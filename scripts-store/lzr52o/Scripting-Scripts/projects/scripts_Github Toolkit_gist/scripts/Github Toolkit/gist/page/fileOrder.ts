/**
 * 記錄同步工具（v1.2.0 起排序功能已移除）
 *
 * v1.2.0 之前這裡同時管排序跟記錄同步；現在排序拿掉了，
 * 只剩「歷史記錄」在 Gist 模式時同步到 GitHub 上的
 * Scripting.gist.json Gist。本地用 Storage 做快速讀寫。
 */
import { gist } from "../class/gist";
import { getLogs, getLogStorageMode, saveLogs, mergeLogs, LogEntry } from "./activityLog";
import { t } from "../../components/i18n";

const META_KEY = "gist_orders_meta";
const DATA_FILENAME = "Scripting.gist.json";
// 以下兩個 key 只是清舊資料用（clearSortData），不再寫入新資料。
const STORAGE_KEY = "gist_orders_all";
const GIST_LIST_ORDER_KEY = "gist_list_order";

// ── 模式判斷 ──────────────────────────────────────────────────

/** 現在只有記錄模式為 gist 時才需要同步到遠端 */
function needGistSync(): boolean {
  return getLogStorageMode() === "gist";
}

/** 根據實際儲存內容生成 gist 描述（現在只有操作記錄） */
function buildGistDescription(): string {
  return t("Scripting Gist 操作記錄資料", "Scripting Gist 操作记录数据", "Scripting Gist activity log data");
}

/** 構建寫入 gist 的完整資料（現在只有 logs） */
function buildGistData(): string {
  return JSON.stringify({
    logs: getLogs(),
  });
}

/**
 * 解析 gist 返回的原始資料。
 * 兼容舊格式（orders + logs + listOrder，或純 orders map）：
 * 舊的排序資料直接忽略，只取 logs。
 */
function parseGistData(raw: string): { logs: LogEntry[] } {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (Array.isArray(parsed.logs)) {
        return { logs: parsed.logs };
      }
    }
  } catch {}
  return { logs: [] };
}

/**
 * v1.2.0：排序功能已移除。清掉舊的排序設定跟排序資料（只清本地）。
 * 遠端 Scripting.gist.json 不動，裡面的舊排序資料會在下次記錄同步時
 * 被覆蓋成只有記錄。每次啟動都跑一次也沒關係（刪不存在的 key 是空操作）。
 */
export function clearSortData(): void {
  const keys = [
    "gist_list_sort_mode",
    "gist_file_sort_mode",
    STORAGE_KEY,
    GIST_LIST_ORDER_KEY,
  ];
  for (const k of keys) {
    try {
      Storage.remove(k);
    } catch {}
  }
}

// ── Gist 遠端同步（異步，僅記錄 Gist 模式生效）────────────────

function getCachedMeta(): { gistUrl: string; rawUrl: string } | null {
  const raw: string | null | undefined = Storage.get(META_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setCachedMeta(meta: { gistUrl: string; rawUrl: string }): void {
  Storage.set(META_KEY, JSON.stringify(meta));
}

function findDataGist(
  gists: any[]
): { gistUrl: string; rawUrl: string } | null {
  const found = gists.find((g: any) => g.files && g.files[DATA_FILENAME]);
  if (found) {
    return {
      gistUrl: found.url,
      rawUrl: found.files[DATA_FILENAME].raw_url,
    };
  }
  return null;
}

/**
 * 設定儲存後的記錄資料初始化同步（記錄 Gist 模式專用）。
 *
 * 邏輯：
 * 1. 檢查 GitHub 上是否已有 Scripting.gist.json
 * 2. 有且內容有資料 → 拉取遠端記錄覆蓋本地
 * 3. 有但內容為空   → 用本地資料更新遠端
 * 4. 沒有           → 用本地資料自動創建
 */
export async function initOrderSync(): Promise<void> {
  if (!needGistSync()) {
    console.log("[Gist] initOrderSync: 無需 Gist 同步，跳過");
    return;
  }

  console.log("[Gist] initOrderSync: 開始資料初始化同步");

  try {
    const gists = await gist.get();
    const foundMeta = findDataGist(gists);

    if (foundMeta) {
      console.log("[Gist] initOrderSync: 發現已有 Scripting.gist.json");
      try {
        const content = await gist.getContent(foundMeta.rawUrl);
        const data = parseGistData(content);

        // 日誌：僅當日誌模式為 gist 時才拉取遠端。
        // 2.1.11：以前是遠端非空就整份覆蓋本地，遠端舊資料會把本地
        // 較新的紀錄（含剛算好的變更）刪掉。現在合併去重。
        if (getLogStorageMode() === "gist" && data.logs.length > 0) {
          saveLogs(mergeLogs(data.logs));
          console.log("[Gist] initOrderSync: 遠端日誌已合併");
        }

        setCachedMeta(foundMeta);

        // 用本地資料更新遠端（內容 + 描述）。2.1.11：合成一次 PATCH。
        await gist.updateContentAndDescription(
          foundMeta.gistUrl,
          DATA_FILENAME,
          buildGistData(),
          buildGistDescription(),
        );
        return;
      } catch {
        // 2026-11-14：讀取失敗不要刪 Gist。之前這裡會把遠端資料 Gist 整個
        // 刪掉再重建，萬一只是網路瞬斷或限流，就等於把使用者的記錄資料
        // 白白刪掉。現在只清掉本地快取、不刪遠端，下面會直接建一個新的
        // 資料 Gist；舊的那個留著不管，不會再被 findDataGist 挑到（新的
        // 比較新，會先被找到）。
        console.log("[Gist] initOrderSync: 遠端資料讀取失敗，將重新創建（不刪除舊的）");
        Storage.remove(META_KEY);
      }
    }

    // 遠端不存在 → 創建
    console.log("[Gist] initOrderSync: 遠端無 Scripting.gist.json，用本地資料創建");
    const desc = buildGistDescription();
    const created = await gist.create(
      DATA_FILENAME,
      buildGistData(),
      false,
      desc
    );
    setCachedMeta({
      gistUrl: created.url,
      rawUrl: created.files[DATA_FILENAME].raw_url,
    });
    console.log("[Gist] initOrderSync: 創建成功");
  } catch (e) {
    console.log("[Gist] initOrderSync 失敗: " + String(e));
  }
}

/**
 * 將本地記錄資料推送到 Gist（創建或更新）。
 * 僅記錄 Gist 模式生效，錯誤向上抛出。
 * （函式名沿用舊的 flushOrders，現在實際上只同步記錄。）
 */
export async function flushOrders(): Promise<void> {
  console.log("[Gist] flushOrders() 進入");
  if (!needGistSync()) {
    console.log("[Gist] flushOrders() 無需 Gist 同步，跳過");
    return;
  }

  let meta = getCachedMeta();

  if (!meta) {
    const gists = await gist.get();
    meta = getCachedMeta() || findDataGist(gists);
    if (meta) setCachedMeta(meta);
  }

  if (meta) {
    try {
      // 2.1.11：內容跟描述合併成一次 PATCH，不再一個操作等兩個來回。
      await gist.updateContentAndDescription(
        meta.gistUrl,
        DATA_FILENAME,
        buildGistData(),
        buildGistDescription()
      );
      console.log("[Gist] flushOrders() 更新成功");
      return;
    } catch {
      console.log("Cached data Gist invalid in flush, recreating...");
      Storage.remove(META_KEY);
      meta = null;
    }
  }

  if (!meta) {
    const desc = buildGistDescription();
    const created = await gist.create(
      DATA_FILENAME,
      buildGistData(),
      false,
      desc
    );
    setCachedMeta({
      gistUrl: created.url,
      rawUrl: created.files[DATA_FILENAME].raw_url,
    });
    console.log("[Gist] flushOrders() 創建成功");
  }
}

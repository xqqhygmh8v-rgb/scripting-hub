/**
 * 活動記錄工具
 *
 * 本地 Storage 儲存操作日誌。
 * 設定中選擇 "Gist" 模式時，日誌隨排序資料一起
 * 同步到 Scripting.gist.json。
 */

import { compareText, compareTextCoarse, DiffFile } from "../../components/diff";

const LOG_KEY = "gist_activity_log";
const LOG_STORAGE_MODE_KEY = "gist_log_storage";
const MAX_ENTRIES = 30;
// 2.1.10：變更紀錄（diff）會一起存進日誌，Gist 模式還要同步上傳，
// 所以逐檔行數上限與檔案數上限都要壓住，避免單筆紀錄肥到拖慢同步。
const MAX_DIFF_FILES = 10;
const MAX_DIFF_LINES = 200;

export interface LogEntry {
  time: string;
  action: string;
  gistName: string;
  fileName?: string;
  contentUrl?: string;
  content?: string;
  // 2.1.10：這次操作改了什麼。結構跟版本歷史／PR 檢視器的 DiffFile 一樣，
  // 詳情頁直接用 DiffFileView 畫。舊紀錄沒有這個欄位。
  changes?: DiffFile[];
  // 變更過多被截斷時為 true，詳情頁會補一行說明。
  changesTruncated?: boolean;
  // 2.1.11：有檔案的差異大到算不動，改用粗略差異（整段刪＋整段增）。
  // 詳情頁會加一句說明，不要讓人以為逐行比對過。
  changesApproximate?: boolean;
  // 2.1.11：更名也要看得出改了什麼。以前更名記成「編輯檔案」、又沒有
  // changes（內容根本沒改），詳情頁就只剩全文、看起來像沒記錄到異動。
  renamedFrom?: string;
  // v1.1.0：多帳號。記錄是哪個帳號的操作，看記錄內容時才知道要用哪支 Token；
  // 舊記錄沒有這個欄位，看內容時退回第一個帳號。
  accountUsername?: string;
}

// 2.1.10：把前後內容算成跟版本歷史一樣的 diff。
// before 沒有就是新增檔案、after 沒有就是刪除檔案；內容一樣就不列。
// 計算失敗（內容太大、非文字）就跳過那個檔，不要讓整筆紀錄寫不進去。
export function buildChanges(
  files: { filename: string; before?: string; after?: string }[],
): { changes: DiffFile[]; truncated: boolean; approximate: boolean } {
  const changes: DiffFile[] = [];
  let truncated = false;
  let approximate = false;
  for (const f of files) {
    if (f.before !== undefined && f.after !== undefined && f.before === f.after) continue;
    let diff: DiffFile | null = null;
    try {
      diff = compareText(f.filename, f.before, f.after);
    } catch {
      // 2.1.11：以前這裡直接跳過這個檔，整筆紀錄可能因此完全沒有 changes，
      // 詳情頁的「變更紀錄」整區不見。現在改成用線性成本的粗略差異，
      // 至少要看得出改了哪一段。
      try {
        diff = compareTextCoarse(f.filename, f.before, f.after);
        approximate = true;
      } catch {
        diff = null;
      }
    }
    if (!diff) {
      truncated = true;
      continue;
    }
    if (diff.lines.length > MAX_DIFF_LINES) {
      diff = { ...diff, lines: diff.lines.slice(0, MAX_DIFF_LINES) };
      truncated = true;
    }
    if (diff.additions === 0 && diff.deletions === 0) continue;
    changes.push(diff);
    if (changes.length >= MAX_DIFF_FILES) {
      truncated = true;
      break;
    }
  }
  return { changes, truncated, approximate };
}

export function getLogStorageMode(): string {
  return Storage.get(LOG_STORAGE_MODE_KEY) || "local";
}

export function getLogs(): LogEntry[] {
  const raw: string | null | undefined = Storage.get(LOG_KEY);
  return raw ? JSON.parse(raw) : [];
}

/** 直接覆蓋寫入（用於從遠端拉取資料）。Gist 模式截斷到 MAX_ENTRIES，本地模式不限制 */
export function saveLogs(entries: LogEntry[]): void {
  if (getLogStorageMode() === "gist") {
    entries = entries.slice(-MAX_ENTRIES);
  }
  Storage.set(LOG_KEY, JSON.stringify(entries));
}

export function addLog(entry: Omit<LogEntry, "time">): void {
  const entries = getLogs();
  entries.push({
    ...entry,
    time: new Date().toISOString(),
  });
  saveLogs(entries);
}

export function clearLogs(): void {
  Storage.remove(LOG_KEY);
}

// 2.1.11：從雲端拉回日誌時不要再「遠端整份覆蓋本地」。之前遠端舊資料一拉
// 就把本地比較新的紀錄（例如有變更紀錄的那些）蓋掉，看起來就像新紀錄
// 沒有異動、甚至不見了。現在依時間合併去重，兩邊都留。
export function mergeLogs(remote: LogEntry[]): LogEntry[] {
  const local = getLogs();
  const keyOf = (e: LogEntry) => `${e.time}|${e.action}|${e.fileName || ""}|${e.gistName || ""}`;
  const map = new Map<string, LogEntry>();
  for (const e of remote) if (e && e.time) map.set(keyOf(e), e);
  for (const e of local) {
    if (!e || !e.time) continue;
    const k = keyOf(e);
    const prev = map.get(k);
    // 兩邊都有時優先用「有 changes」的那份（本地新碼算出來的比較完整）。
    if (!prev || (!prev.changes?.length && e.changes?.length)) map.set(k, e);
  }
  return [...map.values()].sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

export function deleteLog(index: number): void {
  const entries = getLogs();
  if (index >= 0 && index < entries.length) {
    entries.splice(index, 1);
    saveLogs(entries);
  }
}

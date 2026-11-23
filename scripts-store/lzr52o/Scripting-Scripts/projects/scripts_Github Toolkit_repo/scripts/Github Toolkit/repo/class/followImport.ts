import { t } from "./i18n";

// 3.5：「收藏自動帶入 Follow 倉庫」的設定。
// 全域一個開關（使用者設定頁），個別帳號可以覆寫（長按帳號列切換）。
// 設定刻意不塞進 github_toolkit_accounts：那個 key 跟 Gist／Action 共用，
// 那邊 saveAccounts 只寫 username/token/avatar，塞進去的欄位會被洗掉。
export const FOLLOW_IMPORT_GLOBAL_KEY = "repo_follow_auto_import";
export const FOLLOW_IMPORT_ACCOUNTS_KEY = "repo_follow_auto_import_accounts";
// 使用者手動刪掉的自動帶入條目（key 是 owner/repo 小寫），
// 沒記下來的話一進收藏頁又會被帶回來。
export const FOLLOW_IMPORT_SKIP_KEY = "repo_follow_import_skip";

export function loadFollowImportGlobal(): boolean {
  try {
    // 預設開：沒寫過就當 true，只有明確寫 "0" 才是關。
    return (Storage.get<string>(FOLLOW_IMPORT_GLOBAL_KEY) ?? "") !== "0";
  } catch {
    return true;
  }
}

export function saveFollowImportGlobal(on: boolean) {
  try {
    Storage.set(FOLLOW_IMPORT_GLOBAL_KEY, on ? "1" : "0");
  } catch {}
}

export function loadFollowImportAccounts(): Record<string, boolean> {
  try {
    const raw = Storage.get<string>(FOLLOW_IMPORT_ACCOUNTS_KEY) || "";
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: Record<string, boolean> = {};
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === "boolean") out[k] = obj[k];
    }
    return out;
  } catch {
    return {};
  }
}

export function saveFollowImportAccounts(map: Record<string, boolean>) {
  try {
    Storage.set(FOLLOW_IMPORT_ACCOUNTS_KEY, JSON.stringify(map));
  } catch {}
}

// 判斷順序：帳號自己的覆寫 → 全域開關 → 預設開。
// 2.1.9：全域是主開關（使用者指定「全域開，長按使用者可以個別關掉」）。
// 全域關 → 全部不帶入；全域開 → 只有被個別關成 false 的帳號不帶入。
// 之前是「帳號覆寫優先」，全域關時還能單獨開，跟需求不符。
export function isFollowImportEnabled(token: string): boolean {
  if (!loadFollowImportGlobal()) return false;
  const overrides = loadFollowImportAccounts();
  return overrides[token] !== false;
}

export function loadFollowImportSkip(): string[] {
  try {
    const raw = Storage.get<string>(FOLLOW_IMPORT_SKIP_KEY) || "";
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((k: any) => typeof k === "string" && k.includes("/"));
  } catch {
    return [];
  }
}

export function saveFollowImportSkip(list: string[]) {
  try {
    Storage.set(FOLLOW_IMPORT_SKIP_KEY, JSON.stringify(list));
  } catch {}
}

export function addFollowImportSkip(key: string) {
  const k = key.toLowerCase();
  const list = loadFollowImportSkip();
  if (list.includes(k)) return;
  saveFollowImportSkip([...list, k]);
}

// 該使用者不再被 Follow 時，把他的排除紀錄一起清掉，
// 之後重新 Follow 才會重新帶入（跟使用者的預期一致）。
export function pruneFollowImportSkip(followedLogins: string[]) {
  const keep = new Set(followedLogins.map((l) => l.toLowerCase()));
  const list = loadFollowImportSkip();
  const next = list.filter((k) => keep.has(k.split("/")[0]));
  if (next.length !== list.length) saveFollowImportSkip(next);
}

// 重新 Follow 某個使用者時，清掉他的排除紀錄，下次自動帶入才不會漏。
export function clearFollowImportSkipFor(login: string) {
  const key = login.toLowerCase();
  const list = loadFollowImportSkip();
  const next = list.filter((k) => k.split("/")[0] !== key);
  if (next.length !== list.length) saveFollowImportSkip(next);
}

export function followImportAccountLabel(enabled: boolean): string {
  if (!loadFollowImportGlobal()) {
    return t("全域已關閉", "全局已关闭", "Disabled globally");
  }
  return enabled
    ? t("關閉自動帶入 Follow", "关闭自动带入 Follow", "Disable auto-imported follows")
    : t("開啟自動帶入 Follow", "开启自动带入 Follow", "Enable auto-imported follows");
}

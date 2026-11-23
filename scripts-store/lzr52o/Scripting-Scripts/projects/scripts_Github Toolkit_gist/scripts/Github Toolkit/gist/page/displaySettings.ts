// v1.3.9：首頁排序 + 私人反灰的顯示設定，首頁跟設定頁共用。
// 另外開一個檔案是為了避免循環引用（設定頁不能 import 首頁，首頁有 import 設定頁）。
export const SORT_KEY = "gist_sort_mode";
export const PRIVATE_GREY_KEY = "gist_private_grey";

// v1.3.10：順序對調，更新在前、建立在後；預設改為最近更新。
const SORT_MODES = ["updated_desc", "updated_asc", "created_desc", "created_asc"];

export function loadSortMode(): string {
  try {
    const v = Storage.get(SORT_KEY) || "";
    if (SORT_MODES.includes(v)) return v;
  } catch {}
  return "updated_desc";
}

export function loadPrivateGrey(): boolean {
  try {
    return Storage.get(PRIVATE_GREY_KEY) === "1";
  } catch {
    return false;
  }
}

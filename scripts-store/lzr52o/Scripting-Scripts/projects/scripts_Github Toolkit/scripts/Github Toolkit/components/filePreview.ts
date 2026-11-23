import { t } from "./i18n";

// 2026-11-20：QuickLook 預覽共用。檔案頁（收藏裡別人的倉庫、非文字檔）
// 與唯讀檢視頁（副檔名判斷不出來但內容是二進位）都走這支：
// base64 → 暫存檔 → QuickLook.previewURLs。
// QuickLook 只吃「檔案路徑字串」，所以一定要先落地成暫存檔，
// 不能直接把 base64 丟進去。

/** 檔名可能含路徑分隔或系統不接受的符號，落檔前先洗乾淨。 */
export function previewTempPath(name: string): string {
  const safe = (name || "file").split("/").pop()!.replace(/[\\/:*?"<>|]/g, "_");
  return FileManager.temporaryDirectory + "/" + (safe || "file");
}

/** 把 base64 內容寫成暫存檔並用系統預覽打開。 */
export async function previewBase64AsFile(base64: string, name: string): Promise<void> {
  const clean = String(base64 || "").replace(/\s/g, "");
  if (!clean) {
    throw new Error(t("沒有可預覽的內容，請改用下載檔案", "没有可预览的内容，请改用下载文件", "There is nothing to preview. Use Download file instead."));
  }
  const data = Data.fromBase64String(clean);
  if (!data) throw new Error(t("無法解碼檔案內容", "无法解码文件内容", "Failed to decode file content"));
  const tmpPath = previewTempPath(name);
  // writeAsData 是官方 FileManager 的二進位寫法；舊版沒有就退回 writeAsBytes。
  const fm: any = FileManager as any;
  if (typeof fm.writeAsData === "function") await fm.writeAsData(tmpPath, data);
  else {
    const bytes = data.toUint8Array();
    if (!bytes) throw new Error(t("無法解碼檔案內容", "无法解码文件内容", "Failed to decode file content"));
    await FileManager.writeAsBytes(tmpPath, bytes);
  }
  await QuickLook.previewURLs([tmpPath], true);
}

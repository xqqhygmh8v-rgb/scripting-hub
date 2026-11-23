import { t } from "../class/i18n";

// 1.1.17：倉庫詳情改成開倉庫首頁（Kristen：既然是直接進瀏覽器，就進倉庫首頁，
// 不要進 README）。原本 1.1.16 是打 GET /repos/{owner}/{repo}/readme 拿
// html_url 再開，現在不用打 API，直接開 https://github.com/{owner}/{repo}，
// 倉庫首頁本來就有檔案清單，往下滑就是渲染好的 README，跟她截圖那個
// github.com 的畫面一樣。Safari 跟 Dialog 都是 Scripting 全域，不用 import。
export async function openRepoPage(owner: string, repoName: string) {
  const url = `https://github.com/${owner}/${repoName}`;
  try {
    await Safari.present(url, true);
  } catch {
    const opened = await Safari.openURL(url);
    if (!opened) {
      await Dialog.alert({
        title: t("開啟失敗", "打开失败", "Failed to open"),
        message: url,
      });
    }
  }
}

// 1.4.3：個人總覽，開用戶的 GitHub 首頁（github.com/用戶名，預設就是
// Overview 總覽頁）。跟 openRepoPage 同一個做法：Safari.present 內建
// 瀏覽器開，打不開才退回 openURL，還是打不開就跳錯誤。
export async function openUserPage(username: string) {
  const url = `https://github.com/${username}`;
  try {
    await Safari.present(url, true);
  } catch {
    const opened = await Safari.openURL(url);
    if (!opened) {
      await Dialog.alert({
        title: t("開啟失敗", "打开失败", "Failed to open"),
        message: url,
      });
    }
  }
}

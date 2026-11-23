import { ThemeCardBackground, useThemePalette } from "../../components/themePalette";
import { afterDismiss } from "../../components/afterDismiss";
import { traceDelete } from "../../components/deleteTrace";
import { REPO_LIST, RepoHeader, RepoSummary, RepoEntry, RepoIcon } from "../../components/repoUI";
import {
  List,
  Navigation,
  NavigationLink,
  Button,
  Section,
  Text,
  HStack,
  Image,
  Label,
  ProgressView,
  Rectangle,
  useEffect,
  useObservable,
  useRef,
} from "scripting";
import { basename, isTextExtension, parseMoveTarget, repo } from "../class/repo";
import { t } from "../class/i18n";
import { View as EditView } from "./edit";
import { View as ViewerView } from "./viewer";
import { PAGE_BACKGROUND, CARD_BACKGROUND } from "../../components/theme";
import { GlassBackground } from "../../components/glass";
import { LoadingRow } from "../../components/loadingRow";

export function View({
  owner,
  repo: repoName,
  branch,
  path,
  initialMeta,
  onSaved,
  onMoved,
  readOnly,
}: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  // 瀏覽頁清單已經有的檔案資訊（名稱、路徑、大小、sha），有就先顯示。
  initialMeta?: any;
  onSaved?: () => void | Promise<void>;
  onMoved?: (newPath: string) => Promise<void>;
  // 1.1.14：唯讀（收藏倉庫進來的）。檔案頁只留下載檔案、儲存到相簿、
  // 複製 Raw 連結；編輯文字內容、上傳覆蓋、更改路徑／檔名、刪除檔案都藏起來。
  readOnly?: boolean;
}) {
  const dismiss = Navigation.useDismiss();
  // 2.0.11：本頁強調色改跟背景主題連動。
  const palette = useThemePalette();
  // 2026-11-05 回饋：編輯器更名後返回會停在舊路徑的詳情頁，舊路徑
  // 已經不存在，再點編輯就會「載入失敗，請返回」。所以詳情頁不再
  // 只用傳進來的 path，要用一個可變的 filePath：編輯器更名回來時
  // 就把 filePath 換成新路徑、重載詳情，畫面直接變成新檔案的詳情；
  // 瀏覽頁那邊也透過 onMoved 切到新路徑的資料夾，所以按返回時
  // 看到的是新資料夾，不是舊資料夾。
  const filePath = useObservable<string>(path);
  // 2026-11-05 回饋：更改路徑時沒有執行中提示，搬移要等 GitHub
  // 好幾秒，畫面看起來像沒在動。更名中就顯示這一行轉圈。
  const renaming = useObservable<boolean>(false);
  // 2026-11-07：刪除也要有忙碌態，跟更名一樣（旋轉動畫＋紅字「刪除中…」）。
  const deleting = useObservable<boolean>(false);
  // 2026-11-19：刪除互斥鎖。按鈕反灰靠的是 state，不是同步的；這裡在
  // 開確認框之前就用 ref 上鎖，連點不會跑出兩次刪除。
  const deletingLock = useRef(false);
  // 2026-11-05 跨倉庫搬檔案：詳情頁的倉庫跟分支也要可變，搬到別的
  // 倉庫後詳情頁就顯示新倉庫、新分支的檔案，不是舊倉庫的舊路徑。
  const repoState = useObservable<string>(repoName);
  const branchState = useObservable<string>(branch);
  // 2026-11-07：有 initialMeta 時頁面一進來就先顯示檔案資訊，不用等
  // 網路；沒有時（從別處打開）才顯示載入中。完整內容背景再補。
  const meta = useObservable<any | undefined>(initialMeta ?? undefined);
  const error = useObservable<string>("");
  const text = isTextExtension(filePath.value);
  const lastUpdated = useObservable<string>("");
  // v2.0.0：檔案資訊用的兩個格式。時間用裝置本地時區顯示（getFullYear
  // 這些本來就是本地時間，不用硬寫 +8）；大小換算成 KB/MB/GB，小數一位，
  // 剛好整數時去掉 .0（1024 → 1 KB 不是 1.0 KB）。
  function formatLocal(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function formatSize(n: number): string {
    if (!n || n < 1024) return `${n} bytes`;
    const units = ["KB", "MB", "GB"];
    let v = n / 1024;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    const s = v.toFixed(1);
    return `${s.endsWith(".0") ? s.slice(0, -2) : s} ${units[i]}`;
  }

  async function load() {
    // 2026-11-07：有 initialMeta 時頁面已經在顯示檔案資訊了，load()
    // 只是背景補完整內容（content、download_url），所以失敗時不要
    // 把已經顯示的資訊翻成錯誤頁，靜靜留著就好；沒有任何資訊時才
    // 顯示錯誤。最後更新時間另外背景查，不拖主內容。
    const pathAtStart = filePath.value;
    const hadMeta = meta.value !== undefined && meta.value !== null;
    if (!hadMeta) {
      error.setValue("");
      lastUpdated.setValue("");
    }
    try {
      // v2.0.0 修訂（2026-11-07）：檔案資訊先查先顯示，最後更新時間
      // 另外在背景查，不再用 Promise.all 等兩條一起回來——之前點進
      // icon.json 會一直卡在載入中，就是 commits 那條查詢掛住、
      // 把整頁拖住了。這台裝置上 fetch 掛住時 JS 計時器也不跑，
      // 用逾時守不住；但至少不能讓「最後更新」這種附帶資訊拖垮主內容。
      // 主內容回來頁面就出來了，時間那行晚一點補上，查不到就留空。
      // 2026-11-07 再補：原腳本點檔案幾乎秒進，Toolkit 卻一直卡住；
      // 請求寫法跟原腳本一模一樣、API 實測也只要 0.9 秒，剩下的可能
      // 是 Token 本身讓請求卡住（repo.ts 的 getContentsAnonymous 註解
      // 有提過：帶 Token 反而被擋或卡住）。所以帶 Token 查不到就改
      // 不帶 Token 再查一次（公開庫才有東西，VideoPlayer 就是公開庫）；
      // 不帶 Token 也查不到或失敗，就顯示原本那個錯誤，不要蓋成
      // 「找不到檔案」。帶 Token 那條有 AbortSignal，掛住 15 秒就會
      // 翻成逾時、走到這條後備路，不會永遠轉圈圈。
      let info: any = null;
      try {
        info = await repo.getContents(owner, repoState.value, filePath.value, branchState.value);
      } catch (e: any) {
        let anon: any = null;
        let anonOk = false;
        try {
          anon = await repo.getContentsAnonymous(owner, repoState.value, filePath.value, branchState.value);
          anonOk = true;
        } catch {}
        if (anonOk && anon !== null) {
          info = anon;
        } else {
          throw e;
        }
      }
      // 抓回來時如果已經換檔案（更名），就不要蓋掉新檔案的資訊。
      if (filePath.value !== pathAtStart) return;
      meta.setValue(info);
      if (info) {
        repo.getLastCommitDate(owner, repoState.value, filePath.value, branchState.value)
          .then((iso) => { if (iso) lastUpdated.setValue(formatLocal(iso)); })
          .catch(() => {});
      }
    } catch (e: any) {
      if (!hadMeta) {
        // 同瀏覽頁：先解除載入狀態，錯誤顯示在頁面上，不在載入流程裡彈窗。
        meta.setValue(null);
        error.setValue(t(`載入失敗：${String(e?.message || e)}`, `载入失败：${String(e?.message || e)}`, `Failed to load: ${String(e?.message || e)}`));
      }
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function replaceUpload() {
    try {
      const picked = await DocumentPicker.pickFiles({ allowsMultipleSelection: false });
      if (!picked || picked.length === 0) return;
      const data = Data.fromFile(picked[0]);
      if (!data) throw new Error(t("讀取檔案失敗", "读取文件失败", "Failed to read file"));
      if (!meta.value?.sha) throw new Error(t("找不到目前檔案的 sha，請先重新整理", "找不到目前文件的 sha，请先刷新", "Cannot find the current file's sha. Please refresh first."));
      await repo.putFile({
        owner,
        repo: repoState.value,
        path: filePath.value,
        branch: branchState.value,
        message: t(`上傳 ${filePath.value}（Scripting）`, `上传 ${filePath.value}（Scripting）`, `Upload ${filePath.value} (Scripting)`),
        base64: data.toBase64String(),
        sha: meta.value.sha,
      });
      if (onSaved) onSaved();
      await Dialog.alert({ title: t("完成", "完成", "Done"), message: t(`已覆蓋 ${filePath.value}`, `已覆盖 ${filePath.value}`, `Overwrote ${filePath.value}`) });
      await load();
    } catch (e: any) {
      await Dialog.alert({ title: t("上傳失敗", "上传失败", "Upload failed"), message: String(e?.message || e) });
    }
  }

  // v1.13：Raw 連結。優先用 API 回傳的 download_url，沒有時
  // 用 raw.githubusercontent.com 組出來（路徑每段都要 encode）。
  // 私庫的 Raw 連結直接在瀏覽器開會 404，要帶 Token 才能抓，
  // 所以複製只是複製位址，不是保證免登入就能下載。
  function rawUrl(): string {
    if (meta.value?.download_url) return String(meta.value.download_url);
    const encoded = filePath.value
      .split("/")
      .filter((p) => p.length > 0)
      .map((p) => encodeURIComponent(p))
      .join("/");
    return `https://raw.githubusercontent.com/${owner}/${repoState.value}/${encodeURIComponent(branchState.value)}/${encoded}`;
  }

  async function copyRawUrl() {
    try {
      const url = rawUrl();
      await Pasteboard.setString(url);
      await Dialog.alert({ title: t("已複製", "已复制", "Copied"), message: url });
    } catch (e: any) {
      await Dialog.alert({ title: t("複製失敗", "复制失败", "Copy failed"), message: String(e?.message || e) });
    }
  }

  // v1.45：下載檔案。之前非文字檔直接分享 Raw 連結（一個字串），
  // 系統分享選單認不出檔案類型，所以沒有「儲存到檔案」，
  // 圖片也沒有「儲存影像」。現在只要 API 有回傳 content（1MB 以下的檔案），
  // 就先把 base64 還原成真正的檔案寫到暫存檔，再分享那個檔案路徑，
  // 系統認得出副檔名，才會出現儲存到檔案／儲存影像。
  // 文字檔維持原本寫字串的做法；沒有 content 的大檔案才退回分享 Raw 連結。
  async function downloadFile() {
    try {
      if (!meta.value) throw new Error(t("檔案資訊還沒載入", "文件信息还没载入", "File info has not loaded yet"));
      const url = rawUrl();
      if (meta.value.content) {
        const clean = String(meta.value.content).replace(/\s/g, "");
        const tmpPath = FileManager.temporaryDirectory + "/" + basename(filePath.value);
        if (text) {
          const decoded = Data.fromBase64String(clean)?.toDecodedString();
          if (decoded === null || decoded === undefined) throw new Error(t("無法解碼檔案內容", "无法解码文件内容", "Cannot decode file content"));
          await FileManager.writeAsString(tmpPath, decoded);
        } else {
          const data = Data.fromBase64String(clean);
          if (!data) throw new Error(t("無法解碼檔案內容", "无法解码文件内容", "Cannot decode file content"));
          // writeAsData 是官方 FileManager 的二進位寫法；萬一裝置版本沒有它，
          // 就退回舊的分享連結做法，不要讓下載整個壞掉。
          const fm: any = FileManager as any;
          if (typeof fm.writeAsData === "function") {
            await fm.writeAsData(tmpPath, data);
          } else {
            await ShareSheet.present([url]);
            return;
          }
        }
        await ShareSheet.present([tmpPath]);
      } else {
        await ShareSheet.present([url]);
      }
    } catch (e: any) {
      await Dialog.alert({ title: t("下載失敗", "下载失败", "Download failed"), message: String(e?.message || e) });
    }
  }

  function isPhotoExtension(): boolean {
    const ext = (filePath.value.split(".").pop() || "").toLowerCase();
    return ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif"].includes(ext);
  }

  // v1.45：直接儲存到相簿。圖片檔才顯示這顆按鈕（svg 不算，相簿存不了 svg）。
  // 用 Photos.savePhoto 直接存 Data，不經過分享選單，所以不用再找儲存影像按鈕。
  // 第一次用會跳相簿權限詢問，要允許才能存；檔案太大、API 沒有回傳 content 時存不了，
  // 會提示改用下載檔案。
  async function saveToPhotos() {
    try {
      if (!meta.value?.content) {
        await Dialog.alert({ title: t("無法儲存到相簿", "无法保存到相册", "Cannot save to Photos"), message: t("此檔案太大，GitHub API 沒有回傳內容，請改用下載檔案，再從分享選單儲存。", "此文件太大，GitHub API 没有返回内容，请改用下载文件，再从分享菜单保存。", "This file is too large — GitHub API did not return its content. Use Download file and save it from the share sheet instead.") });
        return;
      }
      const clean = String(meta.value.content).replace(/\s/g, "");
      const data = Data.fromBase64String(clean);
      if (!data) throw new Error(t("無法解碼檔案內容", "无法解码文件内容", "Cannot decode file content"));
      const photos: any = (typeof Photos !== "undefined" ? Photos : null) as any;
      if (!photos || typeof photos.savePhoto !== "function") {
        await Dialog.alert({ title: t("無法儲存到相簿", "无法保存到相册", "Cannot save to Photos"), message: t("此裝置不支援直接儲存到相簿，請改用下載檔案，再從分享選單選擇儲存影像。", "此设备不支持直接保存到相册，请改用下载文件，再从分享菜单选择保存图像。", "This device does not support saving directly to Photos. Use Download file and choose Save Image in the share sheet.") });
        return;
      }
      let ok: any = false;
      try {
        ok = await photos.savePhoto(data);
      } catch {
        ok = false;
      }
      if (ok === false) {
        // Data 版不行時，改用檔案路徑版再試一次。
        const tmpPath = FileManager.temporaryDirectory + "/" + basename(filePath.value);
        const fm: any = FileManager as any;
        if (typeof fm.writeAsData === "function") {
          await fm.writeAsData(tmpPath, data);
          ok = await photos.savePhoto(tmpPath);
        }
      }
      if (ok === false) throw new Error(t("相簿拒絕儲存，請檢查相簿權限", "相册拒绝保存，请检查相册权限", "Photos refused to save. Please check Photos permission."));
      await Dialog.alert({ title: t("完成", "完成", "Done"), message: t(`已儲存到相簿：${basename(filePath.value)}`, `已保存到相册：${basename(filePath.value)}`, `Saved to Photos: ${basename(filePath.value)}`) });
    } catch (e: any) {
      await Dialog.alert({ title: t("儲存失敗", "保存失败", "Save failed"), message: String(e?.message || e) });
    }
  }

  // 2026-11-05 回饋：編輯文字內容後返回資訊頁沒有刷新。
  // 上一版編輯器存檔叫的 onSaved 是瀏覽頁的重載（背景頁），
  // 詳情頁自己完全沒重載，所以 sha、大小、最後更新時間都還是舊的。
  // 現在編輯器存檔改叫這一顆：瀏覽頁重載照舊背景跑（不 await，
  // 不然編輯器退出會被拖住），詳情頁自己重載，返回時資訊就是新的。
  async function handleEditorSaved() {
    if (onSaved) {
      try {
        const r: any = (onSaved as any)();
        if (r && typeof r.catch === "function") r.catch(() => {});
      } catch {}
    }
    await load();
  }

  // 2026-11-05 回饋：編輯器更名回來時的處理。
  // 黑畫面回饋（續）：上一版在編輯器還在最上面時就換 filePath，
  // 連帶換掉了編輯頁的 NavigationLink 目的頁，編輯器就變黑畫面。
  // 還有一點是上一版先 await 瀏覽頁 onMoved（要等 GitHub 回來），
  // 編輯器那顆資料夾按鈕就一直轉圈，看起來像卡住。所以現在：
  // 同倉庫才叫瀏覽頁切資料夾，而且不 await（背景跑就好）；
  // 跨倉庫不叫瀏覽頁（瀏覽頁是舊倉庫，叫了會去舊倉庫找新路徑）；
  // 換詳情頁路徑、倉庫、分支、重載一律延後 300ms，等編輯器自己
  // dismiss 掉再做。
  async function handleEditorRenamed(newPath: string, newRepo?: string, newBranch?: string) {
    if (!newRepo || newRepo === repoState.value) {
      if (onMoved) onMoved(newPath).catch(() => {});
      else if (onSaved) onSaved();
    }
    setTimeout(async () => {
      if (newRepo) repoState.setValue(newRepo);
      if (newBranch) branchState.setValue(newBranch);
      filePath.setValue(newPath);
      await load();
    }, 300);
  }

  // v3.0：重新命名／移動檔案，做法跟 GitHub 網頁編輯一樣。
  // 2026-11-05 回饋：提示第一段就是倉庫名，留著就是同倉庫搬，
  // 改成別的倉庫名就是跨倉庫搬（moveFileToRepo：先查目標倉庫、
  // 不存在就提示失敗不提交，先建目標再刪原檔）。同倉庫換資料夾
  // 請保留倉庫名開頭，否則第一段會被當成目標倉庫名。
  // 詳情頁改名後留在新檔案的資訊頁，不關掉；同倉庫才叫瀏覽頁
  // 在背景切到新資料夾（不 await，先顯示新詳情，返回時瀏覽頁
  // 已經是新資料夾），跨倉庫不叫瀏覽頁，返回會回到舊倉庫瀏覽頁，
  // 要看新倉庫請從首頁點進新倉庫。
  async function handleRename() {
    const newPathRaw = await Dialog.prompt({
      title: t("路徑/檔名", "路径/文件名", "Path/filename"),
      defaultValue: `${repoState.value}/${filePath.value}`,
    });
    if (newPathRaw === null || newPathRaw === undefined) return;
    const newPathInput = String(newPathRaw).trim();
    if (!newPathInput) {
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: t("路徑/檔名不能為空。", "路径/文件名不能为空。", "Path/filename cannot be empty.") });
      return;
    }
    if (newPathInput.split("/").some((s) => s === "..")) {
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: t("路徑不能包含 ..。", "路径不能包含 ..。", "Path cannot contain ...") });
      return;
    }
    const target = parseMoveTarget(newPathInput, owner, repoState.value);
    if (!target.path || (target.repo === repoState.value && target.path === filePath.value)) return;
    const isCross = target.repo !== repoState.value;
    const msg = await Dialog.prompt({
      title: t("提交訊息", "提交信息", "Commit message"),
      defaultValue: t(`重新命名 ${filePath.value} 為 ${isCross ? `${target.repo}/${target.path}` : target.path}（Scripting）`, `重命名 ${filePath.value} 为 ${isCross ? `${target.repo}/${target.path}` : target.path}（Scripting）`, `Rename ${filePath.value} to ${isCross ? `${target.repo}/${target.path}` : target.path} (Scripting)`),
    });
    if (msg === null || msg === undefined) return;
    const commitMsg = msg || t(`重新命名 ${filePath.value} 為 ${isCross ? `${target.repo}/${target.path}` : target.path}（Scripting）`, `重命名 ${filePath.value} 为 ${isCross ? `${target.repo}/${target.path}` : target.path}（Scripting）`, `Rename ${filePath.value} to ${isCross ? `${target.repo}/${target.path}` : target.path} (Scripting)`);
    // 2026-11-05 回饋：會移動到其他倉庫時先彈窗提醒，確認後才移動。
    // 只在跨倉庫時跳，同倉庫改名不跳，避免多一次確認。
    if (isCross) {
      const ok = await Dialog.confirm({
        title: t("移動到其他倉庫", "移动到其他仓库", "Move to another repository"),
        message: t(`確定要移動以下檔案嗎？\n「${filePath.value}」\n從 "${repoState.value}" 移動到 "${target.repo}"`, `确定要移动以下文件吗？\n「${filePath.value}」\n从 "${repoState.value}" 移动到 "${target.repo}"`, `Move the following file to another repository?\n"${filePath.value}"\nFrom "${repoState.value}" to "${target.repo}"`),
      });
      if (!ok) return;
    }
    renaming.setValue(true);
    try {
      let targetBranch = branchState.value;
      if (isCross) {
        const r = await repo.moveFileToRepo({ owner, repo: repoState.value, branch: branchState.value, message: commitMsg, oldPath: filePath.value, targetRepo: target.repo, targetPath: target.path });
        targetBranch = r.targetBranch;
      } else {
        await repo.moveFile({ owner, repo: repoState.value, branch: branchState.value, message: commitMsg, oldPath: filePath.value, newPath: target.path });
      }
      // 2026-11-05 回饋：完成通知的「好的」常常點不了。最可能的
      // 原因是更名中那顆按鈕被整個拿掉（renaming 為 true 時按鈕
      // 不顯示），而完成通知就是從那顆按鈕的動作裡彈出來的，
      // 按鈕已經不在畫面上，通知的按鈕就跟著不好點。所以現在
      // 搬完先把 renaming 關掉（按鈕恢復顯示、指示消失），
      // 再彈完成通知，通知就不會掛在一個已經不在的按鈕上。
      renaming.setValue(false);
      await Dialog.alert({ title: t("完成", "完成", "Done"), message: t(`已移到 "${target.repo}/${target.path}"
舊路徑的 Raw 連結會失效`, `已移到 "${target.repo}/${target.path}"
旧路径的 Raw 链接会失效`, `Moved to "${target.repo}/${target.path}".
The old Raw link will stop working.`) });
      if (isCross) {
        repoState.setValue(target.repo);
        branchState.setValue(targetBranch);
        filePath.setValue(target.path);
        await load();
      } else if (onMoved) {
        filePath.setValue(target.path);
        await load();
        onMoved(target.path).catch(() => {});
      } else {
        if (onSaved) onSaved();
        dismiss();
      }
    } catch (e: any) {
      renaming.setValue(false);
      // 2026-11-05 回饋：更名失敗標題都改為「失敗」，不分原因。
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: String(e?.message || e) });
    } finally {
      renaming.setValue(false);
    }
  }

  async function handleDelete() {
    if (deletingLock.current) return;
    deletingLock.current = true;
    // 依你的習慣：刪除只跳一次確認，不再跳第二次「再確認一次」。
    let removed = false;
    try {
      const ok = await Dialog.confirm({
        title: t("刪除檔案", "删除文件", "Delete file"),
        message: t(`確定要刪除以下檔案嗎？\n${filePath.value}\n此操作不可撤銷！`, `确定要删除以下文件吗？\n${filePath.value}\n此操作不可撤销！`, `Are you sure you want to delete the following file?\n${filePath.value}\nThis action cannot be undone!`),
      });
      if (!ok) return;
      // 2026-11-19：Dialog.confirm 回傳不代表確認框的收合動畫已經結束。
      // 舊版回來第一件事就是改 deleting，下面那顆刪除按鈕被換成 HStack，
      // 等於在警示框收合中拆掉使用者剛按的元素。先等緩衝再改畫面。
      traceDelete("repo-file-confirmed", filePath.value);
      await afterDismiss();
      traceDelete("repo-file-sheet-settled");
      // 2026-11-07：刪除中顯示旋轉動畫＋紅字「刪除中…」，跟更名的綠字
      // 「更改路徑/檔名中…」同一個做法；成功就關頁，失敗才還原按鈕。
      deleting.setValue(true);
      if (!meta.value?.sha) throw new Error(t("找不到目前檔案的 sha，請先重新整理", "找不到目前文件的 sha，请先刷新", "Cannot find the current file's sha. Please refresh first."));
      traceDelete("repo-file-delete-start");
      await repo.deleteFile({
        owner,
        repo: repoState.value,
        path: filePath.value,
        branch: branchState.value,
        message: t(`刪除 ${filePath.value}（Scripting）`, `删除 ${filePath.value}（Scripting）`, `Delete ${filePath.value} (Scripting)`),
        sha: meta.value.sha,
      });
      removed = true;
      traceDelete("repo-file-delete-done");
      // 2026-11-19：先退回上一頁，等退場緩衝過後再叫父層刷新。舊版是
      // onSaved() 不 await 又在 dismiss() 之前，等於母頁正被轉場推走時
      // 同時重抓清單；刷新失敗也完全看不到。
      traceDelete("repo-file-dismiss");
      dismiss();
      await afterDismiss();
      traceDelete("repo-file-dismiss-settled");
      try {
        await onSaved?.();
        traceDelete("repo-file-refresh-done");
      } catch (refreshErr) {
        console.log("[Repo] 刪除檔案後刷新清單失敗: " + String(refreshErr));
      }
    } catch (e: any) {
      traceDelete("repo-file-error", e?.message || e);
      // 已經刪掉了才發生的錯（例如父層刷新）不再報成「刪除失敗」。
      if (!removed) {
        deleting.setValue(false);
        await Dialog.alert({ title: t("刪除失敗", "删除失败", "Delete failed"), message: String(e?.message || e) });
      } else {
        console.log("[Repo] 刪除後收尾失敗: " + String(e?.message || e));
      }
    } finally {
      deletingLock.current = false;
      traceDelete("repo-file-handler-exit");
    }
  }


  // 2026-11-07：黑畫面教訓——List 的直接子層只能是 Section，不能包
  // 一層 fragment（<>…</>）。上一版資訊區用 fragment 包兩個 Section，
  // 裝置上整個 List 渲染不出來、全黑；載入／錯誤態是單個 Section、
  // 沒有 fragment，所以沒事。改成三個狀態各回一個 List，Section 都
  // 是 List 的直接子層（跟原腳本同一個寫法），initialMeta 的好處
  // （一進來就先顯示資訊）照樣保留。
  if (meta.value === undefined) {
    return (
      <List {...REPO_LIST}
        tint={palette.accent}
        scrollContentBackground="hidden"
        background={<GlassBackground />}
        navigationTitle={owner}>
        <Section>
          <LoadingRow />
          <Button listRowBackground={<ThemeCardBackground />} title={t("重新整理", "刷新", "Refresh")} systemImage="arrow.clockwise" action={load} />
        </Section>
      </List>
    );
  }
  if (meta.value === null) {
    return (
      <List {...REPO_LIST}
        tint={palette.accent}
        scrollContentBackground="hidden"
        background={<GlassBackground />}
        navigationTitle={owner}>
        <Section>
          <Text listRowBackground={<ThemeCardBackground />}>{error.value || t("找不到此檔案，請返回重新整理。", "找不到此文件，请返回刷新。", "File not found. Please go back and refresh.")}</Text>
        </Section>
      </List>
    );
  }
  return (
    <List {...REPO_LIST}
      tint={palette.accent}
      scrollContentBackground="hidden"
      background={<GlassBackground />}
      navigationTitle={owner}>
      <Section header={<RepoHeader symbol="doc.text.magnifyingglass" title={t("檔案資訊", "文件信息", "File info")} />}>
        <RepoSummary compact symbol="doc.text" title={basename(filePath.value)} subtitle={`${repoState.value}/${filePath.value}`} detail={readOnly ? t("唯讀", "只读", "Read only") : undefined} />
        <HStack spacing={10} listRowInsets={{ top: 4, leading: 16, bottom: 4, trailing: 16 }} listRowBackground={<ThemeCardBackground />}><RepoIcon symbol="arrow.branch" /><Text font="caption" foregroundStyle="secondaryLabel">{t(`分支：${branchState.value}`, `分支：${branchState.value}`, `Branch: ${branchState.value}`)}</Text></HStack>
        <HStack spacing={10} listRowInsets={{ top: 4, leading: 16, bottom: 4, trailing: 16 }} listRowBackground={<ThemeCardBackground />}><RepoIcon symbol="internaldrive" /><Text font="caption" foregroundStyle="secondaryLabel">{t(`大小：${formatSize(meta.value.size ?? 0)}`, `大小：${formatSize(meta.value.size ?? 0)}`, `Size: ${formatSize(meta.value.size ?? 0)}`)}</Text></HStack>
        <HStack spacing={10} listRowInsets={{ top: 4, leading: 16, bottom: 4, trailing: 16 }} listRowBackground={<ThemeCardBackground />}><RepoIcon symbol="number" /><Text font="caption" foregroundStyle="secondaryLabel">{`sha：${String(meta.value.sha || "").slice(0, 12)}`}</Text></HStack>
        {lastUpdated.value ? (
          <HStack spacing={10} listRowInsets={{ top: 4, leading: 16, bottom: 4, trailing: 16 }} listRowBackground={<ThemeCardBackground />}><RepoIcon symbol="clock" /><Text font="caption" foregroundStyle="secondaryLabel">{t(`最後更新時間：${lastUpdated.value}`, `最后更新时间：${lastUpdated.value}`, `Last updated: ${lastUpdated.value}`)}</Text></HStack>
        ) : null}
      </Section>
      <Section header={<RepoHeader symbol="slider.horizontal.3" title={t("操作", "操作", "Actions")} />}>
        {/* 2026-11-20：唯讀（收藏裡別人的倉庫）也能「看」內容，一律放第一排。
            文字檔 → 唯讀編輯器檢視（高亮＋搜尋）；其他檔 → 同一頁載入後
            自動開 QuickLook 預覽。兩者共用同一個 NavigationLink，顏色與
            樣式（眼睛圖標＋右箭頭）完全一致，只有標題依檔案類型不同。
            自己倉庫不重複加一列，照舊用下面的「編輯文字內容」。 */}
        {readOnly ? (
          <NavigationLink listRowBackground={<ThemeCardBackground />}
            destination={
              <ViewerView
                owner={owner}
                repo={repoState.value}
                branch={branchState.value}
                path={filePath.value}
                sha={meta.value?.sha}
                size={meta.value?.size}
                initialBase64={meta.value?.content}
              />
            }
          >
            <Label title={text ? t("查看內容", "查看内容", "View content") : t("預覽檔案", "预览文件", "Preview file")} systemImage={"eye"} />
          </NavigationLink>
        ) : null}
        {!readOnly ? (text ? (
          <NavigationLink listRowBackground={<ThemeCardBackground />}
            destination={
              <EditView
                owner={owner}
                repo={repoState.value}
                branch={branchState.value}
                path={filePath.value}
                onSaved={handleEditorSaved}
                onRenamed={handleEditorRenamed}
              />
            }
          >
            <Label title={t("編輯文字內容", "编辑文字内容", "Edit text content")} systemImage={"square.and.pencil"} />
          </NavigationLink>
        ) : (
          <Text listRowBackground={<ThemeCardBackground />} font={"footnote"} foregroundStyle={"secondaryLabel"}>
            {t("此檔案不是文字檔，無法用編輯器編輯；請用下方「上傳覆蓋」替換，或刪除後重新上傳。", "此文件不是文本文件，无法用编辑器编辑；请用下方「上传覆盖」替换，或删除后重新上传。", "This file is not a text file and cannot be edited in the editor. Use “Replace by upload” below to replace it, or delete it and upload again.")}
          </Text>
        )) : null}
        {!readOnly ? (
          <Button listRowBackground={<ThemeCardBackground />} title={t("上傳覆蓋", "上传覆盖", "Replace by upload")} systemImage={"square.and.arrow.up"} action={replaceUpload} />
        ) : null}
        <Button listRowBackground={<ThemeCardBackground />} title={t("下載檔案", "下载文件", "Download file")} systemImage={"square.and.arrow.down"} action={downloadFile} />
        {isPhotoExtension() ? (
          <Button listRowBackground={<ThemeCardBackground />} title={t("儲存到相簿", "保存到相册", "Save to Photos")} systemImage={"photo"} action={saveToPhotos} />
        ) : null}
        <Button listRowBackground={<ThemeCardBackground />} title={t("複製 Raw 連結", "复制 Raw 链接", "Copy Raw link")} systemImage={"doc.on.doc"} action={copyRawUrl} />
        {!readOnly && renaming.value ? (
          // 2026-11-05 回饋：更名中文字要跟上下行（複製 Raw 連結、
          // 刪除檔案）文字對齊。上一版 HStack 間距 8 比按鈕圖標跟
          // 文字間距窄，綠字就偏左了，改成跟編輯列一樣的間距 20。
          <HStack listRowBackground={<ThemeCardBackground />} spacing={10}>
            <ProgressView />
            <Text foregroundStyle={palette.accent}>{t("更改路徑/檔名中…", "更改路径/文件名中…", "Changing path/filename…")}</Text>
          </HStack>
        ) : null}
        {!readOnly && !renaming.value ? (
          <Button listRowBackground={<ThemeCardBackground />} title={t("更改路徑/檔名", "更改路径/文件名", "Change path/filename")} systemImage={"folder"} action={handleRename} />
        ) : null}
        {/* 2026-11-19：不再用「把按鈕換成 HStack」來表示刪除中。列一旦被
            換掉，剛剛按下去的刪除按鈕就整個被銷毀，而確認框還在收合。
            現在按鈕永遠是同一個元素，忙碌時只改標題跟圖示、變灰。 */}
        {!readOnly ? (
          <Button
            listRowBackground={<ThemeCardBackground />}
            title={deleting.value ? t("刪除中…", "删除中…", "Deleting…") : t("刪除檔案", "删除文件", "Delete file")}
            systemImage={deleting.value ? "hourglass" : "trash"}
            role={"destructive"}
            foregroundStyle={"red"}
            disabled={deleting.value}
            action={handleDelete}
          />
        ) : null}
      </Section>
    </List>
  );
}

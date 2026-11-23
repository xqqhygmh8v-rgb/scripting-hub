import {
  List,
  Navigation,
  NavigationLink,
  NavigationStack,
  Button,
  Section,
  Text,
  HStack,
  Image,
  Toggle,
  Notification,
  useEffect,
  useObservable,
} from "scripting";
import { ACCOUNTS_KEY, TOKEN_KEY, USERNAME_KEY, basename, dirname, repo, type RepoItem } from "../class/repo";
import { t } from "../class/i18n";
import { View as FileDetailView } from "./fileDetail";
import { View as NewFileView } from "./newFile";
import { View as ForkAccountView } from "./forkAccount";

export function View({
  owner,
  repo: repoName,
  branch: initialBranch,
  path,
  onSaved,
  isModal,
  isPrivate,
  accountToken,
  accountUsername,
  onListDirty,
}: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  onSaved?: () => void;
  isModal?: boolean;
  isPrivate?: boolean;
  // v1.15：多帳號清單點進來時帶該帳號的 Token，瀏覽、編輯、上傳都用這個 Token，
  // 不用先去設定切換使用中帳號；沒帶時沿用原本的使用中 Token。
  accountToken?: string;
  // v1.19：同理，帳號分區點進來時帶該區帳號名稱，用來判斷是不是自己的倉庫；
  // 手動開庫沒帶時用 Storage 裡的使用者名稱。v1.50 起 Fork 不再用這個名稱決定
  // 建立在哪個帳號下，點 Fork 後會先選帳號，再用選到的帳號去 Fork。
  accountUsername?: string;
  // v1.25：清單頁在瀏覽頁關掉（返回上一層）時要不要自動刷新，由這個回呼決定；
  // 只有改過公開／私人或 Fork 過，清單才真的需要刷新，檔案上傳編輯不影響清單。
  onListDirty?: () => void;
}) {
  const dismiss = Navigation.useDismiss();
  const items = useObservable<RepoItem[] | undefined>(undefined);
  // v1.10：資料夾不再換頁，同一頁用 currentPath 切換。
  // v1.9 的 Navigation.present 在裝置上點資料夾進不去，
  // 所以乾脆不靠換頁進資料夾，點資料夾就是把路徑改成那個資料夾再重新載入，
  // 上一層就是把路徑改回父層再重新載入，檔案仍用 NavigationLink 進詳情頁。
  const currentPath = useObservable<string>(path);
  // v2.1.5：標題專用 observable。標題不在掛載 effect 裡寫（v2.1.2 那招
  // 對 q1 沒用，根目錄還是置中），改成下面 syncNavTitle 在兩個時機寫：
  // 掛載那次載入完成後（一定是畫面出來之後，模仿進資料夾時換標題的時機），
  // 跟使用者點資料夾／上一層當下；重新整理跟上傳不換路徑，不用重寫。
  const navTitle = useObservable<string>("");
  function syncNavTitle() {
    navTitle.setValue(currentPath.value ? basename(currentPath.value) : repoName);
  }
  // v1.11：狀態要同步顯示倉庫狀況，私人旗標從清單傳進來；
  // 手動開庫沒有傳時，第一次載入用 getRepo 取得，之後同一頁換資料夾不再重打。
  const privateFlag = useObservable<boolean | undefined>(isPrivate);
  const branch = useObservable<string>(initialBranch);
  const error = useObservable<string>("");
  const status = useObservable<string>(t("準備載入…", "准备载入…", "Preparing to load…"));
  // v1.15：完成只顯示綠色打勾，不再寫「完成」兩個字，所以完成狀態不能再用
  // status 字串開頭判斷，改用獨立的 completed 旗標。
  const completed = useObservable<boolean>(false);
  // v2.0.0：載入失敗旗標。成功用綠色打勾、失敗用紅色叉，載入中兩者都沒有，
  // 所以不能只用 completed 反推，失敗要獨立一個旗標。
  const failed = useObservable<boolean>(false);
  const generation = useObservable<number>(0);
  // v1.20：公開開關。開是公開、關是私人，初始值從私人旗標反推。
  // lastSetValue 記住上次程式設的值，開關值跟它一樣就是程式同步，不是使用者撥動，
  // 不用打 API；不一樣才是使用者撥動，才打 API。兩個一起設時，effect 跑起來
  // 看到一樣就會跳過，不會誤觸發。
  const publicValue = useObservable<boolean>(isPrivate !== undefined ? !isPrivate : false);
  const lastSetValue = useObservable<boolean>(isPrivate !== undefined ? !isPrivate : false);
  // v1.25：這一頁改過公開／私人或 Fork 過，清單上的私人標記或倉庫數就會過期，
  // 返回上一層時要自動刷新清單；沒改過就不刷新，避免每次返回都重新載入。
  const listDirty = useObservable<boolean>(false);
  // v1.28：開關執行中旗標。執行中再點開關不重發 PATCH，直接撥回正在改的
  // 那個狀態，避免兩次 PATCH 打架讓開關來回跳。
  const visibilityBusy = useObservable<boolean>(false);
  // v2.0.0：倉庫狀態多一行「最後更新：X 天前」。相對時間，不用絕對日期，
  // 使用者一眼就知道這個倉庫多久沒動了。updatedFor 記住已經查過的倉庫，
  // 同一倉庫只打一次 getRepo，換資料夾不再重打（跟分支／私人旗標同一個做法）。
  const lastUpdated = useObservable<string>("");
  const updatedFor = useObservable<string>("");

  function formatRelative(iso: string): string {
    const ms = new Date(iso).getTime();
    if (isNaN(ms)) return "";
    const diff = Date.now() - ms;
    if (diff < 60000) return t("剛剛", "刚刚", "Just now");
    const min = Math.floor(diff / 60000);
    if (min < 60) return t(`${min} 分鐘前`, `${min} 分钟前`, `${min} minute${min > 1 ? "s" : ""} ago`);
    const hr = Math.floor(min / 60);
    if (hr < 24) return t(`${hr} 小時前`, `${hr} 小时前`, `${hr} hour${hr > 1 ? "s" : ""} ago`);
    const day = Math.floor(hr / 24);
    if (day < 30) return t(`${day} 天前`, `${day} 天前`, `${day} day${day > 1 ? "s" : ""} ago`);
    const mon = Math.floor(day / 30);
    if (mon < 12) return t(`${mon} 個月前`, `${mon} 个月前`, `${mon} month${mon > 1 ? "s" : ""} ago`);
    const yr = Math.floor(mon / 12);
    return t(`${yr} 年前`, `${yr} 年前`, `${yr} year${yr > 1 ? "s" : ""} ago`);
  }

  useEffect(() => {
    const newVal = publicValue.value;
    const oldVal = lastSetValue.value;
    if (newVal === oldVal) return;
    // 執行中又被點到：不重發，直接撥回正在改的目標狀態就好。
    if (visibilityBusy.value) {
      publicValue.setValue(oldVal);
      return;
    }
    lastSetValue.setValue(newVal);
    visibilityBusy.setValue(true);
    (async () => {
      try {
        // v1.25：執行過程顯示。異動還沒完成前，狀態先顯示正在改，不要讓使用者
        // 以為開關撥了就已經改好；完成後再回到預設分支那一行。
        // v1.28：執行中不要把 completed 設成 false，因為開關的顯示條件是
        // completed 才顯示，設 false 會讓開關在執行中消失又重現，看起來像閃爍；
        // 現在只改狀態文字，開關跟綠色打勾都留在原地，不會消失。
        status.setValue(newVal ? t("正在改為公開…", "正在改为公开…", "Changing to public…") : t("正在改為私人…", "正在改为私人…", "Changing to private…"));
        await repo.updateRepoVisibility(owner, repoName, !newVal);
        privateFlag.setValue(!newVal);
        listDirty.setValue(true);
        const branchLine = branch.value ? t(`預設分支：${branch.value}`, `默认分支：${branch.value}`, `Default branch: ${branch.value}`) : "";
        const isEmptyRepo = items.value !== undefined && items.value.length === 0;
        status.setValue(isEmptyRepo && branchLine ? `${t("（空倉庫）", "（空仓库）", "Empty repository")}\n${branchLine}` : branchLine);
        // v1.27：公開跟私人異動完成後都發通知。標題是用戶名／倉庫，
        // 內容是「倉庫已改為公開」或「倉庫已改為私人」。
        // 第一次用時 Scripting 會跳通知權限詢問，請允許，否則只會顯示
        // App 內橫幅；通知發不出來也不影響開關本身，catch 掉就好。
        try {
          const n: any = Notification as any;
          if (n && typeof n.schedule === "function") {
            await n.schedule({
              title: `${owner}/${repoName}`,
              body: newVal ? t("倉庫已改為公開", "仓库已改为公开", "Repository is now public") : t("倉庫已改為私人", "仓库已改为私人", "Repository is now private"),
              threadIdentifier: `github-repo-visibility-${owner}/${repoName}`,
            });
          }
        } catch {}
      } catch (e: any) {
        // 失敗就把開關撥回去，不要讓開關狀態跟實際倉庫狀態不一致。
        publicValue.setValue(oldVal);
        lastSetValue.setValue(oldVal);
        const branchLine2 = branch.value ? t(`預設分支：${branch.value}`, `默认分支：${branch.value}`, `Default branch: ${branch.value}`) : "";
        const isEmptyRepo2 = items.value !== undefined && items.value.length === 0;
        status.setValue(isEmptyRepo2 && branchLine2 ? `${t("（空倉庫）", "（空仓库）", "Empty repository")}\n${branchLine2}` : branchLine2);
        await Dialog.alert({ title: t("變更失敗", "变更失败", "Change failed"), message: String(e?.message || e) });
      } finally {
        visibilityBusy.setValue(false);
      }
    })();
  }, [publicValue.value]);

  // v1.25：返回上一層時自動刷新。這個 cleanup 只在瀏覽頁被關掉（返回清單）
  // 時跑，推檔案詳情頁時瀏覽頁還在，不會誤觸發；只有 listDirty 是 true 才叫
  // 清單刷新，沒改過就不刷新。
  useEffect(() => {
    return () => {
      if (listDirty.value && onListDirty) {
        try {
          onListDirty();
        } catch {}
      }
    };
  }, []);

  // v1.6 關鍵改法：不再有不帶 Token 模式。診斷已證實，不帶 Token 忽成功忽 403，
  // 共用 IP 額度被別人用完就擋下，公開庫也一樣；帶 Token 則在診斷裡秒回 7 筆。
  // 所以瀏覽一律用 Token，沒 Token 就直接說要去使用者頁填，不要再去試不帶 Token 那條路。
  // 另外，分割畫面的詳細窗格換倉庫時可能不會重新掛載元件，useEffect 只跑一次
  // 就會停在舊倉庫的狀態，所以改成倉庫、分支、路徑一變就重新載入。
  async function load() {
    const gen = generation.value + 1;
    generation.setValue(gen);
    error.setValue("");
    completed.setValue(false);
    failed.setValue(false);
    // 多帳號清單帶 Token 進來時用那個 Token，不要被 Storage 的使用中 Token 蓋掉；
    // 沒帶時照舊，先從 Storage 同步一次 Token，避免單例裡的舊值。
    if (accountToken) {
      repo.token = accountToken;
    } else {
      try {
        const saved = Storage.get("repo_editor_token") || "";
        if (saved) repo.token = saved;
      } catch {}
    }
    if (!repo.token) {
      items.setValue([]);
      error.setValue(t("請先在使用者填入 Token，公開庫也需要 Token 讀取（不帶 Token 的共用 IP 額度已用完）。", "请先在用户填入 Token，公开库也需要 Token 读取（不带 Token 的共用 IP 额度已用完）。", "Please enter a Token on the User page first. Public repositories also require a Token, because the shared-IP quota without a Token is exhausted."));
      status.setValue(t("失敗", "失败", "Failed"));
      failed.setValue(true);
      return;
    }
    // 2026-11-05 回饋：載入中狀態不要擠成一段，照下面分行排版。
    // Text 遇到 \n 會換行，其他狀態字串本來就這樣分行。
    // 2026-11-05 回饋定稿：倉庫名跟請求同一行、加「」，Token 跟時間
    // 各一行（上一版 Token 跟時間併同一行是錯的，已經改回分行）。
    status.setValue(
      t(`請求 GitHub 中...「${owner}/${repoName}${currentPath.value ? `/${currentPath.value}` : ""}」\n• 分支 ${branch.value || initialBranch || "（未知）"}\n• Token：${repo.token ? "有" : "無"}\n${new Date().toLocaleTimeString()}`, `请求 GitHub 中...「${owner}/${repoName}${currentPath.value ? `/${currentPath.value}` : ""}」\n• 分支 ${branch.value || initialBranch || "（未知）"}\n• Token：${repo.token ? "有" : "无"}\n${new Date().toLocaleTimeString()}`, `Requesting GitHub... "${owner}/${repoName}${currentPath.value ? `/${currentPath.value}` : ""}"\n• Branch ${branch.value || initialBranch || "(unknown)"}\n• Token: ${repo.token ? "Yes" : "No"}\n${new Date().toLocaleTimeString()}`),
    );
    // v1.20：有了公開開關後，狀態不再寫 Public / Private，公開與否看開關就好。
    // 完成時只剩預設分支那一行，空倉庫才多一行空倉庫標記。
    // （v1.19 之前是「· Private ·」前後各一個點，現在連 Private 都不顯示了，
    // 所以那兩個點也跟著不用了。）
    function completionStatus(isEmpty: boolean): string {
      const branchLine = branch.value ? t(`預設分支：${branch.value}`, `默认分支：${branch.value}`, `Default branch: ${branch.value}`) : "";
      return isEmpty && branchLine ? `${t("（空倉庫）", "（空仓库）", "Empty repository")}\n${branchLine}` : isEmpty ? t("（空倉庫）", "（空仓库）", "Empty repository") : branchLine;
    }
    try {
      let b = branch.value || initialBranch;
      let repoInfo: any = null;
      if (!b || privateFlag.value === undefined) {
        try {
          const info = await repo.getRepo(owner, repoName);
          repoInfo = info;
          if (!b) {
            b = info.default_branch || "main";
            branch.setValue(b);
          }
          if (privateFlag.value === undefined && typeof info.private === "boolean") {
            privateFlag.setValue(info.private);
          }
        } catch {
          // getRepo 失敗不擋目錄載入，狀態就只顯示能確定的部分。
          if (!b) b = "main";
        }
      }
      // v2.0.0：倉庫最後更新。上面已經拿到 repo 資訊就直接用，沒拿到
      // （清單帶著分支跟私人旗標進來的）才另外打一次 getRepo；同一倉庫
      // 只打一次，換資料夾不再重打。取 pushed_at（最後推送），沒有才退回
      // updated_at；空倉庫或拿不到就不顯示那一行，不要擋目錄載入。
      const updatedKey = `${owner}/${repoName}`;
      if (updatedFor.value !== updatedKey) {
        try {
          const info = repoInfo || (await repo.getRepo(owner, repoName));
          updatedFor.setValue(updatedKey);
          const iso = (info as any)?.pushed_at || (info as any)?.updated_at || null;
          if (typeof iso === "string") lastUpdated.setValue(formatRelative(iso));
        } catch {
          updatedFor.setValue(updatedKey);
        }
      }
      const data = await repo.getContents(owner, repoName, currentPath.value, b);
      // 逾時或切換倉庫後才回來的舊結果，直接丟棄，不要覆蓋新一次載入的狀態。
      if (generation.value !== gen) return;
      status.setValue(t("收到回應，整理中…", "收到回应，整理中…", "Response received, organizing…"));
      if (data === null) {
        items.setValue([]);
        // v2.1.4：空倉庫說明標點改成「可能是空倉庫；或預設分支…」
        // （逗號改分號，三語一起改；資料夾空的「此資料夾是空的」跟
        // 狀態列的「（空倉庫）」都不動，只改這一句）。
        // v2.1.5：這兩句話分行，；後面加換行，三語一起換。
        error.setValue(t("此倉庫目前沒有內容，可能是空倉庫；\n或預設分支上還沒有提交。", "此仓库目前没有内容，可能是空仓库；\n或默认分支上还没有提交。", "This repository has no content yet. It may be empty;\nor the default branch has no commits yet."));
        status.setValue(completionStatus(true));
        completed.setValue(true);
        if (privateFlag.value !== undefined) {
          publicValue.setValue(!privateFlag.value);
          lastSetValue.setValue(!privateFlag.value);
        }
        return;
      }
      if (!Array.isArray(data)) throw new Error(t("此路徑不是資料夾", "此路径不是文件夹", "This path is not a folder"));
      const dirs = data.filter((d: any) => d.type === "dir");
      const files = data.filter((d: any) => d.type === "file");
      dirs.sort((a: any, b: any) => a.name.localeCompare(b.name));
      files.sort((a: any, b: any) => a.name.localeCompare(b.name));
      items.setValue([...dirs, ...files]);
      status.setValue(completionStatus(false));
      completed.setValue(true);
      if (privateFlag.value !== undefined) {
        publicValue.setValue(!privateFlag.value);
        lastSetValue.setValue(!privateFlag.value);
      }
    } catch (e: any) {
      if (generation.value !== gen) return;
      items.setValue([]);
      error.setValue(t(`載入失敗：${String(e?.message || e)}`, `载入失败：${String(e?.message || e)}`, `Failed to load: ${String(e?.message || e)}`));
      status.setValue(t("失敗", "失败", "Failed"));
      completed.setValue(false);
      failed.setValue(true);
    }
  }

  // v1.7：堆疊導航每次推入都是全新掛載，所以只在掛載時載入一次，
  // 不再用倉庫/分支/路徑當依賴，避免重複載入互相丟棄結果。
  // v2.1.5：掛載這次載入完成後才寫標題（load() 本身失敗也會正常結束，
  // 所以成功跟失敗兩個回呼都寫標題，不怕失敗就沒標題）；currentPath.value
  // 是當下讀的，萬一載入途中使用者已經點進資料夾，寫的也是資料夾名，
  // 不會寫錯回根目錄。掛載 effect 裡寫標題那招已經拿掉了（對 q1 沒用）。
  useEffect(() => {
    load().then(syncNavTitle, syncNavTitle);
  }, []);

  async function upload() {
    if (!branch.value) {
      await Dialog.alert({ title: t("請稍候", "请稍候", "Please wait"), message: t("還在載入分支資訊，等載入完成再上傳。", "还在载入分支资讯，等载入完成再上传。", "Still loading branch information. Wait for loading to finish before uploading.") });
      return;
    }
    try {
      const picked = await DocumentPicker.pickFiles({ allowsMultipleSelection: true });
      if (!picked || picked.length === 0) return;
      let done = 0;
      for (const localPath of picked) {
        const name = basename(localPath);
        const dest = currentPath.value ? `${currentPath.value}/${name}` : name;
        const data = Data.fromFile(localPath);
        if (!data) throw new Error(t(`讀取失敗：${name}`, `读取失败：${name}`, `Failed to read: ${name}`));
        const existing = await repo.getContents(owner, repoName, dest, branch.value);
        if (existing && existing.type === "file") {
          const ok = await Dialog.confirm({
            title: t("檔案已存在", "文件已存在", "File already exists"),
            message: t(`確定要覆蓋以下檔案嗎？\n${dest}\n此操作不可撤銷！`, `确定要覆盖以下文件吗？\n${dest}\n此操作不可撤销！`, `Overwrite the following file?\n${dest}\nThis action cannot be undone!`),
          });
          if (!ok) continue;
          await repo.putFile({
            owner,
            repo: repoName,
            path: dest,
            branch: branch.value,
            message: t(`上傳 ${dest}（Scripting）`, `上传 ${dest}（Scripting）`, `Upload ${dest} (Scripting)`),
            base64: data.toBase64String(),
            sha: existing.sha,
          });
        } else {
          await repo.putFile({
            owner,
            repo: repoName,
            path: dest,
            branch: branch.value,
            message: t(`上傳 ${dest}（Scripting）`, `上传 ${dest}（Scripting）`, `Upload ${dest} (Scripting)`),
            base64: data.toBase64String(),
          });
        }
        done += 1;
      }
      if (done > 0) {
        await load();
        if (onSaved) onSaved();
        await Dialog.alert({ title: t("完成", "完成", "Done"), message: t(`已上傳 ${done} 個檔案到 ${branch.value} 分支。`, `已上传 ${done} 个文件到 ${branch.value} 分支。`, `Uploaded ${done} files to the ${branch.value} branch.`) });
      }
    } catch (e: any) {
      await Dialog.alert({ title: t("上傳失敗", "上传失败", "Upload failed"), message: String(e?.message || e) });
    }
  }

  // v1.19：Fork 按鈕。只在看別人倉庫時顯示，自己的倉庫不需要 Fork。
  // 帳號名稱優先用分區傳進來的，否則用使用中帳號的名稱；「我的帳號」是舊版
  // 佔位名稱，不算真的帳號名，名稱未知時先顯示按鈕，點了再用 /user 確認。
  const effectiveUsername =
    accountUsername && accountUsername !== "我的帳號"
      ? accountUsername
      : (() => {
          try {
            return Storage.get("repo_editor_username") || "";
          } catch {
            return "";
          }
        })();
  const showFork =
    !effectiveUsername || owner.toLowerCase() !== effectiveUsername.toLowerCase();
  // v1.20：公開開關跟 Fork 相反，只在自己的倉庫顯示，別人倉庫不顯示；
  // 私人旗標還不知道時先不顯示，避免開關狀態跟實際不一致。
  // 2026-11-05 回饋：公開開關只在根目錄展示，進下層資料夾就不展示，
  // 跟 v2.1.5 刪除倉庫按鈕的根目錄條件一樣，加 !currentPath.value。
  const showPublicToggle =
    !!effectiveUsername &&
    owner.toLowerCase() === effectiveUsername.toLowerCase() &&
    completed.value &&
    privateFlag.value !== undefined &&
    !currentPath.value;

  // v2.1.0：刪除倉庫按鈕，只在自己的倉庫顯示。別人的倉庫本來就刪不掉
  // （GitHub 只讓擁有者刪），顯示了也只會失敗，所以直接不顯示；
  // 刪除不需要等私人旗標跟載入完成，擁有者對得上就可以刪。
  // v2.1.5：再加一個條件，只在第一層根目錄（currentPath 是空的）顯示，
  // 進子資料夾就不要再出現；回上一層回到根目錄時會再出現。
  const showDeleteRepo =
    !!effectiveUsername &&
    owner.toLowerCase() === effectiveUsername.toLowerCase() &&
    !currentPath.value;

  async function deleteRepo() {
    // v2.1.3：確認改成專門的確認頁，不再用 Dialog.actionSheet。
    // actionSheet 的排版是系統固定的：取消在左、確認在右，橫著排，沒辦法
    // 改成上面刪除、下面取消直著排；List 的列本來就是直著排，所以用一個
    // 確認頁來做，上面是紅色的「刪除 owner/repo」，下面是取消，剛好上下兩個按鈕。
    // 依你的習慣：刪除只跳一次確認，不再跳第二次；確認頁回傳 true 才真的刪，
    // 按取消或關掉（回傳空值）就不動。
    const confirmed: any = await Navigation.present(
      <DeleteRepoConfirmView owner={owner} repo={repoName} />,
    );
    if (!confirmed) return;
    try {
      // 瀏覽頁載入時已經把 Token 換成這個倉庫所屬帳號的 Token
      // （清單點進來帶 accountToken，手動開庫用使用中 Token），
      // 所以這裡直接用目前的 Token 刪，不用再換一次。
      await repo.deleteRepo(owner, repoName);
      // 刪完清單上的這個倉庫就過期了，返回上一層時自動刷新，
      // 跟改公開／私人、Fork 成功一樣走 listDirty。
      listDirty.setValue(true);
      await Dialog.alert({
        title: t("完成", "完成", "Done"),
        message: t(`已刪除 "${owner}/${repoName}"`, `已删除 "${owner}/${repoName}"`, `Deleted "${owner}/${repoName}".`),
      });
      dismiss();
    } catch (e: any) {
      const msg = String(e?.message || e);
      await Dialog.alert({
        title: t("刪除失敗", "删除失败", "Delete failed"),
        message: msg.includes("403")
          ? `${msg}\n${t("請確認 Token 已勾選 delete_repo 權限，且這個倉庫是你的。", "请确认 Token 已勾选 delete_repo 权限，且这个仓库是你的。", "Please make sure the Token has the delete_repo permission and that this repository is yours.")}`
          : msg,
      });
    }
  }

  // v3.0：重新命名資料夾。GitHub 沒有資料夾物件，所以是把底下所有
  // 檔案一次換路徑、一次提交完成（repo.renameDirectory），分支不變。
  // 回饋 3：進到資料夾後，倉庫狀態區不再顯示「重新命名此資料夾」，
  // 更名只留在上一層長按資料夾列的選單裡。
  // 新名稱只填單一資料夾名，不填路徑，避免不小心把資料夾搬到別層。
  // 回饋 6：確認本來是 Dialog.confirm，但置中彈窗的確認沒辦法變紅
  // （Gist 刪除對話框就證實過），所以改用 Dialog.actionSheet，
  // actions [{label: 確認, destructive: true}] 才會是紅字，只有 index 0 才真的更名。
  async function renameFolder(folderPath: string) {
    if (!branch.value) {
      await Dialog.alert({ title: t("請稍候", "请稍候", "Please wait"), message: t("還在載入分支資訊，等載入完成再更名。", "还在载入分支资讯，等载入完成再更名。", "Still loading branch information. Wait for loading to finish before renaming.") });
      return;
    }
    const oldName = basename(folderPath);
    const parent = dirname(folderPath);
    const newNameRaw = await Dialog.prompt({
      title: t("重新命名資料夾", "重新命名文件夹", "Rename folder"),
      defaultValue: oldName,
    });
    if (newNameRaw === null || newNameRaw === undefined) return;
    const newName = String(newNameRaw).trim();
    if (!newName) {
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: t("資料夾名稱不能為空。", "文件夹名称不能为空。", "Folder name cannot be empty.") });
      return;
    }
    if (newName.includes("/") || newName.includes("\\") || newName === "." || newName === "..") {
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: t("資料夾名稱不能包含 / 或 ..，只填一個資料夾名就好。", "文件夹名称不能包含 / 或 ..，只填一个文件夹名就好。", "Folder name cannot contain / or ... Enter a single folder name.") });
      return;
    }
    if (newName === oldName) return;
    const newDir = parent ? `${parent}/${newName}` : newName;
    const idx = await Dialog.actionSheet({
      title: t("重新命名資料夾", "重新命名文件夹", "Rename folder"),
      message: t(`確定要把資料夾更名嗎？\n${folderPath} → ${newDir}\n底下所有檔案會一起換路徑`, `确定要把文件夹更名吗？\n${folderPath} → ${newDir}\n底下所有文件会一起换路径`, `Rename this folder?\n${folderPath} → ${newDir}\nAll files under it will move to the new path.`),
      actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
    });
    if (idx !== 0) return;
    try {
      const r = await repo.renameDirectory({
        owner,
        repo: repoName,
        branch: branch.value,
        message: t(`重新命名資料夾 ${folderPath} 為 ${newDir}（Scripting）`, `重新命名文件夹 ${folderPath} 为 ${newDir}（Scripting）`, `Rename folder ${folderPath} to ${newDir} (Scripting)`),
        oldDir: folderPath,
        newDir,
      });
      // 如果更名的是目前正在看的資料夾，就跟著切到新路徑；如果更名的是
      // 上一層的子資料夾，目前這層不變，只要重新載入清單就會看到新名字。
      if (currentPath.value === folderPath) {
        currentPath.setValue(newDir);
        navTitle.setValue(newName);
      }
      items.setValue(undefined);
      await load();
      if (onSaved) onSaved();
      await Dialog.alert({ title: t("完成", "完成", "Done"), message: t(`已更名為 "${newDir}"，共移動 ${r.count} 個檔案。\n舊路徑的 Raw 連結會失效，寫在其他檔案裡的舊路徑也要另外改。`, `已更名为 "${newDir}"，共移动 ${r.count} 个文件。\n旧路径的 Raw 链接会失效，写在其他文件里的旧路径也要另外改。`, `Renamed to "${newDir}", moving ${r.count} files.\nOld Raw links will stop working — update any old paths written in other files too.`) });
    } catch (e: any) {
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: String(e?.message || e) });
    }
  }

  // v3.0 回饋 1：刪除資料夾，只在上一層長按資料夾列的選單裡。
  // 確認用 Dialog.actionSheet 才能讓確認變紅（跟刪除帳號同一招，
  // Dialog.confirm 的確認沒辦法變紅），只有 index 0 才真的刪；
  // 取消或點外面都留在原地。刪除本身也是一次提交（repo.deleteDirectory），
  // 底下所有檔案一起刪，分支不變。
  async function deleteFolder(folderPath: string) {
    if (!branch.value) {
      await Dialog.alert({ title: t("請稍候", "请稍候", "Please wait"), message: t("還在載入分支資訊，等載入完成再刪除。", "还在载入分支资讯，等载入完成再删除。", "Still loading branch information. Wait for loading to finish before deleting.") });
      return;
    }
    const idx = await Dialog.actionSheet({
      title: t("刪除資料夾", "删除文件夹", "Delete folder"),
      message: t(`確定要刪除以下資料夾嗎？\n「${folderPath}」\n此操作不可撤銷！\n資料夾內的所有檔案都會一併刪除`, `确定要删除以下文件夹吗？\n「${folderPath}」\n此操作不可撤销！\n文件夹内的所有文件都会一并删除`, `Are you sure you want to delete the following folder?\n"${folderPath}"\nThis action cannot be undone!\nAll files in the folder will be deleted as well.`),
      actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
    });
    if (idx !== 0) return;
    try {
      const r = await repo.deleteDirectory({
        owner,
        repo: repoName,
        branch: branch.value,
        message: t(`刪除資料夾 ${folderPath}（Scripting）`, `删除文件夹 ${folderPath}（Scripting）`, `Delete folder ${folderPath} (Scripting)`),
        dir: folderPath,
      });
      items.setValue(undefined);
      await load();
      await Dialog.alert({ title: t("完成", "完成", "Done"), message: t(`已刪除 "${folderPath}"，共刪除 ${r.count} 個檔案。`, `已删除 "${folderPath}"，共删除 ${r.count} 个文件。`, `Deleted "${folderPath}", removing ${r.count} files.`) });
    } catch (e: any) {
      await Dialog.alert({ title: t("刪除失敗", "删除失败", "Delete failed"), message: String(e?.message || e) });
    }
  }

  async function forkRepo() {
    try {
      // v1.50：外面選項只顯示「Fork」，點了先選帳號，不再預設 Fork 到某個帳號。
      // 帳號清單從 Storage 讀；舊版只有單一 Token、還沒進過使用者頁時，
      // 清單可能是空的，那時就用目前 Token 那組帳號當作唯一選項，還是可以 Fork。
      let forkAccounts: { username: string; token: string }[] = [];
      try {
        const raw = Storage.get(ACCOUNTS_KEY) || "";
        const arr = raw ? JSON.parse(raw) : [];
        if (Array.isArray(arr)) {
          forkAccounts = arr.filter((a: any) => a && a.token);
        }
      } catch {}
      if (forkAccounts.length === 0) {
        const fallbackToken = Storage.get(TOKEN_KEY) || repo.token || "";
        if (!fallbackToken) {
          await Dialog.alert({ title: t("無法 Fork", "无法 Fork", "Cannot fork"), message: t("請先在使用者添加帳號。", "请先在用户添加账号。", "Please add an account on the User page first.") });
          return;
        }
        forkAccounts = [{
          username: Storage.get(USERNAME_KEY) || effectiveUsername || "",
          token: fallbackToken,
        }];
      }
      const chosen: any = await Navigation.present(<ForkAccountView accounts={forkAccounts} />);
      if (!chosen || !chosen.token) return;
      const login = chosen.username || "";
      if (login && owner.toLowerCase() === login.toLowerCase()) {
        await Dialog.alert({ title: t("不需要 Fork", "不需要 Fork", "No need to fork"), message: t("這已經是你自己的倉庫，不需要 Fork。", "这已经是你自己的仓库，不需要 Fork。", "This is already your own repository. No need to fork.") });
        return;
      }
      // 依你的習慣：建立新東西前只跳一次確認，不再跳第二次。
      const ok = await Dialog.confirm({
        title: t("Fork 倉庫", "Fork 仓库", "Fork repository"),
        message: t(`確定要 Fork 以下倉庫嗎？\n${owner}/${repoName}\nFork 會建立在${login ? ` ${login} ` : "目前"}帳號下。`, `确定要 Fork 以下仓库吗？\n${owner}/${repoName}\nFork 会建立在${login ? ` ${login} ` : "目前"}账号下。`, `Fork the following repository?\n${owner}/${repoName}\nThe fork will be created under ${login ? `${login} ` : "current "}account.`),
      });
      if (!ok) return;
      const forked: any = await repo.forkRepoForToken(chosen.token, owner, repoName);
      const fullName = forked?.full_name || (login ? `${login}/${repoName}` : repoName);
      // v1.25：Fork 成功也會改變清單（多一個 Fork 來的倉庫），返回上一層時自動刷新。
      listDirty.setValue(true);
      await Dialog.alert({
        title: t("Fork 完成", "Fork 完成", "Fork complete"),
        message: t(`已 Fork 到 ${fullName}。\nFork 是非同步建立的，如果回清單還看不到，等幾秒再按重新整理。之後在那個 Fork 裡編輯、上傳，作者就是 Fork 的帳號。`, `已 Fork 到 ${fullName}。\nFork 是非同步建立的，如果回清单还看不到，等几秒再按重新整理。之后在那个 Fork 里编辑、上传，作者就是 Fork 的账号。`, `Forked to ${fullName}.\nFork creation is asynchronous. If it is not in the list yet, wait a few seconds and refresh. Edits and uploads in that fork will be authored by the fork's account.`),
      });
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("already") || msg.includes("已經")) {
        await Dialog.alert({ title: t("已經 Fork 過", "已经 Fork 过", "Already forked"), message: t(`你已經 Fork 過 ${owner}/${repoName} 了，請到你帳號的倉庫找 ${repoName}。`, `你已经 Fork 过 ${owner}/${repoName} 了，请到你账号的仓库找 ${repoName}。`, `You have already forked ${owner}/${repoName}. Find ${repoName} in your account's repositories.`) });
      } else if (msg.includes("422")) {
        await Dialog.alert({ title: t("Fork 失敗", "Fork 失败", "Fork failed"), message: t(`無法 Fork ${owner}/${repoName}：可能是自己的倉庫，或已經 Fork 過。\n${msg}`, `无法 Fork ${owner}/${repoName}：可能是自己的仓库，或已经 Fork 过。\n${msg}`, `Cannot fork ${owner}/${repoName}: it may be your own repository, or you may have already forked it.\n${msg}`) });
      } else {
        await Dialog.alert({ title: t("Fork 失敗", "Fork 失败", "Fork failed"), message: msg });
      }
    }
  }

  // v1.2 關鍵改法：不再先回傳 ProgressView 才載入，而是先出 List。
  // 就算 API 卡住，使用者也看得到標題、狀態、重新整理和不帶 Token 重試，
  // 不會被一個沒有任何按鈕的「載入中」畫面困住。
  // v1.9：用 Navigation.present 開子資料夾時，該頁需要自己的 NavigationStack，
  // 否則工具列和檔案的 NavigationLink 沒有堆疊可用；根頁已經在主堆疊裡，不用再包一層。
  // v2.1.2：標題改回原本的置頂小標，不要玻璃藥丸。
  // v2.1.1 把標題放工具列 Text，12:52 截圖證實它會被包成玻璃藥丸按鈕，
  // 不是他要的那種沒有底的純文字小標，所以工具列標題整個拿掉，工具列
  // 左邊恢復成原本只有返回鍵（modal 時）或空著（推入時，系統返回鍵）。
  // 回到 navigationTitle（純文字、沒有藥丸底），但根目錄標題要靠左：
  // v2.0.0 的證據是根目錄標題置中、進資料夾後標題靠左，同一頁兩種位置，
  // 差別只在標題是掛載時就定好、還是之後換路徑才改過去；
  // 所以標題改由 navTitle 帶，掛載時先空，之後才寫進真正的標題。
  // v2.1.5：掛載 effect 裡寫標題那招對 q1 沒用（v2.1.2～v2.1.4 的 q1
  // 根目錄都還是置中），所以掛載 effect 拿掉了，改成掛載那次載入完成後
  // 才寫（load().then），跟使用者點資料夾當下寫一樣，都是畫面出來之後
  // 才換標題；如果這樣 q1 還是置中，代表時機也不是原因，要再想別招。
  // 掛載第一下標題會是空的，載入完成才出現，閃一下是正常的。
  const listElement = (
    <List
      navigationTitle={navTitle.value}
      toolbar={{
        topBarLeading: isModal
          ? [
              <Button
                title={t("返回", "返回", "Back")}
                systemImage={"chevron.left"}
                action={dismiss}
              />,
            ]
          : [],
        topBarTrailing: [
          <Button
            title={t("上傳", "上传", "Upload")}
            systemImage={"square.and.arrow.up"}
            action={upload}
            disabled={items.value === undefined}
          />,
          <Button
            title={t("新增檔案", "新增文件", "Add file")}
            systemImage={"plus"}
            disabled={items.value === undefined || !branch.value}
            action={async () => {
              const r = await Navigation.present(
                <NewFileView owner={owner} repo={repoName} branch={branch.value} dirPath={currentPath.value} />,
              );
              if (r) await load();
            }}
          />,
          <Button
            title={t("重新整理", "重新整理", "Refresh")}
            systemImage={"arrow.clockwise"}
            action={async () => {
              items.setValue(undefined);
              await load();
            }}
          />,
        ],
      }}
    >
      <Section title={`${t("倉庫狀態", "仓库状态", "Repository status")}${privateFlag.value === undefined ? "" : ` · ${privateFlag.value ? "Private" : "Public"}`}`}>
        {showPublicToggle ? (
          <Toggle title={t("公開", "公开", "Public")} value={publicValue} />
        ) : null}
        {completed.value ? (
          // v1.13：綠色圈圈打勾，用 SF Symbol checkmark.circle.fill，不是 emoji ✅。
          // v1.15：完成時只顯示這個打勾，不再寫「完成」兩個字，載入中跟失敗不顯示。
          <HStack spacing={8}>
            <Image systemName={"checkmark.circle.fill"} foregroundStyle={"green"} />
            <Text foregroundStyle={"secondaryLabel"}>{status.value}</Text>
          </HStack>
        ) : failed.value ? (
          // v2.0.0：失敗對應的紅色圈叉，用 SF Symbol xmark.circle.fill，
          // 跟成功那行同一個 HStack 排版；載入中兩者都沒有，只顯示純文字。
          <HStack spacing={8}>
            <Image systemName={"xmark.circle.fill"} foregroundStyle={"red"} />
            <Text foregroundStyle={"secondaryLabel"}>{status.value}</Text>
          </HStack>
        ) : (
          <Text foregroundStyle={"secondaryLabel"}>{status.value}</Text>
        )}
        {completed.value && lastUpdated.value ? (
          // v2.0.0：最後更新前面加一個時鐘圖標，跟上面預設分支那行的打勾用
          // 同一個 HStack（間距 8），文字才會跟預設分支對齊；只在完成時顯示，
          // 載入中跟失敗時狀態那行沒有圖標，對不齊就先不顯示。
          <HStack spacing={8}>
            <Image systemName={"clock"} foregroundStyle={"secondaryLabel"} />
            <Text foregroundStyle={"secondaryLabel"}>{t(`最後更新：${lastUpdated.value}`, `最后更新：${lastUpdated.value}`, `Last updated: ${lastUpdated.value}`)}</Text>
          </HStack>
        ) : null}
        {showFork ? (
          <Button title={t("Fork", "Fork", "Fork")} systemImage={"arrow.branch"} action={forkRepo} />
        ) : null}

        {error.value ? (
          <Text foregroundStyle={"secondaryLabel"}>{error.value}</Text>
        ) : null}
        {items.value === undefined ? (
          <Text font={"callout"} foregroundStyle={"secondaryLabel"}>
            {t("加載超過15秒，代表請求逾時；\n請按右上角重新整理再試一次。", "加载超过15秒，代表请求逾时；\n请按右上角重新整理再试一次。", "If loading takes more than 15 seconds, the request timed out;\nTap Refresh at the top right and try again.")}
          </Text>
        ) : null}
        {currentPath.value ? (
          <Button
            title={t(`上一層（${dirname(currentPath.value) || "根目錄"}）`, `上一层（${dirname(currentPath.value) || "根目录"}）`, `Previous folder (${dirname(currentPath.value) || "Root"})`)}
            systemImage={"chevron.left"}
            action={async () => {
              const parent = dirname(currentPath.value);
              currentPath.setValue(parent);
              navTitle.setValue(parent ? basename(parent) : repoName);
              items.setValue(undefined);
              await load();
            }}
          />
        ) : null}
      </Section>
      {items.value !== undefined ? (
        <Section title={`${owner}/${repoName} · ${branch.value}${currentPath.value ? ` · ${currentPath.value}` : ""}`}>
          {items.value.length === 0 && !error.value ? (
            <Text font={"callout"} foregroundStyle={"secondaryLabel"}>
              {t("此資料夾是空的。", "此文件夹是空的。", "This folder is empty.")}
            </Text>
          ) : (
            items.value.map((item) =>
              item.type === "dir" ? (
                // v1.10：資料夾不再換頁。v1.9 的 Navigation.present 在裝置上點了進不去，
                // 所以點資料夾就是直接把 currentPath 改成那個資料夾、清空列表、重新載入，
                // 同一頁顯示下一層，不需要再開一個瀏覽頁，也就沒有遞迴目的頁的問題。
                <Button
                  key={item.path}
                  title={`${item.name}/`}
                  systemImage={"folder"}
                  contextMenu={{
                    menuItems: (
                      <>
                        <Section>
                          <Button
                            title={t("重新命名資料夾", "重新命名文件夹", "Rename folder")}
                            systemImage={"pencil"}
                            action={async () => await renameFolder(item.path)}
                          />
                          <Button
                            title={t("刪除此資料夾", "删除此文件夹", "Delete this folder")}
                            systemImage={"trash"}
                            role={"destructive"}
                            action={async () => await deleteFolder(item.path)}
                          />
                        </Section>
                      </>
                    ),
                  }}
                  action={async () => {
                    currentPath.setValue(item.path);
                    navTitle.setValue(basename(item.path));
                    items.setValue(undefined);
                    await load();
                  }}
                />
              ) : (
                <NavigationLink
                  key={item.path}
                  title={item.name}
                  destination={
                    <FileDetailView
                      owner={owner}
                      repo={repoName}
                      branch={branch.value}
                      path={item.path}
                      onSaved={async () => await load()}
                      onMoved={async (newPath) => {
                        // 2026-11-05 回饋：檔案改名後瀏覽頁要切到新檔案
                        // 所在的資料夾再重載，不然返回時還停在舊資料夾，
                        // 新檔案看起來像消失了。根目錄的檔案 dirname 是空字串。
                        const dir = newPath.includes("/") ? newPath.slice(0, newPath.lastIndexOf("/")) : "";
                        currentPath.setValue(dir);
                        navTitle.setValue(dir ? basename(dir) : repoName);
                        // 2026-11-05 黑畫面回饋：不要先把 items 清成 undefined，
                        // 不然返回瀏覽頁時清單是空的、只剩載入中，看起來像黑畫面。
                        // 舊清單留著，等 load() 回來再換成新清單，畫面不會先空白。
                        await load();
                      }}
                    />
                  }
                />
              ),
            )
          )}
        </Section>
      ) : null}
      <Section>
        <Text font={"footnote"} foregroundStyle={"secondaryLabel"}>
          {t(`所有寫入都是直接提交到上方顯示的分支，\n不會另外開分支或發 PR。`, `所有写入都是直接提交到上方显示的分支，\n不会另外开分支或发 PR。`, `All writes are committed directly to the branch shown above. No new branch or PR is created.`)}
        </Text>
      </Section>
      {showDeleteRepo ? (
        // v2.1.1：刪除倉庫單獨放在最底下一區，不跟倉庫狀態那區擠在一起。
        // 紅色做法跟 v2.1.0 一樣（role destructive + foregroundStyle 紅色），
        // 12:48 那張截圖已經證實紅色有出來（圖標跟文字都是紅的），搬家不改顏色。
        <Section>
          <Button title={t("刪除倉庫", "删除仓库", "Delete repository")} systemImage={"trash"} role={"destructive"} foregroundStyle={"red"} action={deleteRepo} />
        </Section>
      ) : null}
    </List>
  );
  if (isModal) return <NavigationStack>{listElement}</NavigationStack>;
  return listElement;
}

// v2.1.3：刪除倉庫確認頁。瀏覽頁最底下那列點了之後跳到這裡，
// 不再跳 Dialog.actionSheet（它的取消跟確認是橫著排，改不成直排）。
// 這頁只有上下兩個按鈕：上面紅字「刪除 owner/repo」，點了回傳 true；
// 下面「取消」，點了回傳空值；關掉頁面也算取消。
// v2.1.5：上面那顆按下去之後，還會再跳第二次確認，確認了才回傳 true；
// 這是他明確要求的，只有刪除倉庫是兩次確認。
// v2.1.6：第二次確認改用 Dialog.actionSheet（置中小彈窗的確認沒辦法變紅），
// 紅色確認才回傳 true。
// v2.1.7：第二次確認標題跟內文分開，標題是警告行，內文三行，倉庫名有括號。
// 警告文字跟對話框原本的訊息一樣（倉庫名那行維持原色，12:57 那次
// 說不用改紅字了，所以這裡不把名字另外上色，紅的是按鈕上的名字）。
function DeleteRepoConfirmView({ owner, repo: repoName }: { owner: string; repo: string }) {
  const dismiss = Navigation.useDismiss();
  return (
    <NavigationStack>
      <List
        navigationTitle={t("刪除倉庫", "删除仓库", "Delete repository")}
        navigationBarTitleDisplayMode={"inline"}
      >
        <Section>
          <Text>
            {/* v2.1.6：第一層確認頁警告裡的倉庫名加上「」，三語一起加；
                紅色按鈕上的名字不加括號（按鈕是「刪除 倉庫名」，不是顯示用名字）。 */}
            {t(`確定要刪除以下倉庫嗎？\n「${owner}/${repoName}」\n此操作不可撤銷！\n倉庫內的所有內容都會一併刪除。`, `确定要删除以下仓库吗？\n「${owner}/${repoName}」\n此操作不可撤销！\n仓库内的所有内容都会一并删除。`, `Are you sure you want to delete the following repository?\n「${owner}/${repoName}」\nThis action cannot be undone!\nAll contents in the repository will be deleted as well.`)}
          </Text>
        </Section>
        <Section>
          <Button title={t(`刪除 ${owner}/${repoName}`, `删除 ${owner}/${repoName}`, `Delete ${owner}/${repoName}`)} systemImage={"trash"} role={"destructive"} foregroundStyle={"red"} action={async () => {
            // v2.1.6：按刪除倉庫名之後，跳第二次確認。置中的小彈窗
            // （Dialog.confirm）沒辦法把確認變紅，系統不讓改，這是之前
            // Gist 刪除對話框就證實過的，所以這裡改用 Dialog.actionSheet：
            // 它的 destructive 確認會是紅色，取消是白色，只有按到紅色確認
            // （index 0）才真的刪，取消或點外面都留在確認頁。
            // v2.1.7：他 13:27 釐清第二次確認的結構，標題跟內文分開，
            // 內文只留三行（問句、括號倉庫名、不可撤銷）；確認維持紅色 destructive。
            // v2.1.8：他 13:31 再簡化標題，警告前綴拿掉，只剩「最後確認」。
            // 注意：這是他明確要求的第二次確認，跟平常「刪除只跳一次確認」
            // 的習慣不一樣，只有刪除倉庫是這樣。
            const idx = await Dialog.actionSheet({
              title: t("最後確認", "最后确认", "Final confirmation"),
              message: t(`確定要刪除以下倉庫嗎？\n「${owner}/${repoName}」\n此操作不可撤銷！`, `确定要删除以下仓库吗？\n「${owner}/${repoName}」\n此操作不可撤销！`, `Are you sure you want to delete the following repository?\n「${owner}/${repoName}」\nThis action cannot be undone!`),
              actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
            });
            if (idx === 0) dismiss(true);
          }} />
          {/* v2.1.4：取消加藍色 X 圖標。按鈕預設顏色本來就是系統藍（刪除列
              要另外設紅色才會變紅就是證明），所以只加 systemImage xmark 就好，
              不用另外設顏色，圖標跟文字就會都是藍色。 */}
          <Button title={t("取消", "取消", "Cancel")} systemImage={"xmark"} action={() => dismiss()} />
        </Section>
      </List>
    </NavigationStack>
  );
}

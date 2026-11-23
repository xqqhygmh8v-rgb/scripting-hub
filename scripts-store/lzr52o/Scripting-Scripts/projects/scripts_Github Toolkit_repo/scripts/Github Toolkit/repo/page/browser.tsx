import { ThemeCardBackground, useThemePalette } from "../../components/themePalette";
import { afterDismiss } from "../../components/afterDismiss";
import { traceDelete } from "../../components/deleteTrace";
import { REPO_LIST, RepoHeader, RepoSummary, RepoEntry, RepoIcon } from "../../components/repoUI";
import {
  List,
  Navigation,
  NavigationLink,
  NavigationStack,
  Button,
  Divider,
  Section,
  Text,
  HStack,
  VStack,
  Spacer,
  Image,
  Label,
  Rectangle,
  ProgressView,
  useEffect,
  useObservable,
  useRef,
  useState,
} from "scripting";
import { ACCOUNTS_KEY, TOKEN_KEY, USERNAME_KEY, basename, dirname, repo, type RepoItem } from "../class/repo";
import { t } from "../../components/i18n";
import { View as FileDetailView } from "./fileDetail";
import { View as NewFileView } from "./newFile";
import { View as ForkAccountView } from "./forkAccount";
import { PAGE_BACKGROUND, CARD_BACKGROUND, DIVIDER_COLOR } from "../../components/theme";
import { GlassBackground } from "../../components/glass";
import { BranchListPage, PullRequestsPage } from "./collaboration";
import { SwipeRowBackground } from "../../components/swipeRowBackground";

export function View({
  owner,
  repo: repoName,
  branch: initialBranch,
  path,
  onSaved,
  isModal,
  isPrivate,
  isFork,
  accountToken,
  accountUsername,
  onListDirty,
  readOnly,
}: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  onSaved?: () => void;
  isModal?: boolean;
  isPrivate?: boolean;
  // 1.0.3：清單／搜尋結果點進來時帶這個倉庫是不是 Fork（GitHub 列表
  // API 的 fork 欄位），不用等背景 getRepo 才知道，公開開關一開始
  // 就不會閃現；沒帶時（收藏、手动開庫）由下面 getRepo 補。
  isFork?: boolean;
  // v1.15：多帳號清單點進來時帶該帳號的 Token，瀏覽、編輯、上傳都用這個 Token，
  // 不用先去設定切換使用中帳號；沒帶時沿用原本的使用中 Token。
  accountToken?: string;
  // v1.19：同理，帳號分區點進來時帶該區帳號名稱，用來判斷是不是自己的倉庫；
  // 手動開庫沒帶時用 Storage 裡的使用者名稱。v1.50 起 Fork 不再用這個名稱決定
  // 建立在哪個帳號下，點 Fork 後會先選帳號，再用選到的帳號去 Fork。
  accountUsername?: string;
  // v1.25：清單頁在瀏覽頁關掉（返回上一層）時要不要自動刷新，由這個回呼決定；
  // 只有改過公開／私人或 Fork 過，清單才真的需要刷新，檔案上傳編輯不影響清單。
  onListDirty?: (newRepo?: any) => void;
  // 1.1.14：收藏倉庫進來就是唯讀（Kristen：不要有寫入選項）。收藏頁開的瀏覽頁
  // 帶 readOnly=true；首頁自己倉庫開的不帶，照舊可以寫入。唯讀時工具列的上傳／
  // 新增檔案按鈕、公開開關、刪除倉庫都藏起來，檔案詳情頁也只留下載跟複製連結。
  readOnly?: boolean;
}) {
  const dismiss = Navigation.useDismiss();
  // 2.0.11：這頁的強調色改成跟背景主題連動。之前 PR／同步 Fork／分支藥丸／
  // 超前落後數字都寫死 REPO_ACCENT（藍綠），換成橘黃或藍紫背景時
  // 按鈕還是藍綠色，跟背景對不上。改用 themePalette 的 accent（文字／圖標）
  // 跟 selected（同色系的淡底）——那組本來就是每個主題各自算好的，
  // 所以切主題時按鈕會跟著換。
  const palette = useThemePalette();
  const items = useObservable<RepoItem[] | undefined>(undefined);
  // 資料夾滑動開啟中的路徑，開啟時列背景四角變圓弧。
  const [openSwipeFolder, setOpenSwipeFolder] = useState("");
  // 2.0.28：刪資料夾的忙碌顯示；2.0.29 改成統一版（圖標轉圈圈、
  // 名字第一行、第二行紅色小字「刪除中…」），跟 Gist 首頁同一套；
  // 刪完（成功或失敗）清掉。
  const [busyFolder, setBusyFolder] = useState("");
  // 2026-11-19：刪除資料夾的同步鎖（state 不是同步的，連點會跑兩次）。
  const deletingFolder = useRef(false);
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
  // 3.1：根目錄標題改成擁有者／用戶名（使用者要求）。倉庫名在下面標題卡
  // 第一行已經有了，標題列不重複顯示，順便讓標題列短一點。
  // 3.3：再往前一步——每一層（根目錄、每個資料夾）置頂標題都固定顯示
  // 用戶名，不再跟著資料夾名換。理由同上面：目前資料夾名字已經寫在
  // 檔案清單的分區標題（folder 圖標那一行），置頂再寫一次就是重複，
  // 而置頂固定顯示擁有者，隨時都知道自己在看誰的倉庫。
  function syncNavTitle() {
    navTitle.setValue(owner);
  }
  // v1.11：狀態要同步顯示倉庫狀況，私人旗標從清單傳進來；
  // 手動開庫沒有傳時，第一次載入用 getRepo 取得，之後同一頁換資料夾不再重打。
  const privateFlag = useObservable<boolean | undefined>(isPrivate);
  // 1.0.3：是不是 Fork。來源跟 privateFlag 一樣：先用傳進來的 isFork
  // （清單已經有），沒有才由 getRepo 補；背景 forkParent 是另一層後備。
  const isForkFlag = useObservable<boolean | undefined>(isFork);
  const branch = useObservable<string>(initialBranch);
  const defaultBranch = useObservable<string>(initialBranch);
  // 此頁的協作讀取固定使用開啟時的帳號，不依賴之後可能改動的共用 Token。
  const collaborationToken = useObservable<string>(accountToken || repo.token || "");
  const error = useObservable<string>("");
  const status = useObservable<string>(t("準備載入…", "准备载入…", "Preparing to load…"));
  // v1.15：完成只顯示綠色打勾，不再寫「完成」兩個字，所以完成狀態不能再用
  // status 字串開頭判斷，改用獨立的 completed 旗標。
  const completed = useObservable<boolean>(false);
  // v2.0.0：載入失敗旗標。成功用綠色打勾、失敗用紅色叉，載入中兩者都沒有，
  // 所以不能只用 completed 反推，失敗要獨立一個旗標。
  const failed = useObservable<boolean>(false);
  const generation = useObservable<number>(0);
  // 2.1.12：目錄是不是空的。分支未知時先不帶 ref 拿目錄，分支要等背景
  // getRepo 回來才補上（通常比目錄晚）；補上後要把狀態列的「預設分支：x」
  // 補回去，所以要把「空倉庫」這件事記起來。
  const emptyRepo = useObservable<boolean>(false);
  // 明確記錄請求是否已結束；不能用資料是否非 null 判斷，失敗也必須結束載入。
  const headerReady = useObservable<boolean>(false);
  // 2.1.14：上方三列（Star／Watch／Fork、上游比較、PR／同步 Fork）改成
  // 「一次揭露」。之前是各自回來就各自出現：先目錄出來（只有倉庫名那列），
  // 接著計數列插進來、再插上游列、最後同步 Fork 才長出來，整張卡片在
  // 根目錄被推高三次，看起來就是分好幾次刷新。現在等背景 getRepo 與
  // 上游比對都回來才一起顯示，進去先只有倉庫名那一列。
  const detailsReady = useObservable<boolean>(false);

  async function headerRequest<T>(request: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(t("請求逾時，請下拉刷新重試", "请求超时，请下拉刷新重试", "Request timed out. Pull down to retry."))), 15000);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  // 2.1.9：公開／私人開關與刪除倉庫已搬到首頁右滑（repoList），
  // 這一頁不再有開關，所以 publicValue／lastSetValue／visibilityBusy 都移除。
  // listDirty 也一併移除：它原本只由公開／刪除這兩個已搬走的動作設成 true，
  // Fork 成功是直接呼叫 onListDirty(forked)，不靠這個旗標。
  // v2.0.0：倉庫狀態多一行「最後更新：X 天前」。相對時間，不用絕對日期，
  // 使用者一眼就知道這個倉庫多久沒動了。updatedFor 記住已經查過的倉庫，
  // 同一倉庫只打一次 getRepo，換資料夾不再重打（跟分支／私人旗標同一個做法）。
  const lastUpdated = useObservable<string>("");
  const updatedFor = useObservable<string>("");
  // v1.3.0：Fork 同步卡片。forkParent 是上游資訊（fullName 是 parent 的
  // full_name、branch 是 parent 的預設分支）；forkCompare 是跟上游比對的
  // 超前／落後提交數；forkCompareFor 記住已經比對過的倉庫+分支，
  // 同一倉庫+分支只比對一次（跟 updatedFor 同一個做法）。
  const forkParent = useObservable<{ fullName: string; branch: string } | null>(null);
  const forkCompare = useObservable<{ ahead: number; behind: number } | null>(null);
  const forkCompareError = useObservable<string>("");
  const forkCompareFor = useObservable<string>("");
  // 同步／貢獻執行中："" = 閒置，"sync" = 同步中，"contribute" = 開 PR 中。
  // 執行時按鈕列換成轉圈圈 + 狀態文字，兩個按鈕也 disabled，防重複點。
  const forkBusy = useObservable<"" | "sync" | "contribute">("");
  // 1.0.2：Fork 建立中。執行時按鈕換成轉圈圈 + 狀態文字，防重複點；
  // 跟上面同步／貢獻的 forkBusy 同做法。
  const forking = useObservable<boolean>(false);
  // 1.1.4：Star 狀態。starred 是目前 Token 那個帳號有沒有 Star 這個倉庫
  // （undefined = 還沒查到，預設當沒 Star）；starring 是加／取消 Star
  // 執行中，執行中把 Star 按鈕 disabled，防重複點。
  const starred = useObservable<boolean | undefined>(undefined);
  const starring = useObservable<boolean>(false);
  // 1.1.5：倉庫計數（Watch／Fork／Star）。背景 getRepo 回來才有，拿來在
  // 預設分支下面顯示一欄三區的圖標＋數字；點 Star／Unstar 成功時這裡的
  // Star 數跟著 ＋1／－1，不用重打 getRepo。
  const repoCounts = useObservable<{ watch: number; fork: number; star: number } | null>(null);

  function formatRelative(iso: string): string {
    const ms = new Date(iso).getTime();
    if (isNaN(ms)) return "";
    const diff = Date.now() - ms;
    if (diff < 60000) return t("剛剛", "刚刚", "Just now");
    const min = Math.floor(diff / 60000);
    // 2.0.13：相對時間拿掉數字跟單位之間的空白（「7 小時前」→「7小時前」），
    // 標題列已經很擠，少一個全形寬度的空隙就不容易被拆行。
    if (min < 60) return t(`${min}分鐘前`, `${min}分钟前`, `${min}m ago`);
    const hr = Math.floor(min / 60);
    if (hr < 24) return t(`${hr}小時前`, `${hr}小时前`, `${hr}h ago`);
    const day = Math.floor(hr / 24);
    if (day < 30) return t(`${day}天前`, `${day}天前`, `${day}d ago`);
    const mon = Math.floor(day / 30);
    if (mon < 12) return t(`${mon}個月前`, `${mon}个月前`, `${mon}mo ago`);
    const yr = Math.floor(mon / 12);
    return t(`${yr}年前`, `${yr}年前`, `${yr}y ago`);
  }

  // v1.6 關鍵改法：不再有不帶 Token 模式。診斷已證實，不帶 Token 忽成功忽 403，
  // 共用 IP 額度被別人用完就擋下，公開庫也一樣；帶 Token 則在診斷裡秒回 7 筆。
  // 所以瀏覽一律用 Token，沒 Token 就直接說要去使用者頁填，不要再去試不帶 Token 那條路。
  // 另外，分割畫面的詳細窗格換倉庫時可能不會重新掛載元件，useEffect 只跑一次
  // 就會停在舊倉庫的狀態，所以改成倉庫、分支、路徑一變就重新載入。
  // 2.1.13：force=true 跳過目錄清單快取（下拉刷新、寫入後重載用）。
  async function load(opts?: { force?: boolean }) {
    const force = opts?.force === true;
    const gen = generation.value + 1;
    generation.setValue(gen);
    headerReady.setValue(false);
    error.setValue("");
    completed.setValue(false);
    failed.setValue(false);
    // 分割畫面重用元件時不會重新掛載，上一個倉庫的「空倉庫」狀態
    // 不能留給新倉庫，否則背景 getRepo 回來會把狀態列寫成上一個庫的樣子。
    emptyRepo.setValue(false);
    // 2.1.14：同一個倉庫換資料夾時，計數／上游／比對都已經有了，直接視為就緒，
    // 不要每換一層就讓下面三列消失再長回來；換倉庫才重新等一次。
    detailsReady.setValue(updatedFor.value === `${owner}/${repoName}`);
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
      headerReady.setValue(true);
      return;
    }
    // 2.1.15：載入中的狀態列只留一行「載入中…」。之前會列出完整路徑、
    // 分支、Token 有無跟時間，進子目錄時整塊很有壓迫感（使用者回饋）。
    status.setValue(t("載入中…", "载入中…", "Loading…"));
    // v1.20：有了公開開關後，狀態不再寫 Public / Private，公開與否看開關就好。
    // 完成時只剩預設分支那一行，空倉庫才多一行空倉庫標記。
    // （v1.19 之前是「· Private ·」前後各一個點，現在連 Private 都不顯示了，
    // 所以那兩個點也跟著不用了。）
    function completionStatus(isEmpty: boolean): string {
      const branchLine = branch.value ? t(`預設分支：${branch.value}`, `默认分支：${branch.value}`, `Default branch: ${branch.value}`) : "";
      return isEmpty && branchLine ? `${t("（空倉庫）", "（空仓库）", "Empty repository")}\n${branchLine}` : isEmpty ? t("（空倉庫）", "（空仓库）", "Empty repository") : branchLine;
    }
    try {
      const b = branch.value || initialBranch;
      let repoInfo: any = null;
      // 2.1.12：以前分支或公開／私人狀態未知時，會先 await getRepo 才打目錄。
      // 收藏頁開進來的倉庫 branch 通常是空的，等於每次進詳情都先多一個完整
      // 往返（最壞 15 秒）才開始抓檔案。現在 getRepo 改成背景跑，目錄請求
      // 立刻送出、分支未知時不帶 ref（GitHub 會用預設分支回覆），兩者並行。
      const needRepoInfo = !b || privateFlag.value === undefined;
      const repoInfoTask: Promise<any> = needRepoInfo
        ? headerRequest(repo.getRepo(owner, repoName)).catch(() => null)
        : Promise.resolve(null);
      const applyRepoInfo = (info: any) => {
        if (!info || generation.value !== gen) return;
        repoInfo = info;
        const hadBranch = !!branch.value;
        if (!branch.value && info.default_branch) branch.setValue(info.default_branch);
        // 2.1.12：目錄比 getRepo 先回來時，完成狀態是照「分支還不知道」寫的
        // （空倉庫只寫「（空倉庫）」、非空則是空字串）。分支一補上就重寫，
        // 不然「預設分支：x」那一行永遠不會出現。
        if (!hadBranch && branch.value && completed.value) {
          status.setValue(completionStatus(emptyRepo.value));
        }
        if (privateFlag.value === undefined && typeof info.private === "boolean") {
          privateFlag.setValue(info.private);
        }
        if (isForkFlag.value === undefined && typeof info.fork === "boolean") {
          isForkFlag.setValue(info.fork);
        }
      };
      // 背景補上分支、公開狀態與 Fork 旗標，回來再更新，不擋目錄。
      repoInfoTask.then(applyRepoInfo).catch(() => {});
      // 2026-11-07：倉庫資訊（最後更新、Fork）改成清單出來後在背景查，
      // 不再擋在 getContents 前面。之前是 getRepo 先跑、回來才打
      // getContents，兩個請求串起來要等很久，getRepo 一掛住（15 秒）
      // 就整頁跟著卡；現在目錄一回來就先顯示，getRepo 在背景補。
      const data = await headerRequest(repo.getContents(owner, repoName, currentPath.value, b, force));
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
      }
      if (data !== null && !Array.isArray(data)) throw new Error(t("此路徑不是資料夾", "此路径不是文件夹", "This path is not a folder"));
      const dirs = (data || []).filter((d: any) => d.type === "dir");
      const files = (data || []).filter((d: any) => d.type === "file");
      dirs.sort((a: any, b: any) => a.name.localeCompare(b.name));
      files.sort((a: any, b: any) => a.name.localeCompare(b.name));
      items.setValue([...dirs, ...files]);
      emptyRepo.setValue(data === null);
      status.setValue(completionStatus(data === null));
      completed.setValue(true);
      // 2.1.12：上方資訊不再等背景的 getRepo／compareFork／Star 全部回來。
      // 以前這裡要等 Promise.all(headerTasks)，只要其中一個慢（最多 15 秒），
      // 標題卡就一直是「載入中…」，看起來像整頁卡住；現在目錄一回來就先
      // 揭露標題，計數、最後更新、超前／落後再各自補上。
      headerReady.setValue(true);
      // Fork 上游比對在背景跑；檔案清單可先操作。
      // generation 對不上就丟棄結果，避免舊載入覆蓋新資料夾。
      const fp = forkParent.value;
      // 2.1.12：背景拿到 getRepo 後分支一定有了；這裡用 info.default_branch 補上，
      // 避免分支還空著就組出 compare/…... 的空 head。
      const branchForCompare = b || branch.value || initialBranch || (repoInfo && repoInfo.default_branch) || "";
      const compareKey = `${owner}/${repoName}@${branchForCompare}`;
      // 2.1.10：拿掉 !currentPath.value——比對是看分支而不是路徑，子目錄也要
      // 算超前／落後，底下那顆「同步 Fork」才會跟根目錄一樣出現。
      // 2.1.12：分支還不知道時不比對（以前分支空著也會組出錯誤 URL）。
      if (fp && branchForCompare && forkCompareFor.value !== compareKey) {
        forkCompareFor.setValue(compareKey);
        const parentOwner = fp.fullName.split("/")[0] || "";
        const parentBranch = fp.branch;
        // 2.1.12：不再塞進 headerTasks（那個陣列已經沒人 await 了），
        // 直接背景跑；錯誤在下面自己接住。
        (async () => {
          try {
            const cmp: any = await headerRequest(repo.compareFork(owner, repoName, parentOwner, parentBranch, branchForCompare));
            if (generation.value !== gen) return;
            forkCompare.setValue({ ahead: cmp?.ahead_by ?? 0, behind: cmp?.behind_by ?? 0 });
            forkCompareError.setValue("");
          } catch (e: any) {
            if (generation.value !== gen) return;
            forkCompareError.setValue(String(e?.message || e));
            forkCompareFor.setValue("");
          }
        })();
      }
      // 2026-11-07：倉庫資訊背景查（最後更新、Fork）。
      // 上面已經拿到 repo 資訊（分支未知時那次 getRepo）就直接用，
      // 沒拿到才另外打一次 getRepo。
      // 同一倉庫只打一次，換資料夾不再重打。取 pushed_at（最後推送），
      // 沒有才退回 updated_at；空倉庫或拿不到就不顯示那一行。
      // Fork 比對也在這裡觸發（要等 forkParent 回來才知道是不是 Fork）；
      // forkParent 已經在的情況（分割畫面重用、同一倉庫換資料夾）由上面
      // 那個比對 IIFE 處理，forkCompareFor 會擋掉重複比對。
      const updatedKey = `${owner}/${repoName}`;
      if (updatedFor.value !== updatedKey) {
        // 換倉庫時先清掉上一個倉庫的 Fork 狀態：分割畫面重用元件時
        // 不會重新掛載，舊倉庫的 Fork 卡片不能殘留給新倉庫。
        forkParent.setValue(null);
        forkCompare.setValue(null);
        forkCompareError.setValue("");
        forkCompareFor.setValue("");
        // 2.1.12：同上，直接背景跑。清單已經顯示了才跑，不擋上方揭露。
        (async () => {
          try {
            // 2.1.12：不要另外再打一次 /repos；repoInfoTask 沒回才自己打。
            const info = repoInfo || (await repoInfoTask) || (await headerRequest(repo.getRepo(owner, repoName)));
            if (generation.value !== gen) return;
            if (info.default_branch) defaultBranch.setValue(info.default_branch);
            const iso = (info as any)?.pushed_at || (info as any)?.updated_at || null;
            lastUpdated.setValue(typeof iso === "string" ? formatRelative(iso) : "");
            if (typeof info.private === "boolean") {
              privateFlag.setValue(info.private);
            }
            if (typeof info.fork === "boolean") isForkFlag.setValue(info.fork);
            // 1.1.5：倉庫計數。跟最後更新同一批 getRepo 的資料，不用多打一次；
            // Watch 是 subscribers_count、Fork 是 forks_count、Star 是
            // stargazers_count，拿來在預設分支下面顯示一欄三區。
            repoCounts.setValue({
              watch: (info as any)?.subscribers_count ?? 0,
              fork: (info as any)?.forks_count ?? 0,
              star: (info as any)?.stargazers_count ?? 0,
            });
            // v1.3.0：Fork 同步卡片的上游資訊；不是 Fork 或沒有 parent
            // 就不設，卡片不顯示。
            if ((info as any)?.fork === true && (info as any)?.parent?.full_name) {
              forkParent.setValue({
                fullName: (info as any).parent.full_name,
                branch: (info as any).parent.default_branch || "main",
              });
              // 2.1.10：同上，子目錄也要比對，不再限制根目錄。
              {
                const parentOwner = (info as any).parent.full_name.split("/")[0] || "";
                const parentBranch = (info as any).parent.default_branch || "main";
                // 2.1.12：分支取這裡已經拿到的 default_branch，不再用可能空白的 b。
                const forkBranch = branch.value || info.default_branch || b || "";
                const compareKey = `${owner}/${repoName}@${forkBranch}`;
                if (forkBranch && forkCompareFor.value !== compareKey) {
                  forkCompareFor.setValue(compareKey);
                  try {
                    const cmp: any = await headerRequest(repo.compareFork(owner, repoName, parentOwner, parentBranch, forkBranch));
                    if (generation.value !== gen) return;
                    forkCompare.setValue({ ahead: cmp?.ahead_by ?? 0, behind: cmp?.behind_by ?? 0 });
                    forkCompareError.setValue("");
                  } catch (e: any) {
                    if (generation.value !== gen) return;
                    forkCompareError.setValue(String(e?.message || e));
                    forkCompareFor.setValue("");
                  }
                }
              }
            }
            // 2.1.14：上面三列都準備好了（計數、上游、超前／落後）就一次
            // 揭露。Star 狀態不影響排版（只換空心／實心星），不跟著等，
            // 不然又要多等一個往返才看得到 PR 按鈕。
            if (generation.value !== gen) return;
            detailsReady.setValue(true);
            // 1.1.4：Star 狀態背景查。跟最後更新同一批，不擋檔案清單；
            // 只在看別人倉庫時查（自己的倉庫不顯示 Star 按鈕，不用查）。
            // 用目前 Token 那個帳號的 Star 狀態；查不到就維持未 Star，
            // 不擋清單。
            if (showFork) {
              try {
                const token = repo.token;
                if (token) {
                  const starredNow = await headerRequest(repo.isStarredForToken(token, owner, repoName));
                  if (generation.value !== gen) return;
                  starred.setValue(starredNow);
                }
              } catch {}
            }
            // 抓完了才記 updatedFor：中途被新載入取代（generation 對不上
            // 提早 return）就不記，下次載入會重抓，不會卡在轉圈圈。
            if (generation.value !== gen) return;
            updatedFor.setValue(updatedKey);
          } catch {
            // getRepo 失敗：計數先填 0，讓狀態卡能顯示（不要一直轉圈圈），
            // 不記成功快取，下次載入可重試。
            if (generation.value !== gen) return;
            repoCounts.setValue({ watch: 0, fork: 0, star: 0 });
            // 2.1.14：失敗也要揭露，不然下面三列永遠不出現（含 PR 按鈕）。
            detailsReady.setValue(true);
            // 不記快取成功：下次下拉刷新或資料夾載入仍可重試。
          }
        })();
      }
    } catch (e: any) {
      if (generation.value !== gen) return;
      items.setValue([]);
      error.setValue(t(`載入失敗：${String(e?.message || e)}`, `载入失败：${String(e?.message || e)}`, `Failed to load: ${String(e?.message || e)}`));
      status.setValue(t("失敗", "失败", "Failed"));
      completed.setValue(false);
      failed.setValue(true);
    } finally {
      // 2.1.12：背景資訊不再擋這頁的「載入完成」。以前這裡 await Promise.all，
      // 只要 getRepo／Star／compareFork 有一個卡住（各自逾時 15 秒），
      // load() 就不結束、標題不寫、整頁看起來就是「一直在載入」。
      // 現在只等目錄（上面已 await），背景補的資料回來自己更新畫面，
      // 標題也能立刻寫。
      if (generation.value === gen) headerReady.setValue(true);
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

  async function openBranches() {
    const selected = await Navigation.present({
      element: <BranchListPage owner={owner} repoName={repoName} token={collaborationToken.value} currentBranch={branch.value} defaultBranch={defaultBranch.value} onDefaultChanged={(name) => defaultBranch.setValue(name)} />,
      modalPresentationStyle: "pageSheet",
    });
    if (typeof selected !== "string" || !selected || selected === branch.value) return;
    branch.setValue(selected);
    currentPath.setValue("");
    navTitle.setValue(owner);
    items.setValue(undefined);
    forkCompareFor.setValue("");
    forkCompare.setValue(null);
    await load();
  }

  async function openPullRequests() {
    await Navigation.present({
      element: <PullRequestsPage owner={owner} repoName={repoName} token={collaborationToken.value} />,
      modalPresentationStyle: "pageSheet",
    });
  }

  async function upload() {
    if (!branch.value) {
      await Dialog.alert({ title: t("請稍候", "请稍候", "Please wait"), message: t("還在載入分支資訊，等載入完成再上傳。", "还在载入分支信息，等载入完成再上传。", "Still loading branch information. Wait for loading to finish before uploading.") });
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
        await Dialog.alert({ title: t("完成", "完成", "Done"), message: t(`已上傳 ${done} 個檔案到 ${branch.value} 分支`, `已上传 ${done} 个文件到 ${branch.value} 分支`, `Uploaded ${done} files to the ${branch.value} branch`) });
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
  // 2.1.9：公開開關與刪除倉庫兩個入口已搬到首頁倉庫列右滑（repoList）。
  // 原本的 showPublicToggle／showDeleteRepo／deleteRepo() 一併移除，
  // 確認頁 DeleteRepoConfirmView 改為 export 給首頁共用，流程完全一樣。

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
      await Dialog.alert({ title: t("請稍候", "请稍候", "Please wait"), message: t("還在載入分支資訊，等載入完成再更名。", "还在载入分支信息，等载入完成再更名。", "Still loading branch information. Wait for loading to finish before renaming.") });
      return;
    }
    const oldName = basename(folderPath);
    const parent = dirname(folderPath);
    const newNameRaw = await Dialog.prompt({
      title: t("重新命名資料夾", "重命名文件夹", "Rename folder"),
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
      title: t("重新命名資料夾", "重命名文件夹", "Rename folder"),
      message: t(`確定要把資料夾更名嗎？\n${folderPath} → ${newDir}\n底下所有檔案會一起換路徑`, `确定要把文件夹更名吗？\n${folderPath} → ${newDir}\n底下所有文件会一起换路径`, `Rename this folder?\n${folderPath} → ${newDir}\nAll files under it will move to the new path.`),
      actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
    });
    if (idx !== 0) return;
    try {
      const r = await repo.renameDirectory({
        owner,
        repo: repoName,
        branch: branch.value,
        message: t(`重新命名資料夾 ${folderPath} 為 ${newDir}（Scripting）`, `重命名文件夹 ${folderPath} 为 ${newDir}（Scripting）`, `Rename folder ${folderPath} to ${newDir} (Scripting)`),
        oldDir: folderPath,
        newDir,
      });
      // 如果更名的是目前正在看的資料夾，就跟著切到新路徑；如果更名的是
      // 上一層的子資料夾，目前這層不變，只要重新載入清單就會看到新名字。
      if (currentPath.value === folderPath) {
        currentPath.setValue(newDir);
        navTitle.setValue(owner);
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
  // 底下所有檔案一起刪，分支不變。2026-11-19：一次提交失敗時改走
  // 逐檔刪除（見 repo.deleteDirectory），錯誤訊息會寫明是哪一步失敗。
  async function deleteFolder(folderPath: string) {
    if (!branch.value) {
      await Dialog.alert({ title: t("請稍候", "请稍候", "Please wait"), message: t("還在載入分支資訊，等載入完成再刪除。", "还在载入分支信息，等载入完成再删除。", "Still loading branch information. Wait for loading to finish before deleting.") });
      return;
    }
    // 2026-11-19：刪除資料夾的確認框關掉後，那一列還在，連點會再跑一次
    // 刪除（第二次已經沒有檔案，會回錯誤，也會跟 load() 撞在一起）。
    if (deletingFolder.current) return;
    deletingFolder.current = true;
    try {
      const idx = await Dialog.actionSheet({
        title: t("刪除資料夾", "删除文件夹", "Delete folder"),
        message: t(`確定要刪除以下資料夾嗎？\n「${folderPath}」\n此操作不可撤銷！\n資料夾內的所有檔案都會一併刪除`, `确定要删除以下文件夹吗？\n「${folderPath}」\n此操作不可撤销！\n文件夹内的所有文件都会一并删除`, `Are you sure you want to delete the following folder?\n"${folderPath}"\nThis action cannot be undone!\nAll files in the folder will be deleted as well.`),
        actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
      });
      if (idx !== 0) return;
      // 2026-11-19：actionSheet 回傳不代表警示框收合完畢。舊版回來馬上就
      // items.setValue(undefined)，把剛剛長按的那個資料夾列（連同選單
      // 來源）抽掉，等同在轉場中拆列表。先等緩衝再動。
      traceDelete("repo-folder-confirmed", folderPath);
      await afterDismiss();
      traceDelete("repo-folder-sheet-settled");
      // 2.0.28：確認框收合後才顯示紅字「刪除中…」（跟其他刪除同一招，
      // 警示框還在收合時不動那列）。
      setBusyFolder(folderPath);
      // 2026-11-19：刪除本身與後續刷新分開。以前刷新或完成提示失敗也會
      // 報成「刪除失敗」，但資料夾其實已經刪了。
      try {
        traceDelete("repo-folder-delete-start");
        const r = await repo.deleteDirectory({
          owner,
          repo: repoName,
          branch: branch.value,
          message: t(`刪除資料夾 ${folderPath}（Scripting）`, `删除文件夹 ${folderPath}（Scripting）`, `Delete folder ${folderPath} (Scripting)`),
          dir: folderPath,
        });
        traceDelete("repo-folder-delete-done", r?.count);
        items.setValue(undefined);
        try {
          await load();
          traceDelete("repo-folder-refresh-done");
        } catch (refreshErr) {
          console.log("[Repo] 刪除資料夾後刷新失敗: " + String(refreshErr));
        }
        // 檔案已經不在了，完成提示失敗也不要再跳「刪除失敗」。
        try {
          await Dialog.alert({ title: t("完成", "完成", "Done"), message: t(`已刪除 "${folderPath}"，共刪除 ${r.count} 個檔案。`, `已删除 "${folderPath}"，共删除 ${r.count} 个文件。`, `Deleted "${folderPath}", removing ${r.count} files.`) });
        } catch (doneErr) {
          console.log("[Repo] 刪除資料夾後提示失敗: " + String(doneErr));
        }
      } catch (e: any) {
        traceDelete("repo-folder-error", e?.message || e);
        await Dialog.alert({ title: t("刪除失敗", "删除失败", "Delete failed"), message: String(e?.message || e) });
      }
    } finally {
      setBusyFolder("");
      deletingFolder.current = false;
      traceDelete("repo-folder-exit");
    }
  }

  // 1.1.4：Star／Unstar。只在看別人倉庫時顯示（跟 Fork 同一個條件）。
  // 點了就照目前狀態反向操作：有 Star 就取消、沒 Star 就加上；執行中
  // 把按鈕 disabled，防重複點；失敗就跳提示，不改狀態。
  async function toggleStar() {
    if (starring.value) return;
    const token = repo.token;
    if (!token) {
      await Dialog.alert({ title: t("請先登入", "请先登录", "Please sign in"), message: t("請先在使用者填入 Token，才能 Star 倉庫。", "请先在用户填入 Token，才能 Star 仓库。", "Please enter a Token on the User page first to star a repository.") });
      return;
    }
    const wantStar = !starred.value;
    starring.setValue(true);
    try {
      if (wantStar) {
        await repo.starRepoForToken(token, owner, repoName);
      } else {
        await repo.unstarRepoForToken(token, owner, repoName);
      }
      starred.setValue(wantStar);
      // 1.1.5：預設分支下面那欄的 Star 數跟著 ＋1／－1，不用重打 getRepo。
      if (repoCounts.value) {
        repoCounts.setValue({ ...repoCounts.value, star: Math.max(0, repoCounts.value.star + (wantStar ? 1 : -1)) });
      }
    } catch (e: any) {
      await Dialog.alert({ title: t("Star 失敗", "Star 失败", "Star failed"), message: String(e?.message || e) });
    } finally {
      starring.setValue(false);
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
      // 1.0.29：選完帳號、選帳號頁退場後，要等一下再跳確認視窗。
      // 這裡以前的實機經驗是：回來的時候退場還沒完全結束，確認視窗
      // 蓋在還在退場的頁面上，確認按鈕要等一下才能按（觸控還被那頁卡住）。
      // 等 500ms 再跳視窗，按鈕一點就能按。瀏覽頁本身沒關，這個等候
      // 一定會跑，不會像編輯器那樣退場就把動作取消掉。
      // 2026-11-19：這個固定等候收進 components/afterDismiss，刪除流程
      // 也用同一份，不要各處複製不同的等待時間。
      await afterDismiss();
      const login = chosen.username || "";
      if (login && owner.toLowerCase() === login.toLowerCase()) {
        await Dialog.alert({ title: t("不需要 Fork", "不需要 Fork", "No need to fork"), message: t("這已經是你自己的倉庫，不需要 Fork。", "这已经是你自己的仓库，不需要 Fork。", "This is already your own repository. No need to fork.") });
        return;
      }
      // 依你的習慣：建立新東西前只跳一次確認，不再跳第二次。
      const ok = await Dialog.confirm({
        title: t("Fork 倉庫", "Fork 仓库", "Fork repository"),
        message: t(`確定要 Fork 以下倉庫嗎？\n「${owner}/${repoName}」\nFork 會建立在${login ? ` "${login}"` : "目前"}帳號下`, `确定要 Fork 以下仓库吗？\n「${owner}/${repoName}」\nFork 会建立在${login ? ` "${login}"` : "目前"}账号下`, `Fork the following repository?\n"${owner}/${repoName}"\nThe fork will be created under${login ? ` "${login}"` : " current"} account`),
      });
      if (!ok) return;
      // 1.0.2：Fork 建立中顯示忙碌態。GitHub 是非同步建立，API 回來前
      // 按鈕換成轉圈圈 +「Fork 中…」，防重複點；finally 保證失敗也恢復。
      forking.setValue(true);
      let forked: any;
      try {
        forked = await repo.forkRepoForToken(chosen.token, owner, repoName);
      } finally {
        forking.setValue(false);
      }
      const fullName = forked?.full_name || (login ? `${login}/${repoName}` : repoName);
      // v1.25：Fork 成功也會改變清單（多一個 Fork 來的倉庫），返回上一層時自動刷新。
      // 1.1.1：不要等瀏覽頁關掉才靠 cleanup 觸發（返回時 cleanup 不一定會跑）。
      // 1.1.2：直接叫刷新還是不夠——Fork 是非同步建立，立刻重抓時 GitHub 那邊
      // 新倉庫還沒出來，刷了也看不到，回到主頁還是要手動再刷一次。所以把剛
      // Fork 回來的倉庫（API 回來的就是正確資料）直接傳給主頁，主頁把它插進
      // 清單，回到主頁立刻看得到，不用等 GitHub。
      if (onListDirty) {
        try {
          onListDirty(forked);
        } catch {}
      }
      await Dialog.alert({
        title: t("Fork 完成", "Fork 完成", "Fork complete"),
        message: t(`已Fork到「${fullName}」\nFork 是非同步建立的，如果回清單還看不到，等幾秒再下拉刷新`, `已Fork到「${fullName}」\nFork 是非同步建立的，如果回清单还看不到，等几秒再下拉刷新`, `Forked to "${fullName}"\nFork creation is asynchronous. If it is not in the list yet, wait a few seconds and pull down to refresh`),
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

  // v1.3.0：Fork 同步卡片的兩個按鈕。Contribute 對上游開 PR，Sync fork
  // 把上游合併進來；按鈕列只在自己的 Fork 顯示，看別人 Fork 時只有
  // 上面那行比對文字（別人的 Fork 不能同步、也不能替他開 PR）。
  async function handleContribute() {
    const fp = forkParent.value;
    if (!fp) return;
    const idx = await Dialog.actionSheet({
      title: t("貢獻", "贡献", "Contribute"),
      actions: [{ label: t("開啟 Pull Request", "开启 Pull Request", "Open pull request") }],
    });
    if (idx !== 0) return;
    const titleRaw = await Dialog.prompt({
      title: t("Pull Request 標題", "Pull Request 标题", "Pull request title"),
      defaultValue: "",
    });
    if (titleRaw === null || titleRaw === undefined) return;
    const title = String(titleRaw).trim();
    if (!title) {
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: t("標題不能為空。", "标题不能为空。", "Title cannot be empty.") });
      return;
    }
    const parts = fp.fullName.split("/");
    const parentOwner = parts[0] || "";
    const parentRepo = parts[1] || "";
    if (forkBusy.value) return;
    forkBusy.setValue("contribute");
    try {
      const pr: any = await repo.createPullRequest(parentOwner, parentRepo, {
        title,
        head: `${owner}:${branch.value}`,
        base: fp.branch,
        body: "",
      });
      await Dialog.alert({
        title: t("完成", "完成", "Done"),
        message: t(`已建立 Pull Request #${pr?.number ?? ""}${pr?.html_url ? `\n${pr.html_url}` : ""}。`, `已建立 Pull Request #${pr?.number ?? ""}${pr?.html_url ? `\n${pr.html_url}` : ""}。`, `Pull request #${pr?.number ?? ""} created.${pr?.html_url ? `\n${pr.html_url}` : ""}`),
      });
    } catch (e: any) {
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: String(e?.message || e) });
    } finally {
      forkBusy.setValue("");
    }
  }

  async function handleSyncFork() {
    const idx = await Dialog.actionSheet({
      title: t("同步 Fork", "同步 Fork", "Sync fork"),
      actions: [{ label: t("同步分支", "同步分支", "Sync branch") }],
    });
    if (idx !== 0) return;
    if (forkBusy.value) return;
    forkBusy.setValue("sync");
    try {
      await repo.syncFork(owner, repoName, branch.value);
      // forkCompareFor 清掉，下次 load() 會重新比對，卡片數字才會更新。
      forkCompareFor.setValue("");
      items.setValue(undefined);
      await load();
      await Dialog.alert({ title: t("完成", "完成", "Done"), message: t("已同步到上游最新狀態。", "已同步到上游最新状态。", "Synced to the latest upstream state.") });
    } catch (e: any) {
      const msg = String(e?.message || e);
      const hint = msg.includes("409")
        ? t("請先在網頁上解決衝突。", "请先在网页上解决冲突。", "Please resolve the conflict on the web first.")
        : "";
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: hint ? `${msg}\n${hint}` : msg });
    } finally {
      forkBusy.setValue("");
    }
  }

  // 2.0.4：PR 選單。拉取請求跟貢獻合併成一顆「PR」按鈕，點了跳
  // actionSheet 選：貢獻（對上游開 PR）或查看拉取請求（開 PR 清單頁）。
  // 只有自己的 Fork、比對完成時才有貢獻這個選項（2.1.10 起子目錄也支援），
  // 其他情況直接開 PR 清單，不跳選單。貢獻那條路沿用 handleContribute
  // 本來的流程（裡面還會再跳一次「開啟 Pull Request」確認跟標題輸入）。
  async function handlePRMenu() {
    const canContribute = !readOnly && !!forkCompare.value && owner.toLowerCase() === effectiveUsername.toLowerCase();
    if (!canContribute) {
      await openPullRequests();
      return;
    }
    const idx = await Dialog.actionSheet({
      title: t("PR", "PR", "PR"),
      actions: [
        { label: t("貢獻", "贡献", "Contribute") },
        { label: t("查看拉取請求", "查看拉取请求", "View pull requests") },
      ],
    });
    if (idx === undefined || idx === null || idx < 0) return;
    if (idx === 0) await handleContribute();
    else if (idx === 1) await openPullRequests();
  }

  // v1.2 關鍵改法：不再先回傳 ProgressView 才載入，而是先出 List。
  // 就算 API 卡住，使用者也看得到標題、狀態、下拉刷新和不帶 Token 重試，
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
  // 2.1.14：下面（狀態行與三列）等背景資料到齊才一起出現，整張卡只長
  // 一次；失敗則立刻顯示錯誤，不用等背景。
  // 2.1.14：下面三列（Star／Watch／Fork、上游比較、PR）等背景資料到齊才
  // 一次出現。之前 repoCounts 先回來就先把計數列插進來，上游、同步 Fork
  // 再各自插一次，整張卡在根目錄被推高三次，看起來就是分好幾次刷新。
  const detailsVisible = detailsReady.value;
  // 2.1.16：目錄本身還在載入（完成／失敗都還沒成立）。
  // 子目錄換層時用它把「載入中…」那行收掉，改讓右上角上傳按鈕轉圈。
  const directoryLoading = !completed.value && !failed.value;
  const listElement = (
    <List {...REPO_LIST}
      tint={palette.accent}
      contentMargins={{ edges: "top", insets: 4, placement: "scrollContent" }}
      listSectionSpacing={8}
      scrollContentBackground="hidden"
      // v1.3.6：底色改成 Rectangle + ignoresSafeArea。List 的 background
      // 只上純色時，內容不夠高、底下安全區（home indicator 那一帶）會透出
      // 宿主的純黑——epeius 截圖量到最底一截是 #000000，上面才是 #202022；
      // Rectangle 帶 ignoresSafeArea 才能把灰色一路鋪到螢幕最底邊。
      // 寫法跟登入頁那個 ScrollView 一樣（background 接受 VirtualNode）。
      background={<GlassBackground />}
      // 1.0.1：下拉刷新取代右上角重新整理按鈕（已拿掉）。根目錄跟下層
      // 是同一個 View、同一份 List，currentPath 切換而已，所以這一個
      // refreshable 兩邊都生效；load() 本身不先清空清單，舊清單留著、
      // 轉完才換新的，不會先空白。
      refreshable={async () => { await load({ force: true }); }}

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
        // 1.1.14：唯讀（收藏進來的）工具列不放上傳／新增檔案按鈕。
        topBarTrailing: readOnly ? [] : [
          // 2.1.16：載入中這個位置暫時換成轉圈圈（載入完／失敗就換回上傳圖標）。
          // 上傳按鈕本來在清單還沒回來時就是停用狀態，換成轉圈不會少任何操作。
          directoryLoading ? (
            <ProgressView key="dir-loading" controlSize="small" tint={palette.accent} frame={{ width: 22, height: 22 }} />
          ) : (
          <Button
            title={t("上傳", "上传", "Upload")}
            systemImage={"square.and.arrow.up"}
            action={upload}
            disabled={items.value === undefined}
          />),
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
        ],
      }}
    >
      <Section>
        {/* 2.1.14：倉庫名那一列不等目錄，一進頁就先畫出來（倉庫名、擁有者
            進來時就知道了）；下面三列等背景資料到齊再一起出現。
            之前整張卡都掛在 headerReady 上，進去先只有一行「載入中…」，
            目錄回來才長出標題列，看起來就是分好幾次刷新。 */}
        {/* 2.0.3：標題列重排。擁有者後面直接 inline 公開跟最後更新
            （時鐘圖標＋相對時間，例如「6 天前」），右上角改成分支藥丸按鈕，
            點了開分支清單，藥丸裡顯示目前分支名。 */}
        <HStack spacing={11} padding={{ vertical: 5 }} listRowBackground={<ThemeCardBackground />}>
          <RepoIcon symbol="shippingbox" />
          <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            <Text font="headline" lineLimit={2} truncationMode="tail">{repoName}</Text>
            <HStack spacing={6}>
              {/* 3.1：owner 移到頂部導覽標題，這行留公開狀態跟相對時間，
                  寬度寬鬆很多，時間不會再被擠成兩行。 */}
              {/* 2.1.14：名稱列現在一進頁就畫，公開／私人還不知道時
                  先不畫，避免先顯示「未知」再換成「公開」的抽動。 */}
              {privateFlag.value === undefined ? null : (
              <HStack spacing={3} font={11} foregroundStyle="secondaryLabel">
                <Image systemName={privateFlag.value ? "lock" : "globe"} />
                <Text lineLimit={1}>{privateFlag.value ? t("私人", "私人", "Private") : t("公開", "公开", "Public")}</Text>
              </HStack>
              )}
              {/* 2.1.14：時間也跟下面三列同一批出現，不要在名稱列再插一次。 */}
              {detailsVisible && completed.value && lastUpdated.value ? (
                <HStack spacing={3} font={11} foregroundStyle="secondaryLabel" fixedSize={{ horizontal: true, vertical: false }}>
                  <Image systemName="clock" />
                  <Text lineLimit={1} minScaleFactor={0.8}>{lastUpdated.value}</Text>
                </HStack>
              ) : null}
            </HStack>
          </VStack>
          <Button action={openBranches} buttonStyle="borderless">
            <HStack spacing={4} font={12} padding={{ horizontal: 10, vertical: 6 }} foregroundStyle={palette.accent} background={{ style: { light: "rgba(0,0,0,0.04)", dark: "rgba(255,255,255,0.07)" }, shape: { type: "rect", cornerRadius: 8 } }}>
              <Image systemName="arrow.branch" />
              <Text fontWeight="semibold" lineLimit={1}>{branch.value || t("分支", "分支", "Branch")}</Text>
              <Image systemName="chevron.down" font={9} />
            </HStack>
          </Button>
        </HStack>
        {/* 2.1.15：名稱列先出來、下面三列還沒到齊時，補一條細的「載入中…」，
            不然名稱下面是空的、看起來像壞了。資料回來就整批換成三列。
            左邊留一個跟 RepoIcon 同寬的框給轉圈，文字才會跟上面的倉庫名對齊。 */}
        {detailsVisible || failed.value ? null : (
          <HStack spacing={11} padding={{ vertical: 5 }} listRowBackground={<ThemeCardBackground />} listRowSeparatorTint={"separator"}>
            <ProgressView tint={palette.accent} frame={{ width: 28, height: 28 }} />
            <Text font={12} foregroundStyle="secondaryLabel">{t("載入中…", "载入中…", "Loading…")}</Text>
          </HStack>
        )}
        {detailsVisible || failed.value ? (
          <>
        {/* 2.0.2：Star／Watch／Fork 計數欄往上移一排，放到倉庫標題下面、
            列表卡上面。顯示條件跟按鈕行為不變。 */}
        {!currentPath.value && detailsVisible && repoCounts.value ? (
          // 1.1.11：Fork／Star 按鈕合併進計數欄。一欄三格平分，每格裡面靠左：
          // Star／Fork 是按鈕（看別人倉庫時），點了就 Star／Fork，圖標＋數字
          // 就是按鈕內容，不再另外寫「Star」「Fork」文字。Star 有星是實心星、
          // 沒星是空心星。Watch 只顯示（eye＋數字）。自己的倉庫 Star／Fork
          // 那兩格只顯示數字，不能點。Fork 進行中那格換成轉圈圈＋「Fork 中…」。
          // 1.1.17：順序改成 Star、Watch、Fork（Kristen 更正：Watch 在中間）。
          // 分割線改回系統 Divider（1.1.12：直線改回原來那樣，橫線另外加深）。
          <HStack spacing={6} padding={{ vertical: 2 }} listRowBackground={<ThemeCardBackground />}>
            <RepoMetric symbol={starred.value ? "star.fill" : "star"} title="Star" value={formatRepoCount(repoCounts.value.star)} gold action={showFork ? toggleStar : undefined} disabled={starring.value} />
            <RepoMetric symbol="eye" title="Watch" value={formatRepoCount(repoCounts.value.watch)} />
            <RepoMetric symbol="arrow.triangle.branch" title="Fork" value={forking.value ? "…" : formatRepoCount(repoCounts.value.fork)} action={showFork ? forkRepo : undefined} disabled={forking.value} />
          </HStack>
        ) : null}
        {/* 2.0.3：分支搬到標題列右上角的藥丸、拉取請求搬到底下那排、
            最後更新搬到標題列擁有者後面，這張列表卡只剩上游＋超前／落後
            那一列。只在根目錄的 Fork 倉庫出現；不是 Fork 或進子資料夾時
            整張卡不見。
            3.1：再把這一塊收窄:字級 11/13 → 10/12、行距 0、
            右側固定寬 88 → 76、兩欄間距 10 → 8、垂直內距 1 → 0。 */}
        {!currentPath.value && detailsVisible && forkParent.value ? (
          <VStack spacing={0} padding={{ horizontal: 8 }} listRowBackground={<ThemeCardBackground />}>
            <HStack spacing={8} padding={{ vertical: 0 }} frame={{ maxWidth: "infinity" }}>
              <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                <Text font={10} foregroundStyle="secondaryLabel">{t("上游", "上游", "Upstream")}</Text>
                <Text font={12} foregroundStyle="label" lineLimit={1}>{forkParent.value.fullName}</Text>
              </VStack>
              <Divider />
              {forkCompareError.value ? (
                <Text font={11} foregroundStyle="secondaryLabel" lineLimit={2} frame={{ width: 96 }}>{forkCompareError.value}</Text>
              ) : forkCompare.value ? (
                <VStack spacing={0} alignment="trailing" frame={{ width: 76 }}>
                  <HStack spacing={6}>
                    <Text font={10} foregroundStyle="secondaryLabel">{t("超前", "超前", "Ahead")}</Text>
                    <Spacer />
                    <Text font={12} fontWeight="semibold" foregroundStyle={palette.accent}>{String(forkCompare.value.ahead)}</Text>
                  </HStack>
                  <HStack spacing={6}>
                    <Text font={10} foregroundStyle="secondaryLabel">{t("落後", "落后", "Behind")}</Text>
                    <Spacer />
                    <Text font={12} fontWeight="semibold" foregroundStyle={palette.accent}>{String(forkCompare.value.behind)}</Text>
                  </HStack>
                </VStack>
              ) : (
                <Text font={11} foregroundStyle="secondaryLabel" lineLimit={2} frame={{ width: 96 }}>{t("正在比較與上游的差異…", "正在比较与上游的差异…", "Comparing with upstream…")}</Text>
              )}
            </HStack>
          </VStack>
        ) : null}
        {/* 3.2：這行原本顯示目前路徑（例如 “Surge”），但資料夾表頭已經寫一次，
            拉取請求上面再重複一次很吵，直接拿掉。 */}
        {/* 2.1.16：載入中這行拿掉（改由右上角上傳按鈕轉圈）。 */}
        {/* 2.1.19：成功那行（「預設分支：xxx」／「（空倉庫）」）根目錄也不要了，
            分支已經在右上角的藥丸顯示，整行拿掉；只留下失敗訊息。 */}
        {failed.value ? (
          // v2.0.0：失敗對應的紅色圈叉，用 SF Symbol xmark.circle.fill，
          // 跟成功那行同一個 HStack 排版。
          <HStack listRowBackground={<ThemeCardBackground />} listRowSeparatorTint={"separator"} spacing={8}>
            <Image systemName={"xmark.circle.fill"} foregroundStyle={"red"} />
            <Text foregroundStyle={"secondaryLabel"}>{status.value}</Text>
          </HStack>
        ) : null}
        {/* 2.0.4：底下那排。拉取請求跟貢獻合併成一顆「PR」按鈕，點了跳
            選單選貢獻或查看拉取請求；同步 Fork 還是獨立一顆，跟 PR 一樣大。
            自己的非 Fork 倉庫：PR 改成非按鈕的列，右邊加 chevron，
            點了直接進 PR 清單頁。忙碌態（同步中…／建立 Pull Request 中…）不變。
            2.0.6：裝置上 PR 窄、同步 Fork 寬，兩顆不一樣大。原因是 Button
            的 frame maxWidth infinity 在 Scripting 裡沒把按鈕撐開，
            所以每顆 Button 外面各包一個 frame maxWidth infinity 的 VStack，
            兩邊容器等分、中線對齊，裡面按鈕的 label 保持 frame maxWidth infinity。
            2.0.11：顏色改成跟背景主題連動——淡底用 palette.selected，
            圖標／文字用 palette.accent。之前寫死的藍綠（REPO_ACCENT_SOFT／
            REPO_ACCENT）在橘黃、藍紫背景上會很混淆。
            3.6：收藏（readOnly）一律走上面那條「拉取請求」列，跟自己的非 Fork
            倉庫一樣，點一下直接進 PR 清單。收藏是唯讀的，不提供貢獻（對上游
            開 PR）跟同步 Fork 這兩個寫入動作，連收藏自己的 Fork 也一樣；
            所以下面 forkBusy 那行與「同步 Fork」藥丸在唯讀頁都不會出現。 */}
        {!detailsVisible ? null : forkBusy.value ? (
          <HStack listRowBackground={<ThemeCardBackground />} listRowSeparatorTint={"separator"} spacing={10} alignment="center">
            <ProgressView />
            <Text>{forkBusy.value === "sync" ? t("同步中…", "同步中…", "Syncing…") : t("建立 Pull Request 中…", "建立 Pull Request 中…", "Creating pull request…")}</Text>
          </HStack>
        ) : readOnly || (owner.toLowerCase() === effectiveUsername.toLowerCase() && !forkParent.value && isForkFlag.value !== true) ? (
          <Button action={openPullRequests} buttonStyle="borderless" frame={{ maxWidth: "infinity", height: 40 }} listRowBackground={<ThemeCardBackground />} listRowSeparatorTint={"separator"}>
            <HStack spacing={10} frame={{ maxWidth: "infinity", height: 40 }}>
              {/* 3.6：圖標用主題色（跟分支藥丸、超前／落後數字同一組），文字
                  跟著主題深淺走——深色用白、淺色用黑，不然橘黃那組的
                  淺底配白字根本看不到。右邊箭頭維持次要灰，不搶焦點。 */}
              <Image systemName="arrow.triangle.pull" font={14} foregroundStyle={palette.accent} frame={{ width: 20, height: 20 }} />
              <Text font={13} fontWeight="medium" foregroundStyle={{ light: "black", dark: "white" }}>{t("拉取請求", "拉取请求", "Pull Requests")}</Text>
              <Spacer />
              <Image systemName="chevron.right" font={10} foregroundStyle="secondaryLabel" />
            </HStack>
          </Button>
        ) : (
          // 2.0.7：兩顆按鈕還是不一樣大，2.0.6 的 VStack 包 Button 沒用。
          // 改抄上面 Star／Watch／Fork 那排已證實等分的寫法（RepoMetric）：
          // Button 直接當 HStack 的孩子、buttonStyle="plain"、frame maxWidth
          // infinity，裡面再包一個 frame maxWidth infinity 的 VStack 當藥丸底。
          // 這裡是三元表達式裡面，{/* */} 會讓 esbuild 報錯，只能用 //。
          <HStack spacing={8} padding={{ vertical: 3 }} listRowBackground={<ThemeCardBackground />} listRowSeparatorTint={"separator"}>
            <Button action={handlePRMenu} buttonStyle="plain" frame={{ maxWidth: "infinity" }} disabled={forkBusy.value !== ""}>
              <VStack spacing={0} frame={{ maxWidth: "infinity" }} background={{ style: palette.selected, shape: { type: "rect", cornerRadius: 12 } }}>
                <HStack spacing={8} alignment="center" frame={{ maxWidth: "infinity", height: 38 }} padding={{ horizontal: 14 }} foregroundStyle={palette.accent}>
                  <Image systemName="arrow.triangle.pull" font={15} />
                  <Text font={14} fontWeight="semibold">PR</Text>
                </HStack>
              </VStack>
            </Button>
            {forkCompare.value && owner.toLowerCase() === effectiveUsername.toLowerCase() ? (
              <Button action={handleSyncFork} buttonStyle="plain" frame={{ maxWidth: "infinity" }} disabled={forkBusy.value !== ""}>
                <VStack spacing={0} frame={{ maxWidth: "infinity" }} background={{ style: palette.selected, shape: { type: "rect", cornerRadius: 12 } }}>
                  <HStack spacing={8} alignment="center" frame={{ maxWidth: "infinity", height: 38 }} padding={{ horizontal: 14 }} foregroundStyle={palette.accent}>
                    <Image systemName="arrow.triangle.2.circlepath" font={15} />
                    <Text font={14} fontWeight="semibold">{t("同步 Fork", "同步 Fork", "Sync fork")}</Text>
                  </HStack>
                </VStack>
              </Button>
            ) : null}
          </HStack>
        )}
          </>
        ) : null}

        {error.value ? (
          <Text listRowBackground={<ThemeCardBackground />} listRowSeparatorTint={"separator"} foregroundStyle={"secondaryLabel"}>{error.value}</Text>
        ) : null}

        {currentPath.value ? (
          <Button listRowBackground={<ThemeCardBackground />} listRowSeparatorTint={"separator"}
            title={t(`上一層（${dirname(currentPath.value) || "根目錄"}）`, `上一层（${dirname(currentPath.value) || "根目录"}）`, `Previous folder (${dirname(currentPath.value) || "Root"})`)}
            systemImage={"chevron.left"}
            action={async () => {
              const parent = dirname(currentPath.value);
              currentPath.setValue(parent);
              navTitle.setValue(owner);
              items.setValue(undefined);
              await load();
            }}
          />
        ) : null}
      </Section>
      {items.value !== undefined ? (
        <Section header={<RepoHeader symbol="folder" title={currentPath.value || t("檔案", "文件", "Files")} detail={String(items.value.length)} />}>
          {items.value.length === 0 && !error.value ? (
            <Text listRowBackground={<ThemeCardBackground />} listRowSeparatorTint={"separator"} font={"callout"} foregroundStyle={"secondaryLabel"}>
              {t("此資料夾是空的。", "此文件夹是空的。", "This folder is empty.")}
            </Text>
          ) : (
            items.value.map((item) =>
              item.type === "dir" ? (
                // v1.10：資料夾不再換頁。v1.9 的 Navigation.present 在裝置上點了進不去，
                // 所以點資料夾就是直接把 currentPath 改成那個資料夾、清空列表、重新載入，
                // 同一頁顯示下一層，不需要再開一個瀏覽頁，也就沒有遞迴目的頁的問題。
                // 2.0.7：左右滑改回來，照官方範例掛在列本身的 HStack 上，
                // 按鈕是素 Button＋Label 子元件；「⋯」按鈕整個拿掉。
                // 確認流程不變（deleteFolder 裡面本來就有 actionSheet 確認）。
                <HStack listRowBackground={<SwipeRowBackground isPresented={openSwipeFolder === item.path} />} listRowSeparatorTint={"separator"}
                  key={item.path}
                  spacing={0}
                  alignment="center"
                  // 3.2：膠囊縮成小顆（不影響列本身的兩行內容）。
                  controlSize="small"
                  // 2.0.27：滑動刪除改成長按刪除（跟 Gist／Repo 首頁同一招）。
                  // 左滑只剩編輯，刪除改成長按這列叫出的選單，確認流程不變。
                  contextMenu={{
                    menuItems: (
                      <>
                        <Section>
                          <Button title={t("刪除", "删除", "Delete")} systemImage="trash" role="destructive" action={async () => { await deleteFolder(item.path); }} />
                        </Section>
                      </>
                    ),
                  }}
                  trailingSwipeActions={{
                    allowsFullSwipe: false,
                    onPresentationChanged: (presented: boolean) => setOpenSwipeFolder(current => presented ? item.path : current === item.path ? "" : current),
                    actions: [
                      // 3.2：標題縮短成「編輯／刪除」，膠囊就不會因為字太長被撐成一大顆；
                      // 編輯用藍色、刪除用正紅色。
                      <Button action={async () => { await renameFolder(item.path); }} tint="#0A84FF">
                        <Label title={t("編輯", "编辑", "Edit")} systemImage="pencil" />
                      </Button>,
                    ],
                  }}
                >
                  <Button buttonStyle="borderless" frame={{ maxWidth: "infinity" }}
                    action={async () => {
                      currentPath.setValue(item.path);
                      navTitle.setValue(owner);
                      items.setValue(undefined);
                      await load();
                    }}
                  ><RepoEntry symbol="folder.fill" title={item.name} subtitle={busyFolder === item.path ? t("刪除中…", "删除中…", "Deleting…") : t("資料夾", "文件夹", "Folder")} busy={busyFolder === item.path} /></Button>
                  {/* 2.0.29：刪資料夾的忙碌樣式統一（跟 Gist 首頁同一套）：
                      圖標換轉圈圈、名字第一行不動、第二行顯示紅色小字
                      「刪除中…」（「資料夾」暫時讓位）；列尾的紅字＋轉圈圈拿掉。
                      刪完刷新後這列就不在了，finally 的 setBusyFolder("")
                      只是清狀態。 */}
                </HStack>
              ) : (
                <NavigationLink listRowBackground={<ThemeCardBackground />} listRowSeparatorTint={"separator"}
                  key={item.path}
                  destination={
                    <FileDetailView
                      owner={owner}
                      repo={repoName}
                      branch={branch.value}
                      path={item.path}
                      readOnly={readOnly}
                      // 2026-11-07：瀏覽頁清單已經有這個檔案的資訊
                      // （名稱、路徑、大小、sha），直接帶進詳情頁，
                      // 頁面一進來就先顯示，不用等 getContents 回來。
                      // 原腳本點檔案幾乎秒進，Toolkit 卻會卡在載入中，
                      // 就是因為一定要等那條請求；現在先顯示已知的，
                      // 完整內容（content、download_url）再背景補上。
                      initialMeta={item}
                      onSaved={async () => await load()}
                      onMoved={async (newPath) => {
                        // 2026-11-05 回饋：檔案改名後瀏覽頁要切到新檔案
                        // 所在的資料夾再重載，不然返回時還停在舊資料夾，
                        // 新檔案看起來像消失了。根目錄的檔案 dirname 是空字串。
                        const dir = newPath.includes("/") ? newPath.slice(0, newPath.lastIndexOf("/")) : "";
                        currentPath.setValue(dir);
                        navTitle.setValue(owner);
                        // 2026-11-05 黑畫面回饋：不要先把 items 清成 undefined，
                        // 不然返回瀏覽頁時清單是空的、只剩載入中，看起來像黑畫面。
                        // 舊清單留著，等 load() 回來再換成新清單，畫面不會先空白。
                        await load();
                      }}
                    />
                  }
                ><RepoEntry symbol="doc.text" title={item.name} subtitle={typeof item.size === "number" ? (item.size < 1024 ? `${item.size} B` : `${(item.size / 1024).toFixed(1)} KB`) : undefined} /></NavigationLink>
              ),
            )
          )}
        </Section>
      ) : null}
      <Section header={<RepoHeader symbol="info.circle" title={t("提交方式", "提交方式", "Commit behavior")} />}>
        <Text listRowBackground={<ThemeCardBackground />} listRowSeparatorTint={"separator"} font={"footnote"} foregroundStyle={"secondaryLabel"}>
          {t(`所有寫入都是直接提交到上方顯示的分支，\n不會另外開分支或發 PR。`, `所有写入都是直接提交到上方显示的分支，\n不会另外开分支或发 PR。`, `All writes are committed directly to the branch shown above. No new branch or PR is created.`)}
        </Text>
      </Section>
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
// 2.1.9：公開／私人開關與刪除倉庫已搬到首頁右滑，確認頁留在這裡並改為 export，
// 讓首頁（repoList）直接重用同一個兩次確認流程，不用另外復製一份。
export function DeleteRepoConfirmView({ owner, repo: repoName }: { owner: string; repo: string }) {
  const dismiss = Navigation.useDismiss();
  const palette = useThemePalette();
  return (
    <NavigationStack>
      <List {...REPO_LIST}
      tint={palette.accent}
      scrollContentBackground="hidden"
      background={<GlassBackground />}

        navigationTitle={t("刪除倉庫", "删除仓库", "Delete repository")}
        navigationBarTitleDisplayMode={"inline"}
      >
        <Section>
          <Text listRowBackground={<ThemeCardBackground />} listRowSeparatorTint={"separator"}>
            {/* v2.1.6：第一層確認頁警告裡的倉庫名加上「」，三語一起加；
                後來英文改成 ""（跟上面刪資料夾那句一致），繁中、簡中維持「」。
                紅色按鈕上的名字不加括號（按鈕是「刪除 倉庫名」，不是顯示用名字）。 */}
            {t(`確定要刪除以下倉庫嗎？\n「${owner}/${repoName}」\n此操作不可撤銷！\n倉庫內的所有內容都會一併刪除。`, `确定要删除以下仓库吗？\n「${owner}/${repoName}」\n此操作不可撤销！\n仓库内的所有内容都会一并删除。`, `Are you sure you want to delete the following repository?\n"${owner}/${repoName}"\nThis action cannot be undone!\nAll contents in the repository will be deleted as well.`)}
          </Text>
        </Section>
        <Section>
          <Button listRowBackground={<ThemeCardBackground />} listRowSeparatorTint={"separator"} title={t(`刪除 ${owner}/${repoName}`, `删除 ${owner}/${repoName}`, `Delete ${owner}/${repoName}`)} systemImage={"trash"} role={"destructive"} foregroundStyle={"red"} action={async () => {
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
            traceDelete("repo-confirm-page-ask", `${owner}/${repoName}`);
            const idx = await Dialog.actionSheet({
              title: t("最後確認", "最后确认", "Final confirmation"),
              message: t(`確定要刪除以下倉庫嗎？\n「${owner}/${repoName}」\n此操作不可撤銷！`, `确定要删除以下仓库吗？\n「${owner}/${repoName}」\n此操作不可撤销！`, `Are you sure you want to delete the following repository?\n"${owner}/${repoName}"\nThis action cannot be undone!`),
              actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
            });
            if (idx !== 0) return;
            traceDelete("repo-confirm-page-confirmed");
            // 2026-11-19：actionSheet 回來不代表警示框已經收完。舊版直接
            // dismiss(true)，等於在紅色警示收合動畫中把整個確認頁拆掉，
            // 兩層退場疊在一起；先讓警示框收完再關這一頁。
            await afterDismiss();
            traceDelete("repo-confirm-page-dismiss");
            dismiss(true);
          }} />
          {/* v2.1.4：取消加藍色 X 圖標。按鈕預設顏色本來就是系統藍（刪除列
              要另外設紅色才會變紅就是證明），所以只加 systemImage xmark 就好，
              不用另外設顏色，圖標跟文字就會都是藍色。 */}
          <Button listRowBackground={<ThemeCardBackground />} listRowSeparatorTint={"separator"} title={t("取消", "取消", "Cancel")} systemImage={"xmark"} action={() => dismiss()} />
        </Section>
      </List>
    </NavigationStack>
  );
}

function formatRepoCount(value: number): string {
  if (value <= 10000) return String(value);
  const scaled = value / 1000;
  const rounded = Math.round(scaled * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
}

function RepoMetric({ symbol, title, value, action, disabled, gold }: { symbol: string; title: string; value: string; action?: () => void; disabled?: boolean; gold?: boolean }) {
  // 2.0.11：圖標也跟背景主題連動（原本寫死藍綠）。Star 的金色是「已收藏」
  // 的語意色，不屬於主題色，維持金色不動。
  const palette = useThemePalette();
  const body = <VStack spacing={4} padding={{ vertical: 6 }} frame={{ maxWidth: "infinity" }} background={{ style: { light: "rgba(0,0,0,0.035)", dark: "rgba(255,255,255,0.045)" }, shape: { type: "rect", cornerRadius: 12 } }}>
    <HStack spacing={4}><Image systemName={symbol} font={12} foregroundStyle={gold ? "#D7B35A" : palette.accent} /><Text font={15} fontWeight="semibold" foregroundStyle="label">{value}</Text></HStack>
    <Text font={9} foregroundStyle="secondaryLabel">{title}</Text>
  </VStack>;
  return action ? <Button action={action} disabled={disabled} buttonStyle="plain" frame={{ maxWidth: "infinity" }}>{body}</Button> : body;
}

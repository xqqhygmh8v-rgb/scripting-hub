import { PrivateMarker } from "../../components/privateMarker";
import { ThemeCardBackground, useThemePalette } from "../../components/themePalette";
import { SwipeRowBackground } from "../../components/swipeRowBackground";
import { afterDismiss } from "../../components/afterDismiss";
import { traceDelete } from "../../components/deleteTrace";
import { AccountHeader } from "../../components/accountHeader";
import { Overview } from "../../components/overview";
import { REPO_LIST, RepoHeader, RepoSummary, RepoEntry, RepoIcon } from "../../components/repoUI";
import {
  List,
  VStack,
  TextField,
  Picker,
  Navigation,
  NavigationLink,
  Button,
  Section,
  Text,
  HStack,
  Image,
  Label,
  Spacer,

  Rectangle,  Script,
  Notification,
  ProgressView,
  useEffect,
  useObservable,
  useRef,
  useState,
} from "scripting";
import { ACCOUNTS_KEY, TOKEN_KEY, USERNAME_KEY, repo, type RepoInfo } from "../class/repo";
import { View as BrowserView, DeleteRepoConfirmView } from "./browser";
import { View as SettingView } from "./setting";
import { View as NewRepoView } from "./newRepo";
import { openRepoPage } from "./repoDetail";
import { FavoritesView } from "./favorites";
import { t } from "../class/i18n";
import { PAGE_BACKGROUND, CARD_BACKGROUND } from "../../components/theme";
import { GlassBackground, loadBackgroundTheme } from "../../components/glass";
import type { BackgroundThemeId } from "../../components/glass";
import { LoadingRow } from "../../components/loadingRow";

interface Account {
  username: string;
  token: string;
}

function loadAccounts(): Account[] {
  try {
    const raw = Storage.get<string>(ACCOUNTS_KEY) || "";
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((a: any) => a && a.token);
  } catch {
    return [];
  }
}

// v1.49：帳號分區的展開/折疊要記住，退出再進來不能又全部展開。
// 存在裝置 Storage 裡（跟 Token、帳號清單同一個地方，存在裝置上不會外傳），
// key 是「帳號#序號」跟畫面上的 id 同一套，沒記過的帳號預設折疊（v1.49.1 起）。
const EXPANDED_KEY = "repo_editor_expanded";

function loadExpanded(): Record<string, boolean> {
  try {
    const raw = Storage.get<string>(EXPANDED_KEY) || "";
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

// v1.3.2：帳號標題列前面顯示各自的頭像。快取 Token -> avatar_url，
// 跟設定頁同一個 key（repo_editor_avatars），設定頁寫過的直接沿用。
const AVATARS_KEY = "repo_editor_avatars";

function loadAvatarCache(): Record<string, string> {
  try {
    const raw = Storage.get<string>(AVATARS_KEY) || "";
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    const out: Record<string, string> = {};
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === "string") out[k] = obj[k];
    }
    return out;
  } catch {
    return {};
  }
}

function saveAvatarCache(cache: Record<string, string>) {
  try {
    Storage.set(AVATARS_KEY, JSON.stringify(cache));
  } catch {}
}

// v1.15：清單頁改成多帳號分區。
// 標題改成 Github Repository；右上角順序換成重新整理在左、設定在右。
// 每個帳號各有一個折疊標題列，左邊是「帳號's 倉庫」，
// 右邊是箭頭（朝下是收起、朝上是展開），每個帳號的開合是分開記的，
// 點 A 帳號的標題不會把 B 帳號也收起來。
// 倉庫是用該帳號自己的 Token 抓的，點進去瀏覽時瀏覽頁也會用那個帳號的 Token，
// 不會因為使用中帳號不同就開錯或寫錯帳號；回到清單後使用中帳號不變。
// v1.3.6-cache：切換模組會閃，是因為切過去重新掛載時 reposMap 回到
// undefined、先顯示 LoadingRow 才重抓。把上次成功抓到的列表留在模組
// 層級變數（只在記憶體，不寫 Storage），重新掛載時 state 直接用快取
// 當初始值、先畫舊列表，背景 init() 重抓到新的再換掉；只有第一次
// 啟動、完全沒有快取時才顯示載入中。抓失敗時舊列表留著、不清空。
let cachedReposMap: Record<string, RepoInfo[]> | undefined = undefined;
let cachedErrorsMap: Record<string, string> = {};

// 2.0.5：首頁工作狀態（倉庫列第三行）。Fork 顯示超前／落後，
// 自己倉庫顯示預設分支的總 commit 數。首頁本來沒有這些資料，
// 懶載入＋模組層快取：key 是 full_name，只有展開的帳號分區才抓，
// 抓到就顯示，載入中顯示「…」，失敗空白不報錯。重新掛載時快取還在，
// 不用重抓；同步／上傳後由 invalidateWorkStatus 清掉重抓。
type WorkStatus =
  | { state: "loading" }
  | { state: "ok"; kind: "fork"; ahead: number; behind: number }
  | { state: "ok"; kind: "own"; commits: number }
  | { state: "error" };
let cachedWorkStatus: Record<string, WorkStatus> = {};
const workStatusInFlight = new Set<string>();
// 2026-11-19：刪除倉庫時暫停工作狀態的懶載入。診斷證實刪除流程本身
// 跑得完（repo-flow-exit），崩在之後的畫面更新：reposMap 一變就觸發
// 的 useEffect 會對還沒快取的倉庫逐筆改列（先出現「…」再變超前／落後
// 或提交數），跟抽掉那列的批次更新撞在一起就閃。刪除時先暫停載入，
// 3 秒後再放行、把快取寫回 state 並重新觸發一次（那時抽列早已結束）。
// 2.0.30 補宣告：2.0.26 只寫了上面這段說明跟各處讀寫，漏了這一行，
// 效果裡第一次讀到它就報 ReferenceError，工作狀態整排抓不到。
let workStatusPaused = false;

// 2.0.5：倉庫列第三行（工作狀態）。Fork 顯示超前／落後，自己倉庫顯示總 commit 數；
// 載入中顯示「…」，失敗或還沒抓就不顯示這一行。
function WorkStatusLine({ status }: { status?: WorkStatus }) {
  if (!status || status.state === "error") return null;
  if (status.state === "loading") return <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>…</Text>;
  if (status.kind === "fork") return <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{t(`超前 ${status.ahead} · 落後 ${status.behind}`, `超前 ${status.ahead} · 落后 ${status.behind}`, `Ahead ${status.ahead} · Behind ${status.behind}`)}</Text>;
  return <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{t(`${status.commits} 次提交`, `${status.commits} 次提交`, `${status.commits} commits`)}</Text>;
}

export function View({ titleMenu, onExit, embedded }: { titleMenu?: any; onExit?: () => void; embedded?: boolean } = {}) {
  const palette = useThemePalette();
  const [openSwipeRepo, setOpenSwipeRepo] = useState("");
  const dismiss = Navigation.useDismiss();
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [sortOrder, setSortOrder] = useState("updated");
  const [compact, setCompact] = useState(false);
  const reposMap = useObservable<Record<string, RepoInfo[]> | undefined>(cachedReposMap);
  const errorsMap = useObservable<Record<string, string>>(cachedErrorsMap);
  // 刷新互斥：先前用 refreshing state 當鎖，但 state 不是同步的，連續兩個
  // init() 還是都會通過檢查；改用 ref 做真正的互斥（畫面不需要再另外讀
  // 這個值，下拉刷新自己會轉圈），另外記一個世代號，避免被新刷新取代的
  // 舊請求回來時又把剛刪掉的倉庫寫回清單。
  const refreshingRef = useRef(false);
  const refreshGen = useRef(0);
  // 刪除中的倉庫鎖：在開確認頁之前就取得，連點不會跑兩次刪除。
  const deletingRepo = useRef(false);
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  // 1.1.21：背景主題換了要重畫。1.1.23 修正：之前用一個沒人讀的
  // themeTick（`const [, setThemeTick]`）想觸發重畫，但值沒進畫面，
  // setState 根本不會讓這一頁重畫，所以換了背景要退出重進才換。
  // 改成把主題本身放進 state，並且真的傳給 GlassBackground 當 prop，
  // openSettings 回來 setBgTheme，新主題立刻畫出來。
  const [bgTheme, setBgTheme] = useState<BackgroundThemeId>(() => loadBackgroundTheme());
  // key 是「帳號#序號」，同名帳號也不會互相影響開合。
  // v1.49：初始值直接從 Storage 讀上次記住的開合，之前沒記過的才預設展開。
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => loadExpanded());
  // v1.3.2：帳號標題列前面顯示各自的頭像（Token -> avatar_url）。
  const [avatars, setAvatars] = useState<Record<string, string>>(() => loadAvatarCache());
  // 2.1.9：右滑動作執行中的倉庫（full_name），執行時列尾顯示轉圈圈，防重複點。
  const [busyRepo, setBusyRepo] = useState("");
  // 2.0.5：工作狀態（倉庫列第三行），初始值用模組快取，重新掛載先畫舊的。
  const [workStatus, setWorkStatus] = useState<Record<string, WorkStatus>>(() => cachedWorkStatus);
  // 2.0.26：刪除後重新觸發工作狀態載入的開關（見下面的暫停說明）。
  const [workStatusTick, setWorkStatusTick] = useState(0);

  // 2.0.5：搜尋／篩選共用。畫面跟工作狀態的懶載入都用同一套，
  // 搜尋中看不到的倉庫不抓工作狀態，省 API 次數。
  function filterRepos(all: RepoInfo[]): RepoInfo[] {
    return all.filter(r => (!query || `${r.full_name} ${r.description || ""}`.toLowerCase().includes(query.toLowerCase())) && (visibility === "all" || (visibility === "private" ? r.private : !r.private)));
  }

  // v1.3.2：帳號標題列的頭像。快取裡沒有的帳號，用該帳號的 Token 打 /user
  // 抓一次 avatar_url 並寫回快取。
  // 2026-11-07：並行抓。getUser 現在把 Token 直接傳進請求，不再換共用的
  // repo.token，所以不用先記住、換、再還原。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = loadAvatarCache();
      const missing = accounts.filter((acc) => !next[acc.token]);
      if (missing.length === 0) return;
      const results = await Promise.all(
        missing.map(async (acc) => {
          try {
            const me = await repo.getUser(acc.token);
            return { token: acc.token, url: me?.avatar_url || "" };
          } catch {
            return { token: acc.token, url: "" };
          }
        }),
      );
      let changed = false;
      for (const r of results) {
        if (r.url) {
          next[r.token] = r.url;
          changed = true;
        }
      }
      if (changed && !cancelled) {
        saveAvatarCache(next);
        setAvatars(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accounts]);

  // 2.0.5：展開的帳號分區才抓工作狀態。清單重抓、展開／折疊、搜尋／篩選
  // 變了都可能出現還沒抓過的倉庫，快取跟 in-flight 會擋掉重複的。
  // 帳號之間循序跑，帳號內每批 4 個並行。
  useEffect(() => {
    const map = reposMap.value;
    if (!map) return;
    // 2.0.26：刪除暫停中不載入（見上面模組層的說明）。迴圈裡也再檢查
    // 一次，免得暫停是在這一輪跑到一半時才開始。
    if (workStatusPaused) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < accounts.length; i++) {
        if (cancelled) return;
        if (workStatusPaused) return;
        const acc = accounts[i];
        const sectionId = `${acc.username}#${i}`;
        if (expanded[sectionId] === false) continue;
        await loadWorkStatus(acc, filterRepos(map[sectionId] || []));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reposMap.value, expanded, query, visibility, accounts, workStatusTick]);

  async function init(force?: boolean) {
    // 已經在刷新就不再重入：按鈕已反灰，這裡是下拉刷新 / 其他呼叫的第二道防線。
    // 2026-11-19：用 ref 當鎖（state 不是同步的），刪除後要強制刷新時傳 true。
    if (refreshingRef.current && !force) return;
    const gen = ++refreshGen.current;
    refreshingRef.current = true;
    try {
    if (!Storage.get<string>(TOKEN_KEY) && loadAccounts().length === 0) {
      await Navigation.present(<SettingView />);
      // 設定頁關掉時可能已經有更新的刷新（例如刪除後強制刷新）接棒，
      // 這份就不要再寫回畫面。
      if (gen !== refreshGen.current) return;
      if (!Storage.get<string>(TOKEN_KEY) && loadAccounts().length === 0) {
        reposMap.setValue({});
        cachedReposMap = {};
        return;
      }
      repo.token = Storage.get<string>(TOKEN_KEY) || "";
    }
    let list = loadAccounts();
    // 舊版只有單一 Token、還沒進過新版設定時，把舊 Token 當成一個帳號來顯示。
    if (list.length === 0 && Storage.get<string>(TOKEN_KEY)) {
      let username = Storage.get<string>(USERNAME_KEY) || "";
      if (!username) {
        try {
          const me = await repo.getUser();
          if (me.login) {
            username = me.login;
            Storage.set(USERNAME_KEY, me.login);
          }
        } catch {}
      }
      // 上面 getUser() 也是一個網路往返，回來後同樣要確認沒被新刷新取代。
      if (gen !== refreshGen.current) return;
      list = [{ username: username || "我的帳號", token: Storage.get<string>(TOKEN_KEY) || "" }];
    }
    setAccounts(list);
    // v1.49.1：預設改成折疊，第一次開只看到帳號標題，要看再點開。
    // 已經在 Storage 記過開合的帳號不會被這裡蓋掉，prev 裡有值就保留，
    // 所以之前手動點開過的，之後進來還是會照你上次的樣子展開。
    setExpanded((prev) => {
      const next = { ...prev };
      list.forEach((a, i) => {
        const id = `${a.username}#${i}`;
        if (next[id] === undefined) next[id] = true;
      });
      return next;
    });
    // 2026-11-07：兩個帳號並行抓，而且各帳號回來就先顯示，不用等另一個。
    // listReposForToken 現在把 Token 直接傳進請求，不再換共用的 repo.token，
    // 所以並行不會互相打架；之前循序抓是兩個請求的時間相加，Promise.all
    // 是等最慢的那一個，現在是快的帳號先出。
    const nextRepos: Record<string, RepoInfo[]> = {};
    const nextErrors: Record<string, string> = {};
    await Promise.all(
      list.map(async (acc, i) => {
        const id = `${acc.username}#${i}`;
        try {
          const repos = await repo.listReposForToken(acc.token);
          nextRepos[id] = repos;
          // 已經有更新的刷新在跑，這份結果就是舊的，不要寫回畫面。
          if (gen !== refreshGen.current) return;
          // 這個帳號先回來就先畫出來，不用等另一個帳號。
          reposMap.setValue({ ...(reposMap.value ?? {}), [id]: repos });
          cachedReposMap = { ...(cachedReposMap ?? {}), [id]: repos };
        } catch (e: any) {
          nextRepos[id] = [];
          const msg = t(`載入失敗：${String(e?.message || e)}`, `载入失败：${String(e?.message || e)}`, `Failed to load: ${String(e?.message || e)}`);
          nextErrors[id] = msg;
          if (gen !== refreshGen.current) return;
          reposMap.setValue({ ...(reposMap.value ?? {}), [id]: [] });
          errorsMap.setValue({ ...(errorsMap.value ?? {}), [id]: msg });
          cachedReposMap = { ...(cachedReposMap ?? {}), [id]: [] };
          cachedErrorsMap = { ...(cachedErrorsMap ?? {}), [id]: msg };
        }
      }),
    );
    // 全部回來後再統一寫一次，保證最終狀態一致。
    if (gen !== refreshGen.current) return;
    reposMap.setValue(nextRepos);
    errorsMap.setValue(nextErrors);
    cachedReposMap = nextRepos;
    cachedErrorsMap = nextErrors;
    // 抓完把 Token 換回使用中帳號，不要因為抓清單就改了使用中帳號。
    repo.token = Storage.get<string>(TOKEN_KEY) || "";
    } finally {
      // 已經被更新的刷新接棒就不要把別人的忙碌狀態關掉。
      if (gen === refreshGen.current) {
        refreshingRef.current = false;
      }
    }
  }

  // v1.25：瀏覽頁返回時自動刷新用。瀏覽頁關掉時才叫，瀏覽頁還在時不叫，
  // 所以不會在瀏覽頁裡打斷 Token；叫的時候清單先回到載入中，再重新抓各帳號。
  // 1.1.1：Fork 完是直接叫進來的（瀏覽頁還開著），init() 最後會把 repo.token
  // 換回使用中帳號，會蓋掉瀏覽頁正在用的 Token；先存起來、刷新完再還回去，
  // 瀏覽頁的 Token 不會被動到。瀏覽頁已經關掉時存回來的就是原本那個，沒差。
  // 1.1.2：Fork 完會帶 newRepo（剛 Fork 回來的倉庫）進來。Fork 是非同步建立，
  // 立刻重抓時 GitHub 那邊新倉庫還沒出來，刷了也看不到；直接把 API 回來的
  // 倉庫插進該帳號的清單最前面（就是正確資料），回到主頁立刻看得到，不用等
  // GitHub；那個帳號分區如果收著就幫它展開，不然插進去也看不到。沒有
  // newRepo 時（公開／私人切換、刪除倉庫的 cleanup）走原本的重抓。
  // 1.1.1（重設後）：不要在插進去之後背景再重抓——init() 會把該帳號的清單
  // 整包換成 GitHub 抓回來的，5 秒時 GitHub 那邊新 Fork 可能還沒出來，
  // 重抓就會把剛插進去的 Fork 蓋掉，回到主頁還是看不到（這就是 1.1.2
  // 在裝置上失敗的原因）。插進去就留在清單裡，下次手動刷新或重開時
  // GitHub 已經有了，自然會對上。
  async function handleListDirty(newRepo?: any) {
    if (newRepo && newRepo.full_name) {
      const fullName = String(newRepo.full_name);
      const owner = String(newRepo.owner?.login || fullName.split("/")[0] || "").toLowerCase();
      const keys = Object.keys(reposMap.value ?? {});
      const id = keys.find((k) => k.split("#")[0].toLowerCase() === owner);
      if (id) {
        const current = reposMap.value?.[id] ?? [];
        if (!current.some((r) => r.full_name === fullName)) {
          const next = [newRepo as RepoInfo, ...current];
          reposMap.setValue({ ...(reposMap.value ?? {}), [id]: next });
          cachedReposMap = { ...(cachedReposMap ?? {}), [id]: next };
        }
        setExpanded((prev) => ({ ...prev, [id]: true }));
        return;
      }
      // 帳號對不上（不應該發生），退回原本的重抓。
    }
    const prevToken = repo.token;
    try {
      await init();
    } finally {
      repo.token = prevToken;
    }
  }

  // v1.47：從帳號分區標題左滑新增倉庫（2.0.28 之前是長按選單）。
  // 新增頁成功才回傳 true，
  // 回來後清單先回到載入中再重抓，這樣新倉庫才會出現在該帳號分區裡。
  async function createRepoForAccount(account: Account) {
    const r = await Navigation.present(<NewRepoView account={account} />);
    if (r) {
      await init();
    }
  }

  // v3.0 回饋 7：首頁倉庫長按重新命名。之前首頁倉庫列長按沒有動作，
  // 現在帳號分區的倉庫列用跟設定頁帳號列一樣的 HStack contextMenu 寫法，
  // 長按出現「重新命名倉庫」。新名稱只填單一倉庫名，PATCH 後清單重抓
  // 才會看到新名字；別人的倉庫（不是該帳號擁有的）會回 403，錯誤直接顯示。
  // 手動查其他用戶的公開倉庫列是 title-only NavigationLink，沒有 HStack
  // 可以掛 contextMenu，而且那些本來就不是你的，改名一定失敗，所以不加。
  async function renameRepoForAccount(account: Account, r: RepoInfo) {
    const parts = String(r.full_name || "").split("/");
    const owner = parts[0] || "";
    const oldName = parts[1] || "";
    if (!owner || !oldName) return;
    const newNameRaw = await Dialog.prompt({
      title: t("重新命名倉庫", "重命名仓库", "Rename repository"),
      defaultValue: oldName,
    });
    if (newNameRaw === null || newNameRaw === undefined) return;
    const newName = String(newNameRaw).trim();
    if (!newName) {
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: t("倉庫名稱不能為空。", "仓库名称不能为空。", "Repository name cannot be empty.") });
      return;
    }
    if (newName.includes("/") || newName.includes("\\") || newName === "." || newName === "..") {
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: t("倉庫名稱不能包含 / 或 ..，只填一個倉庫名就好。", "仓库名称不能包含 / 或 ..，只填一个仓库名就好。", "Repository name cannot contain / or ... Enter a single repository name.") });
      return;
    }
    if (newName === oldName) return;
    // 2026-11-05 回饋：之前問完新名稱就直接 PATCH，沒有確認彈窗。
    // 現在跟資料夾更名用同一招：Dialog.actionSheet 才能讓確認變紅，
    // 標題跟訊息也照資料夾更名那張截圖的格式（問句、舊 → 新、影響說明），
    // 只有 index 0 才真的改，取消或點外面都留在原地。
    const idx = await Dialog.actionSheet({
      title: t("重新命名倉庫", "重命名仓库", "Rename repository"),
      message: t(`確定要把倉庫更名嗎？\n${owner}/${oldName} → ${owner}/${newName}\n底下所有檔案會一起換路徑`, `确定要把仓库更名吗？\n${owner}/${oldName} → ${owner}/${newName}\n底下所有文件会一起换路径`, `Rename this repository?\n${owner}/${oldName} → ${owner}/${newName}\nAll files under it will move to the new path.`),
      actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
    });
    if (idx !== 0) return;
    try {
      await repo.renameRepoForToken(account.token, owner, oldName, newName);
      // 2026-11-05 回饋（完成提示，不是確認彈窗）：第一行句號去掉，
      // 帳號／倉庫名前後加英文雙引號；第二行改成完成式「所有檔案已更換路徑」
      //（確認彈窗那句「會一起換路徑」是未來式，不動）。
      await Dialog.alert({ title: t("完成", "完成", "Done"), message: t(`已更名為 "${owner}/${newName}"\n所有檔案已更換路徑`, `已更名为 "${owner}/${newName}"\n所有文件已更换路径`, `Renamed to "${owner}/${newName}"\nAll files have changed path.`) });
      await init();
    } catch (e: any) {
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: String(e?.message || e) });
    }
  }

  // 2.0.5：抓一筆倉庫的工作狀態。Fork 先打 getRepo 拿 parent（上游 full_name
  // 跟預設分支，瀏覽頁同一招），再用 compareFork 取 ahead_by／behind_by；
  // 自己倉庫用 countCommits（commits 列表讀 Link 標頭最後一頁）取總數。
  // 失敗就拋錯，呼叫端記成 error、畫面留空白。
  async function fetchWorkStatus(account: Account, r: RepoInfo): Promise<WorkStatus> {
    const parts = String(r.full_name || "").split("/");
    const owner = parts[0] || "";
    const name = parts[1] || "";
    const branch = r.default_branch || "main";
    if (!owner || !name) throw new Error("no repo");
    if (r.fork) {
      const info: any = await repo.getRepoForToken(account.token, owner, name);
      const parent = info?.parent;
      if (!parent?.full_name) throw new Error("no parent");
      const parentOwner = String(parent.full_name).split("/")[0] || "";
      const parentBranch = parent.default_branch || "main";
      const cmp: any = await repo.compareForkForToken(account.token, owner, name, parentOwner, parentBranch, branch);
      return { state: "ok", kind: "fork", ahead: cmp?.ahead_by ?? 0, behind: cmp?.behind_by ?? 0 };
    }
    const commits = await repo.countCommits(owner, name, branch, account.token);
    return { state: "ok", kind: "own", commits };
  }

  // 2.0.5：分批懶載入工作狀態，每批 4 個並行，倉庫多也不會一次打爆 API。
  // 已經有快取或正在抓的跳過；每筆回來就寫進 state＋模組快取。
  async function loadWorkStatus(account: Account, repos: RepoInfo[]) {
    const todo = repos.filter((r) => {
      const key = String(r.full_name || "");
      return key && !cachedWorkStatus[key] && !workStatusInFlight.has(key);
    });
    if (todo.length === 0) return;
    for (let i = 0; i < todo.length; i += 4) {
      const batch = todo.slice(i, i + 4);
      await Promise.all(batch.map(async (r) => {
        const key = String(r.full_name || "");
        workStatusInFlight.add(key);
        // 2.0.26：暫停中不寫 state（那列的內容不能在抽列的同時變）。
        // 快取照寫，放行時會一次寫回 state；還沒抓的由重新觸發補抓。
        if (!workStatusPaused) setWorkStatus((prev) => ({ ...prev, [key]: { state: "loading" } }));
        try {
          const st = await fetchWorkStatus(account, r);
          cachedWorkStatus[key] = st;
          if (!workStatusPaused) setWorkStatus((prev) => ({ ...prev, [key]: st }));
        } catch {
          const st: WorkStatus = { state: "error" };
          cachedWorkStatus[key] = st;
          if (!workStatusPaused) setWorkStatus((prev) => ({ ...prev, [key]: st }));
        } finally {
          workStatusInFlight.delete(key);
        }
      }));
    }
  }

  // 2.0.5：單筆刷新後工作狀態可能變了（同步完超前／落後歸零、
  // 上傳後 commit 數加一），清掉快取重抓一次。
  function invalidateWorkStatus(r: RepoInfo) {
    const key = String(r.full_name || "");
    if (!key) return;
    delete cachedWorkStatus[key];
    setWorkStatus((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // 2.0.5：把剛抓回來的單筆倉庫資料寫回清單（取代舊的那一筆，順序不變）。
  function updateRepoEntry(sectionId: string, r: RepoInfo, info: any) {
    const list = reposMap.value?.[sectionId] || [];
    const next = list.map((x) => (x.full_name === r.full_name ? { ...x, ...(info as RepoInfo), full_name: r.full_name } : x));
    reposMap.setValue({ ...(reposMap.value ?? {}), [sectionId]: next });
    cachedReposMap = { ...(cachedReposMap ?? {}), [sectionId]: next };
  }

  // 2026-11-19：作廢還在跑的刷新。刪掉一筆後，如果剛好有一個更早開始的
  // 刷新還在路上，它回來會把已刪的倉庫寫回清單。這裡把世代號推前、並
  // 把鎖釋放（舊請求回來只會被 gen 檢查擋下，不會再寫畫面）。
  function invalidateRepoRefresh() {
    refreshGen.current += 1;
    refreshingRef.current = false;
  }

  // 2026-11-19：刪掉一筆倉庫後，直接把它從該帳號分區與快取拿掉，不等刷新。
  // 這樣就算後面的背景刷新失敗，畫面也不會還留著一筆已經不存在的倉庫。
  function removeRepoEntry(sectionId: string, fullName: string) {
    const cur = reposMap.value?.[sectionId];
    if (!cur) return;
    const next = cur.filter((x) => x.full_name !== fullName);
    if (next.length === cur.length) return;
    reposMap.setValue({ ...(reposMap.value ?? {}), [sectionId]: next });
    cachedReposMap = { ...(cachedReposMap ?? {}), [sectionId]: next };
    invalidateWorkStatus({ full_name: fullName } as RepoInfo);
  }

  // 2.0.10：首頁的抓取（Fetch）、合併（Pull）、推送（Push）三個動作連同函式
  // 一起移除，首頁只剩左滑的詳情／重新命名／同步 Fork。repo.ts 裡的 API
  //（getRepoForToken／syncForkForToken／putFileForToken 等）保留，
  // 瀏覽頁與其他頁面都還在用。

  // 2.0.5：左滑同步 Fork（只有 Fork 倉庫才有這顆）。跟瀏覽頁 handleSyncFork
  // 同做法（merge-upstream），成功後刷新該筆資料跟工作狀態（超前／落後歸零）。
  async function syncForkForAccount(account: Account, sectionId: string, r: RepoInfo) {
    const parts = String(r.full_name || "").split("/");
    const owner = parts[0] || "";
    const name = parts[1] || "";
    const branch = r.default_branch || "main";
    if (!owner || !name) return;
    try {
      const confirmed = await Dialog.confirm({
        title: t("同步 Fork", "同步 Fork", "Sync fork"),
        message: t(`確定要將「${r.full_name}」的 ${branch} 分支與上游同步嗎？`, `确定要将「${r.full_name}」的 ${branch} 分支与上游同步吗？`, `Sync the ${branch} branch of “${r.full_name}” with upstream?`),
      });
      if (!confirmed) return;
      await repo.syncForkForToken(account.token, owner, name, branch);
      try {
        const info: any = await repo.getRepoForToken(account.token, owner, name);
        updateRepoEntry(sectionId, r, info);
      } catch {}
      await Dialog.alert({ title: t("完成", "完成", "Done"), message: t("已同步到上游最新狀態。", "已同步到上游最新状态。", "Synced to the latest upstream state.") });
      invalidateWorkStatus(r);
      await loadWorkStatus(account, [r]);
    } catch (e: any) {
      const msg = String(e?.message || e);
      const hint = msg.includes("409")
        ? t("請先在網頁上解決衝突。", "请先在网页上解决冲突。", "Please resolve the conflict on the web first.")
        : "";
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: hint ? `${msg}\n${hint}` : msg });
    }
  }

  // 2.1.9：公開／刪除從內頁搬到首頁右滑，但流程跟原本一模一樣：
  // 公開是「確認 → PATCH → 通知」，刪除是「確認頁 → 第二次紅色確認 → DELETE」。
  // 首頁是多帳號清單，所以兩個動作都明確帶該分區帳號的 Token，
  // 不換共用的 repo.token（避免和其他帳號的請求打架）。
  function repoOwner(r: RepoInfo): string {
    return String(r.full_name || "").split("/")[0] || "";
  }
  function repoName(r: RepoInfo): string {
    return String(r.full_name || "").split("/")[1] || "";
  }
  // 公開／刪除都只能對自己的倉庫做。清單可能含組織或協作者倉庫，
  // 這些按下去一定失敗，所以直接提示，不發請求。
  function isOwnRepo(account: Account, r: RepoInfo): boolean {
    return !!account.username && repoOwner(r).toLowerCase() === account.username.toLowerCase();
  }

  async function togglePublicForAccount(account: Account, sectionId: string, r: RepoInfo) {
    const owner = repoOwner(r);
    const name = repoName(r);
    if (!owner || !name) return;
    if (!isOwnRepo(account, r)) {
      await Dialog.alert({ title: t("無法變更", "无法变更", "Cannot change"), message: t("只能變更自己倉庫的公開狀態。", "只能变更自己仓库的公开状态。", "You can only change the visibility of your own repositories.") });
      return;
    }
    // Fork 的可見性必須跟上游一致，GitHub 會回 422，跟內頁原本的條件一樣先擋。
    if (r.fork) {
      await Dialog.alert({ title: t("無法變更", "无法变更", "Cannot change"), message: t("Fork 倉庫的可見性跟上游一致，不能單獨變更。", "Fork 仓库的可见性跟上游一致，不能单独变更。", "A fork's visibility follows its upstream and cannot be changed separately.") });
      return;
    }
    const newPublic = !!r.private;
    const ok = await Dialog.confirm({
      title: t("確認變更", "确认变更", "Confirm change"),
      message: newPublic
        ? t("確定要把這個倉庫改為公開嗎？", "确定要把这个仓库改为公开吗？", "Change this repository to public?")
        : t("確定要把這個倉庫改為私人嗎？", "确定要把这个仓库改为私人吗？", "Change this repository to private?"),
    });
    if (!ok) return;
    setBusyRepo(String(r.full_name || ""));
    try {
      await repo.updateRepoVisibility(owner, name, !newPublic, account.token);
      updateRepoEntry(sectionId, r, { private: !newPublic });
      try {
        const n: any = Notification as any;
        if (n && typeof n.schedule === "function") {
          await n.schedule({
            title: `${owner}/${name}`,
            body: newPublic
              ? t("倉庫已改為公開", "仓库已改为公开", "Repository is now public")
              : t("倉庫已改為私人", "仓库已改为私人", "Repository is now private"),
            threadIdentifier: `github-repo-visibility-${owner}/${name}`,
          });
        }
      } catch {}
    } catch (e: any) {
      await Dialog.alert({ title: t("變更失敗", "变更失败", "Change failed"), message: String(e?.message || e) });
    } finally {
      setBusyRepo("");
    }
  }

  async function deleteRepoForAccount(account: Account, sectionId: string, r: RepoInfo) {
    const owner = repoOwner(r);
    const name = repoName(r);
    if (!owner || !name) return;
    if (!isOwnRepo(account, r)) {
      await Dialog.alert({ title: t("無法刪除", "无法删除", "Cannot delete"), message: t("只能刪除自己的倉庫。", "只能删除自己的仓库。", "You can only delete your own repositories.") });
      return;
    }
    // 2026-11-19：同步上鎖再開確認頁，避免連點或手勢重入跑出兩次刪除。
    if (deletingRepo.current) return;
    deletingRepo.current = true;
    let deleted = false;
    let refreshScheduled = false;
    try {
      // 沿用內頁那個確認頁：第一層頁面 + 第二層紅色「最後確認」，兩次都要按到。
      const confirmed: any = await Navigation.present(
        <DeleteRepoConfirmView owner={owner} repo={name} />,
      );
      traceDelete("repo-confirm-closed", confirmed ? "true" : String(confirmed));
      if (!confirmed) return;
      // 2026-11-19：確認頁回來不代表轉場已結束。舊版馬上就 setBusyRepo，
      // 把剛剛滑動的那一列換成忙碌樣式；先等緩衝。
      await afterDismiss();
      traceDelete("repo-confirm-settled");
      // 2.0.27：忙碌顯示加回來（轉圈圈＋紅字「刪除中…」，見下面列的
      // 第三行）。2.0.22 拿掉它是因為當時以為轉圈圈是兇手，後來證實
      // 不是（2.0.22 跟 2.0.20 的刪除程式一模一樣還是閃）；現在刪除
      // 改成長按選單，刪的時候沒有滑動開著，換內容應該是安全的。
      // 工作狀態暫停（2.0.26）還留著，抽列那幾秒不會有列更新來撞。
      setBusyRepo(String(r.full_name || ""));
      // 2026-11-19：DELETE 自己一個 try。已經刪掉了才發生的錯誤（提示、
      // 局部移除、背景刷新）不能再報成「刪除失敗」。
      try {
        traceDelete("repo-delete-start");
        await repo.deleteRepo(owner, name, account.token);
        traceDelete("repo-delete-done");
      } catch (e: any) {
        traceDelete("repo-delete-error", e?.message || e);
        const msg = String(e?.message || e);
        await Dialog.alert({
          title: t("刪除失敗", "删除失败", "Delete failed"),
          message: msg.includes("403")
            ? `${msg}\n${t("請確認 Token 已勾選 delete_repo 權限，且這個倉庫是你的。", "请确认 Token 已勾选 delete_repo 权限，且这个仓库是你的。", "Please make sure the Token has the delete_repo permission and that this repository is yours.")}`
            : msg,
        });
        return;
      }
      deleted = true;
      // 先讓還在跑的舊刷新作廢，再改清單；不然它回來會把這筆加回去。
      invalidateRepoRefresh();
      try {
        await Dialog.alert({
          title: t("完成", "完成", "Done"),
          message: t(`已刪除 "${owner}/${name}"`, `已删除 "${owner}/${name}"`, `Deleted "${owner}/${name}".`),
        });
      } catch {}
      // 2.0.20：不要在這裡立刻 removeRepoEntry／init(true)。那列的左滑
      // 刪除鈕還開著，在 handler 裡把那列抽掉、再整張重抓，等 handler
      // 結束、系統收合滑動時那列已經不在了，底層列表就算不攏——跟 Gist
      // 刪檔案 2.0.19 還閃退是同一個問題。所以先讓 handler 結束（滑動
      // 收合），800ms 後再局部移除那列；那列是在滑動已收合的狀態下消失。
      // 2.0.23：延後那段不再 init(true) 整張重抓。診斷三次都停在同一個
      // 地方（fgg、usuzu、ggg）：removeRepoEntry 跑完了，init(true) 重抓
      // 的那幾秒裡閃退，沒有 repo-refresh-done。刪的都是空倉庫——工作狀態
      // 的 countCommits 對空倉庫直接回 409，檢查失敗得快，剩下的列在重抓
      // 回來的同一時間改內容（超前／落後那行出現或消失），整張重抓的批次
      // 更新跟這些列更新撞在一起就閃。局部移除那列本身已證實跑得完，快取
      // 也同步更新了，那筆不會再出現；整張重抓交給下次下拉刷新或重開 App，
      // 不在刪除當下做。鎖等延後那段跑完才解。
      refreshScheduled = true;
      traceDelete("repo-remove-scheduled");
      setTimeout(() => {
        (async () => {
          try {
            traceDelete("repo-remove-row-start");
            // 2.0.26：抽列之前先暫停工作狀態的懶載入（見上面模組層的
            // 說明），免得那幾秒裡剩下的列一邊出現「…」一邊改超前／
            // 落後，跟抽列的批次更新撞在一起。
            workStatusPaused = true;
            removeRepoEntry(sectionId, String(r.full_name || ""));
            traceDelete("repo-remove-row-done");
            traceDelete("repo-refresh-skipped");
          } catch (uiErr) {
            console.log("[Repo] 刪除後更新清單失敗: " + String(uiErr));
          } finally {
            setBusyRepo("");
            deletingRepo.current = false;
            traceDelete("repo-flow-exit");
            // 2.0.26：3 秒後放行工作狀態載入。抽列早已結束，這時把
            // 暫停期間抓回來的快取一次寫回 state，再重新觸發一次
            // 載入，補抓暫停時跳過的倉庫。
            setTimeout(() => {
              workStatusPaused = false;
              setWorkStatus({ ...cachedWorkStatus });
              setWorkStatusTick((t) => t + 1);
            }, 3000);
          }
        })();
      }, 800);
    } catch (e: any) {
      // 這裡只收到確認頁本身出的錯（例如呈現失敗）。
      if (!deleted) {
        traceDelete("repo-flow-error", e?.message || e);
        console.log("[Repo] 刪除流程失敗: " + String(e?.message || e));
      }
    } finally {
      // 2.0.20：延後刷新已排程時，鎖跟 repo-flow-exit 留給延後那段收尾，
      // 不要在 handler 結束時就先解鎖／先寫結束。
      if (!refreshScheduled) {
        setBusyRepo("");
        deletingRepo.current = false;
        traceDelete("repo-flow-exit");
      }
    }
  }

  // v1.41：設定按鈕改回頂部工具列（v1.39 的置中做法已取消，依使用者要求改回原樣）。
  // v1.50.14：使用者頁回來要不要刷新，不再靠打勾的回傳值決定。
  // 打勾傳回來的值在這個頁面不可靠（v1.50.11～v1.50.13 實測：傳值回去
  // 關不掉頁面，只有不傳值的 dismiss() 一定關得掉），所以使用者頁的
  // 完成跟 X 現在都只用 dismiss() 關閉；清單頁自己在開頁前後各讀一次
  // 帳號清單比對，真的有新增、刪除、拖移排序才重抓，沒異動就不刷新，
  // 而且不管按打勾還是按 X 回來，只要帳號真的變了都會刷新。
  async function openSettings() {
    const before = Storage.get<string>(ACCOUNTS_KEY) || "";
    const beforeTheme = loadBackgroundTheme();
    await Navigation.present(<SettingView />);
    const after = Storage.get<string>(ACCOUNTS_KEY) || "";
    if (after !== before) {
      repo.token = Storage.get<string>(TOKEN_KEY) || "";
      await init();
    }
    // 1.1.21：背景主題換了也要重畫，不然首頁還是舊背景。
    // 1.1.23：直接把新主題寫進 state（bgTheme 真的傳給 GlassBackground），
    // 這一頁立刻重畫，不用退出重進。
    if (loadBackgroundTheme() !== beforeTheme) {
      setBgTheme(loadBackgroundTheme());
    }
  }

  useEffect(() => {
    repo.token = Storage.get<string>(TOKEN_KEY) || "";
    init();
  }, []);


  return (
    <List {...REPO_LIST}
      // 2.0.11：列表 tint 改成跟背景主題連動（滑動動作的圓形鈕吃這個）。
      // 之前固定是藍綠色，換成橘黃或藍紫背景時，左滑的詳情／重新命名
      // 還是藍綠圓，跟背景對不上。
      tint={palette.accent}
      navigationTitle={"GitHub Toolkit"}
      navigationBarTitleDisplayMode={"inline"}
      // navigationTitle 留著：返回上一頁的按鈕文字要用它。
      // 首頁背景：上版只改了 App 外層 VStack 的顏色，但 List 會自己畫一層
      // 系統背景（深色模式下接近黑色），把外層的深灰完全蓋掉，所以登入後
      // 的首頁還是黑色。scrollContentBackground="hidden" 把 List 那層系統
      // 背景藏起來，再用 background 直接給 List 上深灰（見 components/theme.ts）。
      scrollContentBackground="hidden"
      background="clear"
      listStyle="insetGroup"
      contentMargins={{ edges: "top", insets: 4, placement: "scrollContent" }}
      listSectionSpacing={8}
      refreshable={async () => { await init(); }}
      toolbar={{
        principal: <Text font={17} fontWeight="semibold" lineLimit={1} minScaleFactor={0.75}>GitHub Toolkit</Text>,
        // 嵌入首頁時沒有可以退出的 sheet，退出按鈕直接不顯示。
        ...(embedded ? {} : {
          topBarLeading: [
            <Button
              title={t("退出", "退出", "Close")}
              systemImage={"xmark"}
              action={() => {
                if (onExit) return onExit();
                dismiss();
                Script.exit();
              }}
            />,
          ],
        }),
        topBarTrailing: [
          // 3.2：收藏入口回到單一按鈕，進去會直接開上次看的那一邊；
          // 要在收藏／Follow 之間切，進頁面後點置頂標題的箭頭。
          // 2.1.10：圖標改回收藏的 bookmark（之前換成 person.2 反而看不出是收藏）。
          <Button
            title={t("收藏", "收藏", "Favorites")}
            systemImage="bookmark"
            action={async () => { await Navigation.present(<FavoritesView onListDirty={handleListDirty} />); }}
          />,
          <Button title={t("使用者", "用户", "User")} systemImage={"person.crop.circle"} action={openSettings} />,
        ],
      }}
    >
      <Section>
        <Overview title={t("Repo 總覽", "Repo 总览", "Repos")} query={query} onQuery={setQuery} visibility={visibility} onVisibility={setVisibility} sort={sortOrder} onSort={setSortOrder} options={[{id:"updated",title:t("最近更新", "最近更新", "Recently updated")},{id:"name",title:t("名稱", "名称", "Name")},{id:"stars",title:t("星數", "星数", "Stars")}]} compact={compact} onCompact={() => setCompact(!compact)} />
      </Section>
      {reposMap.value === undefined ? (
        <Section>
          <LoadingRow />
        </Section>
      ) : accounts.length === 0 ? (
        <Section>
          <Text listRowBackground={<ThemeCardBackground />} font={"callout"} foregroundStyle={"secondaryLabel"}>
            {t("尚未新增帳號，請先到使用者添加帳號。", "尚未新增账号，请先到用户添加账号。", "No account added yet. Please add an account on the User page first.")}
          </Text>
        </Section>
      ) : (
        accounts.map((account, idx) => {
          const id = `${account.username}#${idx}`;
          // v1.49.1：預設折疊，所以只有明確記成 true 才算展開，
          // 沒記過（undefined）跟記成 false 都算折疊。
          const isOpen = expanded[id] !== false;
          const allRepos = reposMap.value?.[id] || [];
          const list = filterRepos(allRepos).slice().sort((a,b) => sortOrder === "name" ? a.full_name.localeCompare(b.full_name) : sortOrder === "stars" ? (b.stargazers_count || 0) - (a.stargazers_count || 0) : (b.pushed_at || b.updated_at || "").localeCompare(a.pushed_at || a.updated_at || ""));
          // 2.0.5：該帳號總星星（已載入倉庫的 stargazers_count 加總）。
          // 還沒載入時 reposMap[id] 是 undefined，傳 undefined 讓卡片先不顯示；
          // 超過 100 個倉庫的帳號會少算（listReposForToken 只抓第一頁），接受這個限制。
          const totalStars = reposMap.value?.[id] === undefined ? undefined : allRepos.reduce((s, r) => s + (r.stargazers_count || 0), 0);
          const err = errorsMap.value[id] || "";
          const title =
            account.username && account.username !== "我的帳號"
              ? t(`${account.username}'s 倉庫`, `${account.username}'s 仓库`, `${account.username}'s Repositories`)
              : t("我的倉庫", "我的仓库", "My Repositories");
          return (
            <Section key={id}>
              {/* 2.0.28：分區標題的新增倉庫改成左滑。之前是長按（以為 Section
                  標題列掛不上 swipeActions）；照 Gist 帳號標題列「新增 Gist」
                  同一套寫法，把 Button 包進 HStack，左滑掛在 HStack 上，
                  點標題還是展開／折疊。 */}
              <HStack listRowBackground={<ThemeCardBackground />}
                trailingSwipeActions={{
                  allowsFullSwipe: false,
                  actions: [
                    <Button tint="#0A84FF" action={async () => { await createRepoForAccount(account); }}>
                      <Label title={t("新增倉庫", "新增仓库", "Create repository")} systemImage="plus" />
                    </Button>,
                  ],
                }}
              >
                <Button buttonStyle="borderless" frame={{ maxWidth: "infinity", alignment: "leading" }}
                  action={() => {
                  // v1.49：點一下就立刻寫進 Storage，退出再進來還是一樣的開合。
                  // v1.49.1：預設是折疊，isOpen 已經把「沒記過 = 折疊」算進去了，
                  // 所以直接用 !isOpen，不要用 !prev[id]，否則沒記過的帳號
                  // 點第一次會誤判成還要折疊（本來就是折疊的）。
                  const next = { ...expanded, [id]: !isOpen };
                  setExpanded(next);
                  try {
                    Storage.set(EXPANDED_KEY, JSON.stringify(next));
                  } catch {}
                }}
              >
                  <AccountHeader name={account.username && account.username !== "我的帳號" ? account.username : t("我的帳號", "我的账号", "My account")} avatar={avatars[account.token]} count={allRepos.length} unit="repo" publicCount={allRepos.filter(r => !r.private).length} privateCount={allRepos.filter(r => r.private).length} expanded={isOpen} totalStars={totalStars} />
                </Button>
              </HStack>
              {isOpen ? (
                <>
                  {err ? (
                    <Text listRowBackground={<ThemeCardBackground />} foregroundStyle={"secondaryLabel"}>{err}</Text>
                  ) : null}
                  {list.length === 0 && !err ? (
                    <Text listRowBackground={<ThemeCardBackground />} font={"callout"} foregroundStyle={"secondaryLabel"}>
                      {allRepos.length > 0 ? t("沒有符合條件的倉庫，試試其他關鍵字或篩選。", "没有符合条件的仓库，试试其他关键词或筛选。", "No repositories match. Try another search or filter.") : t("尚無倉庫，或 Token 沒有讀取權限，請先到使用者檢查。", "尚无仓库，或 Token 没有读取权限，请先到用户检查。", "No repositories, or the Token has no read permission. Please check on the User page.")}
                    </Text>
                  ) : (
                    list.map((r) => (
                      <NavigationLink listRowBackground={<SwipeRowBackground isPresented={openSwipeRepo === `${id}/${r.full_name}`} />}
                        listRowInsets={{ top: 8, leading: 16, bottom: 8, trailing: 16 }}
                        key={r.full_name}
                        foregroundStyle={r.private ? "secondaryLabel" : undefined}
                        destination={
                          <BrowserView
                            owner={r.full_name.split("/")[0]}
                            repo={r.full_name.split("/")[1]}
                            branch={r.default_branch}
                            path={""}
                            isPrivate={r.private}
                            isFork={r.fork}
                            accountToken={account.token}
                            accountUsername={account.username}
                            onListDirty={handleListDirty}
                          />
                        }
                      >
                        <HStack alignment="center" padding={{ leading: 16 }}
                          frame={{ minHeight: compact ? 40 : 54 }}
                          // 2.0.27：滑動刪除改成長按刪除（跟 Gist 那邊同一招）。
                          // 只有自己的倉庫才有刪除；別人的倉庫長按不出現刪除。
                          contextMenu={isOwnRepo(account, r) ? {
                            menuItems: (
                              <>
                                <Section>
                                  <Button title={t("刪除", "删除", "Delete")} systemImage="trash" role="destructive" action={async () => { await deleteRepoForAccount(account, id, r); }} />
                                </Section>
                              </>
                            ),
                          } : undefined}
                          leadingSwipeActions={{
                            allowsFullSwipe: false,
                            onPresentationChanged: presented => setOpenSwipeRepo(current => presented ? `${id}/${r.full_name}` : current === `${id}/${r.full_name}` ? "" : current),
                            // 2.1.9：公開、重新命名、刪除搬到首頁右滑，按鈕順序依使用者指定是
                            // 公開 → 重新命名 → 刪除；點下去的後續步驟跟原本在內頁一模一樣
                            // （公開是確認 → PATCH → 通知，刪除是確認頁 → 第二次紅色確認）。
                            actions: [
                              // 只有自己的倉庫才顯示公開（Fork 的可見性跟上游綁住，也不顯示）；
                              // 跟原本內頁的顯示條件一致，別人的倉庫不再會按了才報錯。
                              // 2.1.10：按鈕文字依目前狀態雙向切換——公開的顯示「私人」、
                              // 私人的顯示「公開」，圖標一起換（globe／lock），按下去就是
                              // 切到另一個狀態，確認訊息跟實際目標狀態一致。
                              ...(isOwnRepo(account, r) && !r.fork
                                ? [<Button tint="#0A84FF" disabled={busyRepo !== ""} action={async () => { await togglePublicForAccount(account, id, r); }}><Label title={r.private ? t("公開", "公开", "Public") : t("私人", "私人", "Private")} systemImage={r.private ? "globe" : "lock"} /></Button>]
                                : []),
                              <Button tint="#EF963C" disabled={busyRepo !== ""} action={async () => { await renameRepoForAccount(account, r); }}><Label title={t("重新命名", "重命名", "Rename")} systemImage="pencil" /></Button>,
                            ],
                          }}
                          trailingSwipeActions={{
                            allowsFullSwipe: false,
                            onPresentationChanged: presented => setOpenSwipeRepo(current => presented ? `${id}/${r.full_name}` : current === `${id}/${r.full_name}` ? "" : current),
                            actions: [
                              ...(r.fork ? [<Button tint="#51C3AC" action={async () => { await syncForkForAccount(account, id, r); }}><Label title={t("同步 Fork", "同步 Fork", "Sync fork")} systemImage="arrow.triangle.2.circlepath" /></Button>] : []),
                              <Button tint="#5D748C" action={async () => {
                                const parts = String(r.full_name || "").split("/");
                                await openRepoPage(parts[0] || "", parts[1] || "");
                              }}><Label title={t("倉庫詳情", "仓库详情", "Repository details")} systemImage="info.circle" /></Button>,

                            ],
                          }}
                        >
                          {busyRepo === String(r.full_name || "") ? <ProgressView /> : <Image systemName={r.fork ? "arrow.triangle.branch" : "shippingbox"} font={17} foregroundStyle={palette.accent} frame={{ width: 36, height: 36 }} background={{ style: palette.selected, shape: { type: "rect", cornerRadius: 10 } }} />}
                          {/* 2.0.17：保留外側上下各 8pt 留白，內容最低高度降為 54pt，
                              移除文字區重複內距，讓原生動作區更接近 Gist 的高度。
                              使用 minHeight 保留放大字體自然增高的空間。 */}
                          <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                            {/* 2.0.5：倉庫列改三行。第一行：倉庫名＋預設分支名＋星星；
                                第二行：倉庫介紹（緊湊模式不顯示，沒描述也不顯示）；
                                第三行：工作狀態（緊湊模式也保留）。語言那個小標新規格
                                沒位置，先拿掉。 */}
                            <HStack spacing={8} alignment="center">
                              <Text font={14} fontWeight="semibold" lineLimit={1}>{r.full_name.split("/").slice(1).join("/")}</Text>
                              <HStack spacing={3} alignment="center">
                                <Image systemName="arrow.triangle.branch" font={10} foregroundStyle="secondaryLabel" />
                                <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{r.default_branch}</Text>
                              </HStack>
                              {/* 2.0.8：星星再改小。2.0.6 改回空心後裝置上還是顯大：
                                  star 字形比分支圖標寬，font 10 看起來跟旁邊 11 的數字
                                  差不多大。改成 font 8，讓圖標明顯比數字小，
                                  跟瀏覽頁 RepoMetric（圖標 12、數字 15）同一個比例。 */}
                              <HStack spacing={2} alignment="center">
                                <Image systemName="star" font={8} foregroundStyle="secondaryLabel" />
                                <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{String(r.stargazers_count || 0)}</Text>
                              </HStack>
                            </HStack>
                            {/* 2.0.9：描述從兩行改一行。之前兩行的列很高，滑開時
                                圓形按鈕置中、文字浮在很高的位置，看起來中間空一塊。
                                收成一行後列變矮，滑動動作跟內容貼得比較緊。 */}
                            {/* 2.0.29：刪除忙碌樣式統一（跟 Gist 首頁同一套）：圖標換
                                轉圈圈、名字第一行不動、第二行顯示紅色小字「刪除中…」
                                （描述暫時讓位），第三行工作狀態留著；列尾的轉圈圈拿掉。 */}
                            {busyRepo === String(r.full_name || "") ? <Text font={11} foregroundStyle="red" lineLimit={1}>{t("刪除中…", "删除中…", "Deleting…")}</Text> : (!compact && r.description ? <Text font={12} foregroundStyle="secondaryLabel" lineLimit={1}>{r.description}</Text> : null)}
                            <WorkStatusLine status={workStatus[String(r.full_name || "")]} />
                          </VStack>
                          <Spacer />
                          {r.private ? <Image systemName="lock.fill" font={9} foregroundStyle="secondaryLabel" frame={{ width: 16, height: 20 }} /> : null}
                          </HStack>
                      </NavigationLink>
                    ))
                  )}
                </>
              ) : null}
            </Section>
          );
        })
      )}
      {embedded ? (
        <Section>
          <HStack listRowBackground={<Rectangle fill={"clear"} />}>
            <Rectangle fill={"clear"} frame={{ maxWidth: "infinity", height: 50 }} />
          </HStack>
        </Section>
      ) : null}
    </List>
  );
}

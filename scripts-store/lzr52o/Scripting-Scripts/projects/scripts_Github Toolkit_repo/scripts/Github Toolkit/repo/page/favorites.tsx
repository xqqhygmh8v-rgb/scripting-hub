import { ThemeCardBackground, ThemeCardSolidBackground, useThemePalette } from "../../components/themePalette";
import { REPO_LIST, RepoHeader, RepoEntry, RepoIcon } from "../../components/repoUI";
// 收藏倉庫：把常用（別人的）倉庫或用戶釘在這裡，
// 不用每次都從首頁「查詢其他用戶倉庫」手動輸入。
// 每筆收藏就是一組跟舊手動查詢一樣的參數：用戶名（必填）、倉庫名（可空）、
// 分支（可空，留空就用預設分支）。倉庫名留空時，這筆收藏代表「這個用戶」，
// 點開會展開顯示他的公開倉庫（跟舊手動查詢同一套寫法）。
import {
  Button,
  ForEach,
  HStack,
  Image,
  Label,
  List,
  Navigation,
  NavigationLink,
  NavigationStack,
  ProgressView,
  Rectangle,
  Section,
  Spacer,
  Text,
  TextField,
  VStack,
  useEffect,
  useObservable,
  useRef,
  useState,
} from "scripting";
import { ACCOUNTS_KEY, TOKEN_KEY, USERNAME_KEY, repo, type RepoInfo } from "../class/repo";
import { View as BrowserView } from "./browser";
import { openRepoPage, openUserPage } from "./repoDetail";
import { t } from "../class/i18n";
import { PAGE_BACKGROUND, CARD_BACKGROUND } from "../../components/theme";
import { GlassBackground } from "../../components/glass";
import { LoadingRow } from "../../components/loadingRow";
import { SwipeRowBackground } from "../../components/swipeRowBackground";
import {
  addFollowImportSkip,
  clearFollowImportSkipFor,
  isFollowImportEnabled,
  loadFollowImportSkip,
  pruneFollowImportSkip,
} from "../class/followImport";

export interface Favorite {
  id: string;
  owner: string;
  repo: string;
  branch: string;
  addedAt: number;
  // 3.5：自動從 Follow 帶入的收藏會記來源使用者（login）。
  // 手動收藏沒有這個欄位；有這個欄位就歸到那個使用者的分區，
  // 取消 Follow 之後也不會被刪掉。
  fromFollow?: string;
}

// owner/repo 不分大小寫的去重鍵，自動帶入與刪除排除清單都用同一套。
function favoriteKey(owner: string, repo: string): string {
  return `${String(owner).toLowerCase()}/${String(repo).toLowerCase()}`;
}

// 自動帶入一次只跑一份，避免進頁、下拉、切模式同時觸發重複打 API。
// 2.1.9：正在跑的時候又有人叫（例如下拉刷新、或匯入中重新進入收藏頁），
// 記成「還要再跑一次」，這一份跑完再接著跑，不要直接把這次刷新丟掉。
let importInFlight = false;
let importQueued = false;
// 2.1.11：短時間內不重跑整批帶入。進收藏頁、切回收藏、從添加頁回來、
// 下拉刷新都會叫一次，每次都要把「每一位 Follow 使用者」的倉庫重抓一輪；
// 帳號多、Follow 的人多時就是一連串請求，畫面看起來一直轉圈。
// 這裡只擋 60 秒內的短時間重複（手動下拉會強制重跑），不會取代「進收藏頁就刷新」。
const IMPORT_MIN_INTERVAL = 60_000;
let lastImportAt = 0;

// 固定上限的平行工作池：一次最多 4 個請求，哪個先回來就先套用。
async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length));
  const runners: Promise<void>[] = [];
  for (let i = 0; i < size; i++) {
    runners.push((async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        try {
          await worker(item);
        } catch {}
      }
    })());
  }
  await Promise.all(runners);
}

// 2.1.11：頭像抓取的進行中清單。之前 effect 直接依賴整個 favorites，
// 自動帶入是「每個使用者回來就 setFavorites 一次」，每改一次就重啟回圈，
// 整批缺失頭像被重新抓一輪（同一個 owner 可能被抓好幾次），
// 看起來就是進收藏頁一直在轉圈、還很耗 API 額度。
const avatarInFlight = new Set<string>();

const FAVORITES_KEY = "repo_favorites";
const AVATAR_CACHE_KEY = "repo_favorite_avatars";
// 3.1：記住上次看的是「收藏」還是「Follow」，下次進來直接回到那一邊。
const MODE_KEY = "repo_favorites_mode";

function loadFavorites(): Favorite[] {
  try {
    const raw = Storage.get<string>(FAVORITES_KEY) || "";
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((f: any) => f && typeof f.owner === "string" && f.owner.trim());
  } catch {
    return [];
  }
}

function saveFavorites(list: Favorite[]) {
  try {
    Storage.set(FAVORITES_KEY, JSON.stringify(list));
  } catch {}
}

function loadMode(): "favorites" | "follow" {
  try {
    return Storage.get<string>(MODE_KEY) === "follow" ? "follow" : "favorites";
  } catch {
    return "favorites";
  }
}

// 3.1：滑動鈕用原生 Label。Scripting 的 Label 在滑動區就是「圖標在上、文字在下」，
// 標題保持短（刪除／編輯／Follow），膠囊才會是小顆的那種。
// （之前自己用 VStack 排，文字會跑到膠囊外面，看起來反而更大更亂。）

function loadAvatarCache(): Record<string, string> {
  try {
    const raw = Storage.get<string>(AVATAR_CACHE_KEY) || "";
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    return obj;
  } catch {
    return {};
  }
}

function saveAvatarCache(map: Record<string, string>) {
  try {
    Storage.set(AVATAR_CACHE_KEY, JSON.stringify(map));
  } catch {}
}

function favoriteLabel(fav: Favorite): string {
  return fav.repo ? `${fav.owner}/${fav.repo}` : fav.owner;
}

// 一筆收藏的列。倉庫名有填就是直接進倉庫的 NavigationLink；
// 倉庫名留空就是用戶收藏，點標題展開看他的公開倉庫（跟舊手動查詢同一套）。
function FavoriteRow({
  fav,
  avatar,
  menu,
  onListDirty,
  query,
  onDelete,
}: {
  fav: Favorite;
  query: string;
  avatar?: string;
  menu: any;
  onListDirty?: (newRepo?: any) => void;
  // 2.0.27：滑動刪除改成長按刪除。刪除從 rowMenu 拿掉，改由這列的
  // contextMenu 叫出。
  onDelete?: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  // 滑動狀態：自己這一列與下方展開出來的倉庫列各自追蹤，開啟時背景才變圓弧。
  const [swipeOpen, setSwipeOpen] = useState(false);
  const [openRepoRow, setOpenRepoRow] = useState("");
  // 2.0.11：分支圖標改跟背景主題連動。
  const palette = useThemePalette();
  const [userRepos, setUserRepos] = useState<RepoInfo[] | null>(null);
  const [userError, setUserError] = useState("");
  const [userLoading, setUserLoading] = useState(false);
  const [userLoadedFor, setUserLoadedFor] = useState("");
  // 1.1.6：用戶收藏的公開倉庫數。展開才載的 userRepos 還沒載時看不到數字，
  // 所以掛載時先打一次 getUserByName 拿 public_repos，只為了顯示標題後面
  // 的「 (N)」，跟 Gist／Action 首頁分區標題後面的數字同一個寫法。
  // 失敗就不顯示數字，不擋清單。
  const [userRepoCount, setUserRepoCount] = useState<number | null>(null);

  useEffect(() => {
    if (fav.repo) return;
    let cancelled = false;
    (async () => {
      try {
        const u: any = await repo.getUserByName(fav.owner);
        if (cancelled) return;
        if (typeof u?.public_repos === "number") setUserRepoCount(u.public_repos);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadUserRepos(username: string) {
    setUserLoading(true);
    setUserError("");
    try {
      const list = await repo.listUserRepos(username);
      setUserRepos(list);
      setUserLoadedFor(username);
      // 1.1.6：展開後用實際載到的清單長度更新標題後面的數字，跟
      // getUserByName 的 public_repos 應該一致，取實際載到的為準。
      setUserRepoCount(list.length);
    } catch (e: any) {
      setUserRepos([]);
      const msg = String(e?.message || e);
      setUserError(
        msg.includes("404")
          ? t(`找不到用戶「${username}」，請檢查用戶名是否正確。`, `找不到用户「${username}」，请检查用户名是否正确。`, `User “${username}” not found. Please check the username.`)
          : t(`載入失敗：${msg}`, `载入失败：${msg}`, `Failed to load: ${msg}`),
      );
      setUserLoadedFor(username);
    }
    setUserLoading(false);
  }

  const keyword = query.trim().toLowerCase();
  const favoriteMatches = `${fav.owner}/${fav.repo} ${fav.branch}`.toLowerCase().includes(keyword);
  const matchingRepos = (userRepos || []).filter((r) =>
    `${r.full_name} ${r.description || ""}`.toLowerCase().includes(keyword),
  );
  // 保持列掛載，搜尋與清除關鍵字不會丟失已載入清單或展開狀態。
  if (keyword && !favoriteMatches && (fav.repo || matchingRepos.length === 0)) return null;
  const visibleRepos = keyword && !favoriteMatches ? matchingRepos : (userRepos || []);

  if (fav.repo) {
    return (
      <Section>
        <NavigationLink
          listRowBackground={<SwipeRowBackground isPresented={swipeOpen} />}
          destination={<BrowserView owner={fav.owner} repo={fav.repo} branch={fav.branch} path={""} onListDirty={onListDirty} readOnly={true} />}
        >
          {/* 2.0.7：滑動改回來，照官方範例掛在列本身的 HStack 上
              （不要掛 NavigationLink）。menu 就是 trailingSwipeActions 物件。 */}
          <HStack alignment={"center"} spacing={10}
            contextMenu={onDelete ? {
              menuItems: (
                <>
                  <Section>
                    <Button title={t("刪除", "删除", "Delete")} systemImage="trash" role="destructive" action={async () => { await onDelete(); }} />
                  </Section>
                </>
              ),
            } : undefined}
            trailingSwipeActions={{
              ...menu,
              onPresentationChanged: (presented: boolean) => setSwipeOpen(presented),
            }}>
            {/* 2.1.10：倉庫列照首頁原本的顯示（方塊圖標），不帶頭像；
                頭像只留在使用者分區的標題列。 */}
            <RepoEntry symbol="shippingbox" title={fav.repo} subtitle={`${fav.owner} · ${fav.branch || t("預設分支", "默认分支", "Default branch")}`} />
          </HStack>
        </NavigationLink>
      </Section>
    );
  }

  return (
    <Section>
      {/* 2.0.7：滑動改回來，照官方範例掛在列本身的 HStack 上。
          主內容 Button 留著（點了展開／折疊，跟以前一樣），「⋯」按鈕拿掉。 */}
      <HStack alignment={"center"} spacing={10} listRowBackground={<SwipeRowBackground isPresented={swipeOpen} />}
        contextMenu={onDelete ? {
          menuItems: (
            <>
              <Section>
                <Button title={t("刪除", "删除", "Delete")} systemImage="trash" role="destructive" action={async () => { await onDelete(); }} />
              </Section>
            </>
          ),
        } : undefined}
        trailingSwipeActions={{
          ...menu,
          onPresentationChanged: (presented: boolean) => setSwipeOpen(presented),
        }}>
        <Button
          buttonStyle="borderless"
          frame={{ maxWidth: "infinity", alignment: "leading" }}
          action={async () => {
            const nextOpen = !expanded;
            setExpanded(nextOpen);
            if (nextOpen && (userLoadedFor.toLowerCase() !== fav.owner.toLowerCase() || userRepos === null)) {
              await loadUserRepos(fav.owner);
            }
          }}
        >
          <HStack alignment={"center"} spacing={8} frame={{ maxWidth: "infinity", height: 30, alignment: "leading" }}>
            {avatar ? (
              <Image imageUrl={avatar} resizable={true} frame={{ width: 24, height: 24 }} clipShape={"circle"} />
            ) : (
              <Image systemName={"person.crop.circle"} frame={{ width: 24, height: 24 }} foregroundStyle={"secondaryLabel"} />
            )}
            <Text fontWeight="semibold" lineLimit={1}>{fav.owner}</Text>
            {userRepoCount !== null ? (
              <Text foregroundStyle={"secondaryLabel"}>{` (${userRepoCount})`}</Text>
            ) : null}
            <Spacer />
            <Image systemName={expanded ? "chevron.up" : "chevron.down"} foregroundStyle={palette.accent} />
          </HStack>
        </Button>
      </HStack>
      {expanded || (keyword && matchingRepos.length > 0) ? (
        userLoading ? (
          <LoadingRow />
        ) : userLoadedFor.toLowerCase() !== fav.owner.toLowerCase() ? (
          <Text listRowBackground={<ThemeCardBackground />} font={"callout"} foregroundStyle={"secondaryLabel"}>
            {t("用戶名已變更，請重新載入。", "用户名已变更，请重新载入。", "Username changed. Please reload.")}
          </Text>
        ) : userError ? (
          <Text listRowBackground={<ThemeCardBackground />} foregroundStyle={"secondaryLabel"}>
            {userError}
          </Text>
        ) : !userRepos || userRepos.length === 0 ? (
          <Text listRowBackground={<ThemeCardBackground />} font={"callout"} foregroundStyle={"secondaryLabel"}>
            {t("這個用戶沒有公開倉庫。", "这个用户没有公开仓库。", "This user has no public repositories.")}
          </Text>
        ) : (
          visibleRepos.map((r) => (
            <NavigationLink
              listRowBackground={<SwipeRowBackground isPresented={openRepoRow === r.full_name} />}
              key={r.full_name}
              destination={
                <BrowserView
                  owner={r.full_name.split("/")[0]}
                  repo={r.full_name.split("/")[1]}
                  branch={r.default_branch}
                  path={""}
                  isPrivate={r.private}
                  isFork={r.fork}
                  onListDirty={onListDirty}
                  readOnly={true}
                />
              }
            >
              {/* 2.0.7：滑動改回來，照官方範例掛在列本身的 HStack 上
                  （不要掛 NavigationLink）。只有「倉庫詳情」一個選項。 */}
              <HStack alignment={"center"} trailingSwipeActions={{
                allowsFullSwipe: false,
                onPresentationChanged: (presented: boolean) => setOpenRepoRow(current => presented ? r.full_name : current === r.full_name ? "" : current),
                actions: [
                  <Button action={async () => { await openRepoPage(r.full_name.split("/")[0], r.full_name.split("/")[1]); }} tint="#5D748C">
                    <Label title={t("倉庫詳情", "仓库详情", "Repository details")} systemImage="info.circle" />
                  </Button>,
                ],
              }}>
                <RepoEntry symbol="shippingbox" title={r.full_name.split("/")[1]} subtitle={r.description || r.full_name} />
              </HStack>
            </NavigationLink>
          ))
        )
      ) : null}
    </Section>
  );
}

// 添加／編輯收藏的表單，搬入使用者設定頁的模式：
// 上面是已經加好的收藏（長按三行線拖移排序），下面是藍色「添加倉庫」卡片，
// 點了才在原頁展開輸入表單；收藏頁（FavoritesView）本身維持現在這樣不動。
// 新增存好後表單收起來、新加的出現在上面清單裡，不關掉本頁；
// 編輯在添加頁內部完成：長按清單選「編輯」，表單填入該筆的值、存好後更新清單、不關頁；
// 收藏頁長按只剩刪除（編輯搬進添加頁裡了）。
function AddFavoriteView({ favorites }: { favorites: Favorite[] }) {
  const dismiss = Navigation.useDismiss();
  // 2.0.11：這頁的強調色改跟背景主題連動。
  const palette = useThemePalette();
  // 拖移用的清單（跟使用者設定頁的 accountItems 同一套寫法）：
  // ForEach + editActions="move"，拖完直接改寫 favoriteItems。
  // 3.5：這裡只管理手動收藏；Follow 自動帶入的項目由收藏頁依使用者分區顯示，
  // 不接進來排，避免這裡寫回 Storage 時跟自動帶入互相覆蓋。
  const favoriteItems = useObservable(favorites.filter((f) => !f.fromFollow).map((f) => ({ ...f })));
  const editMode = useObservable(() => EditMode.active());
  const [avatars, setAvatars] = useState<Record<string, string>>(() => loadAvatarCache());
  // 表單先收起來，點藍色卡片才展開；長按清單選「編輯」時，表單切到編輯模式、
  // 填入該筆的值（編輯在添加頁內部完成，不再從收藏頁跨頁開進來）。
  const [showAdd, setShowAdd] = useState(false);
  // 正在編輯的那筆收藏 id；null 就是新增模式。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [owner, setOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [branch, setBranch] = useState("");

  // 拖移改了 favoriteItems 就立刻寫回 Storage；收藏頁關掉添加頁時重讀 Storage，
  // 順序就跟著變（返回用 dismiss(true) 讓收藏頁重讀）。
  // 3.5：自動帶入的項目不在這份清單裡，但寫回時要把它們原樣保留，
  // 不然添加／拖移一次就會把剛帶入的倉庫全部抹掉。
  useEffect(() => {
    const imported = loadFavorites().filter((f) => f.fromFollow);
    const next: Favorite[] = [...favoriteItems.value.map((item: any) => ({ ...item })), ...imported];
    if (JSON.stringify(next) !== JSON.stringify(loadFavorites())) {
      saveFavorites(next);
    }
  }, [favoriteItems.value]);

  // 每列頭像：快取裡沒有的擁有者，用 getUserByName 拉一次 avatar_url 並快取起來；
  // 抓不到（沒 Token、用戶不存在、網路問題）就留著預設圖示，不擋整頁。
  useEffect(() => {
    const owners = [...new Set(favoriteItems.value.map((item: any) => String(item.owner).toLowerCase()))];
    const missing = owners.filter((o) => !loadAvatarCache()[o]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const next = loadAvatarCache();
      let changed = false;
      for (const o of missing) {
        try {
          const me = await repo.getUserByName(o);
          if (me?.avatar_url) {
            next[o] = me.avatar_url;
            changed = true;
          }
        } catch {}
      }
      if (!cancelled && changed) {
        saveAvatarCache(next);
        setAvatars(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [favoriteItems.value]);

  async function handleSave() {
    const o = owner.trim();
    const r = repoName.trim();
    const b = branch.trim();
    if (!o) {
      await Dialog.alert({
        title: t("請輸入用戶名", "请输入用户名", "Enter a username"),
        message: t("用戶名不能為空。", "用户名不能为空。", "Username cannot be empty."),
      });
      return;
    }
    // 重複檢查：同一組 用戶名+倉庫名+分支（不分大小寫）只能收藏一次，
    // 編輯時要把正在改的這一筆排除，否則改分支以外的欄位也會被擋。
    // 用 favoriteItems（目前清單）檢查，不用傳進來的 favorites——
    // 同一次開頁連續新增多筆時，傳進來的那份還是舊的。
    // 2.1.9：自動帶入的項目不看分支。自動帶入用的是倉庫的預設分支，
    // 使用者手動再加同一倉庫但填別的分支時，之前會變成同一個倉庫兩筆。
    const dup = loadFavorites().some(
      (f: any) =>
        f.id !== editingId &&
        String(f.owner).toLowerCase() === o.toLowerCase() &&
        String(f.repo || "").toLowerCase() === r.toLowerCase() &&
        (f.fromFollow ? true : String(f.branch || "").toLowerCase() === b.toLowerCase()),
    );
    if (dup) {
      await Dialog.alert({
        title: t("已經收藏過了", "已经收藏过了", "Already in favorites"),
        message: t("這個倉庫已經在收藏清單裡。", "这个仓库已经在收藏清单里。", "This repository is already in your favorites."),
      });
      return;
    }
    if (editingId) {
      // 編輯：更新上面清單裡那筆（寫回 favoriteItems 就會觸發 useEffect 寫進 Storage），
      // 留在添加頁裡不關頁，表單收起來、回到新增狀態。
      favoriteItems.setValue(
        favoriteItems.value.map((f: any) => (f.id === editingId ? { ...f, owner: o, repo: r, branch: b } : f)),
      );
      setEditingId(null);
      setOwner("");
      setRepoName("");
      setBranch("");
      setShowAdd(false);
    } else {
      const list = loadFavorites();
      const entry: Favorite = { id: String(Date.now()), owner: o, repo: r, branch: b, addedAt: Date.now() };
      const next = [entry, ...list];
      saveFavorites(next);
      favoriteItems.setValue([entry, ...favoriteItems.value.map((f: any) => ({ ...f }))]);
      // 新增不關頁：表單收起來、清空欄位，新加的立刻出現在上面清單裡。
      setOwner("");
      setRepoName("");
      setBranch("");
      setShowAdd(false);
    }
  }

  // 長按清單選「編輯」：表單切到編輯模式、填入該筆的值（用戶收藏也一樣，只填用戶名）。
  function startEdit(item: any) {
    setEditingId(String(item.id));
    setOwner(String(item.owner || ""));
    setRepoName(String(item.repo || ""));
    setBranch(String(item.branch || ""));
    setShowAdd(true);
  }

  // 長按清單選「刪除」：先問一次再刪；正在編輯的那筆被刪了，表單也要清掉、回到新增狀態。
  async function handleDeleteItem(item: any) {
    const idx = await Dialog.actionSheet({
      title: t("刪除收藏", "删除收藏", "Remove favorite"),
      message: t(`確定要刪除「${favoriteLabel(item)}」嗎？`, `确定要删除「${favoriteLabel(item)}」吗？`, `Remove “${favoriteLabel(item)}” from favorites?`),
      actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
    });
    if (idx !== 0) return;
    if (editingId === String(item.id)) {
      setEditingId(null);
      setOwner("");
      setRepoName("");
      setBranch("");
      setShowAdd(false);
    }
    // 寫回 favoriteItems 就會觸發 useEffect 寫進 Storage。
    favoriteItems.setValue(favoriteItems.value.filter((f: any) => f.id !== item.id));
  }

  return (
    <NavigationStack>
      <List {...REPO_LIST}
        tint={palette.accent}
        scrollContentBackground="hidden"
        background={<GlassBackground />}
        navigationTitle={t("添加倉庫", "添加仓库", "Add repository")}
        navigationBarTitleDisplayMode={"inline"}
        environments={{ editMode }}
        toolbar={{
          // 返回要帶 true 回去，收藏頁收到才重讀 Storage（拖移排序、新增都要靠它更新）。
          topBarLeading: <Button title={t("返回", "返回", "Back")} action={() => dismiss(true)} />,
        }}
      >
        <Section header={<RepoHeader symbol="bookmark" title={t("收藏倉庫", "收藏仓库", "Favorites")} />}>
          {favoriteItems.value.length > 0 ? (
            <ForEach
              data={favoriteItems}
              editActions={"move"}
              builder={(item: any) => (
                <HStack
                  key={item.id}
                  // 2.0.12：拖移排序的清單改用實色卡片底，避免拖曳時半透明的
                  // 卡片跟系統拖曳預覽疊出另一層顏色（跟使用者設定頁帳號列一樣）。
                  listRowBackground={<ThemeCardSolidBackground />}
                  alignment={"center"}
                  spacing={10}
                  contextMenu={{
                    // 2.0.5：這處長按刻意不改左滑。這個 List 永久處於編輯模式
                    //（EditMode.active()，為了拖移排序），SwiftUI 編輯模式下
                    // swipeActions 不會出現，改了會讓編輯／刪除按不到，所以
                    // 留著原本的長按選單。跟使用者設定頁的帳號清單同一套寫法：
                    // 編輯模式的 List 裡，長按列一樣可以叫出選單（編輯／刪除），
                    // 拖移排序不受影響。
                    menuItems: (
                      <>
                        <Section>
                          <Button title={t("編輯", "编辑", "Edit")} systemImage={"pencil"} action={() => startEdit(item)} />
                        </Section>
                        <Section>
                          <Button title={t("刪除", "删除", "Delete")} systemImage={"trash"} role={"destructive"} action={async () => { await handleDeleteItem(item); }} />
                        </Section>
                      </>
                    ),
                  }}
                >
                  {avatars[String(item.owner).toLowerCase()] ? (
                    <Image imageUrl={avatars[String(item.owner).toLowerCase()]} resizable={true} frame={{ width: 28, height: 28 }} clipShape={"circle"} />
                  ) : (
                    <Image systemName={"person.crop.circle"} frame={{ width: 28, height: 28 }} foregroundStyle={"#8e8e93"} />
                  )}
                  <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                    <Text font="callout" fontWeight="medium" lineLimit={1}>{favoriteLabel(item)}</Text>
                    <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>{item.repo ? (item.branch || t("預設分支", "默认分支", "Default branch")) : t("公開倉庫", "公开仓库", "Public repositories")}</Text>
                  </VStack>
                </HStack>
              )}
            />
          ) : (
            <Text listRowBackground={<ThemeCardBackground />} font={"callout"} foregroundStyle={"secondaryLabel"}>
              {t("尚未收藏倉庫，請點下方「添加倉庫」。", "尚未收藏仓库，请点下方「添加仓库」。", "No favorites yet. Tap “Add repository” below.")}
            </Text>
          )}
        </Section>
        <Section>
          <Button
            listRowBackground={<ThemeCardBackground />}
            title={t("添加倉庫", "添加仓库", "Add repository")}
            systemImage={"plus.circle.fill"}
            action={() => {
              // 點藍色卡片就是新增：表單正在開（新增模式）就收起來；
              // 正在編輯就切回空白的新增表單。
              if (showAdd && !editingId) {
                setShowAdd(false);
              } else {
                setEditingId(null);
                setOwner("");
                setRepoName("");
                setBranch("");
                setShowAdd(true);
              }
            }}
          />
        </Section>
        {showAdd ? (
          <Section title={editingId ? t("編輯收藏", "编辑收藏", "Edit favorite") : t("新增收藏", "新增收藏", "Add favorite")}>
            <TextField listRowBackground={<ThemeCardBackground />} title={t("用戶名", "用户名", "Username")} value={owner} onChanged={setOwner} prompt={t("用戶名", "用户名", "Username")} />
            <TextField listRowBackground={<ThemeCardBackground />} title={t("倉庫名", "仓库名", "Repository name")} value={repoName} onChanged={setRepoName} prompt={t("倉庫名", "仓库名", "Repository name")} />
            <TextField listRowBackground={<ThemeCardBackground />} title={t("分支（留空則使用預設分支）", "分支（留空则使用默认分支）", "Branch (leave blank for the default branch)")} value={branch} onChanged={setBranch} prompt={t("分支（留空則使用預設分支）", "分支（留空则使用默认分支）", "Branch (leave blank for the default branch)")} />
            <Button listRowBackground={<ThemeCardBackground />} action={handleSave}>
              <HStack alignment={"center"}>
                <Image systemName={"checkmark"} foregroundStyle={palette.accent} />
                <Text foregroundStyle={palette.accent}>{t("儲存", "保存", "Save")}</Text>
              </HStack>
            </Button>
            <Button
              listRowBackground={<ThemeCardBackground />}
              action={() => {
                // 取消只收起表單、不儲存（編輯和新增都在添加頁內部，不關頁）。
                setEditingId(null);
                setShowAdd(false);
                setOwner("");
                setRepoName("");
                setBranch("");
              }}
            >
              <HStack alignment={"center"}>
                <Image systemName={"xmark"} foregroundStyle={"red"} />
                <Text foregroundStyle={"red"}>{t("取消", "取消", "Cancel")}</Text>
              </HStack>
            </Button>
          </Section>
        ) : null}
        <Section>
          <Text listRowBackground={<ThemeCardBackground />} font={"footnote"} foregroundStyle={"secondaryLabel"}>
            {t("只填用戶名時，會顯示該用戶的所有公開倉庫。", "只填用户名时，会显示该用户的所有公开仓库。", "If you only enter a username, that user's public repositories will be shown.")}
          </Text>
        </Section>
      </List>
    </NavigationStack>
  );
}

// 3.1：Follow 清單。資料就是 GET /user/following 回來的使用者物件，
// 只用到 login、avatar_url、name。模組層快取以 Token 為 key，
// 重進頁面先畫快取、背景再抓新的，跟首頁倉庫清單同一個做法。
type FollowUser = { login: string; avatar_url?: string; name?: string; html_url?: string };
type FollowAccount = { username: string; token: string };
let cachedFollowing: Record<string, FollowUser[]> = {};
let cachedAccountAvatars: Record<string, string> = {};

// 帳號頭像沿用首頁／設定頁那份快取（Token -> avatar_url），不用重抓。
const ACCOUNT_AVATAR_KEY = "repo_editor_avatars";

function loadAccountAvatars(): Record<string, string> {
  try {
    const raw = Storage.get<string>(ACCOUNT_AVATAR_KEY) || "";
    if (!raw) return {};
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
    return obj;
  } catch {
    return {};
  }
}

function loadFollowAccounts(): FollowAccount[] {
  try {
    const raw = Storage.get<string>(ACCOUNTS_KEY) || "";
    const arr = raw ? JSON.parse(raw) : [];
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.filter((a: any) => a && a.token).map((a: any) => ({ username: String(a.username || ""), token: String(a.token) }));
    }
  } catch {}
  const token = Storage.get<string>(TOKEN_KEY) || "";
  if (!token) return [];
  return [{ username: Storage.get<string>(USERNAME_KEY) || t("我的帳號", "我的账号", "My account"), token }];
}

// 2.1.15：Follow 名單列整體往右縮排，讓列的頭像左緣對齊上方帳號標題的用戶名文字起點。
// 標題列是「16 列內距 + 32 頭像 + 10 間距 = 58」，名單列本身已有 16 的列內距，
// 所以列內再補 42 就會落在同一條 58 的線上。空狀態／錯誤文字也用同一條線。
const FOLLOW_ROW_INDENT = 42;

function followingMatches(users: FollowUser[] | undefined, login: string) {
  if (!users) return false;
  const key = login.toLowerCase();
  return users.some((u) => String(u.login || "").toLowerCase() === key);
}

// Follow 清單的帳號分區標題，跟首頁帳號列同一個味道：頭像、帳號名、
// 第二行顯示「N 位追蹤中」，右邊是開合箭頭。
function FollowHeader({ name, avatar, count, expanded, loading }: { name: string; avatar?: string; count?: number; expanded: boolean; loading?: boolean }) {
  const palette = useThemePalette();
  return (
    <HStack spacing={10} padding={{ vertical: 5 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      {avatar ? (
        <Image imageUrl={avatar} resizable frame={{ width: 32, height: 32 }} clipShape="circle" />
      ) : (
        <Image systemName="person.crop.circle.fill" font={30} frame={{ width: 32, height: 32 }} foregroundStyle="secondaryLabel" />
      )}
      <VStack alignment="leading" spacing={4}>
        <Text font={14} fontWeight="semibold" lineLimit={1} foregroundStyle={palette.accent}>{name}</Text>
        <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>
          {loading ? t("載入中…", "载入中…", "Loading…") : count === undefined ? "" : t(`${count} 位追蹤中`, `${count} 位关注中`, `${count} following`)}
        </Text>
      </VStack>
      <Spacer />
      {/* 3.4：分區開合箭頭用沒有底色的系統箭頭，跟手動收藏的分區一致。
          2.1.12：灰色改用 secondaryLabel（跟標題後面「(N)」同一個灰），
          寫死的 #8e8e93 在淺色主題（橘黃）上幾乎看不見。 */}
      <Image systemName={expanded ? "chevron.up" : "chevron.down"} foregroundStyle={palette.accent} />
    </HStack>
  );
}

// 一列被 Follow 的使用者。左滑是「個人總覽」＋「取消 Follow」，
// 取消一樣先確認再打 API。
// 3.5：這裡不再展開倉庫。倉庫改由收藏頁自動帶入、依使用者分區；
// Follow 清單只單純列使用者，列高維持 30，滑動膠囊才會是小顆的。
function FollowRow({ user, onOpen, onUnfollow }: { user: FollowUser; onOpen: () => void; onUnfollow: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <HStack alignment="center" spacing={10} listRowBackground={<SwipeRowBackground isPresented={open} />}
      controlSize="small"
      trailingSwipeActions={{
        allowsFullSwipe: false,
        onPresentationChanged: (presented: boolean) => setOpen(presented),
        actions: [
          // 2.1.10：兩顆按鈕互換（畫面左 → 右）：個人總覽在左、取消 Follow 在右。
          // 陣列順序跟畫面左右相反，所以取消 Follow 寫在前面。
          <Button tint="#EF963C" action={onUnfollow}>
            <Label title={t("取消 Follow", "取消 Follow", "Unfollow")} systemImage="person.badge.minus" />
          </Button>,
          <Button tint="#5D748C" action={onOpen}>
            <Label title={t("個人總覽", "个人总览", "Profile overview")} systemImage="person.crop.circle" />
          </Button>,
        ],
      }}
    >
      {/* 2.1.15：整列往右縮排 42，頭像左緣就落在上方帳號標題的用戶名文字起點（16+32+10）。 */}
      <HStack spacing={8} padding={{ leading: FOLLOW_ROW_INDENT }} frame={{ maxWidth: "infinity", height: 30, alignment: "leading" }}>
        {user.avatar_url ? (
          <Image imageUrl={user.avatar_url} resizable frame={{ width: 24, height: 24 }} clipShape="circle" />
        ) : (
          <Image systemName="person.crop.circle" frame={{ width: 24, height: 24 }} foregroundStyle="secondaryLabel" />
        )}
        <Text fontWeight="semibold" lineLimit={1}>{user.login}</Text>
        {user.name ? <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>{user.name}</Text> : null}
        <Spacer />
      </HStack>
    </HStack>
  );
}

// 3.5：從 Follow 自動帶入的倉庫列。跟手動收藏的倉庫列長得一樣（首頁那種方塊圖標），
// 2.1.10：不再帶頭像，也不在列尾掛使用者圖標——那些只留在上方的使用者分區標題列。
function ImportedRepoRow({
  fav,
  menu,
  onListDirty,
  onDelete,
}: {
  fav: Favorite;
  menu: any;
  onListDirty?: (newRepo?: any) => void;
  // 2.0.27：滑動刪除改成長按刪除（跟 FavoriteRow 同一招）。
  // 還 Follow 著時不傳 onDelete（menu 是 detailsMenu，本來就沒有刪除）。
  onDelete?: () => Promise<void>;
}) {
  const [swipeOpen, setSwipeOpen] = useState(false);
  return (
    <NavigationLink
      listRowBackground={<SwipeRowBackground isPresented={swipeOpen} />}
      destination={<BrowserView owner={fav.owner} repo={fav.repo} branch={fav.branch} path={""} onListDirty={onListDirty} readOnly={true} />}
    >
      <HStack
        alignment={"center"}
        spacing={10}
        contextMenu={onDelete ? {
          menuItems: (
            <>
              <Section>
                <Button title={t("刪除", "删除", "Delete")} systemImage="trash" role="destructive" action={async () => { await onDelete(); }} />
              </Section>
            </>
          ),
        } : undefined}
        trailingSwipeActions={{
          ...menu,
          onPresentationChanged: (presented: boolean) => setSwipeOpen(presented),
        }}
      >
        <RepoEntry symbol="shippingbox" title={fav.repo} subtitle={`${fav.owner} · ${fav.branch || t("預設分支", "默认分支", "Default branch")}`} />
      </HStack>
    </NavigationLink>
  );
}

// 3.5：某個使用者的自動帶入分區。標題是使用者頭像加名字，
// 後面接倉庫數；載入中時在標題旁轉小圈，不擋上面的手動收藏。
// 2.1.12：這張卡片就是一位 Follow 的使用者，補上左右滑：個人總覽與取消 Follow，
// 跟 Follow 清單的列一致（之前這裡只有展開／收起，滑不動）。
// 2.1.14：拿掉列尾的他人圖標（那顆人形在淺色主題上只剩一團灰，
// 已 Follow 與否自己看滑動鈕的文字就知道），並補上「刪除」：
// 刪掉這一區自動帶入的倉庫，並記進排除清單，以後不會再被帶回來。
function ImportedGroupSection({
  login,
  avatar,
  items,
  stillFollowing,
  expanded,
  loading,
  onToggle,
  onOpenProfile,
  onUnfollow,
  onDelete,
  menuFor,
  onListDirty,
  onDeleteFav,
}: {
  login: string;
  avatar?: string;
  items: Favorite[];
  stillFollowing: boolean;
  expanded: boolean;
  loading: boolean;
  onToggle: () => void;
  onOpenProfile: () => void;
  onUnfollow: () => void;
  onDelete: () => void;
  menuFor: (fav: Favorite) => any;
  onListDirty?: (newRepo?: any) => void;
  // 2.0.27：滑動刪除改成長按刪除。帶入倉庫列的刪除從 rowMenu 拿掉，
  // 改由 ImportedRepoRow 的 contextMenu 叫出；還 Follow 著時不傳
  //（那時 menu 是 detailsMenu，本來就沒有刪除）。
  onDeleteFav?: (fav: Favorite) => Promise<void>;
}) {
  const palette = useThemePalette();
  const [swipeOpen, setSwipeOpen] = useState(false);
  return (
    <Section>
      <HStack alignment="center" spacing={8} listRowBackground={<SwipeRowBackground isPresented={swipeOpen} />}
        // 2.0.27：滑動刪除改成長按刪除。還 Follow 著時不能刪除（跟以前
        // 左滑一樣，取消 Follow 後長按才出現刪除）。
        contextMenu={!stillFollowing ? {
          menuItems: (
            <>
              <Section>
                <Button title={t("刪除", "删除", "Delete")} systemImage="trash" role="destructive" action={async () => { await onDelete(); }} />
              </Section>
            </>
          ),
        } : undefined}
        trailingSwipeActions={{
          allowsFullSwipe: false,
          onPresentationChanged: (presented: boolean) => setSwipeOpen(presented),
          // 2.1.15：陣列順序跟畫面左右相反。還 Follow 著時只有兩顆
          //（畫面左→右：個人總覽、取消 Follow）。
          actions: [
            <Button tint="#EF963C" action={onUnfollow}>
              <Label title={stillFollowing ? t("取消 Follow", "取消 Follow", "Unfollow") : t("Follow", "Follow", "Follow")} systemImage={stillFollowing ? "person.badge.minus" : "person.badge.plus"} />
            </Button>,
            <Button tint="#5D748C" action={onOpenProfile}>
              <Label title={t("個人總覽", "个人总览", "Profile overview")} systemImage="person.crop.circle" />
            </Button>,
          ],
        }}>
        <Button buttonStyle="borderless" frame={{ maxWidth: "infinity", alignment: "leading" }} action={onToggle}>
          <HStack spacing={8} frame={{ maxWidth: "infinity", height: 30, alignment: "leading" }}>
            {avatar ? (
              <Image imageUrl={avatar} resizable frame={{ width: 24, height: 24 }} clipShape="circle" />
            ) : (
              <Image systemName="person.crop.circle" frame={{ width: 24, height: 24 }} foregroundStyle="secondaryLabel" />
            )}
            <Text fontWeight="semibold" lineLimit={1}>{login}</Text>
            {loading ? <ProgressView tint={palette.accent} frame={{ width: 14, height: 14 }} /> : null}
            <Text foregroundStyle="secondaryLabel">{` (${items.length})`}</Text>
            <Spacer />
            {/* 2.1.15：狀態只看圖標——還 Follow 著才有打勾的人形，取消 Follow
                後就沒有圖標，不再另外寫一行「已取消 Follow」。 */}
            {stillFollowing ? (
              <Image systemName="person.crop.circle.badge.checkmark" frame={{ width: 20, height: 20 }} foregroundStyle="secondaryLabel" />
            ) : null}
            {/* 2.1.11：開合箭頭改回沒有底色的系統箭頭，跟手動收藏的分區一致。
                2.1.12：顏色改成跟上面的使用者名同一個主題強調色，不再用灰的。 */}
            <Image systemName={expanded ? "chevron.up" : "chevron.down"} foregroundStyle={palette.accent} />
          </HStack>
        </Button>
      </HStack>
      {expanded
        ? items.map((fav) => (
            <ImportedRepoRow
              key={fav.id}
              fav={fav}
              menu={menuFor(fav)}
              onListDirty={onListDirty}
              onDelete={onDeleteFav ? async () => { await onDeleteFav(fav); } : undefined}
            />
          ))
        : null}
    </Section>
  );
}

export function FavoritesView({ onListDirty, initialMode }: { onListDirty?: (newRepo?: any) => void; initialMode?: "favorites" | "follow" } = {}) {
  // 2.0.11：收藏頁的強調色也跟背景主題連動。
  const palette = useThemePalette();
  // 3.1：頂部按鈕切換「收藏」跟「Follow」兩種清單。
  // 從首頁工具列直接點 Follow 進來時 initialMode 是 follow，並立刻抓清單。
  const [mode, setMode] = useState<"favorites" | "follow">(initialMode ?? loadMode());
  const [favorites, setFavorites] = useState<Favorite[]>(() => loadFavorites());
  const [query, setQuery] = useState("");
  // 2026-11-18：搜尋框改成預設收起，點工具列的放大鏡才展開（跟元件的 Overview 同一套）。
  const [searchVisible, setSearchVisible] = useState(false);
  const [avatars, setAvatars] = useState<Record<string, string>>(() => loadAvatarCache());
  const [accounts, setAccounts] = useState<FollowAccount[]>(() => loadFollowAccounts());
  // Token -> 該帳號 Follow 的使用者清單。
  const [followMap, setFollowMap] = useState<Record<string, FollowUser[]>>(() => ({ ...cachedFollowing }));
  const [followErrors, setFollowErrors] = useState<Record<string, string>>({});
  const [followLoading, setFollowLoading] = useState(false);
  // 帳號分區開合，key 是「帳號#序號」，預設展開。
  const [followExpanded, setFollowExpanded] = useState<Record<string, boolean>>({});
  const [accountAvatars, setAccountAvatars] = useState<Record<string, string>>(() => ({ ...cachedAccountAvatars, ...loadAccountAvatars() }));
  // 3.5：自動帶入。importLoading 是「哪個使用者的倉庫正在抓」，
  // 分區標題旁顯示小旋轉圖示，不擋上面的手動收藏。
  const [importLoading, setImportLoading] = useState<Record<string, boolean>>({});
  const [importBusy, setImportBusy] = useState(false);
  // 2.1.9：自動帶入失敗時的提示（全部使用者都失敗才顯示，部分失敗安靜）。
  const [importError, setImportError] = useState("");
  // 自動帶入分區的開合，key 是使用者 login（小寫），預設展開。
  const [importExpanded, setImportExpanded] = useState<Record<string, boolean>>({});
  // 2.1.14：Follow／取消 Follow 後，那位使用者的狀態以「剛剛的動作」為準，
  // 而且精確到帳號（login 小寫 → token → boolean）。
  // 只做整人的 boolean 會錯：A 取消、B 還 Follow 時其實還是 Follow 狀態，
  // 會把卡片錯寫成已取消。
  // 寫入後不用等背景名單回來，滑動鈕文字、卡片狀態與名單列表馬上跟。
  const [followOverride, setFollowOverride] = useState<Record<string, Record<string, boolean>>>({});

  // 3.1：把目前模式寫回去（用標題箭頭切換或從首頁沿用上次模式進來都算），
  // 下次從收藏入口進來就會直接回到同一邊。
  useEffect(() => {
    try { Storage.set(MODE_KEY, mode); } catch {}
  }, [mode]);

  // 每列頭像：快取裡沒有的擁有者，用 getUserByName 拉一次 avatar_url 並快取起來；
  // 抓不到（沒 Token、用戶不存在、網路問題）就留著預設圖示，不擋整頁。
  // 2.1.11：依賴改成「排序後的擁有者清單字串」，只有 owner 集合真的變了才重跑；
  // 自動帶入只是增加同一位使用者的倉庫時，不會再讓整輪頭像重來。
  const ownersKey = [...new Set(favorites.map((f) => String(f.owner).toLowerCase()))].sort().join(",");
  useEffect(() => {
    const owners = ownersKey ? ownersKey.split(",") : [];
    const cached = loadAvatarCache();
    setAvatars(cached);
    const missing = owners.filter((o) => !cached[o] && !avatarInFlight.has(o));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const next = loadAvatarCache();
      let changed = false;
      // 2.1.11：以前一位一位 await，收藏一多就要排很久（而且每輪都在等）。
      // 改成最多 4 個並行，順序不重要，抓到就寫快取。
      await runPool(missing, 4, async (owner) => {
        if (avatarInFlight.has(owner)) return;
        avatarInFlight.add(owner);
        try {
          const me = await repo.getUserByName(owner);
          if (me?.avatar_url) {
            next[owner] = me.avatar_url;
            changed = true;
          }
        } catch {}
        finally {
          avatarInFlight.delete(owner);
        }
      });
      if (changed) {
        // 快取是全站共用，就算這一輪被取消（owner 集合又變了）也照樣寫入，
        // 不然已抓到的頭像會白白丟掉；只有更新畫面才需要看 cancelled。
        saveAvatarCache(next);
        if (!cancelled) setAvatars(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ownersKey]);

  // 3.1：帳號頭像。快取裡沒有的帳號用該帳號自己的 Token 打 /user 抓一次，
  // 抓到就寫回首頁那份快取（repo_editor_avatars），兩邊共用。
  useEffect(() => {
    if (mode !== "follow" || accounts.length === 0) return;
    let cancelled = false;
    (async () => {
      const cached = loadAccountAvatars();
      const missing = accounts.filter((a) => !cached[a.token]);
      if (missing.length === 0) {
        if (!cancelled) setAccountAvatars({ ...cachedAccountAvatars, ...cached });
        return;
      }
      const results = await Promise.all(
        missing.map(async (a) => {
          try {
            const me = await repo.getUser(a.token);
            return { token: a.token, url: me?.avatar_url || "" };
          } catch {
            return { token: a.token, url: "" };
          }
        }),
      );
      let changed = false;
      for (const r of results) {
        if (r.url) {
          cached[r.token] = r.url;
          changed = true;
        }
      }
      if (cancelled) return;
      if (changed) {
        try {
          Storage.set(ACCOUNT_AVATAR_KEY, JSON.stringify(cached));
        } catch {}
        cachedAccountAvatars = cached;
      }
      setAccountAvatars({ ...cachedAccountAvatars, ...cached });
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, accounts]);

  // 3.5：收藏模式時要拿 Follow 清單做兩件事——左滑標籤要知這顯示 Follow 還是取消 Follow，
  // 以及自動帶入的倉庫尾端要不要顯示使用者圖標。所以兩個模式的掛載都需要真實清單。
  // 進入收藏頁、切回收藏、下拉刷新都會重新整理一次。
  // 2.1.9 修正：之前初始就是 Follow 模式時直接 return，導致剛好記住 Follow 模式的使用者
  // 下次進來看不到名單；現在 Follow 模式掛載也補抓一次。
  useEffect(() => {
    if (mode === "follow") {
      const fresh = loadFollowAccounts();
      setAccounts(fresh);
      setFollowMap({ ...cachedFollowing });
      void loadFollowing(fresh);
      return;
    }
    void refreshFavoritesMode();
  }, []);

  // 所有帳號的 Follow 聯集（小寫 login -> 真 login）。
  // 某個帳號抛錯時它的清單是 undefined，不貢獻聯集，
  // 就不會因為一次失敗把人家的圖標全部當成已取消。
  function followedLogins(): Map<string, string> {
    const out = new Map<string, string>();
    for (const acc of accounts) {
      const users = effectiveFollowing(acc.token);
      if (!users) continue;
      for (const u of users) {
        const login = String(u.login || "");
        if (!login) continue;
        const key = login.toLowerCase();
        if (!out.has(key)) out.set(key, login);
      }
    }
    return out;
  }

  // 3.5：把 Follow 使用者的公開倉庫帶進收藏。
  // 只新增，不刪除：取消 Follow 後倉庫繼續留在收藏。
  // 已有收藏（手動或之前帶入的）不重複；使用者手動刪除的記在排除清單。
  // 2.1.10：手動「加用戶」的收藏若跟 Follow 帶入的同一個使用者重複，
  // 只保留 Follow 那份（手動那筆自動刪掉）。單一倉庫的收藏不動。
  // 用「目前還 Follow 著」判斷：取消 Follow 後手動收藏就不會被誤刪。
  function dedupeManualUserFavorites() {
    // 用模組層的 cachedFollowing（loadFollowing 剛寫進去的）而不是 state，
    // 避免在同一個 render 裡讀到舊的 followMap。
    const followedOwners = new Set<string>();
    for (const acc of loadFollowAccounts()) {
      for (const u of cachedFollowing[acc.token] || []) {
        const login = String(u.login || "").toLowerCase();
        if (login) followedOwners.add(login);
      }
    }
    if (followedOwners.size === 0) return;
    const stored = loadFavorites();
    // 只有真的已經帶入過這個使用者的倉庫（有 fromFollow 項目）才刪手動那筆，
    // 否則把自動帶入關掉或全被排除時，手動收藏會平白消失。
    const importedOwners = new Set(
      stored.filter((f) => f.fromFollow && f.repo).map((f) => String(f.owner).toLowerCase()),
    );
    const next = stored.filter(
      (f) => f.fromFollow || f.repo ||
        !(followedOwners.has(String(f.owner).toLowerCase()) && importedOwners.has(String(f.owner).toLowerCase())),
    );
    if (next.length === stored.length) return;
    saveFavorites(next);
    setFavorites(next);
  }

  async function importFollowRepos(list?: FollowAccount[], force?: boolean) {
    // 2.1.9：已經在跑就不丟掉這次，記下來等這份跑完再補跑一次，
    // 才不會「匯入中重新進收藏頁」或「匯入中下拉刷新」沒反應。
    // 2.1.12：這個判斷要放在節流之前。之前先節流，處於 in-flight 時如果上次
    // 完成不到 60 秒，這次連排隊都不會記，手動觸發就被直接丟掉。
    if (importInFlight) {
      importQueued = true;
      return;
    }
    // 2.1.11：短時間重複觸發就不再重抓一輪（見 IMPORT_MIN_INTERVAL）。
    if (!force && Date.now() - lastImportAt < IMPORT_MIN_INTERVAL) return;
    const accs = list ?? loadFollowAccounts();
    const enabled = accs.filter((a) => isFollowImportEnabled(a.token));
    if (enabled.length === 0) return;
    importInFlight = true;
    setImportBusy(true);
    setImportError("");
    let failed = 0;
    let attempted = 0;
    let hadTargets = false;
    try {
      // 先把 enabled 帳號的 Follow 清單補齊（已經抓過的沿用）。
      const map: Record<string, FollowUser[]> = { ...cachedFollowing };
      await Promise.all(
        enabled.map(async (acc) => {
          if (map[acc.token] !== undefined) return;
          try {
            map[acc.token] = await repo.listFollowingForToken(acc.token);
          } catch {}
        }),
      );
      // login（小寫）-> 拿哪個帳號的 Token 去抓倉庫；多帳號 Follow 同一個人時只要抓一次。
      const targets = new Map<string, { login: string; token: string }>();
      for (const acc of enabled) {
        for (const u of map[acc.token] || []) {
          const login = String(u.login || "");
          if (!login) continue;
          const key = login.toLowerCase();
          if (!targets.has(key)) targets.set(key, { login, token: acc.token });
        }
      }
      if (targets.size === 0) {
        // 沒有人要帶入（例如全部帳號都已取消失敗沒資料），排隊旗標要清掉，
        // 不然會一直卡在「還要再跑一次」。
        importQueued = false;
        return;
      }
      hadTargets = true;

      const markLoading = (key: string, on: boolean) =>
        setImportLoading((prev) => {
          if (!!prev[key] === on) return prev;
          const next = { ...prev };
          if (on) next[key] = true;
          else delete next[key];
          return next;
        });

      // 同時最多 4 個請求，哪個使用者先回來就先套用、先出現在清單。
      await runPool([...targets.entries()], 4, async ([key, tgt]) => {
        markLoading(key, true);
        attempted++;
        try {
          const repos = await repo.listUserRepos(tgt.login, tgt.token);
          // 每次都重讀 Storage 再合併，避免跟添加頁／刪除互相覆蓋。
          const stored = loadFavorites();
          const seen = new Set(
            stored.filter((f) => f.repo).map((f) => favoriteKey(f.owner, f.repo)),
          );
          const skip = new Set(loadFollowImportSkip());
          const additions: Favorite[] = [];
          for (const r of repos) {
            const parts = String(r.full_name || "").split("/");
            if (parts.length !== 2) continue;
            const k = favoriteKey(parts[0], parts[1]);
            if (seen.has(k) || skip.has(k)) continue;
            seen.add(k);
            additions.push({
              id: `follow-${key}-${k}`,
              owner: parts[0],
              repo: parts[1],
              branch: r.default_branch || "",
              addedAt: Date.now(),
              fromFollow: tgt.login,
            });
          }
          if (additions.length > 0) {
            saveFavorites([...additions, ...loadFavorites()]);
            setFavorites(loadFavorites());
          }
        } catch {
          failed++;
        }
        markLoading(key, false);
      });
    } finally {
      importInFlight = false;
      // 2.1.12：只有「真的跑過而且至少一個成功」才記時間。之前無論成功、
      // 全失敗、甚至根本沒有目标都記，一失敗就 60 秒內不能再試，
      // 而且剛 Follow 完回來也可能被上一次的失敗卡住。
      if (hadTargets && attempted > 0 && failed < attempted) lastImportAt = Date.now();
      setImportBusy(false);
      setImportLoading({});
    }
    // 2.1.10：全部使用者都失敗才提示（例如 Token 沒權限、額度用完）；
    // 只有部分失敗就安靜，已經帶入的照樣留著。
    if (attempted > 0 && failed === attempted) {
      setImportError(t("Follow 倉庫帶入失敗，請下拉刷新或稍後再試。", "Follow 仓库带入失败，请下拉刷新或稍后再试。", "Failed to import followed repositories. Pull to refresh or try again later."));
    }
    // 2.1.10：帶入完直接把重複的「使用者收藏」清掉，只留 Follow 那份。
    dedupeManualUserFavorites();
    // 2.1.9：跑完發現期間又叫過一次，就再跑一輪（這是使用者剛剛的動作，
    // 不受上面的短時間節流限制）。
    if (importQueued) {
      importQueued = false;
      await importFollowRepos(undefined, true);
    }
  }

  // 收藏模式的重新整理：先更新 Follow 狀態（圖標跟左滑標籤），再自動帶入。
  // 2.1.11：force 給下拉刷新用，其餘自動觸發會受短時間節流。
  async function refreshFavoritesMode(force?: boolean) {
    const fresh = loadFollowAccounts();
    setAccounts(fresh);
    // 2.1.10：先把重複的手動「加用戶」收藏清掉（保留 Follow 那份）。
    // 不能放在抓 Follow 清單之前——要先用真實的 Follow 名單判斷。
    const allOk = await loadFollowing(fresh);
    dedupeManualUserFavorites();
    // 2.1.9：全部帳號都抓成功，才清理「已 unfollow 的使用者」的排除紀錄；
    // 有任一帳號失敗就跳過，避免把失敗當成空清單而清光資料。
    if (allOk) {
      const logins: string[] = [];
      for (const acc of fresh) {
        for (const u of cachedFollowing[acc.token] || []) {
          const login = String(u.login || "");
          if (login) logins.push(login);
        }
      }
      pruneFollowImportSkip(logins);
    }
    await importFollowRepos(fresh, force);
  }

  // 編輯不再從收藏頁跨頁開進來（編輯搬進添加頁裡了），這裡只開新增用的添加頁。
  // 2.1.9：不管添加頁回傳什麼，回來都重讀收藏（添加頁可能是用 dismiss() 關的，
  // 回傳值不一定可靠）；收藏模式順便再刷新一次 Follow。
  async function openForm() {
    await Navigation.present(<AddFavoriteView favorites={favorites} />);
    setAvatars(loadAvatarCache());
    setFavorites(loadFavorites());
    if (mode !== "follow") {
      void refreshFavoritesMode();
    }
  }

  async function handleDelete(fav: Favorite) {
    const idx = await Dialog.actionSheet({
      title: t("刪除收藏", "删除收藏", "Remove favorite"),
      message: t(`確定要刪除「${favoriteLabel(fav)}」嗎？`, `确定要删除「${favoriteLabel(fav)}」吗？`, `Remove “${favoriteLabel(fav)}” from favorites?`),
      actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
    });
    if (idx !== 0) return;
    // 自動帶入的項目刪掉要先記排除，不然下次進收藏頁又會被帶回來。
    if (fav.fromFollow && fav.repo) addFollowImportSkip(favoriteKey(fav.owner, fav.repo));
    const next = loadFavorites().filter((f) => f.id !== fav.id);
    saveFavorites(next);
    setFavorites(next);
  }

  // 2.1.14：刪除一整個「自動帶入」分區（某位 Follow 使用者的全部倉庫）。
  // 跟單筆刪除一樣先記進排除清單，下次自動帶入才不會把它們帶回來；
  // 取消 Follow 不會刪這些倉庫，要清掉就靠這裡。
  // 注意：不能用畫面上傳進來的 items，搜尋中那些只是過飽子集。
  async function handleDeleteImportedGroup(login: string) {
    const target = login.toLowerCase();
    const all = loadFavorites().filter((f) => (f.fromFollow || "").toLowerCase() === target);
    if (all.length === 0) return;
    const idx = await Dialog.actionSheet({
      title: t("刪除帶入的倉庫", "删除带入的仓库", "Remove imported repositories"),
      message: t(
        `確定要刪除「${login}」帶入的 ${all.length} 個倉庫嗎？\n之後不會再自動帶入，要恢復請重新 Follow 或手動加入。`,
        `确定要删除「${login}」带入的 ${all.length} 个仓库吗？\n之后不会再自动带入，要恢复请重新 Follow 或手动加入。`,
        `Remove the ${all.length} repositories imported from “${login}”?\nThey will not be imported again until you follow the user again or add them manually.`,
      ),
      actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
    });
    if (idx !== 0) return;
    for (const fav of all) {
      if (fav.repo) addFollowImportSkip(favoriteKey(fav.owner, fav.repo));
    }
    const ids = new Set(all.map((f) => f.id));
    const next = loadFavorites().filter((f) => !ids.has(f.id));
    saveFavorites(next);
    setFavorites(next);
  }

  // 3.1：抓各帳號的 Follow 清單。每個帳號用自己的 Token 並行抓，
  // 哪一個先回來就先畫那一個；失敗只在那個分區顯示錯誤，不擋別的帳號。
  // 2.1.9：回傳「是否全部帳號都成功」，呼叫端要 prune 排除清單時必須確認資料完整，
  // 不能把抓失敗當成「沒有 Follow 任何人」，否則一次斷線就會把排除紀錄清光。
  async function loadFollowing(list?: FollowAccount[]): Promise<boolean> {
    const targets = list ?? accounts;
    if (targets.length === 0) return true;
    setFollowLoading(true);
    let allOk = true;
    await Promise.all(
      targets.map(async (acc) => {
        try {
          const users = await repo.listFollowingForToken(acc.token);
          cachedFollowing = { ...cachedFollowing, [acc.token]: users };
          setFollowMap((prev) => ({ ...prev, [acc.token]: users }));
          setFollowErrors((prev) => ({ ...prev, [acc.token]: "" }));
        } catch (e: any) {
          allOk = false;
          setFollowErrors((prev) => ({ ...prev, [acc.token]: t(`載入失敗：${String(e?.message || e)}`, `载入失败：${String(e?.message || e)}`, `Failed to load: ${String(e?.message || e)}`) }));
        }
      }),
    );
    setFollowLoading(false);
    return allOk;
  }

  // 3.1：第一次切到 Follow 才抓，避免一進收藏頁就打 API。
  // 已經有快取（模組層，這次開啟內抓過的）就不再重打，要更新按右上角重新整理或下拉。
  function switchMode(next: "favorites" | "follow") {
    setMode(next);
    setQuery("");
    if (next !== "follow") {
      // 3.5：切回收藏就是一次新的刷新（跟每次進收藏頁一樣）。
      void refreshFavoritesMode();
      return;
    }
    const fresh = loadFollowAccounts();
    setAccounts(fresh);
    const missing = fresh.filter((a) => cachedFollowing[a.token] === undefined);
    setFollowMap({ ...cachedFollowing });
    if (missing.length > 0) void loadFollowing(missing);
  }

  // 3.1：Follow 一個使用者。已經 Follow 的不會再打 API，只提示。
  // 要看那個帳號目前是否已 Follow，用 cachedFollowing 判斷。
  async function followUser(acc: FollowAccount, login: string) {
    // 2.1.15：不能 Follow 自己。GitHub 對這個請求會回 204（看起來成功），
    // 但名單裡不會多出任何人，以前就會變成按鈕已變「取消 Follow」、實際沒生效。
    // 這裡先擋掉，不必多打一次請求。
    if (String(acc.username || "").toLowerCase() === String(login).toLowerCase()) {
      await Dialog.alert({
        title: t("不能 Follow 自己", "不能 Follow 自己", "Cannot follow yourself"),
        message: t(`「${login}」就是目前選取的帳號，GitHub 不允許 Follow 自己。`, `「${login}」就是目前选中的账号，GitHub 不允许 Follow 自己。`, `“${login}” is the selected account itself. GitHub does not allow following yourself.`),
      });
      return;
    }
    if (isFollowing(acc, login)) {
      await Dialog.alert({
        title: t("已經 Follow 了", "已经 Follow 了", "Already following"),
        message: t(`「${login}」已經在 ${acc.username} 的 Follow 清單裡。`, `「${login}」已经在 ${acc.username} 的 Follow 清单里。`, `“${login}” is already in ${acc.username}'s following list.`),
      });
      return;
    }
    const ok = await Dialog.confirm({
      title: t("Follow 使用者", "Follow 用户", "Follow user"),
      message: t(`確定要用「${acc.username}」Follow「${login}」嗎？`, `确定要用「${acc.username}」Follow「${login}」吗？`, `Follow “${login}” as ${acc.username}?`),
    });
    if (!ok) return;
    try {
      await repo.followUserForToken(acc.token, login);
      // 2.1.15：GitHub 對「Follow 自己」會回 204，看起來成功，但名單裡不會
      // 多出任何人（其他被限流／無權限的情況也可能靜默失敗）。所以寫入後
      // 再用單筆查詢驗一次；驗不到就不改畫面，並直接講清楚原因。
      let confirmed = true;
      try {
        confirmed = await repo.isFollowingForToken(acc.token, login);
      } catch {
        // 驗證本身失敗（網路、額度）不要當成 Follow 失敗，維持原本流程。
        confirmed = true;
      }
      if (!confirmed) {
        const self = String(acc.username || "").toLowerCase() === login.toLowerCase();
        await Dialog.alert({
          title: t("Follow 沒有生效", "Follow 没有生效", "Follow did not take effect"),
          message: self
            ? t(`GitHub 不允許 Follow 自己，所以「${login}」不會出現在名單裡。`, `GitHub 不允许 Follow 自己，所以「${login}」不会出现在名单里。`, `GitHub does not allow following yourself, so “${login}” will not appear in the list.`)
            : t(`GitHub 回報成功，但「${login}」沒有出現在 ${acc.username} 的 Follow 名單裡。請確認 Token 有 user:follow 權限，或稍後再試。`, `GitHub 回报成功，但「${login}」没有出现在 ${acc.username} 的 Follow 清单里。请确认 Token 有 user:follow 权限，或稍后再试。`, `GitHub reported success, but “${login}” is not in ${acc.username}'s following list. Check the Token's user:follow scope or try again later.`),
        });
        return;
      }
      // 重新 Follow 就把這個使用者的刪除排除清掉，倉庫才會再被帶回收藏。
      clearFollowImportSkipFor(login);
      // 2.1.14：本頁立即改回「已 Follow」，不等背景名單回來（也不會被舊名單抵銷）。
      setFollowOverride((prev) => ({ ...prev, [login.toLowerCase()]: { ...(prev[login.toLowerCase()] || {}), [acc.token]: true } }));
      // 先樂觀更新，讓左滑按鈕立刻變回「取消 Follow」；背景再抓一次官方清單補上頭像跟名字。
      const current = followMap[acc.token] ?? cachedFollowing[acc.token] ?? [];
      const updated = [{ login }, ...current.filter((u) => String(u.login || "").toLowerCase() !== login.toLowerCase())];
      cachedFollowing = { ...cachedFollowing, [acc.token]: updated };
      setFollowMap((prev) => ({ ...prev, [acc.token]: updated }));
      // 剛 Follow 完，下次進收藏要馬上帶入這位使用者的倉庫，不要被短時間節流擋住。
      lastImportAt = 0;
      void loadFollowing([acc]);
    } catch (e: any) {
      const raw = String(e?.message || e);
      // 3.2：Follow 回 404 幾乎都是 Token 沒有 user:follow 權限（GitHub 對沒權限的
      // 端點一律回 404，不是 403），不是帳號打錯。這裡直接講清楚要補什麼權限。
      const hint = raw.includes("404")
        ? t(`\n\n可能是「${acc.username}」的 Token 沒有勾選 user:follow 權限，或該使用者不存在。請到 GitHub 重新產生 Token 並勾選 user:follow。`, `\n\n可能是「${acc.username}」的 Token 没有勾选 user:follow 权限，或该用户不存在。请到 GitHub 重新生成 Token 并勾选 user:follow。`, `\n\nThe Token for “${acc.username}” probably lacks the user:follow scope, or the user does not exist. Regenerate the Token with user:follow enabled.`)
        : "";
      await Dialog.alert({ title: t("Follow 失敗", "Follow 失败", "Follow failed"), message: raw + hint });
    }
  }

  // 3.1：取消 Follow，先確認再打 DELETE。
  async function unfollowUser(acc: FollowAccount, login: string) {
    const ok = await Dialog.confirm({
      title: t("取消 Follow", "取消 Follow", "Unfollow"),
      message: t(`確定不要用「${acc.username}」Follow「${login}」了嗎？`, `确定不要用「${acc.username}」Follow「${login}」了吗？`, `Unfollow “${login}” as ${acc.username}?`),
    });
    if (!ok) return;
    try {
      await repo.unfollowUserForToken(acc.token, login);
      // 2.1.15：跟 Follow 一樣要驗。GitHub 對「取消 Follow 自己」也是回
      // 204 但什麼都沒發生，不驗就會把畫面改成已取消、實際卻還在名單裡。
      let confirmed = true;
      try {
        confirmed = !(await repo.isFollowingForToken(acc.token, login));
      } catch {
        confirmed = true;
      }
      if (!confirmed) {
        await Dialog.alert({
          title: t("取消 Follow 沒有生效", "取消 Follow 没有生效", "Unfollow did not take effect"),
          message: t(`GitHub 回報成功，但「${login}」還在 ${acc.username} 的 Follow 名單裡。請確認 Token 有 user:follow 權限，或稍後再試。`, `GitHub 回报成功，但「${login}」还在 ${acc.username} 的 Follow 清单里。请确认 Token 有 user:follow 权限，或稍后再试。`, `GitHub reported success, but “${login}” is still in ${acc.username}'s following list. Check the Token's user:follow scope or try again later.`),
        });
        return;
      }
      // 2.1.14：先記下「已取消」，滑動鈕的文字與列表立即改；
      // 之前只有背景名單回來才變，舊資料回來時看起來就像沒反應。
      setFollowOverride((prev) => ({ ...prev, [login.toLowerCase()]: { ...(prev[login.toLowerCase()] || {}), [acc.token]: false } }));
      const current = followMap[acc.token] ?? cachedFollowing[acc.token] ?? [];
      const updated = current.filter((u) => String(u.login || "").toLowerCase() !== login.toLowerCase());
      cachedFollowing = { ...cachedFollowing, [acc.token]: updated };
      setFollowMap((prev) => ({ ...prev, [acc.token]: updated }));
      // 背景再抓一次，確認其他帳號是否還 Follow 同一個人（尾端圖標靠聯集判斷）。
      void loadFollowing([acc]);
    } catch (e: any) {
      const raw = String(e?.message || e);
      const hint = raw.includes("404")
        ? t(`\n\n可能是「${acc.username}」的 Token 沒有勾選 user:follow 權限。請到 GitHub 重新產生 Token 並勾選 user:follow。`, `\n\n可能是「${acc.username}」的 Token 没有勾选 user:follow 权限。请到 GitHub 重新生成 Token 并勾选 user:follow。`, `\n\nThe Token for “${acc.username}” probably lacks the user:follow scope. Regenerate the Token with user:follow enabled.`)
        : "";
      await Dialog.alert({ title: t("取消失敗", "取消失败", "Unfollow failed"), message: raw + hint });
    }
  }

  // 3.1：要 Follow 哪一個帳號。只有一個帳號就直接用，不用多跳一層；
  // 兩個以上才跳清單讓使用者選（已 Follow 的會在標籤上註明）。
  async function pickAccount(login: string): Promise<FollowAccount | undefined> {
    if (accounts.length === 0) {
      await Dialog.alert({
        title: t("尚未新增帳號", "尚未新增账号", "No account yet"),
        message: t("請先到使用者頁添加 GitHub 帳號，才能 Follow 使用者。", "请先到用户页添加 GitHub 账号，才能 Follow 用户。", "Add a GitHub account on the User page before following anyone."),
      });
      return undefined;
    }
    if (accounts.length === 1) return accounts[0];
    const idx = await Dialog.actionSheet({
      title: t("選擇帳號", "选择账号", "Choose account"),
      message: t(`要用哪一個帳號處理「${login}」？`, `要用哪一个账号处理「${login}」？`, `Which account should be used for “${login}”?`),
      actions: accounts.map((a) => ({
        label: isFollowing(a, login)
          ? t(`${a.username}（已 Follow）`, `${a.username}（已 Follow）`, `${a.username} (following)`)
          : a.username || t("未命名帳號", "未命名账号", "Unnamed account"),
      })),
    });
    if (idx === null || idx === undefined || idx < 0 || idx >= accounts.length) return undefined;
    return accounts[idx];
  }

  // 2.1.14：某個帳號是否 Follow 某人。本頁剛做的動作優先，
  // 不然取消完再點一次會拿舊名單判斷，又跳出「已經 Follow 了」。
  function isFollowing(acc: FollowAccount, login: string) {
    const ov = followOverride[login.toLowerCase()]?.[acc.token];
    if (ov !== undefined) return ov;
    return followingMatches(followMap[acc.token] ?? cachedFollowing[acc.token], login);
  }

  // 2.1.14：某個帳號的清單扣除「本頁剛取消」、補上「本頁剛 Follow」。
  function effectiveFollowing(token: string): FollowUser[] | undefined {
    const base = followMap[token] ?? cachedFollowing[token];
    if (!base && Object.keys(followOverride).length === 0) return base;
    const drops: string[] = [];
    const adds: string[] = [];
    for (const key of Object.keys(followOverride)) {
      const val = followOverride[key]?.[token];
      if (val === false) drops.push(key);
      else if (val === true) adds.push(key);
    }
    if (drops.length === 0 && adds.length === 0) return base;
    const kept = (base || []).filter((u) => !drops.includes(String(u.login || "").toLowerCase()));
    const extra = adds
      .filter((login) => !kept.some((u) => String(u.login || "").toLowerCase() === login))
      .map((login) => ({ login }) as FollowUser);
    return [...extra, ...kept];
  }

  // 3.1：左滑的 Follow／取消 Follow。多帳號時先選帳號，再依那個帳號的狀態決定方向。
  async function followFromRow(login: string) {
    const acc = await pickAccount(login);
    if (!acc) return;
    if (isFollowing(acc, login)) {
      await unfollowUser(acc, login);
    } else {
      await followUser(acc, login);
    }
  }

  // 2.0.7：滑動改回來，照官方範例掛在列本身的 HStack 上（不要掛
  // NavigationLink）。rowMenu 回傳 trailingSwipeActions 物件
  //（allowsFullSwipe 關掉），由 FavoriteRow 掛到列內容的 HStack 上。
  // 3.1：左滑固定三顆（左至右）刪除、個人總覽／倉庫詳情、Follow。
  // 陣列順序與畫面上左右相反，所以這裡寫成 Follow、詳情、刪除。
  function rowMenu(fav: Favorite) {
    // 3.1：只要有任何一個帳號已經 Follow，標籤就顯示「取消 Follow」，
    // 點了再選要用哪個帳號處理。
    // 2.1.14：改用 followingSet（已包含本頁剛做的 Follow／取消 Follow），
    // 不然剛取消完這一列的滑動鈕還是寫「取消 Follow」。
    const already = followingSet.has(String(fav.owner).toLowerCase());
    return {
      allowsFullSwipe: false,
      actions: [
        <Button action={async () => { await followFromRow(fav.owner); }} tint="#EF963C">
          <Label title={already ? t("取消 Follow", "取消 Follow", "Unfollow") : t("Follow", "Follow", "Follow")} systemImage={already ? "person.badge.minus" : "person.badge.plus"} />
        </Button>,
        fav.repo ? (
          <Button action={async () => { await openRepoPage(fav.owner, fav.repo); }} tint="#5D748C">
            <Label title={t("倉庫詳情", "仓库详情", "Repository details")} systemImage="info.circle" />
          </Button>
        ) : (
          <Button action={async () => { await openUserPage(fav.owner); }} tint="#5D748C">
            <Label title={t("個人總覽", "个人总览", "Profile overview")} systemImage="person.crop.circle" />
          </Button>
        ),
        // 2.0.27：滑動刪除改成長按刪除。刪除從這裡拿掉，改由各列的
        // contextMenu 叫出（FavoriteRow／ImportedRepoRow 的 onDelete）。
      ],
    };
  }

  // 2.1.15：自動帶入分區裡的列，如果那位使用者還在 Follow 中，左滑只給
  //「倉庫詳情」一顆——Follow／取消 Follow 已經在上面那張使用者卡片上，
  // 刪除也統一由卡片的刪除處理（還在 Follow 時不該拆掉單一列）。
  function detailsMenu(fav: Favorite) {
    return {
      allowsFullSwipe: false,
      actions: [
        fav.repo ? (
          <Button action={async () => { await openRepoPage(fav.owner, fav.repo); }} tint="#5D748C">
            <Label title={t("倉庫詳情", "仓库详情", "Repository details")} systemImage="info.circle" />
          </Button>
        ) : (
          <Button action={async () => { await openUserPage(fav.owner); }} tint="#5D748C">
            <Label title={t("個人總覽", "个人总览", "Profile overview")} systemImage="person.crop.circle" />
          </Button>
        ),
      ],
    };
  }

  const keyword = query.trim().toLowerCase();
  // 3.5：收藏模式把「手動收藏」跟「Follow 自動帶入」拆開：
  // 手動的留在上面（維持原本的用戶列／倉庫列），帶入的依使用者分區放下面。
  const manualFavorites = favorites.filter((f) => !f.fromFollow);
  const importedGroups = (() => {
    const groups = new Map<string, { login: string; items: Favorite[] }>();
    for (const fav of favorites) {
      if (!fav.fromFollow) continue;
      if (keyword && !`${fav.owner}/${fav.repo} ${fav.branch}`.toLowerCase().includes(keyword)) continue;
      const key = fav.fromFollow.toLowerCase();
      const g = groups.get(key) || { login: fav.fromFollow, items: [] };
      g.items.push(fav);
      groups.set(key, g);
    }
    return [...groups.values()].sort((a, b) => a.login.localeCompare(b.login));
  })();
  // 目前還被任何帳號 Follow 的使用者（小寫）。尾端圖標用這個集合判斷。
  const followingSet = followedLogins();
  // 3.1：標題文字也給選單用。
  // 2026-11-18：標題從「我的收藏」改成「收藏」，跟模式選單裡的名稱一致。
  const modeTitle = mode === "follow" ? t("Follow", "Follow", "Following") : t("收藏", "收藏", "Favorites");
  // 2026-11-18：搜尋框預設收起來，點工具列放大鏡才展開（跟 components/overview.tsx 同一套）。
  const toggleSearch = () => { if (searchVisible) setQuery(""); setSearchVisible(!searchVisible); };

  return (
    <NavigationStack>
      <List {...REPO_LIST}
        tint={palette.accent}
        contentMargins={{ edges: "top", insets: 4, placement: "scrollContent" }}
        listSectionSpacing={8}
        // 3.1：左滑膠囊縮成跟 Gist 歷史紀錄一樣大一號（controlSize small），
        // 列內距也收窄，膠囊才會真的跟著變小。
        controlSize="small"
        listRowInsets={{ top: 2, bottom: 2, leading: 16, trailing: 16 }}
        navigationBarTitleDisplayMode={"inline"}
        // 3.4：模式切換改成系統的 toolbarTitleMenu——就是使用者截圖那種
        // 標題右邊一顆圓圈小箭頭（iOS 原生樣式，不用自己畫）。
        // 點標題或那顆箭頭都會展開選單，可點範圍是整個標題區，
        // 不像之前自製的小圖示常常按不到。
        navigationTitle={modeTitle}
        toolbarTitleMenu={
          <>
            <Button title={t("收藏", "收藏", "Favorites")} systemImage="bookmark" action={() => switchMode("favorites")} />
            <Button title={t("Follow", "Follow", "Following")} systemImage="person.2" action={() => switchMode("follow")} />
          </>
        }
        scrollContentBackground="hidden"
        background={<GlassBackground />}
        refreshable={mode === "follow" ? async () => {
          // 2.1.14：使用者主動下拉就是把本頁的暫存判斷清掉，一切以官方名單為準。
          setFollowOverride({});
          await loadFollowing();
        } : async () => { await refreshFavoritesMode(true); }}
        toolbar={{
          // 3.4：標題與切換選單已交給 navigationTitle + toolbarTitleMenu，
          // principal 不再自己排 HStack，右上只留「＋」或重新整理。
          // 2026-11-18：兩邊都加一顆放大鏡，點了才展開搜尋框；收起時順便清空關鍵字。
          topBarTrailing: mode === "favorites" ? [
            <Button
              key="search"
              title={searchVisible ? t("收起搜尋", "收起搜索", "Hide search") : t("搜尋", "搜索", "Search")}
              systemImage="magnifyingglass"
              action={toggleSearch}
            />,
            <Button
              key="add"
              title={t("添加倉庫", "添加仓库", "Add repository")}
              systemImage={"plus"}
              action={async () => {
                await openForm();
              }}
            />,
          ] : [
            <Button
              key="search"
              title={searchVisible ? t("收起搜尋", "收起搜索", "Hide search") : t("搜尋", "搜索", "Search")}
              systemImage="magnifyingglass"
              action={toggleSearch}
            />,
            <Button key="refresh" title={t("重新整理", "刷新", "Refresh")} systemImage="arrow.clockwise" action={async () => { setFollowOverride({}); await loadFollowing(); }} disabled={followLoading} />,
          ],
        }}
      >
        {searchVisible ? (
          <Section>
            <HStack spacing={8} padding={10} background={{ style: CARD_BACKGROUND, shape: { type: "rect", cornerRadius: 12 } }} listRowBackground={<Rectangle fill="clear" />} listRowInsets={{ top: 4, bottom: 6, leading: 16, trailing: 16 }}>
              <Image systemName="magnifyingglass" foregroundStyle="secondaryLabel" font={13} />
              <TextField title={mode === "follow" ? t("搜尋使用者", "搜索用户", "Search users") : t("搜尋收藏", "搜索收藏", "Search favorites")} value={query} onChanged={setQuery}
                prompt={mode === "follow" ? t("搜尋已 Follow 的使用者", "搜索已 Follow 的用户", "Search followed users") : t("搜尋用戶或已載入倉庫", "搜索用户或已载入仓库", "Search users or loaded repositories")}
                textFieldStyle="plain" autocorrectionDisabled textInputAutocapitalization="never" />
              {query ? <Button title={t("清除", "清除", "Clear")} systemImage="xmark.circle.fill" action={() => setQuery("")} buttonStyle="plain" /> : null}
            </HStack>
          </Section>
        ) : null}
        {importError && mode === "favorites" ? (
          <Section>
            <Text listRowBackground={<ThemeCardBackground />} font={12} foregroundStyle="secondaryLabel">{importError}</Text>
          </Section>
        ) : null}
        {mode === "favorites" ? (
          manualFavorites.length === 0 && importedGroups.length === 0 ? (
            <Section>
              {/* 2.1.9：初次匯入還沒有任何收藏時，也要看得到旋轉圖標跟文字，
                  不然畫面停在「尚未收藏倉庫」，看起來像匯入沒在跑。 */}
              {importBusy ? (
                <HStack spacing={8} listRowBackground={<ThemeCardBackground />} padding={{ vertical: 4 }}>
                  <ProgressView tint={palette.accent} frame={{ width: 14, height: 14 }} />
                  <Text font={12} foregroundStyle="secondaryLabel">
                    {t("同步 Follow 倉庫中…", "同步 Follow 仓库中…", "Syncing followed repositories…")}
                  </Text>
                </HStack>
              ) : (
                <Text listRowBackground={<ThemeCardBackground />} font={"callout"} foregroundStyle={"secondaryLabel"}>
                  {t("尚未收藏倉庫，請點右上角＋加入收藏。", "尚未收藏仓库，请点右上角＋加入收藏。", "No favorites yet. Tap + at the top right to add one.")}
                </Text>
              )}
            </Section>
          ) : (
            <>
              {manualFavorites.map((fav) => (
                <FavoriteRow key={fav.id} fav={fav} query={query} avatar={avatars[fav.owner.toLowerCase()]} menu={rowMenu(fav)} onListDirty={onListDirty} onDelete={async () => { await handleDelete(fav); }} />
              ))}
              {/* 自動帶入的分區：依使用者一段一段排，每段可折疊。 */}
              {importedGroups.map((g) => {
                const key = g.login.toLowerCase();
                return (
                  <ImportedGroupSection
                    key={key}
                    login={g.login}
                    avatar={avatars[key]}
                    items={g.items}
                    stillFollowing={followingSet.has(key)}
                    expanded={importExpanded[key] !== false}
                    loading={!!importLoading[key]}
                    onToggle={() => setImportExpanded((prev) => ({ ...prev, [key]: prev[key] === false }))}
                    onOpenProfile={async () => { await openUserPage(g.login); }}
                    onUnfollow={async () => { await followFromRow(g.login); }}
                    onDelete={async () => { await handleDeleteImportedGroup(g.login); }}
                    menuFor={followingSet.has(key) ? detailsMenu : rowMenu}
                    onDeleteFav={followingSet.has(key) ? undefined : async (fav) => { await handleDelete(fav); }}
                    onListDirty={onListDirty}
                  />
                );
              })}
              {importBusy ? (
                <Section>
                  <HStack spacing={8} listRowBackground={<ThemeCardBackground />} padding={{ vertical: 4 }}>
                    <ProgressView tint={palette.accent} frame={{ width: 14, height: 14 }} />
                    <Text font={12} foregroundStyle="secondaryLabel">
                      {t("同步 Follow 倉庫中…", "同步 Follow 仓库中…", "Syncing followed repositories…")}
                    </Text>
                  </HStack>
                </Section>
              ) : null}
            </>
          )
        ) : accounts.length === 0 ? (
          <Section>
            <Text listRowBackground={<ThemeCardBackground />} font={"callout"} foregroundStyle={"secondaryLabel"}>
              {t("尚未新增帳號，請先到使用者添加帳號，才能看到 Follow 清單。", "尚未新增账号，请先到用户添加账号，才能看到 Follow 清单。", "No account yet. Add one on the User page to see who you follow.")}
            </Text>
          </Section>
        ) : (
          accounts.map((acc, idx) => {
            const sectionId = `${acc.username}#${idx}`;
            const isOpen = followExpanded[sectionId] !== false;
            const users = effectiveFollowing(acc.token);
            const err = followErrors[acc.token] || "";
            const visible = (users || []).filter(
              (u) => !keyword || `${u.login} ${u.name || ""}`.toLowerCase().includes(keyword),
            );
            const loadingThis = followLoading && users === undefined;
            return (
              <Section key={sectionId}>
                <Button listRowBackground={<ThemeCardBackground />}
                  action={() => setFollowExpanded((prev) => ({ ...prev, [sectionId]: !isOpen }))}
                >
                  <FollowHeader
                    name={acc.username || t("我的帳號", "我的账号", "My account")}
                    avatar={accountAvatars[acc.token]}
                    count={users?.length}
                    loading={loadingThis}
                    expanded={isOpen}
                  />
                </Button>
                {!isOpen ? null : err ? (
                  <Text listRowBackground={<ThemeCardBackground />} foregroundStyle={"systemRed"} font={13} padding={{ leading: FOLLOW_ROW_INDENT }}>{err}</Text>
                ) : loadingThis ? (
                  <LoadingRow leadingIndent={FOLLOW_ROW_INDENT} />
                ) : visible.length === 0 ? (
                  <Text listRowBackground={<ThemeCardBackground />} font={"callout"} foregroundStyle={"secondaryLabel"} padding={{ leading: FOLLOW_ROW_INDENT }}>
                    {keyword ? t("沒有符合的使用者", "没有符合的用户", "No matching users") : t("這個帳號還沒有 Follow 任何人。", "这个账号还没有 Follow 任何人。", "This account is not following anyone yet.")}
                  </Text>
                ) : (
                  visible.map((user) => (
                    <FollowRow
                      key={user.login}
                      user={user}
                      onOpen={async () => { await openUserPage(user.login); }}
                      onUnfollow={async () => { await unfollowUser(acc, user.login); }}
                    />
                  ))
                )}
              </Section>
            );
          })
        )}
      </List>
    </NavigationStack>
  );
}

import { PrivateMarker } from "../../components/privateMarker";
import { ThemeCardBackground, useThemePalette } from "../../components/themePalette";
import { SwipeRowBackground } from "../../components/swipeRowBackground";
import { afterDismiss } from "../../components/afterDismiss";
import { traceDelete } from "../../components/deleteTrace";
import { AccountHeader } from "../../components/accountHeader";
import { Overview } from "../../components/overview";
import {
  TextField,
  List,
  NavigationLink,
  NavigationStack,
  Text,
  useMemo,
  useObservable,
  useRef,
  useState,

  Rectangle,  useEffect,
  Section,
  Picker,
  Navigation,
  Button,
  HStack,
  Spacer,
  VStack,
  Image,
  Label,
  Script,
  ProgressView,
} from "scripting";
import { View as AddView } from "./add";
import { View as EditorView } from "./edit";
import { View as SettingView, LOG_STORAGE_KEY } from "./setting";
import { View as UpdateView } from "./update";
import { View as LogView } from "./log";
import { View as HistoryView } from "./history";
import { addLog, buildChanges } from "./activityLog";
import { flushOrders, initOrderSync, clearSortData } from "./fileOrder";
import { gist, getAccounts, ensureAccounts, fetchUser } from "../class/gist";
import { registerToast, showToast } from "./toast";
import { SORT_KEY, loadSortMode, loadPrivateGrey } from "./displaySettings";
import { PAGE_BACKGROUND, CARD_BACKGROUND } from "../../components/theme";
import { GlassBackground } from "../../components/glass";
import { LoadingRow } from "../../components/loadingRow";
import { t } from "../../components/i18n";

const LIST_CACHE_KEY = "gist_list_cache";
const ACCOUNT_EXPANDED_KEY = "gist_account_expanded";

// v1.3.2：帳號標題列的頭像快取，Token -> avatar_url，Gist 自己的 key。
// 帳號本身已有 avatar 欄位（設定頁寫入）時優先用那個；
// 沒有（舊帳號）才用 Token 打 /user 抓一次，寫進這個快取，不跟 Repository 的 key 共用。
const GIST_AVATARS_KEY = "gist_avatars";

function loadGistAvatarCache(): Record<string, string> {
  // 2.1.11：先讀 Repository 設定頁那份共用頭像快取（同一個腳本、同一份
  // Storage），再叠上 Gist 自己的。已經抓過的頭像就不用再打一次 /user，
  // 進頁面也能直接顯示。
  const out: Record<string, string> = { ...readAvatarMap("repo_editor_avatars") };
  Object.assign(out, readAvatarMap(GIST_AVATARS_KEY));
  return out;
}

function readAvatarMap(key: string): Record<string, string> {
  try {
    const raw = Storage.get<string>(key) || "";
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

function saveGistAvatarCache(cache: Record<string, string>) {
  try {
    Storage.set(GIST_AVATARS_KEY, JSON.stringify(cache));
    // 2.1.11：抓到的頭像也寫回共用快取，設定頁（兩個模組）下次不用再打 /user。
    const shared = readAvatarMap("repo_editor_avatars");
    Storage.set("repo_editor_avatars", JSON.stringify({ ...shared, ...cache }));
  } catch {}
}

// v1.1.0：多帳號抓取。每筆 Gist 打上所屬帳號，全部合併成一張清單；
// 某個帳號抓失敗就跳過它，不要一個壞 Token 擋住全部；全部都失敗才丟錯，
// 讓呼叫端去開設定。
// 2.1.11：以前是一個帳號一個帳號照順序 await，帳號一多、每次進頁面就要
// 排隊等好几個網路往返，看起來就是一直轉圈。現在每個請求自己帶 Token，
// 可以安全地並行；結果順序照帳號順序組回去，畫面排序不變。
async function fetchAllGists(): Promise<any[]> {
  const accounts = getAccounts();
  const results = await Promise.all(
    accounts.map(async (acc) => {
      try {
        const r = await gist.get(acc.token);
        for (const g of r) g._accountUsername = acc.username;
        return { ok: true, list: r as any[] };
      } catch {
        return { ok: false, list: [] as any[] };
      }
    })
  );
  const all: any[] = [];
  for (const r of results) all.push(...r.list);
  if (accounts.length > 0 && !results.some((r) => r.ok))
    throw new Error(t("無法讀取 Gist 列表", "无法读取 Gist 列表", "Failed to load the Gist list"));
  return all;
}

// 快取或舊資料裡沒有帳號標記的 Gist，歸到第一個帳號底下，不要讓它憑空消失。
function resolveAccount(g: any, accounts: any[]): string {
  const tag = g?._accountUsername;
  if (tag && accounts.some((a) => a.username === tag)) return tag;
  return accounts.length > 0 ? accounts[0].username : "";
}

function loadAccountExpanded(): Record<string, boolean> {
  try {
    const raw = Storage.get<string>(ACCOUNT_EXPANDED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    }
  } catch {}
  return {};
}

// v1.3.6-cache：跟 Repository 首頁同一套寫法。切換模組重新掛載時，
// list 的初始值直接用上次抓到的列表，先畫舊的、背景 init() 重抓到
// 新的再換掉；只有第一次啟動、完全沒有快取時才顯示載入中。Storage 的
// LIST_CACHE_KEY 仍保留（跨啟動的快取），模組變數是同一啟動內的即時快取。
let cachedGistList: any[] | undefined = undefined;

// 2026-11-19：清單世代號。刪掉一筆後遞增，讓還在跑的舊刷新作廢，
// 不然它回來會把剛刪掉的那筆又寫回清單。
let gistListGen = 0;

// 2026-11-19：刪掉一筆 Gist 後，把它從清單與快取一起移除。
// 以前這裡只在 404 分支改記憶體裡的 list，Storage 快取還留著，重開又會
// 看到已刪掉的那筆；而且是在詳情頁還掛著的時候改，等於轉場中重建列表。
function removeGistFromList(list: any, id: string) {
  if (!id) return;
  // 就算清單裡已經找不到這一筆（例如父層剛被別的刷新換掉），還是要把
  // 還在路上的舊刷新作廢，不然它回來會把剛刪掉的這筆又寫回去。
  gistListGen += 1;
  const cur: any[] | undefined = list?.value;
  if (!cur) return;
  const next = cur.filter((g: any) => g.id !== id);
  if (next.length === cur.length) return;
  list.setValue(next);
  cachedGistList = next;
  try {
    Storage.set(LIST_CACHE_KEY, JSON.stringify(next));
  } catch {}
}

export function View({ titleMenu, onExit, embedded }: { titleMenu?: any; onExit?: () => void; embedded?: boolean } = {}) {
  const palette = useThemePalette();
  const [openSwipeGist, setOpenSwipeGist] = useState("");
  // 帳號列自己的滑動開啟狀態。
  const [openSwipeAccount, setOpenSwipeAccount] = useState("");
  const [busyGist, setBusyGist] = useState("");
  // 2026-11-19：首頁滑動刪除的同步鎖。busyGist 是 state，連點兩下還是會
  // 進兩個確認流程；用 ref 在開確認頁之前就上鎖。
  const deletingGistLock = useRef(false);
  const list = useObservable<any[] | undefined>(cachedGistList);
  const toastPresented = useObservable(false);
  // 帳號區塊的開合：沒有歷史紀錄的新帳號預設展開；一旦使用者點過，
  // 就完全依照 Storage 中的明確值保留狀態。
  const accountExpanded = useObservable<Record<string, boolean>>(loadAccountExpanded());
  // v1.3.9：首頁排序（官網四種）跟私人反灰開關的顯示狀態；排序在首頁直接改就
  // 立刻存，私人反灰是設定頁按儲存才寫入，回來時再同步（見設定按鈕）。
  const search = useObservable<string>("");
  const visibility = useObservable<string>("all");
  const compact = useObservable<boolean>(false);
  const sortMode = useObservable<string>(loadSortMode());
  const privateGrey = useObservable<boolean>(loadPrivateGrey());
  // v1.3.2：帳號標題列前面顯示各自的頭像（Token -> avatar_url）。
  const [avatars, setAvatars] = useState<Record<string, string>>(() => loadGistAvatarCache());

  // v1.3.2：帳號標題列的頭像。帳號自帶 avatar 的直接用（設定頁寫入的）；
  // 沒有的才用該帳號 Token 打 /user 抓一次，寫回 Gist 自己的快取。
  // 2.1.11：改成並行抓（以前迴圈一位一位 await，帳號一多就多等好几個來回），
  // 並且把帳號自帶的 avatar 也寫進快取，下次不用再靠帳號欄位。
  const accountsSig = JSON.stringify(getAccounts().map((a: any) => a.username));
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = loadGistAvatarCache();
      let changed = false;
      const missing: any[] = [];
      for (const acc of getAccounts()) {
        if (acc.avatar) {
          if (!next[acc.token]) {
            next[acc.token] = acc.avatar;
            changed = true;
          }
          continue;
        }
        if (!next[acc.token]) missing.push(acc);
      }
      await Promise.all(
        missing.map(async (acc) => {
          try {
            const user = await fetchUser(acc.token);
            if (user?.avatar_url) {
              next[acc.token] = user.avatar_url;
              changed = true;
            }
          } catch {}
        }),
      );
      if (changed) {
        saveGistAvatarCache(next);
        if (!cancelled) setAvatars(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountsSig]);

  useEffect(() => {
    registerToast(() => toastPresented.setValue(true));
  }, []);

  useEffect(() => {
    try {
      Storage.set(SORT_KEY, sortMode.value);
    } catch {}
  }, [sortMode.value]);

  async function init(skipCache?: boolean) {
    const gen = ++gistListGen;
    // v1.2.0：排序拿掉了，啟動時清掉舊的排序設定跟排序資料（只清本地）。
    clearSortData();
    // v1.1.0：多帳號。先確保帳號清單（舊單一 Token 會自動遷移），
    // 記錄的 Gist 同步走 gist.token，固定用第一個帳號。
    let accounts = await ensureAccounts();
    gist.token = accounts.length > 0 ? accounts[0].token : "";
    console.log("[Gist] list.init() 開始, accounts=" + accounts.map((a) => a.username).join(",") + ", skipCache=" + skipCache);

    // 優先顯示快取資料，實現秒開（刷新時跳過快取）
    if (list.value === undefined && !skipCache) {
      const cached: string | null | undefined = Storage.get<string>(LIST_CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          // 舊快取沒有帳號標記，全部歸到第一個帳號。
          if (parsed.length > 0 && !parsed[0]._accountUsername && accounts.length > 0) {
            for (const g of parsed) g._accountUsername = accounts[0].username;
          }
          list.setValue(parsed);
          cachedGistList = parsed;
          console.log("[Gist] 已顯示快取列表");
        } catch {}
      }
    }

    if (accounts.length === 0) {
      console.log("[Gist] list.init() 無帳號，彈出設定");
      await new Promise<void>((resolve) => {
        setTimeout(async () => {
          await Navigation.present(<SettingView />);
          resolve();
        }, 100);
      });
      accounts = getAccounts();
      // 設定頁關掉時可能已經有更新的刷新在跑（例如剛刪完一筆），這份就不要再寫。
      if (gen !== gistListGen) return;
      console.log("[Gist] list.init() 設定 dismiss, accounts=" + accounts.length);
      if (accounts.length === 0) {
        console.log("[Gist] list.init() 仍無帳號，清除快取並顯示空列表");
        Storage.remove(LIST_CACHE_KEY);
        list.setValue([]);
        cachedGistList = [];
        return;
      }
      gist.token = accounts[0].token;
      // 用戶剛加了帳號，執行記錄資料初始化同步
      await initOrderSync();
    }
    try {
      console.log("[Gist] list.init() 開始拉取 Gist 列表");
      const r = await fetchAllGists();
      console.log("[Gist] list.init() 拉取完成, count=" + r.length);
      // 已經有更新的刷新在跑（例如刪除後的補刷），這份結果就是舊的，丟掉。
      if (gen !== gistListGen) {
        console.log("[Gist] list.init() 丟棄過期結果, gen=" + gen + ", current=" + gistListGen);
        return;
      }
      Storage.set(LIST_CACHE_KEY, JSON.stringify(r));
      list.setValue(r);
      cachedGistList = r;
      console.log("[Gist] list.init() list.setValue 完成");
    } catch (e) {
      console.log("[Gist] list.init() 拉取失敗: " + String(e));
      // 已經有更新的刷新（或剛刪掉一筆）接棒，這個失敗不用再處理。
      if (gen !== gistListGen) return;
      // 如果已有快取資料且不是主動刷新，網路失敗時保持顯示快取
      if (!skipCache && list.value && list.value.length > 0) return;
      // 主動刷新失敗或沒有快取，彈設定讓用戶檢查 token
      await Navigation.present(<SettingView />);
      if (gen !== gistListGen) return;
      if (getAccounts().length === 0) {
        Storage.remove(LIST_CACHE_KEY);
        list.setValue([]);
        cachedGistList = [];
        return;
      }
      await init();
    }
  }

  // v1.1.0：首頁改成帳號區塊。一個帳號一列標題（點一下展開／收起，
  // 長按跳出新增Gist），展開時下面是該帳號的 Gist（原本的摺疊不變）。
  // 不用 Fragment 包，用陣列直接攤平成 List 的子元素。
  function renderAccounts() {
    const els: any[] = [];
    const accounts = getAccounts();
    // 帳號卡片照帳號清單的順序排（設定頁拖曳換順序，回來刷新後首頁就跟著換）；
    // v1.3.9：每個帳號裡面的 Gist 照首頁排序列排（官網四種，用 created_at /
    // updated_at 在本地排，不用再跟 GitHub 要資料）。
    const sorted = list.value;
    for (const acc of accounts) {
      const accGists = (sorted || []).filter((g: any) => resolveAccount(g, accounts) === acc.username);
      const filtered = accGists.filter((g: any) => {
        const q = search.value.trim().toLowerCase();
        return (visibility.value === "all" || (visibility.value === "public" ? g.public : !g.public)) && (!q || [g.description || "", ...Object.keys(g.files || {})].join(" ").toLowerCase().includes(q));
      });
      const ordered = [...filtered].sort((a: any, b: any) => {
        if (sortMode.value === "created_asc") return (a.created_at || "").localeCompare(b.created_at || "");
        if (sortMode.value === "updated_desc") return (b.updated_at || "").localeCompare(a.updated_at || "");
        if (sortMode.value === "updated_asc") return (a.updated_at || "").localeCompare(b.updated_at || "");
        return (b.created_at || "").localeCompare(a.created_at || "");
      });
      const hasExpansionRecord = Object.prototype.hasOwnProperty.call(accountExpanded.value, acc.username);
      const isOpen = hasExpansionRecord ? accountExpanded.value[acc.username] === true : true;
      // 帳號標題列前面的頭像。帳號自帶的優先，沒有才用快取抓回來的。
      const accAvatar = acc.avatar || avatars[acc.token] || "";
      const accountEls: any[] = [];
      // 新增 Gist 的流程原樣不動（彈出新增頁，成功回來重抓）。
      const addGistForAccount = async () => {
        try {
          const r = await Navigation.present(<AddView accountToken={acc.token} />);
          if (!r) return;
          await init(true);
        } catch (e) {
          await Dialog.alert({
            title: t("錯誤", "错误", "Error"),
            message: String(e),
          });
        }
      };
      // 2.0.7：滑動改回來，照官方範例掛在列本身的 HStack 上。
      // 只有「新增Gist」一個選項；按鈕是素 Button＋Label 子元件。
      // 2.0.29：膠囊改藍色 #0A84FF，跟新增倉庫一樣。
      accountEls.push(
        <HStack key={`account-${acc.username}`} alignment={"center"} spacing={10} listRowBackground={<SwipeRowBackground isPresented={openSwipeAccount === acc.username} />} trailingSwipeActions={{
          allowsFullSwipe: false,
          onPresentationChanged: (presented: boolean) => setOpenSwipeAccount(current => presented ? acc.username : current === acc.username ? "" : current),
          actions: [
            <Button action={async () => { await addGistForAccount(); }} tint="#0A84FF">
              <Label title={t("新增Gist", "新增Gist", "New Gist")} systemImage="plus" />
            </Button>,
          ],
        }}>
          <Button buttonStyle="borderless" frame={{ maxWidth: "infinity", alignment: "leading" }}
            action={() => {
              const next = { ...accountExpanded.value, [acc.username]: !isOpen };
              try {
                Storage.set(ACCOUNT_EXPANDED_KEY, JSON.stringify(next));
              } catch {}
              accountExpanded.setValue(next);
            }}
          >
            <AccountHeader name={acc.username} avatar={accAvatar} count={accGists.length} unit="gist" publicCount={accGists.filter((g: any) => g.public).length} privateCount={accGists.filter((g: any) => !g.public).length} expanded={isOpen} />
          </Button>
        </HStack>
      );
      if (isOpen) {
        for (const info of ordered) {
          // Gist 列維持原有 NavigationLink 與私人反灰設定，只重新整理資訊層級。
          const fileNames = Object.keys(info.files || {});
          const firstFile = fileNames.length > 0 ? info.files[fileNames[0]] : undefined;
          const gistTitle = firstFile?.filename ? `${info.owner.login}/${firstFile.filename}` : `${info.owner.login}/`;
          const fileSummary = fileNames.length === 0
            ? t("沒有檔案", "没有文件", "No files")
            : t(`${fileNames.length}個檔案`, `${fileNames.length}个文件`, `${fileNames.length} ${fileNames.length === 1 ? "file" : "files"}`);
          const rowForeground = privateGrey.value && !info.public ? "secondaryLabel" : "label";
          accountEls.push(
            <NavigationLink listRowBackground={<SwipeRowBackground isPresented={openSwipeGist === info.id} />}
              listRowInsets={{ top: 10, leading: 16, bottom: 10, trailing: 16 }} key={info.id}
              destination={<GistDetailView info={info} accountToken={acc.token} list={list} />}>
              <HStack spacing={11} alignment="center" padding={{ leading: 16 }}
                // 2.0.27：滑動刪除改成長按刪除。2.0.26 還是閃退，左滑刪除鈕
                // 開著時動這列（忙碌顯示、抽掉、刷新）都會讓底層列表算不攏；
                // 改成長按叫出選單再刪，刪的時候沒有滑動開著。確認、紅字
                // 「刪除中…」、抽列、刷新流程全部不變，只換觸發方式。
                contextMenu={{
                  menuItems: (
                    <>
                      <Section>
                        <Button title={t("刪除", "删除", "Delete")} systemImage="trash" role="destructive" action={async () => {
                          if (deletingGistLock.current) return;
                          deletingGistLock.current = true;
                          traceDelete("list-delete-tap", info.id);
                          try {
                            let removed = false;
                            try {
                              // 2026-11-19：忙碌顯示不能在這裡先設——確認頁還開著，
                              // 設了上面那列就先跳「刪除中…」。改用 confirmAndDeleteGist
                              // 的 onConfirmed：確認頁退場、真的要刪了才設（詳情頁
                              // 刪除按鈕本來就是這個寫法）。按取消就永遠不會設。
                              removed = await confirmAndDeleteGist(info, acc.token, gistTitle, () => {
                                setBusyGist(info.id);
                              });
                            } catch (e) {
                              traceDelete("list-delete-error", e);
                              await Dialog.alert({ title: t("刪除失敗", "删除失败", "Delete failed"), message: String(e) });
                            }
                            // 2026-11-19：刪除與刷新分開。已經刪掉了，就先把這列從清單
                            // 拿掉；背景刷新失敗不要再報一次「刪除失敗」。確認頁才剛
                            // 關掉，先等退場緩衝再動列表，避免轉場中抽掉來源列。
                            if (removed) {
                              await afterDismiss();
                              traceDelete("list-remove-row");
                              removeGistFromList(list, info.id);
                              traceDelete("list-remove-done");
                            }
                            try {
                              if (removed) {
                                traceDelete("list-refresh");
                                await init(true);
                                traceDelete("list-refresh-done");
                              }
                            } catch (refreshErr) {
                              console.log("[Gist] 刪除後刷新列表失敗: " + String(refreshErr));
                            }
                          } finally {
                            setBusyGist("");
                            deletingGistLock.current = false;
                            traceDelete("list-delete-exit");
                          }
                        }} />
                      </Section>
                    </>
                  ),
                }}
                trailingSwipeActions={{
                  allowsFullSwipe: false,
                  onPresentationChanged: presented => setOpenSwipeGist(current => presented ? info.id : current === info.id ? "" : current),
                  actions: [
                    <Button tint="#0A84FF" disabled={busyGist !== "" || fileNames.length === 0} action={async () => {
let filename = fileNames[0];
                      if (fileNames.length > 1) {
                        const selected = await Dialog.actionSheet({ title: t("選擇要編輯的檔案", "选择要编辑的文件", "Choose a file to edit"), actions: fileNames.map(name => ({ label: name })) });
                        if (selected === null || selected === undefined || !fileNames[selected]) return;
                        filename = fileNames[selected];
                      }
                      await Navigation.present(<EditorView info={info} filename={filename} accountToken={acc.token} list={list} onSaved={async () => { await init(true); }} />);
                    }}><Label title={t("編輯", "编辑", "Edit")} systemImage="pencil" /></Button>,
                    <Button tint="#555B61" disabled={busyGist !== ""} action={async () => {
                      await Navigation.present(<HistoryView info={info} accountToken={acc.token} />);
                    }}><Label title={t("歷史紀錄", "历史记录", "History")} systemImage="clock.arrow.circlepath" /></Button>,
                  ],
                }}
              >

                {busyGist === info.id ? <ProgressView /> : <Image
                  systemName="doc.text.fill"
                  font={17}
                  foregroundStyle={palette.accent}
                  frame={{ width: 34, height: 34 }}
                  background={{ style: palette.selected, shape: { type: "rect", cornerRadius: 10 } }}
                />}
                <VStack alignment={"leading"} spacing={4}>
                  <Text lineLimit={1} font={"headline"} fontWeight={"semibold"} foregroundStyle={rowForeground}>{firstFile?.filename || t("Gist", "Gist", "Gist")}</Text>
                  {/* 2.0.24：首頁左滑刪整個 Gist 時，忙碌的那列也顯示紅色「刪除中…」
                      （之前只有轉圈圈）。跟詳情頁刪檔案同一招：busyGist 一設就換內容，
                      那列本身不被抽掉、只是換字跟顏色；抽掉那列跟整張重抓本來就
                      不在這裡做，診斷已證實這條刪整個 Gist 的流程跑得完。 */}
                  {busyGist === info.id || !compact.value ? <Text lineLimit={1} font={"caption"} foregroundStyle={busyGist === info.id ? "red" : rowForeground}>{busyGist === info.id ? t("刪除中…", "删除中…", "Deleting…") : (info.description || t("無描述", "无描述", "No description"))}</Text> : null}
                  <HStack spacing={8}>
                    <Text font={9} monospaced foregroundStyle={"secondaryLabel"}>{fileSummary}</Text>
                  </HStack>
                </VStack>
              <Spacer />
                {!info.public ? <Image systemName="lock.fill" font={9} foregroundStyle="secondaryLabel" frame={{ width: 16, height: 20 }} /> : null}
                </HStack>
            </NavigationLink>
          );
        }
      }
      // v1.3.2：一個帳號包一個 Section，兩個帳號就是兩張獨立的卡，中間有間隔，
      // 不再像之前那樣擠在同一張卡裡。
      els.push(<Section key={`account-section-${acc.username}`}>{accountEls}</Section>);
    }
    return els;
  }

  useEffect(() => {
    console.log("[Gist] App 啟動 useEffect");
    // v1.3.0：Gist 列不再展開折疊，gist_expanded_ids 不再使用。
    init();
  }, []);

  return (
    <List
      listStyle="insetGroup"
      contentMargins={{ edges: "top", insets: 4, placement: "scrollContent" }}
      listSectionSpacing={8}
      navigationTitle={"GitHub Toolkit"}
      navigationBarTitleDisplayMode={"inline"}
      // navigationTitle 留著：返回上一頁的按鈕文字要用它。
      // 首頁背景：跟 Repository 首頁一樣，List 的系統背景（深色模式下接近
      // 黑色）會蓋掉外層的深灰，藏起來再直接給 List 上深灰（見 components/theme.ts）。
      scrollContentBackground="hidden"
      background="clear"
      toast={{
        isPresented: toastPresented,
        message: t("已複製至剪貼簿", "已复制至剪贴板", "Copied to clipboard"),
        position: "top",
      }}
      refreshable={async () => {
        console.log("[Gist] 下拉刷新");
        await init(true);
      }}
      toolbar={{
        principal: <Text font={17} fontWeight="semibold" lineLimit={1} minScaleFactor={0.75}>GitHub Toolkit</Text>,
        // 嵌入首頁時沒有可以退出的 sheet，退出按鈕直接不顯示。
        ...(embedded ? {} : {
          topBarLeading: <Button title={t("退出", "退出", "Close")} systemImage="xmark" action={() => onExit ? onExit() : Script.exit()} />,
        }),
        // v1.1.0：左上角的新增Gist（+）拿掉了，新增改成長按帳號標題。
        // v1.2.0：排序拿掉了，排序按鈕也跟著拿掉。
        topBarTrailing: [
          <Button
            title={t("記錄", "记录", "Activity Log")}
            systemImage="clock.arrow.circlepath"
            action={() => {
              Navigation.present(<LogView />);
            }}
          />,
          <Button
            title={t("使用者設定", "用户设置", "User Settings")}
            systemImage="person.crop.circle"
            action={async () => {
              console.log("[Gist] 打開設定");
              // v2.0.1：設定回來時，沒異動就不要刷新。以前只比帳號，
              // 而且按儲存一定刷新，就算什麼都沒改也會刷；現在三樣一起比：
              // 帳號（內容正規化過，不怕鍵順序或空白影響）、私人反灰、
              // 記錄儲存位置，三樣都沒變就直接回去，儲存或取消都一樣。
              // 取消那邊（見設定頁）會把帳號還原，所以取消回來帳號一定沒變，
              // 自然就不會刷新，不用再特別分取消還是儲存。
              const accountsSig = () =>
                JSON.stringify(
                  getAccounts().map((a: any) => ({
                    username: a.username,
                    token: a.token,
                    avatar: a.avatar || "",
                  }))
                );
              const beforeAccounts = accountsSig();
              const beforeGrey = loadPrivateGrey();
              const beforeLogMode = Storage.get<string>(LOG_STORAGE_KEY) || "local";
              const r = await Navigation.present(<SettingView />);
              console.log("[Gist] 設定返回, r=" + JSON.stringify(r));
              const afterAccounts = accountsSig();
              const afterGrey = loadPrivateGrey();
              const afterLogMode = Storage.get<string>(LOG_STORAGE_KEY) || "local";
              if (
                afterAccounts === beforeAccounts &&
                afterGrey === beforeGrey &&
                afterLogMode === beforeLogMode
              )
                return;
              // v1.3.9：設定頁的私人反灰是按儲存才寫入，回來時同步到首頁顯示。
              if (afterGrey !== privateGrey.value) privateGrey.setValue(afterGrey);
              console.log("[Gist] 設定有異動，刷新列表");
              // 只有按儲存才同步記錄資料；只有帳號變了就只刷新列表。
              if (r) await initOrderSync();
              await init(true);
            }}
          />,
        ],
      }}>
      <Section>
        <Overview title={t("Gist 總覽", "Gist 总览", "Gists")} query={search.value} onQuery={v => search.setValue(v)} visibility={visibility.value} onVisibility={v => visibility.setValue(v)} sort={sortMode.value} onSort={v => sortMode.setValue(v)} options={[{id:"updated_desc",title:t("最近更新", "最近更新", "Recently updated")},{id:"updated_asc",title:t("最早更新", "最早更新", "Least recently updated")},{id:"created_desc",title:t("最近建立", "最近创建", "Recently created")},{id:"created_asc",title:t("最早建立", "最早创建", "Least recently created")}]} compact={compact.value} onCompact={() => compact.setValue(!compact.value)} />
      </Section>
      {list.value === undefined ? (
        <Section><LoadingRow /></Section>
      ) : getAccounts().length === 0 ? (
        <Section><Text listRowBackground={<ThemeCardBackground />} font="callout" foregroundStyle="secondaryLabel">{t("尚未新增帳號，請先到設定添加帳號。", "尚未新增账号，请先到设置添加账号。", "No account added yet. Please add an account in Settings first.")}</Text></Section>
      ) : renderAccounts()}
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

// v1.3.0：點 Gist 不再展開折疊，改進到下一層詳情頁（跟 Repository 點倉庫進瀏覽頁一樣）。
// 檔案跟操作都搬到這裡：檔案列點進去是編輯頁（本來就是 NavigationLink），
// 下方操作區有新增檔案、編輯描述、刪除 Gist。
// 詳情頁自己維護 current（目前這筆 Gist 的最新資料），操作後 init 會重抓並更新
// current，所以不用回首頁再進來就看得到新檔案；Gist 被刪掉時 init 找不到就自動返回。
function GistDetailView({ info, list, accountToken }: { info: any; list: Observable<any[] | undefined>; accountToken: string }) {
  const dismiss = Navigation.useDismiss();
  // 2026-11-19：刪除互斥鎖。useState 的忙碌旗標不是同步的，連點兩下紅色
  // 確認、或「刪檔案」跟「刪整個 Gist」先後按，兩個流程都可能真的跑起來；
  // 這裡用 ref 在開確認框之前就上鎖，取消或出錯都一定會解鎖。
  const deleting = useRef(false);
  // 已經開始退場：之後不要再改這一頁的 observable，也不要再抓這一筆。
  const left = useRef(false);
  // 2.0.11：這頁的 tint 也跟背景主題連動。
  const palette = useThemePalette();
  const current = useObservable<any>(info);
  // 2026-11-07：刪檔案／刪 Gist 也要有忙碌態（旋轉動畫＋紅字「刪除中…」），
  // 跟檔案頁的刪除一樣。deletingFile 記正在刪的檔名（那一列變忙碌列），
  // deletingGist 記整個 Gist 正在刪（操作區的刪除按鈕變忙碌列）。
  // 2.0.19：刪「檔案」不再用 deletingFile。診斷停在 snapshot、早上 .ips
  // 是列表重繪時 abort，兇手是確認後那次忙碌態重繪（列還開著左滑刪除鈕，
  // 內容一換底層列表就算不攏；500ms 等待已證實沒用）。刪檔案時那列維持原樣，
  // 直到 PATCH 完一次 init() 才刷新；代價是刪檔案時不再顯示「刪除中…」。
  // 刪整個 Gist（deletingGist）跟更名（renamingFile）這版沒動。
  const deletingFile = useObservable<string | null>(null);
  const deletingGist = useObservable<boolean>(false);
  // 2026-11-07：更名也要有忙碌態（旋轉動畫＋綠字「重新命名中…」），跟
  // 檔案頁的更名一樣。renamingFile 記正在更名的檔名（那一列變忙碌列）。
  const renamingFile = useObservable<string | null>(null);

  // 2026-11-19：離開詳情頁的統一流程。
  // 刪除成功（含「最後一檔連整筆刪」）與「外部已刪、刷新拿到 404」都走這裡。
  // 先關詳情頁，等一段退場緩衝，再改首頁清單與快取；舊版是在同一輪同步
  // 更新來源清單又 dismiss，使用者在這個入口遇到整個 app 回主畫面，因此改成
  // 退場後才動父層資料。緩衝固定 500ms，是沿用 Fork 流程的實機觀察值，
  // 不是原生轉場完成的回呼。
  async function leaveToList() {
    if (left.current) return;
    left.current = true;
    traceDelete("dismiss");
    dismiss();
    // 2026-11-19：dismiss 只代表「已經要求關頁」，不代表 native 的轉場
    // 已經完成。舊版回來馬上就改父層的 observable（移除這筆 Gist），
    // 等於在別人的轉場中抽它的資料來源。先等緩衝。
    await afterDismiss();
    traceDelete("dismiss-settled");
    removeGistFromList(list, info.id);
    traceDelete("parent-list-updated");
  }

  async function init() {
    if (left.current) return;
    console.log("[Gist] GistDetail.init() 開始, gistId=" + info.id);
    if (getAccounts().length === 0) {
      await new Promise<void>((resolve) => {
        setTimeout(async () => {
          await Navigation.present(<SettingView />);
          resolve();
        }, 100);
      });
      if (getAccounts().length === 0) return;
    }
    try {
      // 2.1.11：以前這裡叫 fetchAllGists()，只為了拿自己這一筆，卻把
      // 所有帳號的所有 Gist 重抓一次（存檔後也會再跑一次）。帳號一多，
      // 每次存檔都要等好几個請求，就是「加載东西轉圈好久」的來源之一。
      // 現在只抓這一筆，成功後把首頁列表中的那一筆換掉；列表本來就在，
      // 不用整張重抓。
      const fresh = await gist.getById(info.id, accountToken);
      if (left.current) return;
      fresh._accountUsername = info._accountUsername ?? fresh.owner?.login;
      current.setValue(fresh);
      const cur = list.value;
      if (cur) {
        const idx = cur.findIndex((g: any) => g.id === fresh.id);
        const next = idx >= 0 ? cur.map((g: any, i: number) => (i === idx ? fresh : g)) : [...cur, fresh];
        list.setValue(next);
        cachedGistList = next;
        try { Storage.set(LIST_CACHE_KEY, JSON.stringify(next)); } catch {}
      }
    } catch (e) {
      // 這筆 Gist 已經不在了（在別的地方被刪掉），用跟刪除成功同一條
      // 安全順序返回：先退場、再從首頁清單與快取移除。
      if (String(e).includes("404")) {
        await leaveToList();
        return;
      }
      await Navigation.present(<SettingView />);
      if (left.current) return;
      if (getAccounts().length === 0) return;
      try {
        const fresh = await gist.getById(info.id, accountToken);
        if (left.current) return;
        current.setValue(fresh);
      } catch {}
    }
  }

  const gistTitle =
    Object.keys(current.value.files).length > 0
      ? `${current.value.owner.login}/${current.value.files[Object.keys(current.value.files)[0]].filename}`
      : `${current.value.owner.login}/`;

  // 檔案照檔名自然排序（跟以前預設模式一樣）。
  const sortedFilenames = useMemo(
    () => Object.keys(current.value.files).sort(),
    [current.value.id, current.value.files]
  );

  return (
    <List
      scrollContentBackground="hidden"
      background={<GlassBackground />}
      tint={palette.accent}
      listStyle="insetGroup"
      listSectionSpacing={4}
      contentMargins={{ top: 4, leading: 16, bottom: 8, trailing: 16 }}

      navigationTitle={gistTitle}
      navigationBarTitleDisplayMode={"inline"}
      refreshable={async () => {
        await init();
      }}
    >
      <Section>
        <HStack spacing={12} padding={{ vertical: 7 }} listRowBackground={<ThemeCardBackground />}>
          <Image systemName={current.value.public ? "doc.text" : "lock.document"} font={24} foregroundStyle={palette.accent} />
          <VStack alignment="leading" spacing={6}>
            <Text font="headline">{current.value.description || t("無描述", "无描述", "No description")}</Text>
            <Text font="caption" foregroundStyle="secondaryLabel">{t(`${current.value.owner.login} · ${current.value.public ? "公開" : "私人"} · ${sortedFilenames.length}個檔案`, `${current.value.owner.login} · ${current.value.public ? "公开" : "私人"} · ${sortedFilenames.length}个文件`, `${current.value.owner.login} · ${current.value.public ? "Public" : "Private"} · ${sortedFilenames.length} files`)}</Text>
          </VStack>
        </HStack>
      </Section>
      <Section header={<HStack><Text>{t("檔案", "文件", "Files")}</Text><Spacer /><Button buttonStyle="plain" font={12}
          title={t("新增", "新增", "Add")}
          systemImage={"plus"}
          action={async () => {
            try {
              const r = await Navigation.present(
                <UpdateView
                  url={current.value.url}
                  gistId={current.value.id}
                  files={current.value.files}
                  gistName={gistTitle}
                  accountToken={accountToken}
                  accountUsername={current.value._accountUsername}
                />
              );
              if (!r) return;
              await init();
            } catch (e) {
              await Dialog.alert({
                title: t("錯誤", "错误", "Error"),
                message: String(e),
              });
            }
          }}
        />
</HStack>}>
        {sortedFilenames.map((filename: string) => {
          const i = current.value.files[filename];
          if (!i) return null;

          async function handleDeleteFile() {
            // 2026-11-19：同步上鎖，連點不會進兩個刪除流程。
            if (deleting.current) return;
            deleting.current = true;
            let removingGist = false;
            let reloadScheduled = false;
            // v1.3.8：置中確認框沒辦法把確認變紅（跟刪除帳號一樣），改用
            // Dialog.actionSheet：取消在左（白色），確認是 destructive 在右（紅色）；
            // 只有按確認（index 0）才刪除，取消或關掉（null）就不動。
            // 2026-11-07：最後一個檔案不能單獨刪——GitHub 不准 Gist 變空，
            // 單獨刪最後一個檔案會回 422 Validation Failed，刪不掉。所以是
            // 最後一個檔案時，確認框就直接講明「刪除它等於刪除整個 Gist」，
            // 確認後就刪整個 Gist（不是只刪檔案）。
            try {
              const isLastFile = Object.keys(current.value.files).length === 1;
              // 2026-11-07：最後一個檔案時，標題直接寫「刪除整個 Gist」，不要
              // 只寫「刪除檔案」——只放在內文裡太容易被略過，標題一眼就要
              // 看得出這會把整個 Gist 刪掉。
              traceDelete("ask", isLastFile ? `last-file ${i.filename}` : `file ${i.filename}`);
              const idx = await Dialog.actionSheet({
                title: isLastFile ? t("刪除整個 Gist", "删除整个 Gist", "Delete Entire Gist") : t("刪除檔案", "删除文件", "Delete File"),
                message: isLastFile
                  ? t(`「${i.filename}」是這個 Gist 裡最後一個檔案，刪除它等於刪除整個 Gist「${gistTitle}」。\n此操作不可撤銷！`, `「${i.filename}」是这个 Gist 里最后一个文件，删除它等于删除整个 Gist「${gistTitle}」。\n此操作不可撤销！`, `"${i.filename}" is the last file in this Gist. Deleting it will delete the entire Gist "${gistTitle}".\nThis action cannot be undone.`)
                  : t(`確定要刪除以下檔案嗎？\n「${i.filename}」\n此操作不可撤銷！`, `确定要删除以下文件吗？\n「${i.filename}」\n此操作不可撤销！`, `Are you sure you want to delete this file?\n"${i.filename}"\nThis action cannot be undone.`),
                actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
              });
              if (idx !== 0) return;
              if (left.current) return;
              // 2026-11-19：actionSheet 的 Promise 回來只代表「使用者選了」，
              // 不保證 alert 的收合動畫已經結束。舊版回來第一件事就是改
              // deletingFile，整個列（含剛剛那顆滑動按鈕）在收合動畫中
              // 被重建；使用者在這裡就會閃退。先等一小段再做任何畫面變更。
              traceDelete("confirm", `last=${isLastFile}`);
              await afterDismiss();
              traceDelete("after-sheet");
              // 2.0.27：紅字「刪除中…」加回來。2.0.26 拿掉它是因為左滑
              // 刪除鈕開著時換這列內容會崩；現在刪除改成長按選單，刪的
              // 時候沒有滑動開著，換內容應該是安全的（跟首頁刪整個 Gist
              // 只換內容從來不閃一樣）。如果長按刪除還是閃，就確定兇手
              // 不是滑動，到時再拿掉這一行。
              deletingFile.setValue(i.filename);
              // v1.3.4：詳情頁刷新時不要先清空首頁列表（之前這裡會讓底層閃現
              // ProgressView、甚至把 SplitView 的詳情頁整個清掉變黑屏不動）；
              // 直接 init，init 最後會把新列表寫回去，過程中首頁都還顯示舊資料。
              let logEntry: any = null;
              if (isLastFile) {
                traceDelete("delete-gist", i.filename);
                await gist.withToken(accountToken, () => gist.delete(current.value.url));
                traceDelete("delete-gist-done");
                removingGist = true;
                logEntry = { action: "刪除列表", gistName: gistTitle, accountUsername: current.value._accountUsername };
              } else {
                traceDelete("snapshot", i.filename);
                const snapshot = await gist.withToken(accountToken, () => gist.getContent(i.raw_url));
                traceDelete("delete-file", i.filename);
                await gist.withToken(accountToken, () => gist.deleteContent(current.value.url, i.filename));
                traceDelete("delete-file-done");
                // 2.1.10：刪除檔案＝跟空內容比對，詳情頁就看得到刪掉了什麼。
                // 2026-11-19：檔案這時已經刪掉了，整理變更摘要若出錯只能記 log，
                // 不能再往上丟成「刪除失敗」。
                try {
                  const { changes, truncated, approximate } = buildChanges([
                    { filename: i.filename, before: snapshot },
                  ]);
                  logEntry = {
                    action: "刪除檔案",
                    gistName: gistTitle,
                    fileName: i.filename,
                    content: snapshot,
                    accountUsername: current.value._accountUsername,
                    changes,
                    changesTruncated: truncated,
                    changesApproximate: approximate,
                  };
                } catch (diffErr) {
                  console.log("[Gist] 計算刪除差異失敗: " + String(diffErr));
                  logEntry = {
                    action: "刪除檔案",
                    gistName: gistTitle,
                    fileName: i.filename,
                    accountUsername: current.value._accountUsername,
                  };
                }
              }
              // 2026-11-19：日誌跟刪除結果分開。刪除已經成功，寫活動記錄或同步
              // 排序資料失敗時只記 log，不要再跳「錯誤」讓使用者以為沒刪掉。
              if (logEntry) {
                try {
                  addLog(logEntry);
                } catch (logErr) {
                  console.log("[Gist] 寫入活動記錄失敗: " + String(logErr));
                }
              }
              try {
                await flushOrders();
              } catch (syncErr) {
                console.log("[Gist] 同步排序資料失敗: " + String(syncErr));
              }
              // 2026-11-19：最後一個檔案會連整筆 Gist 一起刪，直接把詳情頁收掉；
              // 不再 init() 去 GET 一筆已經 404 的 Gist。刪掉單一檔案才留在頁上刷新。
              if (removingGist) {
                traceDelete("leave");
                await leaveToList();
                traceDelete("leave-done");
              } else {
                // 2.0.20：不要在這裡立刻 init()。2.0.19 證實刪檔案流程本身
                // 跑得完（trace 到 file-handler-exit），檔案也不見了，但放著
                // 不動、點刪除幾秒後還是閃退——那列的左滑刪除鈕還開著，
                // init() 在 handler 裡把那列抽掉，等 handler 結束、系統收合
                // 滑動時那列已經不在了，底層列表就算不攏。所以 PATCH 成功
                // 後先讓 handler 結束（滑動收合），800ms 後再刷新；那列是
                // 在滑動已收合的狀態下消失。鎖等延後刷新跑完才解，免得刷新
                // 前又進第二個刪除流程。
                reloadScheduled = true;
                traceDelete("reload-scheduled");
                setTimeout(() => {
                  (async () => {
                    try {
                      if (left.current) return;
                      traceDelete("reload");
                      await init();
                      traceDelete("reload-done");
                    } catch (refreshErr) {
                      console.log("[Gist] 刪除檔案後刷新失敗: " + String(refreshErr));
                    } finally {
                      // 2.0.21：那列已經被 init() 抽掉了，這時清 null 不會
                      // 再碰到任何一列的內容（沒有一列還對得上這個檔名）。
                      deletingFile.setValue(null);
                      deleting.current = false;
                      traceDelete("file-handler-exit");
                    }
                  })();
                }, 800);
              }
            } catch (e) {
              traceDelete("error", e);
              if (left.current) return;
              await Dialog.alert({
                title: t("錯誤", "错误", "Error"),
                message: String(e),
              });
            } finally {
              // 2.0.21：忙碌顯示加回來了，沒排程延後刷新時（取消、失敗、
              // 刪最後一個檔案）要在這裡把那列還原；延後刷新已排程時，
              // 鎖、還原跟 file-handler-exit 都留給延後那段收尾。
              if (!reloadScheduled) {
                deletingFile.setValue(null);
                deleting.current = false;
                traceDelete("file-handler-exit");
              }
            }
          }

          // 2026-11-19：列不再因為忙碌而換成另一種元素。以前是直接
          // return 一個全新的 HStack，等於把正在承載滑動按鈕（刪除、更名
          // 就是那顆）的列連同 swipe 容器一起拆掉重建，而且就在確認框
          // 剛回傳、還在收合的時候。現在一律回同一個 Item，忙碌只在
          // 列內部換內容。
          return (
            <Item
              key={i.filename}
              filename={i.filename}
              list={list}
              info={current.value}
              accountToken={accountToken}
              onSaved={init}
              busyKind={
                deletingFile.value === i.filename
                  ? "delete"
                  : renamingFile.value === i.filename
                    ? "rename"
                    : null
              }
              // Private prop names prevent the renderer from applying swipe modifiers
              // to both Item and its root row. Trailing actions render from right to left.
              fileTrailingActions={{
                allowsFullSwipe: false,
                actions: [
                  <Button tint="#00CC66" action={async () => {
                    try {
                      const content = await gist.withToken(accountToken, () => gist.getContent(i.raw_url));
                      const tmpPath = FileManager.temporaryDirectory + "/" + i.filename;
                      await FileManager.writeAsString(tmpPath, content);
                      await ShareSheet.present([tmpPath]);
                    } catch (e) {
                      await Dialog.alert({
                        title: t("錯誤", "错误", "Error"),
                        message: String(e),
                      });
                    }
                  }}>
                    <Label title={t("共享", "共享", "Share")} systemImage="square.and.arrow.up" />
                  </Button>,
                  <Button tint="#0A84FF" action={async () => {
                    try {
                      await Pasteboard.setString(i.raw_url);
                      showToast();
                    } catch (e) {
                      await Dialog.alert({ title: t("錯誤", "错误", "Error"), message: String(e) });
                    }
                  }}><Label title={t("複製連結", "复制链接", "Copy Link")} systemImage="link" /></Button>,
                  <Button tint="#555B61" action={async () => {
                    await Navigation.present(<HistoryView info={current.value} accountToken={accountToken} filename={i.filename} />);
                  }}><Label title={t("歷史紀錄", "历史记录", "History")} systemImage="clock.arrow.circlepath" /></Button>,
                ],
              }}
              fileLeadingActions={{
                allowsFullSwipe: false,
                actions: [
                  <Button tint="#EF963C" action={async () => {
                    try {
                      const name = await Dialog.prompt({
                        title: t("請輸入檔名", "请输入文件名", "Enter a filename"),
                        defaultValue: i.filename,
                      });
                      if (name === null || name === undefined) return;
                      if (name === "") throw t("檔名不能為空", "文件名不能为空", "Filename cannot be empty");

                      // 2026-11-19：Dialog.prompt 回來不代表輸入框已收合完成。
                      // 舊版回來馬上就 renamingFile.setValue，列在彈窗收合中重繪。
                      traceDelete("gist-rename-confirmed", i.filename);
                      await afterDismiss();
                      if (left.current) return;
                      // 2026-11-07：更名中這列顯示旋轉動畫＋綠字「重新命名中…」，
                      // 跟檔案頁的更名一樣；成功後 init 會把新名字寫回去，失敗才還原。
                      renamingFile.setValue(i.filename);
                      traceDelete("gist-rename-start");
                      const content = await gist.withToken(accountToken, () => gist.getContent(i.raw_url));

                      let updated: any;
                      // 2026-11-07：更名一次 PATCH 完成（renameContent），不再先刪
                      // 舊檔、再建新檔。兩次請求時，Gist 只有一個檔案會先被刪空，
                      // 第二步就對著不存在的 Gist 打、只回含糊的 client error。
                      await gist.withToken(accountToken, async () => {
                        updated = await gist.renameContent(current.value.url, i.filename, name, content);
                      });
                      addLog({
                        action: "重新命名",
                        gistName: gistTitle,
                        fileName: name,
                        contentUrl: updated.files?.[name]?.raw_url,
                        accountUsername: current.value._accountUsername,
                        // 2.1.11：記下舊檔名，詳情頁才看得出這是更名而不是空白紀錄。
                        // 內容不變，所以沒有 changes（也不該硬畫一個假的差異）。
                        renamedFrom: i.filename !== name ? i.filename : undefined,
                      });
                      await flushOrders();

                      traceDelete("gist-rename-done", name);
                      await init();
                    } catch (e) {
                      traceDelete("gist-rename-error", e);
                      if (!left.current) {
                        await Dialog.alert({
                          title: t("錯誤", "错误", "Error"),
                          message: String(e),
                        });
                      }
                    } finally {
                      if (!left.current) renamingFile.setValue(null);
                      traceDelete("gist-rename-exit");
                    }
                  }}>
                    <Label title={t("重新命名", "重命名", "Rename")} systemImage="pencil" />
                  </Button>,
                ],
              }}
              // 2.0.27：滑動刪除改成長按刪除（見上面 home 列的說明）。
              // 刪除改成長按這列叫出的選單，左滑只剩重新命名。
              onDeleteFile={handleDeleteFile}
            />
          );
        })}
      </Section>
      <Section title={t("操作", "操作", "Actions")}>
        <Button listRowBackground={<ThemeCardBackground />}
          title={t("編輯描述", "编辑描述", "Edit Description")}
          systemImage={"text.alignleft"}
          action={async () => {
            try {
              const desc = await Dialog.prompt({
                title: t("請輸入描述", "请输入描述", "Enter a description"),
                defaultValue: current.value.description || "",
              });

              if (desc === null || desc === undefined) return;

              await gist.withToken(accountToken, () => gist.updateDescription(current.value.url, desc));
              await init();
            } catch (e) {
              await Dialog.alert({
                title: t("錯誤", "错误", "Error"),
                message: String(e),
              });
            }
          }}
        />
        {/* 2026-11-19：不再用「把這列換成 HStack」來表示忙碌。列一旦被
            換掉，原本那顆刪除按鈕就被銷毀，而那正好是使用者剛按下去的
            元素，而且接下來馬上要彈出確認頁——畫面結構在呈現的同時被拆。
            現在按鈕永遠是同一個元素，忙碌時只改標題、變灰。 */}
        <Button listRowBackground={<ThemeCardBackground />}
          title={deletingGist.value
            ? t("刪除中…", "删除中…", "Deleting…")
            : t("刪除", "删除", "Delete")}
          systemImage={deletingGist.value ? "hourglass" : "trash"}
          role={"destructive"}
          foregroundStyle={"red"}
          disabled={deletingGist.value}
          action={async () => {
            if (deleting.current) return;
            deleting.current = true;
            let removed = false;
            try {
              // 確認頁回傳 true、而且確認頁退場緩衝過後，才顯示「刪除中…」。
              // 以前是按下按鈕就先把這列換成忙碌列，等於在確認頁彈出的同時
              // 拆掉來源列。
              const ok = await confirmAndDeleteGist(current.value, accountToken, gistTitle, () => {
                if (left.current) return;
                deletingGist.setValue(true);
              });
              if (ok) {
                // 2026-11-19：刪成功就直接退場，不再 init() 去 GET 已刪的 Gist。
                removed = true;
                traceDelete("detail-leave");
                await leaveToList();
                traceDelete("detail-leave-done");
              }
            } catch (e) {
              traceDelete("detail-error", e);
              if (!removed && !left.current) {
                await Dialog.alert({ title: t("刪除失敗", "删除失败", "Delete failed"), message: String(e) });
                // 刪除沒成功才重抓現況；重抓失敗也不要在這裡再抛一次。
                // 若其實已刪掉（例如逾時後才成功），init() 拿到 404 會走
                // leaveToList() 安全返回，不會停在已不存在的頁面。
                try {
                  await init();
                } catch (refreshErr) {
                  console.log("[Gist] 刪除失敗後刷新失敗: " + String(refreshErr));
                }
              }
            } finally {
              if (!removed && !left.current) deletingGist.setValue(false);
              deleting.current = false;
            }
          }}
        />
      </Section>
    </List>
  );
}

// Shared by the list swipe action and the detail page. No DELETE occurs
// until both the confirmation page and its final destructive dialog succeed.
//
// 2026-11-19：這裡只負責「確認 + 刪除」，日誌與排序同步失敗不再往上丟。
// 以前 addLog／flushOrders 在 DELETE 成功後才失敗的話，呼叫端會跳
// 「刪除失敗」，但 Gist 其實已經刪掉了，使用者會再試一次、然後得到 404。
async function confirmAndDeleteGist(
  info: any,
  accountToken: string,
  gistTitle: string,
  // 確認頁真正退場後才呼叫，讓呼叫端可以在此時才改忙碌畫面。
  onConfirmed?: () => void,
): Promise<boolean> {
  traceDelete("gist-confirm-open", gistTitle);
  const confirmed = await Navigation.present(<DeleteGistConfirmView gistTitle={gistTitle} />);
  traceDelete("gist-confirm-closed", confirmed === true ? "true" : String(confirmed));
  if (confirmed !== true) return false;
  // 兩層畫面（確認頁 + 最後紅色警示）退場後再讓呼叫端重繪。
  await afterDismiss();
  traceDelete("gist-confirm-settled");
  if (onConfirmed) onConfirmed();
  traceDelete("gist-delete-start");
  await gist.withToken(accountToken, () => gist.delete(info.url));
  traceDelete("gist-delete-done");
  try {
    addLog({ action: "刪除列表", gistName: gistTitle, accountUsername: info._accountUsername });
  } catch (logErr) {
    console.log("[Gist] 寫入活動記錄失敗: " + String(logErr));
  }
  traceDelete("gist-log-done");
  try {
    await flushOrders();
  } catch (syncErr) {
    console.log("[Gist] 同步排序資料失敗: " + String(syncErr));
  }
  traceDelete("gist-sync-done");
  return true;
}

// 1.4.2：刪除整個 Gist 的確認頁，跟刪除倉庫的 DeleteRepoConfirmView
// 同一個做法（Kristen 要求，兩次確認）。原本刪 Gist 只有一次
// Dialog.actionSheet，現在先跳這個確認頁：上面是警告文字（Gist 名
// 有「」），下面是紅色的「刪除 Gist 名」跟取消；點紅色按鈕再跳一次
// Dialog.actionSheet「最後確認」，確認了才回傳 true。關掉頁面或按
// 取消都回傳空值，就不刪。
function DeleteGistConfirmView({ gistTitle }: { gistTitle: string }) {
  const dismiss = Navigation.useDismiss();
  const palette = useThemePalette();
  return (
    <NavigationStack>
      <List
      scrollContentBackground="hidden"
      background={<GlassBackground />}
      tint={palette.accent}

        navigationTitle={t("刪除 Gist", "删除 Gist", "Delete Gist")}
        navigationBarTitleDisplayMode={"inline"}
      >
        <Section>
          <Text listRowBackground={<ThemeCardBackground />}>
            {t(`確定要刪除以下 Gist 嗎？\n「${gistTitle}」\n此操作不可撤銷！\nGist 內的所有檔案都會一併刪除。`, `确定要删除以下 Gist 吗？\n「${gistTitle}」\n此操作不可撤销！\nGist 内的所有文件都会一并删除。`, `Are you sure you want to delete this Gist?\n"${gistTitle}"\nThis action cannot be undone.\nAll files in the Gist will be deleted as well.`)}
          </Text>
        </Section>
        <Section>
          <Button listRowBackground={<ThemeCardBackground />} title={t(`刪除 ${gistTitle}`, `删除 ${gistTitle}`, `Delete ${gistTitle}`)} systemImage={"trash"} role={"destructive"} foregroundStyle={"red"} action={async () => {
            // 按紅色按鈕之後，跳第二次確認。置中小彈窗（Dialog.confirm）沒辦法
            // 把確認變紅，系統不讓改，這是之前 Gist 刪除對話框就證實過的，
            // 所以這裡改用 Dialog.actionSheet：它的 destructive 確認會是紅色，
            // 取消是白色，只有按到紅色確認（index 0）才真的刪，取消或點外面
            // 都留在確認頁。
            traceDelete("confirm-page-ask", gistTitle);
            const idx = await Dialog.actionSheet({
              title: t("最後確認", "最后确认", "Final confirmation"),
              message: t(`確定要刪除以下 Gist 嗎？\n「${gistTitle}」\n此操作不可撤銷！`, `确定要删除以下 Gist 吗？\n「${gistTitle}」\n此操作不可撤销！`, `Are you sure you want to delete this Gist?\n"${gistTitle}"\nThis action cannot be undone.`),
              actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
            });
            if (idx !== 0) return;
            traceDelete("confirm-page-confirmed");
            // 2026-11-19：actionSheet 回來不代表警示框已經收完。舊版直接
            // dismiss(true)，等於在紅色警示收合動畫中把整個確認頁拆掉，
            // 兩層退場疊在一起；先讓警示框收完再關這一頁。
            await afterDismiss();
            traceDelete("confirm-page-dismiss");
            dismiss(true);
          }} />
          <Button listRowBackground={<ThemeCardBackground />} title={t("取消", "取消", "Cancel")} systemImage={"xmark"} action={() => dismiss()} />
        </Section>
      </List>
    </NavigationStack>
  );
}

function Item({
  filename,
  info,
  list,
  accountToken,
  onSaved,
  fileLeadingActions,
  fileTrailingActions,
  busyKind,
  onDeleteFile,
}: {
  filename: string;
  info: any;
  list: Observable<any[] | undefined>;
  accountToken: string;
  onSaved: () => Promise<void>;
  fileLeadingActions?: any;
  fileTrailingActions?: any;
  // 2026-11-19：忙碌顯示改在列內部。以前是父層把整列換成另一個 HStack，
  // 等於把「正在承載這個滑動按鈕的列」連同它的 swipe 容器一起銷毀，
  // 而且就發生在確認框還在收合的時候；使用者在刪最後一檔時整個 app
  // 會消失，兩個入口都一樣。現在列本身永遠是同一個 HStack，只換內容。
  busyKind?: "delete" | "rename" | null;
  // 2.0.27：滑動刪除改成長按刪除。長按這列叫出的選單裡刪除，
  // 左滑只剩重新命名（fileLeadingActions 那邊已經拿掉刪除鈕）。
  onDeleteFile?: () => Promise<void>;
}) {
  // v1.3.1：檔案列不再用 NavigationLink 推編輯頁，改用彈出視窗開編輯器。
  // 之前用 NavigationLink 時，編輯器的 X 會一路退回首頁（SplitView 的
  // detail 選擇被清掉），而不是回上一層詳情頁；改成從詳情頁彈出視窗，
  // X 跟存檔後的關閉都會回到彈出它的詳情頁。
  // 2.0.7：滑動改回來，照官方範例掛在自己根部的 HStack 上（不要掛裡面
  // 的主內容 Button）。主內容 Button 留著（maxWidth infinity，點了開編輯器，
  // 跟以前一樣），「⋯」按鈕拿掉。
  // 2.0.11：檔案圖標也跟背景主題連動。
  const palette = useThemePalette();
  const [swipeSide, setSwipeSide] = useState<"leading" | "trailing" | null>(null);
  return (
    <HStack spacing={11} alignment={"center"}
      listRowBackground={<SwipeRowBackground isPresented={swipeSide !== null} side={swipeSide || "trailing"} />}
      contextMenu={onDeleteFile ? {
        menuItems: (
          <>
            <Section>
              <Button title={t("刪除", "删除", "Delete")} systemImage="trash" role="destructive" action={async () => { await onDeleteFile(); }} />
            </Section>
          </>
        ),
      } : undefined}
      leadingSwipeActions={{ ...fileLeadingActions, onPresentationChanged: (presented: boolean) => setSwipeSide(current => presented ? "leading" : current === "leading" ? null : current) }}
      trailingSwipeActions={{ ...fileTrailingActions, onPresentationChanged: (presented: boolean) => setSwipeSide(current => presented ? "trailing" : current === "trailing" ? null : current) }}>
      <Button buttonStyle="borderless" frame={{ maxWidth: "infinity", alignment: "leading" }}
        disabled={busyKind != null}
        action={async () => {
          await Navigation.present(
            <EditorView
              list={list}
              info={info}
              filename={filename}
              accountToken={accountToken}
              onSaved={onSaved}
            />
          );
        }}
      >
        {/* 2.0.25：忙碌顯示改成原地換內容，不再整段換結構。2.0.20 證實
            拿掉忙碌顯示就不閃，2.0.21 加回來就又閃——差別就在這裡：
            忙碌時整段 HStack 被換成另一組（ProgressView＋一行紅字），
            列從兩行縮成一行、箭頭也不見了，等於把正在承載滑動按鈕
            的列拆掉重建；首頁刪整個 Gist 只換圖示跟字（結構不變）
            就從來不閃，2.0.24 紅字也證實有出現。現在忙碌只換圖示
            （ProgressView）跟第一行字（紅色「刪除中…」／綠色
            「重新命名中…」），第二行、間距、箭頭全部留著，列高不變。
            2.0.29：刪除的忙碌樣式統一（跟首頁刪整個 Gist 同一套）：
            檔名留在第一行，紅色「刪除中…」改放第二行（語言・大小
            暫時讓位）；更名還是綠字在第一行。結構一樣兩行不變。 */}
        <HStack spacing={11} padding={{ vertical: 5 }}>
          {busyKind ? <ProgressView /> : <Image systemName="doc.text" font={19} foregroundStyle={palette.accent} frame={{ width: 28, height: 30 }} />}
          <VStack alignment="leading" spacing={4}>
            <Text font={14} fontWeight="medium" foregroundStyle={busyKind === "rename" ? "green" : "label"} lineLimit={1}>{busyKind === "rename" ? t("重新命名中…", "重命名中…", "Renaming…") : filename}</Text>
            <Text font={10} foregroundStyle={busyKind === "delete" ? "red" : "secondaryLabel"}>{busyKind === "delete" ? t("刪除中…", "删除中…", "Deleting…") : `${info.files?.[filename]?.language || t("文字檔案", "文本文件", "Text file")} · ${((info.files?.[filename]?.size || 0) / 1024).toFixed(1)} KB`}</Text>
          </VStack>
          <Spacer />
          <Image systemName={"chevron.right"} font={11} foregroundStyle={"tertiaryLabel"} />
        </HStack>
      </Button>
    </HStack>
  );
}

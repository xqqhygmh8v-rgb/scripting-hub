import { ThemeCardBackground, useThemePalette } from "../../components/themePalette";
import { AppearanceSection } from "../../components/appearance";
import { REPO_LIST, RepoHeader, RepoSummary } from "../../components/repoUI";
import {
  List,
  Navigation,
  NavigationStack,
  Button,
  TextField,
  SecureField,
  Section,
  useObservable,
  useState,
  useEffect,
  Picker,
  Toggle,
  Text,
  HStack,
  VStack,
  Image,
  ForEach,

  Rectangle,} from "scripting";
import { gist, getAccounts, saveAccounts, ensureAccounts, fetchUser } from "../class/gist";
import { TokenPermissions } from "../../components/tokenPermissions";
import type { GistAccount } from "../class/gist";
import { PRIVATE_GREY_KEY, loadPrivateGrey } from "./displaySettings";
import { PAGE_BACKGROUND, CARD_BACKGROUND } from "../../components/theme";
import { GlassBackground } from "../../components/glass";
import { getDeleteTrace, clearDeleteTrace, formatDeleteTrace } from "../../components/deleteTrace";
import { t } from "../../components/i18n";

export const LOG_STORAGE_KEY = "gist_log_storage";

// 模組級變數（記錄的待存值；帳號改完立刻存，不走這裡）
let pendingLogMode: string = Storage.get(LOG_STORAGE_KEY) || "local";
// v1.3.9：私人反灰的待存值，跟記錄一樣按右上角儲存才寫入。
let pendingDisplayGrey: boolean = loadPrivateGrey();
// v2.0.1：取消要真的還原：設定頁打開時記住的帳號清單（見下面
// AccountsView 打開時的效果）。取消按鈕把它寫回去，帳號、順序、
// 頭像都回到打開時；還沒打開過（null）就不用還原。
let openAccountsSnapshot: GistAccount[] | null = null;

export function View() {
  const dismiss = Navigation.useDismiss();
  // 2.0.11：滑動／按鈕強調色跟背景主題連動。
  const palette = useThemePalette();
  // v1.2.0：跟 Repository 的使用者頁一樣，整個設定 List 進編輯模式，
  // 帳號列的 ForEach 用 editActions="move"，長按三行線就能拖曳換順序。
  const editMode = useObservable(() => EditMode.active());
  return (
    <NavigationStack>
      <List {...REPO_LIST}
      tint={palette.accent}
      scrollContentBackground="hidden"
      background={<GlassBackground />}

        navigationTitle={t("使用者設定", "用户设置", "User Settings")}
        navigationBarTitleDisplayMode={"inline"}
        environments={{ editMode }}
        toolbar={{
          // 設定頁頂部只留左邊一個返回按鈕，不再有取消 X 跟儲存勾。
          // 返回就等於以前的儲存：顯示跟記錄的待存設定會寫入，帳號改動也會保留，
          // 不再有取消還原（帳號本來就是立刻存，返回後首頁比對到有異動就會刷新）。
          topBarLeading: (
            <Button
              title={t("返回", "返回", "Back")}
              action={() => {
                Storage.set(LOG_STORAGE_KEY, pendingLogMode);
                Storage.set(PRIVATE_GREY_KEY, pendingDisplayGrey ? "1" : "0");
                dismiss(true);
              }}
            />
          ),
        }}
      >
        
        <AccountsView />
        <LogStorageView />
        <DisplayView />
        <AppearanceSection />
        {/* 2026-11-19：閃退回主畫面時拿不到 crash log，所以在刪除流程裡留
            麵包屑。這裡是唯一的檢視入口：出事後重開腳本，進來就能看到
            最後走到哪一步。 */}
        <DeleteTraceView />
      </List>
    </NavigationStack>
  );
}

// 2.1.11：頭像快取（Token -> avatar_url）。跟 Repository 設定頁用同一個 key：
// 整個腳本共用一份 Storage，這裡直接沿用那邊已經抓到的頭像，
// 不用再打一次 /user；抓回來的新頭像也寫回去，兩邊都受益。
// 2.1.12：這三個原本寫在 AccountsView 裡面（const 宣告在 useState 之後），
// 首次 render 的 useState 初始化去讀它時撞上 TDZ，被 try/catch 吞成 {},
// 快取等於從來沒載進來，頭像才一直空白。搬到模組層就沒這個問題。
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

// v1.1.0：多帳號。長按帳號跳出刪除（只有一次確認）。帳號一加一刪就立刻存，
// 不用按右上角儲存；首頁回來時會比對帳號清單有沒有變，有變就刷新。
// v1.3.1：加入帳號改成跟 Repository 一樣，要填使用者名稱 + Token（不再只填 Token），
// 使用者名稱會跟 Token 的 /user login 比對，對不上就不新增。
function AccountsView() {
  const accountsState = useObservable<GistAccount[]>(getAccounts());
  // v1.2.1：跟 Repository 的使用者頁一樣，ForEach 要吃有 id 的項目（id = token），
  // 所以另外維護一份 accountItems；兩邊用內容比對同步，避免迴圈。
  // （v1.2.0 直接把沒有 id 的帳號丟給 ForEach，是設定頁黑掉的可能原因之一；
  // 另一個原因是之前把 EditMode 當成 import，Repository 證明它是全域，不用 import。）
  const accountItems = useObservable(
    getAccounts().map((a) => ({
      id: a.token,
      username: a.username,
      token: a.token,
      avatar: a.avatar || "",
    }))
  );
  const showAdd = useObservable(false);
  // 2.1.11：Token -> avatar_url，跟 Repository 共用快取。
  const [avatars, setAvatars] = useState<Record<string, string>>(() => loadAvatarCache());
  const adding = useObservable(false);
  const usernameValue = useObservable("");
  const tokenValue = useObservable("");

  useEffect(() => {
    // v2.0.1：取消要真的還原：打開時先記住帳號清單（這時使用者還沒辦法
    // 動手改），之後 ensureAccounts 跑完再記一次（沒有帳號時它會自動
    // 補上舊 Token 的帳號，那不算使用者改的，取消不應該把它清掉）。
    openAccountsSnapshot = getAccounts();
    (async () => {
      const accs = await ensureAccounts();
      openAccountsSnapshot = accs;
      accountsState.setValue(accs);
    })();
  }, []);

  // Accounts created from the shared Toolkit login do not initially include
  // an avatar. Fetch and cache it here so Gist's account list matches the
  // other two modules.
  // 2.1.11：以前只看帳號本身的 avatar 欄位，沒有就整個圖不出來；現在先讀共用
  // 快取（Repository 設定頁抓過的直接可用），缺的才去 /user 補，並行抓、
  // 抓到就寫回快取，清單上的頭像立刻補上。
  // 2.1.12：只能靠 token 清單當依賴。舊版用 []，ensureAccounts 補完帳號、
  // 或使用者中途加／刪帳號時都不會再跑，新帳號就一直沒頭像；而加頭像會改
  // accountsState，若直接依 accountsState 又會自己叫自己。
  const accountSignature = accountsState.value.map((a) => a.token).join("\n");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = getAccounts();
      const cached = loadAvatarCache();
      let changed = false;
      let accountsChanged = false;
      const next: GistAccount[] = [];
      const missing: GistAccount[] = [];
      for (const account of current) {
        if (account.avatar) {
          if (cached[account.token] !== account.avatar) {
            cached[account.token] = account.avatar;
            changed = true;
          }
          next.push(account);
          continue;
        }
        if (cached[account.token]) {
          // 快取已經有頭像，直接補進帳號資料，其他頁也跟著受益。
          next.push({ ...account, avatar: cached[account.token] });
          accountsChanged = true;
          continue;
        }
        next.push(account);
        missing.push(account);
      }
      await Promise.all(
        missing.map(async (account) => {
          try {
            const user = await fetchUser(account.token);
            if (user.avatar_url) {
              cached[account.token] = user.avatar_url;
              changed = true;
            }
            const idx = next.findIndex((a) => a.token === account.token);
            if (idx >= 0) {
              next[idx] = {
                ...next[idx],
                username: user.login || next[idx].username,
                avatar: user.avatar_url || next[idx].avatar || "",
              };
              accountsChanged = true;
            }
          } catch {}
        }),
      );
      if (cancelled) return;
      if (changed) {
        saveAvatarCache(cached);
        setAvatars(cached);
      } else {
        setAvatars(cached);
      }
      if (accountsChanged) {
        saveAccounts(next);
        accountsState.setValue(next);
      }
    })();
    return () => { cancelled = true; };
  }, [accountSignature]);

// 帳號加入／刪除改了 accountsState → accountItems 跟著換（內容一樣就不動）。
  useEffect(() => {
    const next = accountsState.value.map((a) => ({
      id: a.token,
      username: a.username,
      token: a.token,
      avatar: a.avatar || "",
    }));
    if (JSON.stringify(next) !== JSON.stringify(accountItems.value)) {
      accountItems.setValue(next);
    }
  }, [accountsState.value]);

  // 拖移改了 accountItems 的順序 → 寫回帳號清單跟 Storage（內容一樣就不動）。
  // 拖完第一個帳號換人時，gist.token 也跟著換成新的第一個帳號。
  useEffect(() => {
    const next = accountItems.value.map((item) => ({
      username: item.username,
      token: item.token,
      avatar: item.avatar,
    }));
    if (JSON.stringify(next) !== JSON.stringify(accountsState.value)) {
      accountsState.setValue(next);
    }
    saveAccounts(next);
    gist.token = next[0]?.token || "";
  }, [accountItems.value]);

  // v1.3.1：新增帳號改成跟 Repository 一樣，要填使用者名稱 + Token。
  // 使用者名稱真的有驗證作用：/user 查回來的 login 一定要跟填進來的
  // 使用者名稱對得上（大小寫不一樣沒關係，GitHub 使用者名稱不分大小寫），
  // 對不上就不新增；顯示的名稱用 GitHub 回傳的 login（大小寫正確）。
  async function handleAdd() {
    if (adding.value) return;
    const trimmedUsername = usernameValue.value.trim();
    const trimmedToken = tokenValue.value.trim();
    if (!trimmedUsername || !trimmedToken) {
      await Dialog.alert({
        title:
          !trimmedUsername && !trimmedToken
            ? t("請先填寫 Username 和 Token", "请先填写 Username 和 Token", "Please enter your Username and Token")
            : !trimmedUsername
              ? t("請填寫 Username", "请填写 Username", "Please enter your Username")
              : t("請填寫 Token", "请填写 Token", "Please enter your Token"),
        message: t("Username 和 Token 都不能為空", "Username 和 Token 都不能为空", "Username and Token cannot be empty"),
      });
      return;
    }
    const cur = getAccounts();
    if (cur.some((a) => a.token === trimmedToken)) {
      await Dialog.alert({ title: t("新增失敗", "新增失败", "Failed to add"), message: t("這個 Token 已經新增過了。", "这个 Token 已经新增过了。", "This Token has already been added.") });
      return;
    }
    if (cur.some((a) => a.username.toLowerCase() === trimmedUsername.toLowerCase())) {
      await Dialog.alert({ title: t("新增失敗", "新增失败", "Failed to add"), message: t("這個帳號已經新增過了。", "这个账号已经新增过了。", "This account has already been added.") });
      return;
    }
    adding.setValue(true);
    try {
      const user = await fetchUser(trimmedToken);
      if (!user.login || user.login.toLowerCase() !== trimmedUsername.toLowerCase()) {
        throw new Error(t("Username 跟 Token 的帳號不符\n請檢查 Username 是否正確！", "Username 跟 Token 的账号不符\n请检查 Username 是否正确！", "The Username does not match the Token account.\nPlease check that the Username is correct!"));
      }
      const next = [...cur, { username: user.login, token: trimmedToken, avatar: user.avatar_url || "" }];
      saveAccounts(next);
      if (user.avatar_url) {
        const cache = { ...loadAvatarCache(), [trimmedToken]: user.avatar_url };
        saveAvatarCache(cache);
        setAvatars(cache);
      }
      gist.token = next[0]?.token || "";
      accountsState.setValue(next);
      usernameValue.setValue("");
      tokenValue.setValue("");
      showAdd.setValue(false);
    } catch (e: any) {
      await Dialog.alert({ title: t("新增失敗", "新增失败", "Failed to add"), message: String(e?.message || e) });
    } finally {
      adding.setValue(false);
    }
  }

  async function handleDelete(acc: GistAccount) {
    // v1.3.10：跟刪除 Gist / 刪除檔案一樣，置中確認框沒辦法把確認變紅，
    // 改用 Dialog.actionSheet：取消在左（白色），確認是 destructive 在右（紅色）；
    // 只有按確認（index 0）才刪除，取消或關掉（null）就不動。
    const idx = await Dialog.actionSheet({
      title: t("刪除帳號", "删除账号", "Delete Account"),
      message: t(`確定要刪除 "${acc.username}" 嗎？\n此操作不可撤銷！`, `确定要删除 "${acc.username}" 吗？\n此操作不可撤销！`, `Are you sure you want to delete "${acc.username}"?\nThis action cannot be undone!`),
      actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
    });
    if (idx !== 0) return;
    const next = getAccounts().filter((a) => a.token !== acc.token);
    saveAccounts(next);
    gist.token = next[0]?.token || "";
    accountsState.setValue(next);
  }

  // v1.3.1：跟 Repository 一樣，帳號列、添加帳號按鈕、新增帳號表單是分開的 Section。
  return (
    <>
    <Section header={<RepoHeader symbol="person.2" title={t("GitHub 帳號", "GitHub 账号", "GitHub Accounts")} />}>
      {accountsState.value.length === 0 ? (
        <Text listRowBackground={<ThemeCardBackground />} font="callout" foregroundStyle="secondaryLabel">
          {t("尚未新增帳號，請按下方添加。", "尚未新增账号，请按下方添加。", "No account added yet. Tap below to add one.")}
        </Text>
      ) : (
        <ForEach
          data={accountItems}
          editActions={"move"}
          builder={(item: any) => (
            <HStack listRowBackground={<ThemeCardBackground />}
              key={item.id}
              alignment="center"
              spacing={10}
              // 2.0.5：這處長按刻意不改左滑。這個 List 永久處於編輯模式
              //（EditMode.active()，為了拖移排序），SwiftUI 編輯模式下
              // swipeActions 不會出現，改了會讓刪除按不到，所以留著原本的長按選單。
              contextMenu={{
                menuItems: (
                  <>
                    <Section>
                      <Button
                        title={t("刪除", "删除", "Delete")}
                        systemImage={"trash"}
                        role={"destructive"}
                        action={async () => {
                          await handleDelete({
                            username: item.username,
                            token: item.token,
                            avatar: item.avatar,
                          });
                        }}
                      />
                    </Section>
                  </>
                ),
              }}
            >
              {avatars[item.token] || item.avatar ? (
                <Image
                  imageUrl={avatars[item.token] || item.avatar}
                  resizable={true}
                  frame={{ width: 28, height: 28 }}
                  clipShape={"circle"}
                />
              ) : (
                <Image
                  systemName={"person.crop.circle"}
                  font={24}
                  foregroundStyle="secondaryLabel"
                  frame={{ width: 28, height: 28 }}
                />
              )}
              <VStack alignment="leading" spacing={3}><Text fontWeight="semibold">{item.username}</Text></VStack>
            </HStack>
          )}
        />
      )}
    </Section>
      <Section>
        <Button listRowBackground={<ThemeCardBackground />} title={t("添加帳號", "添加账号", "Add Account")} systemImage={"plus.circle.fill"} action={() => showAdd.setValue(!showAdd.value)} />
      </Section>
      {showAdd.value ? (
        <Section title={t("新增帳號", "新增账号", "Add Account")}>
          <TextField listRowBackground={<ThemeCardBackground />} title={t("使用者名稱", "用户名", "Username")} value={usernameValue} prompt={"Github_Username"} />
          <SecureField listRowBackground={<ThemeCardBackground />} title={"Token"} value={tokenValue} prompt={"ghp_xxxxxxxx"} />
          <VStack listRowBackground={<ThemeCardBackground />}><TokenPermissions /></VStack>
          <Button listRowBackground={<ThemeCardBackground />} action={handleAdd} disabled={adding.value}>
            <HStack alignment={"center"}>
              <Image systemName={"checkmark"} foregroundStyle={"green"} />
              <Text foregroundStyle={"green"}>{adding.value ? t("驗證中…", "验证中…", "Verifying…") : t("儲存帳號", "保存账号", "Save Account")}</Text>
            </HStack>
          </Button>
          <Button listRowBackground={<ThemeCardBackground />}
            action={() => {
              usernameValue.setValue("");
              tokenValue.setValue("");
              showAdd.setValue(false);
            }}
          >
            <HStack alignment={"center"}>
              <Image systemName={"xmark"} foregroundStyle={"red"} />
              <Text foregroundStyle={"red"}>{t("取消", "取消", "Cancel")}</Text>
            </HStack>
          </Button>
        </Section>
      ) : null}
    </>
  );
}

function DeleteTraceView() {
  const steps = getDeleteTrace();
  return (
    <Section title={t("刪除流程診斷", "删除流程诊断", "Delete Flow Diagnostics")}>
      <Button
        listRowBackground={<ThemeCardBackground />}
        title={t("查看上次刪除步驟", "查看上次删除步骤", "View last delete steps")}
        systemImage="list.bullet.rectangle"
        action={async () => {
          await Navigation.present(<DeleteTracePage />);
        }}
      />
      <Text listRowBackground={<ThemeCardBackground />} font="footnote" foregroundStyle="secondaryLabel">
        {steps.length > 0
          ? t(`已記錄 ${steps.length} 步，最後一步：${steps[steps.length - 1].step}`, `已记录 ${steps.length} 步，最后一步：${steps[steps.length - 1].step}`, `${steps.length} steps recorded, last: ${steps[steps.length - 1].step}`)
          : t("還沒有記錄。執行一次刪除後再回來看。", "还没有记录。执行一次删除后再回来看。", "No records yet. Run a delete, then come back.")}
      </Text>
    </Section>
  );
}

function DeleteTracePage() {
  const dismiss = Navigation.useDismiss();
  const palette = useThemePalette();
  const [steps, setSteps] = useState(() => getDeleteTrace());
  return (
    <NavigationStack>
      <List
        scrollContentBackground="hidden"
        background={<GlassBackground />}
        tint={palette.accent}
        navigationTitle={t("刪除流程", "删除流程", "Delete Trace")}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarTrailing: <Button title={t("關閉", "关闭", "Close")} action={() => dismiss()} />,
        }}
      >
        <Section>
          <Text listRowBackground={<ThemeCardBackground />} font="footnote">
            {formatDeleteTrace(steps)}
          </Text>
        </Section>
        <Section>
          <Button
            listRowBackground={<ThemeCardBackground />}
            title={t("清除記錄", "清除记录", "Clear trace")}
            systemImage="trash"
            role="destructive"
            foregroundStyle="red"
            action={async () => {
              clearDeleteTrace();
              setSteps([]);
            }}
          />
        </Section>
      </List>
    </NavigationStack>
  );
}

function DisplayView() {
  const value = useObservable<boolean>(loadPrivateGrey());
  // v1.3.9：開關先改待存值，按右上角儲存才寫入；每次打開設定頁都從 Storage
  // 重讀待存值，所以按取消不會把上次沒存的更動帶到下次。
  useEffect(() => {
    pendingDisplayGrey = loadPrivateGrey();
  }, []);
  useEffect(() => {
    pendingDisplayGrey = value.value;
  }, [value.value]);

  return (
    <Section title={t("顯示", "显示", "Display")}>
      <Toggle listRowBackground={<ThemeCardBackground />} title={t("私人 Gist 文字反灰", "私人 Gist 文字变灰", "Dim private Gist text")} value={value} />
      <Text listRowBackground={<ThemeCardBackground />} font="footnote" foregroundStyle="secondaryLabel">
        {t("開啟：私人 Gist 的「標題＆描述」會顯示為灰色\n關閉：私人與公開 Gist 一樣是白色，只用鎖頭區分", "开启：私人 Gist 的「标题＆描述」会显示为灰色\n关闭：私人与公开 Gist 一样是白色，只用锁头区分", "On: private Gists’ titles & descriptions appear grey\nOff: private and public Gists look the same, distinguished only by the lock icon")}
      </Text>
    </Section>
  );
}

function LogStorageView() {
  // v2.0.1：跟顯示那區一樣，每次打開都從 Storage 重讀，取消改過的
  // 記錄位置才不會留到下次打開（以前待存值是模組級的，取消也不會重設，
  // 下次打開還會顯示取消掉的選項，之後按儲存就會把它寫進去）。
  const value = useObservable<string>(Storage.get(LOG_STORAGE_KEY) || "local");
  useEffect(() => {
    pendingLogMode = Storage.get(LOG_STORAGE_KEY) || "local";
  }, []);
  useEffect(() => {
    pendingLogMode = value.value;
  }, [value.value]);

  return (
    <Section title={t("歷史記錄", "历史记录", "Activity Log")}>
      <Picker listRowBackground={<ThemeCardBackground />} title={t("儲存位置", "存储位置", "Storage location")} value={value}>
        <Text tag="local">{t("本地", "本地", "Local")}</Text>
        <Text tag="gist">Gist</Text>
      </Picker>
      <Text listRowBackground={<ThemeCardBackground />} font="footnote" foregroundStyle="secondaryLabel">
        {t("本地：操作記錄僅儲存在設備本地，不限條數。", "本地：操作记录仅保存在设备本地，不限条数。", "Local: activity logs are stored only on this device, with no limit.")}
      </Text>
      <Text listRowBackground={<ThemeCardBackground />} font="footnote" foregroundStyle="secondaryLabel">
        {t("Gist：操作記錄同步到 Scripting.gist.json，最多保留最近 30 條。", "Gist：操作记录同步到 Scripting.gist.json，最多保留最近 30 条。", "Gist: activity logs sync to Scripting.gist.json, keeping only the latest 30 entries.")}
      </Text>
    </Section>
  );
}

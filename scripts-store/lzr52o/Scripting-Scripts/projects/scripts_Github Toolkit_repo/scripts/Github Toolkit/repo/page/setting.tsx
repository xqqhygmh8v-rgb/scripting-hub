import { ThemeCardBackground, useThemePalette } from "../../components/themePalette";
import { AppearanceSection } from "../../components/appearance";
import { REPO_LIST, RepoHeader, RepoSummary, RepoEntry, RepoIcon } from "../../components/repoUI";
import {
  List,
  Navigation,
  NavigationStack,
  Button,
  TextField,
  SecureField,
  Section,
  Text,
  HStack,
  VStack,
  Image,
  ForEach,
  Rectangle,
  Spacer,
  Toggle,
  useEffect,
  useObservable,
  useState,
} from "scripting";
import {
  ACCOUNTS_KEY,
  TOKEN_KEY,
  USERNAME_KEY,
  repo,
} from "../class/repo";
import { t } from "../class/i18n";
import {
  isFollowImportEnabled,
  followImportAccountLabel,
  loadFollowImportAccounts,
  loadFollowImportGlobal,
  saveFollowImportAccounts,
  saveFollowImportGlobal,
} from "../class/followImport";
import { TokenPermissions } from "../../components/tokenPermissions";
import { PAGE_BACKGROUND, CARD_BACKGROUND } from "../../components/theme";
import { GlassBackground, BACKGROUND_THEMES, loadBackgroundTheme, saveBackgroundTheme } from "../../components/glass";
import type { BackgroundThemeId } from "../../components/glass";

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

function saveAccounts(accounts: Account[]) {
  Storage.set(ACCOUNTS_KEY, JSON.stringify(accounts));
}

// v1.50：每列頭像快取，Token -> avatar_url，跟順序無關，
// 跟 Action 的 github_avatars 同一個做法（但 Repository 腳本的 Storage 是獨立的，
// key 名稱一樣也不會跟 Action 互相覆蓋）；Fork 選帳號頁也讀同一個 key。
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

// v1.13：設定改成多帳號，不再是單一使用者名稱 + Token。
// 清單裡點帳號就切換使用中的帳號，+ 添加可以再加一組；
// 切換跟新增都會立刻同步寫回 repo_editor_token，
// 所以清單頁按完成回來就會用新帳號重新載入，不用改瀏覽頁的程式碼。
// 提交作者身分欄已取消：提交時不再送 committer，一律用 GitHub 預設
// （Token 帳號當作者跟提交者），舊的作者名稱/信箱資料會在開啟設定時清除。
export function View() {
  const dismiss = Navigation.useDismiss();
  // 2.0.11：本頁的按鈕強調色改跟背景主題連動。
  const palette = useThemePalette();
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newToken, setNewToken] = useState("");
  const [adding, setAdding] = useState(false);
  // 3.5：收藏頁自動帶入 Follow 倉庫的全域開關（預設開）。
  // 個別帳號的覆寫存在另一個 key，長按帳號列可以切換。
  const [autoImport, setAutoImport] = useState<boolean>(() => loadFollowImportGlobal());
  const [importOverrides, setImportOverrides] = useState<Record<string, boolean>>(() => loadFollowImportAccounts());
  // 1.1.21：背景主題。存在 Storage，選了馬上寫回、這一頁立刻重畫
  //（GlassBackground 每次畫都重讀 Storage）；回清單頁時 repoList 的
  // openSettings 會比對主題有沒有變，變了就重畫，整站跟著換。
  const [bgTheme, setBgTheme] = useState<BackgroundThemeId>(() => loadBackgroundTheme());
  // 1.1.22：背景改選單式。點下面那列跳 Dialog.actionSheet 選主題，
  // 不再把六個選項全部列出來；目前選中的那個前面打 ✓。選了馬上寫回，
  // 這一頁立刻重畫；回清單頁時 repoList 的 openSettings 會比對主題
  // 有沒有變，變了就重畫，整站跟著換。
  async function pickBackgroundTheme() {
    const idx = await Dialog.actionSheet({
      title: t("背景", "背景", "Background"),
      actions: BACKGROUND_THEMES.map((theme) => ({
        label: (theme.id === bgTheme ? "✓ " : "") + t(theme.nameHant, theme.nameHans, theme.nameEn),
      })),
    });
    if (idx === null || idx === undefined) return;
    const theme = BACKGROUND_THEMES[idx];
    if (!theme) return;
    saveBackgroundTheme(theme.id);
    setBgTheme(theme.id);
  }
  // v1.50.14：完成跟 X 都只用 dismiss() 關閉，不再傳值回去。
  // 教訓：這個頁面傳值回去關不掉（v1.50.11 傳 false、v1.50.12～v1.50.13
  // 傳 true 都實測沒反應，只有不傳值的 dismiss() 一定關得掉）；
  // 回來要不要刷新改由清單頁自己比對開頁前後的帳號清單決定，
  // 所以這裡不需要再記 dirty，新增、刪除、拖移本來就會立刻寫 Storage。
  // v1.50：使用者頁，照 Action v1.3.0 起的做法：不再有預設帳號、沒有另外的
  // 刪除區，GitHub 帳號區直接就是帳號列。
  // v1.50.5：排序還原成原本的三行圖標拖移（v1.50.4 的專用排序頁已取消）。
  // List 直接進編輯模式，ForEach 用 editActions="move"，帳號後面就會自動
  // 出現三行線，長按三行線上下拖移，拖完立刻寫回帳號清單。
  // v1.50.4 曾經誤判是編輯模式讓添加帳號按鈕點不動，才改成專用排序頁；
  // 真正的原因是 v1.50.3 加說明卡片時用了 VStack 卻忘了 import，新增區
  // 一要顯示就出錯，按鈕看起來才像沒反應。編輯模式本身不是兇手，
  // v1.50.0 那版按鈕本來就是好的（01:13 那張截圖就是點開新增區拍的）。
  // v1.50.20 曾經誤把整張 Token 權限說明卡片拿掉；你的意思是只去掉
  // 每行文字最後的句號，不是拿掉說明，所以 v1.50.21 把卡片還原了，
  // 只是 repo、workflow、注意三行最後的句號都拿掉，VStack 也加回來。
  // 刪除不用另外一區：長按帳號列叫出選單，點刪除，一樣只跳一次確認。
  // 沒有預設帳號之後，清單第一個帳號就是手動開庫跟其他需要一個 Token 時的
  // 後備帳號；想換後備帳號，把想用的帳號拖到最上面即可。
  // 當前用戶那列不要了（Action v1.4.0 起也是這樣），改成每個帳號列前面
  // 顯示各自的頭像。
  const accountItems = useObservable(
    loadAccounts().map((a) => ({
      id: a.token,
      username: a.username,
      token: a.token,
    })),
  );
  const editMode = useObservable(() => EditMode.active());
  const [avatars, setAvatars] = useState<Record<string, string>>(() => loadAvatarCache());

  // v1.50：不再有「使用中帳號」切換，TOKEN_KEY / USERNAME_KEY 永遠跟著
  // 清單第一個帳號走（手動開庫、瀏覽頁沒帶 Token 時都讀這兩個 key）。
  function syncAccounts(next: Account[]) {
    saveAccounts(next);
    if (next.length > 0) {
      repo.token = next[0].token;
      Storage.set(TOKEN_KEY, next[0].token);
      Storage.set(USERNAME_KEY, next[0].username);
    } else {
      repo.token = "";
      Storage.remove(TOKEN_KEY);
      Storage.remove(USERNAME_KEY);
    }
  }

  // 拖移會直接改寫 accountItems，改寫後推回 accounts 並寫 Storage；
  // 新增／刪除改的是 accounts，改完再回寫 accountItems，兩邊用內容比對擋住迴圈。
  useEffect(() => {
    const next = accounts.map((a) => ({ id: a.token, username: a.username, token: a.token }));
    if (JSON.stringify(next) !== JSON.stringify(accountItems.value)) {
      accountItems.setValue(next);
    }
  }, [accounts]);
  useEffect(() => {
    const next: Account[] = accountItems.value.map((item: any) => ({
      username: item.username,
      token: item.token,
    }));
    if (JSON.stringify(next) !== JSON.stringify(accounts)) {
      setAccounts(next);
      syncAccounts(next);
    }
  }, [accountItems.value]);

  // 每列頭像：快取裡沒有的帳號，用 /user 拉一次 avatar_url 並快取起來；
  // 帳號順序變了不會重拉（用 Token 當 key，跟順序無關），新增帳號時
  // addAccount 裡已經拉過一次，這裡只補還沒快取的。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = loadAvatarCache();
      let changed = false;
      const prevToken = repo.token;
      for (const acc of accounts) {
        if (next[acc.token]) continue;
        try {
          repo.token = acc.token;
          const me = await repo.getUser();
          if (me?.avatar_url) {
            next[acc.token] = me.avatar_url;
            changed = true;
          }
        } catch {}
      }
      repo.token = prevToken;
      if (changed && !cancelled) {
        saveAvatarCache(next);
        setAvatars(next);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accounts]);

  useEffect(() => {
    // 舊版單帳號遷移：清單是空的、但舊 Token 還在時，把舊 Token 變成第一個帳號。
    // 舊版提交作者資料不再使用，順便清除，避免之後又被讀到。
    // v1.50 遷移：舊的當前用戶快取不再使用，順便清除；如果之前選的預設帳號
    // 不是清單第一個，TOKEN_KEY 改成跟第一個帳號走（手動開庫的後備帳號
    // 就會跟著變，想用回舊預設帳號就把它拖到最上面）。
    try {
      Storage.remove("repo_editor_author_name");
      Storage.remove("repo_editor_author_email");
      Storage.remove("repo_editor_current_token");
      Storage.remove("repo_editor_current_username");
      Storage.remove("repo_editor_current_avatar");
    } catch {}
    const current = loadAccounts();
    const legacy = Storage.get<string>(TOKEN_KEY) || "";
    if (current.length === 0 && legacy) {
      const migrated: Account[] = [
        { username: Storage.get<string>(USERNAME_KEY) || t("帳號 1", "账号 1", "Account 1"), token: legacy },
      ];
      saveAccounts(migrated);
      setAccounts(migrated);
    } else if (current.length > 0 && legacy !== current[0].token) {
      Storage.set(TOKEN_KEY, current[0].token);
      Storage.set(USERNAME_KEY, current[0].username);
      repo.token = current[0].token;
    }
  }, []);

  async function addAccount() {
    // v1.49.2：新增帳號改回要填使用者名稱和 Token（跟 Action 一樣），
    // v1.42 只填 Token 的做法取消。
    // v1.49.3：使用者名稱現在真的有驗證作用了：/user 查回來的 login
    // 一定要跟填進來的使用者名稱對得上（大小寫不一樣沒關係，
    // GitHub 使用者名稱不分大小寫），對不上就不新增。
    const trimmedUsername = newUsername.trim();
    const trimmedToken = newToken.trim();
    if (!trimmedUsername || !trimmedToken) {
      await Dialog.alert({
        title: !trimmedUsername && !trimmedToken
          ? t("請先填寫 Username 和 Token", "请先填写 Username 和 Token", "Please enter a Username and Token first")
          : !trimmedUsername
            ? t("請填寫Username", "请填写Username", "Please enter Username")
            : t("請填寫Token", "请填写Token", "Please enter Token"),
        message: t("Username 和 Token 都不能為空", "Username 和 Token 都不能为空", "Username and Token cannot be empty"),
      });
      return;
    }
    // v1.50：拖移是用 Token 當列的 id，同一個 Token 加兩次會讓兩列 id 重複，
    // 所以跟 Action 一樣，先擋掉已經加過的 Token。
    if (accounts.some((a) => a.token === trimmedToken)) {
      await Dialog.alert({ title: t("新增失敗", "新增失败", "Failed to add"), message: t("這個 Token 已經新增過了。", "这个 Token 已经新增过了。", "This Token has already been added.") });
      return;
    }
    setAdding(true);
    const prevToken = repo.token;
    try {
      // 先驗證一次，避免存了無效 Token 才發現。
      // 使用者名稱一定要跟 Token 的帳號對得上，對不上就直接丟錯、不新增。
      repo.token = trimmedToken;
      const me = await repo.getUser();
      if (!me?.login || me.login.toLowerCase() !== trimmedUsername.toLowerCase()) {
        throw new Error(t("Username 跟 Token 的帳號不符\n請檢查 Username 是否正確！", "Username 和 Token 的账号不符\n请检查 Username 是否正确！", "Username does not match the Token's account\nPlease check the Username!"));
      }
      const account: Account = { username: trimmedUsername, token: trimmedToken };
      // v1.50：新帳號只是加到清單最後，不會變成使用中帳號（已經沒有預設帳號了）；
      // 清單是空的、本來就只有這一個時，它自然就是第一個，TOKEN_KEY 會跟著它走。
      if (me?.avatar_url) {
        const nextAvatars = { ...loadAvatarCache(), [trimmedToken]: me.avatar_url };
        saveAvatarCache(nextAvatars);
        setAvatars(nextAvatars);
      }
      const next = [...accounts, account];
      setAccounts(next);
      syncAccounts(next);
      setNewUsername("");
      setNewToken("");
      setShowAdd(false);
    } catch (e: any) {
      repo.token = prevToken;
      await Dialog.alert({ title: t("新增失敗", "新增失败", "Failed to add"), message: String(e?.message || e) });
    }
    setAdding(false);
  }

  function toggleAutoImport(on: boolean) {
    setAutoImport(on);
    saveFollowImportGlobal(on);
  }

  // 2.1.9：全域是主開關。全域關著時全帳號都不帶入，長按帳號的選項就只提示，
  // 不去寫一個永遠不會生效的覆寫。全域開著時，長按就是把這個帳號關掉（寫 false），
  // 再按一次就刪掉覆寫，回去跟全域連動。
  function toggleAccountImport(token: string) {
    if (!loadFollowImportGlobal()) {
      void Dialog.alert({
        title: t("全域已關閉", "全局已关闭", "Disabled globally"),
        message: t("請先打開上方的「收藏自動帶入」，才能個別設定帳號。", "请先打开上方的「收藏自动带入」，才能单独设置账号。", "Turn on “Auto-import favorites” above before setting accounts individually."),
      });
      return;
    }
    const current = isFollowImportEnabled(token);
    const overrides = loadFollowImportAccounts();
    if (current) overrides[token] = false;
    else delete overrides[token];
    saveFollowImportAccounts(overrides);
    setImportOverrides(overrides);
  }

  async function deleteAccountByToken(token: string) {
    const account = accounts.find((a) => a.token === token);
    if (!account) return;
    // 依你的習慣：刪除只跳一次確認，不再跳第二次。
    // v1.50.17：置中確認框沒辦法把按鈕變紅（Dialog.confirm 只有改文字的
    // 選項，沒有顏色/destructive），所以改用 Dialog.actionSheet：內建取消
    // 在左（白色），destructive 動作在右（紅色），跟登出彈窗 v9 實證過的
    // 排版一樣；按確認（index 0）才刪除，按取消或關掉（null）就不動。
    const idx = await Dialog.actionSheet({
      title: t("刪除帳號", "删除账号", "Delete account"),
      message: t(`確定要刪除 "${account.username}" 嗎？\n此操作不可撤銷！`, `确定要删除 "${account.username}" 吗？\n此操作不可撤销！`, `Are you sure you want to delete "${account.username}"?\nThis action cannot be undone!`),
      actions: [{ label: t("確認", "确认", "Confirm"), destructive: true }],
    });
    if (idx !== 0) return;
    const next = accounts.filter((a) => a.token !== token);
    const nextAvatars = loadAvatarCache();
    delete nextAvatars[token];
    saveAvatarCache(nextAvatars);
    setAvatars(nextAvatars);
    setAccounts(next);
    syncAccounts(next);
    // 帳號刪了，它的自動帶入覆寫也留不住，順手清掉。
    const overrides = loadFollowImportAccounts();
    if (overrides[token] !== undefined) {
      const cleaned = { ...overrides };
      delete cleaned[token];
      saveFollowImportAccounts(cleaned);
      setImportOverrides(cleaned);
    }
    // 刪光也不自動關掉：按右上角完成回去，清單頁看到帳號是空的就會顯示提示。
  }

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
          // 使用者頁頂部只留左邊一個返回按鈕，不再有取消 X 跟完成勾；兩顆本來都只是 dismiss()，行為不變。
          topBarLeading: <Button title={t("返回", "返回", "Back")} action={() => dismiss()} />,
        }}
      >
        
        <Section header={<RepoHeader symbol="person.2" title={t("GitHub 帳號", "GitHub 账号", "GitHub Accounts")} />}>
          {accounts.length > 0 ? (
            <ForEach
              data={accountItems}
              editActions={"move"}
              builder={(item: any) => (
                <HStack
                  key={item.id}
                  alignment={"center"}
                  spacing={10}
                  // 2.0.12：拖移排序時原本會多出一層奇怪的顏色。原因是卡片底
                  // 帶透明度（ThemeCardBackground 是半透明 Rectangle），
                  // 拖曳抬起的那列跟下面的佔位列兩層半透明疊在一起就變色。
                  // 這裡改用實色版的卡片底（色值預先混成跟原本一樣的顏色），
                  // 外觀不變，拖曳時也不會再疊出另一層。
                  // 2.1.11：使用者要求帳號這區的底色跟其他卡片完全一樣。之前為了
                  // 拖移時不多疊一層顏色，這裡用實色版（把半透明色預混成主題
                  // 中間色的近似值）；但背景是會慢慢動的漸層，固定實色永遠對不上
                  // 當下的漸層，看起來就是這區塊顏色跟別人不一樣。改回半透明
                  // 卡片底，合成結果就跟其他卡片一致。
                  listRowBackground={<ThemeCardBackground />}
                  // 2.0.5：這處長按刻意不改左滑。這個 List 永久處於編輯模式
                  //（EditMode.active()，為了拖移排序），SwiftUI 編輯模式下
                  // swipeActions 不會出現，改了會讓刪除按不到，所以留著原本的長按選單。
                  contextMenu={{
                    menuItems: (
                      <>
                        <Section>
                          {/* 長按刪除，紅色寫法跟 Action v1.5.3 一樣用 role="destructive"：
                              系統選單會忽略文字顏色，只有破壞性標示才會變紅；
                              role 是不是 Scripting 支援的屬性還沒驗證過，
                              如果忽略，選單還是會顯示預設顏色，到時要再換做法。 */}
                          <Button
                            title={followImportAccountLabel(isFollowImportEnabled(item.token))}
                            systemImage={"square.and.arrow.down"}
                            action={() => toggleAccountImport(item.token)}
                          />
                          <Button title={t("刪除", "删除", "Delete")} systemImage={"trash"} role={"destructive"} action={() => deleteAccountByToken(item.token)} />
                        </Section>
                      </>
                    ),
                  }}
                >
                  {avatars[item.token] ? (
                    <Image
                      imageUrl={avatars[item.token]}
                      resizable={true}
                      frame={{ width: 28, height: 28 }}
                      clipShape={"circle"}
                    />
                  ) : <RepoIcon symbol="person.crop.circle" />}
                  <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                    <Text fontWeight="semibold" lineLimit={1}>{item.username}</Text>

                  </VStack>
                </HStack>
              )}
            />
          ) : (
            <Text listRowBackground={<ThemeCardBackground />} font={"callout"} foregroundStyle={"secondaryLabel"}>
              {t("尚未新增帳號，請按下方添加。", "尚未新增账号，请按下方添加。", "No accounts added yet. Use Add account below.")}
            </Text>
          )}
        </Section>
        <Section>
          <Button listRowBackground={<ThemeCardBackground />}
            title={t("添加帳號", "添加账号", "Add account")}
            systemImage={"plus.circle.fill"}
            action={() => setShowAdd(!showAdd)}
          />
        </Section>
        <Section header={<RepoHeader symbol="square.and.arrow.down" title={t("收藏自動帶入", "收藏自动带入", "Favorites auto-import")} />}>
          <Toggle
            listRowBackground={<ThemeCardBackground />}
            title={t("自動帶入 Follow 的倉庫", "自动带入 Follow 的仓库", "Auto-import followed repositories")}
            value={autoImport}
            onChanged={toggleAutoImport}
            tint={palette.accent}
          />
          <Text listRowBackground={<ThemeCardBackground />} font={"footnote"} foregroundStyle={"secondaryLabel"}>
            {t(
              `進入收藏頁自動帶入 Follow 使用者的倉庫，取消 Follow 後仍保留。長按上方帳號可個別關閉。${Object.keys(importOverrides).length > 0 ? "目前已有個別帳號關閉帶入。" : ""}`,
              `进入收藏页自动带入 Follow 用户的仓库，取消 Follow 后仍保留。长按上方账号可单独关闭。${Object.keys(importOverrides).length > 0 ? "目前已有个别账号关闭带入。" : ""}`,
              `Opening Favorites auto-imports followed users' repositories; they stay after unfollowing. Long-press an account above to exclude it.${Object.keys(importOverrides).length > 0 ? " Some accounts are currently excluded." : ""}`,
            )}
          </Text>
        </Section>
        {showAdd ? (
          <Section header={<RepoHeader symbol="person.badge.plus" title={t("新增帳號", "新增账号", "Add account")} />}>
            <TextField listRowBackground={<ThemeCardBackground />} title={t("使用者名稱", "用户名", "Username")} value={newUsername} onChanged={setNewUsername} prompt={"Github_Username"} />
            <SecureField listRowBackground={<ThemeCardBackground />} title={"Token"} value={newToken} onChanged={setNewToken} prompt={"ghp_xxxxxxxx"} />
            <VStack listRowBackground={<ThemeCardBackground />}><TokenPermissions /></VStack>
            <Button listRowBackground={<ThemeCardBackground />}
              action={addAccount}
              disabled={adding}
            >
              <HStack alignment={"center"}>
                <Image systemName={"checkmark"} foregroundStyle={palette.accent} />
                <Text foregroundStyle={palette.accent}>{adding ? t("驗證中…", "验证中…", "Verifying...") : t("儲存帳號", "保存账号", "Save account")}</Text>
              </HStack>
            </Button>
            <Button listRowBackground={<ThemeCardBackground />}
              action={() => {
                setShowAdd(false);
                setNewUsername("");
                setNewToken("");
              }}
            >
              <HStack alignment={"center"}>
                <Image systemName={"xmark"} foregroundStyle={"red"} />
                <Text foregroundStyle={"red"}>{t("取消", "取消", "Cancel")}</Text>
              </HStack>
            </Button>
          </Section>
        ) : null}
        <Section header={<RepoHeader symbol="signature" title={t("提交身分", "提交身份", "Commit identity")} />}>
          <Text listRowBackground={<ThemeCardBackground />} font={"footnote"} foregroundStyle={"secondaryLabel"}>
            {t(`提交時一律使用原 GitHub 作者身份，\n作者與提交者均為該倉庫所屬帳號；\nFork 時則可自行選擇目標帳號。`, `提交时一律使用原 GitHub 作者身份，\n作者与提交者均为该仓库所属账号；\nFork 时则可自行选择目标账号。`, `Commits always use the original GitHub author identity,\nauthor and committer are both the repository account;\nWhen forking, you can choose the target account yourself.`)}
          </Text>
        </Section>
        <AppearanceSection />
      </List>
    </NavigationStack>
  );
}

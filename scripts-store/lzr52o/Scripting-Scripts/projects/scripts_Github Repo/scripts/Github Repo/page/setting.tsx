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

interface Account {
  username: string;
  token: string;
}

function loadAccounts(): Account[] {
  try {
    const raw = Storage.get(ACCOUNTS_KEY) || "";
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
// 跟 Action 的 github_avatars 同一個做法（但 Repo 腳本的 Storage 是獨立的，
// key 名稱一樣也不會跟 Action 互相覆蓋）；Fork 選帳號頁也讀同一個 key。
const AVATARS_KEY = "repo_editor_avatars";

function loadAvatarCache(): Record<string, string> {
  try {
    const raw = Storage.get(AVATARS_KEY) || "";
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
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newToken, setNewToken] = useState("");
  const [adding, setAdding] = useState(false);
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
    const legacy = Storage.get(TOKEN_KEY) || "";
    if (current.length === 0 && legacy) {
      const migrated: Account[] = [
        { username: Storage.get(USERNAME_KEY) || t("帳號 1", "账号 1", "Account 1"), token: legacy },
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
    // 刪光也不自動關掉：按右上角完成回去，清單頁看到帳號是空的就會顯示提示。
  }

  return (
    <NavigationStack>
      <List
        navigationTitle={t("使用者", "用户", "User")}
        navigationBarTitleDisplayMode={"inline"}
        environments={{ editMode }}
        toolbar={{
          // 使用者頁頂部只留左邊一個返回按鈕，不再有取消 X 跟完成勾；兩顆本來都只是 dismiss()，行為不變。
          topBarLeading: <Button title={t("返回", "返回", "Back")} action={() => dismiss()} />,
        }}
      >
        <Section title={t("GitHub 帳號", "GitHub 账号", "GitHub Accounts")}>
          {accounts.length > 0 ? (
            <ForEach
              data={accountItems}
              editActions={"move"}
              builder={(item: any) => (
                <HStack
                  key={item.id}
                  alignment={"center"}
                  spacing={10}
                  contextMenu={{
                    menuItems: (
                      <>
                        <Section>
                          {/* 長按刪除，紅色寫法跟 Action v1.5.3 一樣用 role="destructive"：
                              系統選單會忽略文字顏色，只有破壞性標示才會變紅；
                              role 是不是 Scripting 支援的屬性還沒驗證過，
                              如果忽略，選單還是會顯示預設顏色，到時要再換做法。 */}
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
                  ) : null}
                  <Text lineLimit={1}>{item.username}</Text>
                </HStack>
              )}
            />
          ) : (
            <Text font={"callout"} foregroundStyle={"secondaryLabel"}>
              {t("尚未新增帳號，請按下方添加。", "尚未新增账号，请按下方添加。", "No accounts added yet. Use Add account below.")}
            </Text>
          )}
        </Section>
        <Section>
          <Button
            title={t("添加帳號", "添加账号", "Add account")}
            systemImage={"plus.circle.fill"}
            action={() => setShowAdd(!showAdd)}
          />
        </Section>
        {showAdd ? (
          <Section title={t("新增帳號", "新增账号", "Add account")}>
            <TextField title={t("使用者名稱", "用户名", "Username")} value={newUsername} onChanged={setNewUsername} prompt={"Github_Username"} />
            <SecureField title={"Token"} value={newToken} onChanged={setNewToken} prompt={"ghp_xxxxxxxx"} />
            <VStack alignment={"leading"}>
              <HStack alignment={"center"}>
                <Image systemName={"lock.shield.fill"} />
                <Text font={"subheadline"}>{t("Token 權限設定", "Token 权限设置", "Token permission settings")}</Text>
              </HStack>
              <Text font={"footnote"}>• repo：{t("存取及修改 Repository", "访问并修改 Repository", "Access and modify repositories")}</Text>
              <Text font={"footnote"}>• workflow：{t("編輯 .github/workflows 目錄內的檔案", "编辑 .github/workflows 目录内的文件", "Edit files under the\n.github/workflows directory")}</Text>
              {/* v2.1.0：瀏覽頁新增刪除倉庫，Token 說明同步補上 delete_repo；
                  上面兩行跟注意那行都不動，只多這一行，結尾一樣不加句號。 */}
              <Text font={"footnote"}>• delete_repo：{t("刪除倉庫", "删除仓库", "Delete repositories")}</Text>
              <Text font={"footnote"} foregroundStyle={"secondaryLabel"}>{t("注意：若缺少所需權限，操作可能會失敗並回傳 403 錯誤", "注意：若缺少所需权限，操作可能会失败并返回 403 错误", "Note: If required permissions are missing,\noperations may fail with a 403 error")}</Text>
            </VStack>
            <Button
              action={addAccount}
              disabled={adding}
            >
              <HStack alignment={"center"}>
                <Image systemName={"checkmark"} foregroundStyle={"green"} />
                <Text foregroundStyle={"green"}>{adding ? t("驗證中…", "验证中…", "Verifying...") : t("儲存帳號", "保存账号", "Save account")}</Text>
              </HStack>
            </Button>
            <Button
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
        <Section>
          <Text font={"footnote"} foregroundStyle={"secondaryLabel"}>
            {t(`提交時一律使用原 GitHub 作者身份，\n作者與提交者均為該倉庫所屬帳號；\nFork 時則可自行選擇目標帳號。`, `提交时一律使用原 GitHub 作者身份，\n作者与提交者均为该仓库所属账号；\nFork 时则可自行选择目标账号。`, `Commits always use the original GitHub author identity,\nauthor and committer are both the repository account;\nWhen forking, you can choose the target account yourself.`)}
          </Text>
        </Section>
      </List>
    </NavigationStack>
  );
}

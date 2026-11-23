import {
  List,
  Navigation,
  NavigationLink,
  Button,
  TextField,
  Section,
  Text,
  Toggle,
  HStack,
  Image,
  Spacer,
  ProgressView,
  useEffect,
  useObservable,
  useState,
} from "scripting";
import { ACCOUNTS_KEY, TOKEN_KEY, USERNAME_KEY, repo, type RepoInfo } from "../class/repo";
import { View as BrowserView } from "./browser";
import { View as SettingView } from "./setting";
import { View as NewRepoView } from "./newRepo";
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

// v1.49：帳號分區的展開/折疊要記住，退出再進來不能又全部展開。
// 存在裝置 Storage 裡（跟 Token、帳號清單同一個地方，存在裝置上不會外傳），
// key 是「帳號#序號」跟畫面上的 id 同一套，沒記過的帳號預設折疊（v1.49.1 起）。
const EXPANDED_KEY = "repo_editor_expanded";

function loadExpanded(): Record<string, boolean> {
  try {
    const raw = Storage.get(EXPANDED_KEY) || "";
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

// v1.15：清單頁改成多帳號分區。
// 標題改成 Github Repo；右上角順序換成重新整理在左、設定在右。
// 每個帳號各有一個折疊標題列，左邊是「帳號's 倉庫」，
// 右邊是箭頭（朝下是收起、朝上是展開），每個帳號的開合是分開記的，
// 點 A 帳號的標題不會把 B 帳號也收起來。
// 倉庫是用該帳號自己的 Token 抓的，點進去瀏覽時瀏覽頁也會用那個帳號的 Token，
// 不會因為使用中帳號不同就開錯或寫錯帳號；回到清單後使用中帳號不變。
export function View() {
  const dismiss = Navigation.useDismiss();
  const reposMap = useObservable<Record<string, RepoInfo[]> | undefined>(undefined);
  const errorsMap = useObservable<Record<string, string>>({});
  const [owner, setOwner] = useState("");
  const [repoName, setRepoName] = useState("");
  const [branch, setBranch] = useState("");
  // v1.46：手動開啟主標題改為「查詢其他用戶倉庫」，仍沒有小標題，預設關閉。
  // 之前 v1.36 的「其他用戶倉庫」小標 + 「查詢」開關已拿掉，只剩這一列。
  // 開關用已驗證的 Toggle + observable 寫法（跟公開開關、Gist 公開開關相同），
  // 開啟後才顯示原本的手動欄位與手動倉庫選項；關掉再開啟，輸入的值會保留。
  const showManual = useObservable(false);
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  // key 是「帳號#序號」，同名帳號也不會互相影響開合。
  // v1.49：初始值直接從 Storage 讀上次記住的開合，之前沒記過的才預設展開。
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => loadExpanded());
  // v1.17：手動只填擁有者時，顯示該用戶的公開倉庫。
  // 不在每打一個字就去抓 API，點標題展開時才抓一次；
  // v1.38 起擁有者改了會停手 800ms 後自動重抓，v1.39 起不再有手動載入按鈕。
  const [manualUserExpanded, setManualUserExpanded] = useState(false);
  const [manualUserRepos, setManualUserRepos] = useState<RepoInfo[] | null>(null);
  const [manualUserError, setManualUserError] = useState("");
  const [manualUserLoading, setManualUserLoading] = useState(false);
  const [manualUserLoadedFor, setManualUserLoadedFor] = useState("");

  async function loadManualUserRepos(username: string) {
    setManualUserLoading(true);
    setManualUserError("");
    try {
      const list = await repo.listUserRepos(username);
      setManualUserRepos(list);
      setManualUserLoadedFor(username);
    } catch (e: any) {
      setManualUserRepos([]);
      const msg = String(e?.message || e);
      setManualUserError(
        msg.includes("404")
          ? t(`找不到用戶「${username}」，請檢查用戶名是否正確。`, `找不到用户「${username}」，请检查用户名是否正确。`, `User “${username}” not found. Please check the username.`)
          : t(`載入失敗：${msg}`, `载入失败：${msg}`, `Failed to load: ${msg}`),
      );
      // v1.37：載入失敗也要把 loadedFor 記成這次要查的用戶名，否則展開區會先
      // 走「用戶名已變更，請重新載入」那一支，把真正的失敗原因蓋掉。
      setManualUserLoadedFor(username);
    }
    setManualUserLoading(false);
  }

  async function init() {
    if (!Storage.get(TOKEN_KEY) && loadAccounts().length === 0) {
      await Navigation.present(<SettingView />);
      if (!Storage.get(TOKEN_KEY) && loadAccounts().length === 0) {
        reposMap.setValue({});
        return;
      }
      repo.token = Storage.get(TOKEN_KEY) || "";
    }
    let list = loadAccounts();
    // 舊版只有單一 Token、還沒進過新版設定時，把舊 Token 當成一個帳號來顯示。
    if (list.length === 0 && Storage.get(TOKEN_KEY)) {
      let username = Storage.get(USERNAME_KEY) || "";
      if (!username) {
        try {
          const me = await repo.getUser();
          if (me.login) {
            username = me.login;
            Storage.set(USERNAME_KEY, me.login);
          }
        } catch {}
      }
      list = [{ username: username || "我的帳號", token: Storage.get(TOKEN_KEY) || "" }];
    }
    setAccounts(list);
    // v1.49.1：預設改成折疊，第一次開只看到帳號標題，要看再點開。
    // 已經在 Storage 記過開合的帳號不會被這裡蓋掉，prev 裡有值就保留，
    // 所以之前手動點開過的，之後進來還是會照你上次的樣子展開。
    setExpanded((prev) => {
      const next = { ...prev };
      list.forEach((a, i) => {
        const id = `${a.username}#${i}`;
        if (next[id] === undefined) next[id] = false;
      });
      return next;
    });
    const nextRepos: Record<string, RepoInfo[]> = {};
    const nextErrors: Record<string, string> = {};
    // 循序抓，避免 listReposForToken 換 Token 時互相打架。
    for (let i = 0; i < list.length; i++) {
      const id = `${list[i].username}#${i}`;
      try {
        nextRepos[id] = await repo.listReposForToken(list[i].token);
      } catch (e: any) {
        nextRepos[id] = [];
        nextErrors[id] = t(`載入失敗：${String(e?.message || e)}`, `载入失败：${String(e?.message || e)}`, `Failed to load: ${String(e?.message || e)}`);
      }
    }
    reposMap.setValue(nextRepos);
    errorsMap.setValue(nextErrors);
    // 抓完把 Token 換回使用中帳號，不要因為抓清單就改了使用中帳號。
    repo.token = Storage.get(TOKEN_KEY) || "";
  }

  // v1.25：瀏覽頁返回時自動刷新用。瀏覽頁關掉時才叫，瀏覽頁還在時不叫，
  // 所以不會在瀏覽頁裡打斷 Token；叫的時候清單先回到載入中，再重新抓各帳號。
  async function handleListDirty() {
    reposMap.setValue(undefined);
    await init();
  }

  // v1.47：從帳號分區標題的長按選單新增倉庫。新增頁成功才回傳 true，
  // 回來後清單先回到載入中再重抓，這樣新倉庫才會出現在該帳號分區裡。
  async function createRepoForAccount(account: Account) {
    const r = await Navigation.present(<NewRepoView account={account} />);
    if (r) {
      reposMap.setValue(undefined);
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
      title: t("重新命名倉庫", "重新命名仓库", "Rename repository"),
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
      title: t("重新命名倉庫", "重新命名仓库", "Rename repository"),
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
      reposMap.setValue(undefined);
      await init();
    } catch (e: any) {
      await Dialog.alert({ title: t("失敗", "失败", "Failed"), message: String(e?.message || e) });
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
    const before = Storage.get(ACCOUNTS_KEY) || "";
    await Navigation.present(<SettingView />);
    const after = Storage.get(ACCOUNTS_KEY) || "";
    if (after !== before) {
      repo.token = Storage.get(TOKEN_KEY) || "";
      reposMap.setValue(undefined);
      await init();
    }
  }

  useEffect(() => {
    repo.token = Storage.get(TOKEN_KEY) || "";
    init();
  }, []);

  // v1.38：擁有者改了就自動刷新，不用再手動點載入。
  // 不在每打一個字就抓 API：等停手 800ms 後才抓一次，停手前改字會把舊計時清掉；
  // 抓完 loadedFor 變成新用戶名，效果就不會再觸發，不會無限循環。
  useEffect(() => {
    if (!showManual.value) return;
    if (!manualUserExpanded) return;
    const name = owner.trim();
    if (!name || repoName.trim()) return;
    if (manualUserLoadedFor.toLowerCase() === name.toLowerCase()) return;
    if (manualUserLoading) return;
    const timer = setTimeout(() => {
      loadManualUserRepos(name);
    }, 800);
    return () => clearTimeout(timer);
  }, [owner, repoName, showManual.value, manualUserExpanded, manualUserLoadedFor, manualUserLoading]);

  if (reposMap.value === undefined) return <ProgressView title={t("載入中", "载入中", "Loading...")} />;

  return (
    <List
      navigationTitle={"Github Repo"}
      navigationBarTitleDisplayMode={"inline"}
      toolbar={{
        topBarLeading: [
          <Button title={t("退出", "退出", "Close")} systemImage={"xmark"} action={dismiss} />,
        ],
        topBarTrailing: [
          <Button
            title={t("重新整理", "重新整理", "Refresh")}
            systemImage={"arrow.clockwise"}
            action={async () => {
              reposMap.setValue(undefined);
              await init();
            }}
          />,
          <Button title={t("使用者", "用户", "User")} systemImage={"person.crop.circle"} action={openSettings} />,
        ],
      }}
    >
      {accounts.length === 0 ? (
        <Section>
          <Text font={"callout"} foregroundStyle={"secondaryLabel"}>
            {t("尚未新增帳號，請先到使用者添加帳號。", "尚未新增账号，请先到用户添加账号。", "No account added yet. Please add an account on the User page first.")}
          </Text>
        </Section>
      ) : (
        accounts.map((account, idx) => {
          const id = `${account.username}#${idx}`;
          // v1.49.1：預設折疊，所以只有明確記成 true 才算展開，
          // 沒記過（undefined）跟記成 false 都算折疊。
          const isOpen = expanded[id] === true;
          const list = reposMap.value?.[id] || [];
          const err = errorsMap.value[id] || "";
          const title =
            account.username && account.username !== "我的帳號"
              ? t(`${account.username}'s 倉庫`, `${account.username}'s 仓库`, `${account.username}'s Repos`)
              : t("我的倉庫", "我的仓库", "My Repositories");
          return (
            <Section key={id}>
              <Button
                contextMenu={{
                  menuItems: (
                    <>
                      <Section>
                        <Button
                          title={t("新增倉庫", "新增仓库", "Create repository")}
                          systemImage={"plus"}
                          action={async () => {
                            await createRepoForAccount(account);
                          }}
                        />
                      </Section>
                    </>
                  ),
                }}
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
                <HStack>
                  <Text>{title}</Text>
                  <Spacer />
                  <Image systemName={isOpen ? "chevron.up" : "chevron.down"} />
                </HStack>
              </Button>
              {isOpen ? (
                <>
                  {err ? (
                    <Text foregroundStyle={"secondaryLabel"}>{err}</Text>
                  ) : null}
                  {list.length === 0 && !err ? (
                    <Text font={"callout"} foregroundStyle={"secondaryLabel"}>
                      {t("尚無倉庫，或 Token 沒有讀取權限，請先到使用者檢查。", "尚无仓库，或 Token 没有读取权限，请先到用户检查。", "No repositories, or the Token has no read permission. Please check on the User page.")}
                    </Text>
                  ) : (
                    list.map((r) => (
                      <NavigationLink
                        key={r.full_name}
                        foregroundStyle={r.private ? "secondaryLabel" : undefined}
                        destination={
                          <BrowserView
                            owner={r.full_name.split("/")[0]}
                            repo={r.full_name.split("/")[1]}
                            branch={r.default_branch}
                            path={""}
                            isPrivate={r.private}
                            accountToken={account.token}
                            accountUsername={account.username}
                            onListDirty={handleListDirty}
                          />
                        }
                      >
                        <HStack
                          alignment={"center"}
                          contextMenu={{
                            menuItems: (
                              <>
                                <Section>
                                  <Button
                                    title={t("重新命名倉庫", "重新命名仓库", "Rename repository")}
                                    systemImage={"pencil"}
                                    action={async () => await renameRepoForAccount(account, r)}
                                  />
                                </Section>
                              </>
                            ),
                          }}
                        >
                          <Text lineLimit={1}>{r.full_name}</Text>
                          {r.private ? (
                            <Image
                              systemName={"lock.fill"}
                              imageScale={"small"}
                              foregroundStyle={"tertiaryLabel"}
                            />
                          ) : null}
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
      {/* v1.38：查詢其他用戶倉庫板塊固定在清單最底部，帳號分區在前，它在後。v1.45：小標題已拿掉，主標題就是下面這列開關。 */}
      <Section>
        <Toggle title={t("查詢其他用戶倉庫", "查询其他用户仓库", "Search other users' repositories")} value={showManual} />
        {showManual.value ? (
          <>
            <TextField title={t("用戶名", "用户名", "Username")} value={owner} onChanged={setOwner} prompt={t("用戶名", "用户名", "Username")} />
            <TextField title={t("倉庫名", "仓库名", "Repository name")} value={repoName} onChanged={setRepoName} prompt={t("倉庫名", "仓库名", "Repository name")} />
            <TextField title={t("分支（留空則使用預設分支）", "分支（留空则使用默认分支）", "Branch (leave blank for the default branch)")} value={branch} onChanged={setBranch} prompt={t("分支（留空則使用預設分支）", "分支（留空则使用默认分支）", "Branch (leave blank for the default branch)")} />
            <Text font={"footnote"} foregroundStyle={"secondaryLabel"}>
              {t("只填用戶名時，會顯示該用戶的所有公開倉庫。", "只填用户名时，会显示该用户的所有公开仓库。", "If you only enter a username, that user's public repositories will be shown.")}
            </Text>
          </>
        ) : null}
      </Section>
      {showManual.value ? (
        <>
          {owner.trim() && repoName.trim() ? (
            <Section>
              <NavigationLink
                title={`${owner.trim()}/${repoName.trim()}`}
                destination={
                  <BrowserView owner={owner.trim()} repo={repoName.trim()} branch={branch.trim()} path={""} onListDirty={handleListDirty} />
                }
              />
            </Section>
          ) : null}
          {owner.trim() && !repoName.trim() ? (
            <Section>
              <Button
                action={async () => {
                  const nextOpen = !manualUserExpanded;
                  setManualUserExpanded(nextOpen);
                  // v1.37：GitHub 用戶名不分大小寫，大小寫不同也視為同一個人，
                  // 之前用嚴格相等比對，大小寫一改就誤判成「已變更」，才出現截圖那個提示。
                  if (nextOpen && (manualUserLoadedFor.toLowerCase() !== owner.trim().toLowerCase() || manualUserRepos === null)) {
                    await loadManualUserRepos(owner.trim());
                  }
                }}
              >
                <HStack>
                  <Text>{t(`${owner.trim()}'s 倉庫`, `${owner.trim()}'s 仓库`, `${owner.trim()}'s Repos`)}</Text>
                  <Spacer />
                  <Image systemName={manualUserExpanded ? "chevron.up" : "chevron.down"} />
                </HStack>
              </Button>
              {manualUserExpanded ? (
                manualUserLoading ? (
                  <Text font={"callout"} foregroundStyle={"secondaryLabel"}>
                    {t("載入中…", "载入中…", "Loading...")}
                  </Text>
                ) : manualUserLoadedFor.toLowerCase() !== owner.trim().toLowerCase() ? (
                  <Text font={"callout"} foregroundStyle={"secondaryLabel"}>
                    {t("用戶名已變更，請重新載入。", "用户名已变更，请重新载入。", "Username changed. Please reload.")}
                  </Text>
                ) : manualUserError ? (
                  <Text foregroundStyle={"secondaryLabel"}>{manualUserError}</Text>
                ) : !manualUserRepos || manualUserRepos.length === 0 ? (
                  <Text font={"callout"} foregroundStyle={"secondaryLabel"}>
                    {t("這個用戶沒有公開倉庫。", "这个用户没有公开仓库。", "This user has no public repositories.")}
                  </Text>
                ) : (
                  manualUserRepos.map((r) => (
                    <NavigationLink
                      key={r.full_name}
                      title={r.full_name}
                      destination={
                        <BrowserView
                          owner={r.full_name.split("/")[0]}
                          repo={r.full_name.split("/")[1]}
                          branch={r.default_branch}
                          path={""}
                          isPrivate={r.private}
                          onListDirty={handleListDirty}
                        />
                      }
                    />
                  ))
                )
              ) : null}
            </Section>
          ) : null}
        </>
      ) : null}
    </List>
  );
}

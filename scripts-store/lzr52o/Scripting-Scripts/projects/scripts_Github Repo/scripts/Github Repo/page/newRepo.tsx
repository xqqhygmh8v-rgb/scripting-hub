import {
  Button,
  HStack,
  List,
  Navigation,
  NavigationStack,
  ProgressView,
  Section,
  Text,
  TextField,
  Toggle,
  useObservable,
  useState,
} from "scripting";
import { repo } from "../class/repo";
import { t } from "../class/i18n";

// v1.47：新增倉庫頁。從清單頁帳號分區標題的長按選單進來，
// 倉庫會建立在傳進來的那個帳號下，不是只用使用中帳號。
// 公開開關跟瀏覽頁同一個寫法：開是公開、關是私人，預設關（私人）比較安全；
// 新增的倉庫一開始是空的，沒有 README，之後再用瀏覽頁上傳或新增檔案。
// 成功才 dismiss(true) 讓清單刷新，失敗不關頁面，讓使用者改完名稱再試。
export function View({ account }: { account: { username: string; token: string } }) {
  const dismiss = Navigation.useDismiss();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const publicValue = useObservable(false);
  const creating = useObservable(false);

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      await Dialog.alert({ title: t("請輸入倉庫名稱", "请输入仓库名称", "Enter a repository name"), message: t("倉庫名稱不能為空。", "仓库名称不能为空。", "Repository name cannot be empty.") });
      return;
    }
    if (/\s/.test(trimmedName)) {
      await Dialog.alert({ title: t("名稱格式不對", "名称格式不对", "Invalid name"), message: t("倉庫名稱不能包含空格，請改用 - 或 _ 連接。", "仓库名称不能包含空格，请改用 - 或 _ 连接。", "Repository names cannot contain spaces. Use - or _ instead.") });
      return;
    }
    creating.setValue(true);
    try {
      const created = await repo.createRepoForToken(account.token, {
        name: trimmedName,
        isPrivate: !publicValue.value,
        description: description.trim(),
      });
      const fullName = created?.full_name || `${account.username}/${trimmedName}`;
      await Dialog.alert({ title: t("完成", "完成", "Done"), message: t(`已新增 "${fullName}"`, `已新增 "${fullName}"`, `Created "${fullName}".`) });
      dismiss(true);
    } catch (e: any) {
      await Dialog.alert({ title: t("新增失敗", "新增失败", "Failed to create"), message: String(e?.message || e) });
    } finally {
      creating.setValue(false);
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle={t("新增倉庫", "新增仓库", "Create repository")}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarLeading: [<Button title={t("取消", "取消", "Cancel")} systemImage={"xmark"} action={() => dismiss()} />],
        }}
      >
        <Section title={t("帳號", "账号", "Account")}>
          <Text>{account.username}</Text>
          <Text font={"footnote"} foregroundStyle={"secondaryLabel"}>
            {t("新增的倉庫會建立在這個帳號下。", "新增的仓库会建立在这个账号下。", "The new repository will be created under this account.")}
          </Text>
        </Section>
        <Section title={t("倉庫資訊", "仓库信息", "Repository information")}>
          <TextField title={t("倉庫名稱", "仓库名称", "Repository name")} value={name} onChanged={setName} prompt={t("倉庫名稱", "仓库名称", "Repository name")} />
          <TextField title={t("描述", "描述", "Description")} value={description} onChanged={setDescription} prompt={t("描述（可留空）", "描述（可留空）", "Description (optional)")} />
          <Toggle title={t("公開", "公开", "Public")} value={publicValue} />
          <Text font={"footnote"} foregroundStyle={"secondaryLabel"}>
            {t("公開開關關著就是私人倉庫。倉庫名稱不能有空格，同一個帳號下不能重複。", "公开开关关着就是私人仓库。仓库名称不能有空格，同一个账号下不能重复。", "With the Public switch off, the repository is private. Repository names cannot contain spaces and must be unique under the same account.")}
          </Text>
        </Section>
        <Section>
          {creating.value ? (
            // 2026-11-05 回饋：新增中不要放在旋轉動畫下面，改放在右邊。
            // ProgressView 不帶 title 就只顯示旋轉動畫，文字用 Text 放右邊，
            // 兩顆放同一個 HStack 就是同一行。
            // 2026-11-05 回饋：新增中改綠字，並且跟下面「新增倉庫」那行
            // 文字對齊。下面那顆是 Button（圖標＋文字），圖標跟文字的
            // 間距比 HStack 預設寬，所以這裡間距用 20（跟詳情頁圖標列
            // 一樣），讓新增中文字的左邊跟下面新增倉庫文字的左邊對齊。
            <HStack spacing={20}>
              <ProgressView />
              <Text foregroundStyle={"green"}>{t("新增中", "新增中", "Creating...")}</Text>
            </HStack>
          ) : null}
          <Button
            title={t("新增倉庫", "新增仓库", "Create repository")}
            systemImage={"plus"}
            disabled={creating.value}
            action={handleCreate}
          />
          <Text font={"footnote"} foregroundStyle={"secondaryLabel"}>
            {t("新增的倉庫一開始是空的，沒有 README，之後可以在倉庫裡上傳或新增檔案。", "新增的仓库一开始是空的，没有 README，之后可以在仓库里上传或新增文件。", "The new repository starts empty, with no README. You can upload or create files in it later.")}
          </Text>
        </Section>
      </List>
    </NavigationStack>
  );
}

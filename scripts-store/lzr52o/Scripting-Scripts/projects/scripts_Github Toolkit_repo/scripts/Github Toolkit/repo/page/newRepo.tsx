import { ThemeCardBackground, useThemePalette } from "../../components/themePalette";
import { REPO_LIST, RepoHeader, RepoSummary, RepoEntry, RepoIcon } from "../../components/repoUI";
import {
  Button,
  List,
  Navigation,
  NavigationStack,
  ProgressView,
  Rectangle,
  Section,
  Text,
  TextField,
  Toggle,
  useObservable,
  useState,
} from "scripting";
import { repo } from "../class/repo";
import { t } from "../class/i18n";
import { PAGE_BACKGROUND, CARD_BACKGROUND } from "../../components/theme";
import { GlassBackground } from "../../components/glass";

// v1.47：新增倉庫頁。從清單頁帳號分區標題左滑進來（2.0.28 之前是長按選單），
// 倉庫會建立在傳進來的那個帳號下，不是只用使用中帳號。
// 公開開關跟瀏覽頁同一個寫法：開是公開、關是私人，預設關（私人）比較安全；
// 新增的倉庫一開始是空的，沒有 README，之後再用瀏覽頁上傳或新增檔案。
// 成功才 dismiss(true) 讓清單刷新，失敗不關頁面，讓使用者改完名稱再試。
export function View({ account }: { account: { username: string; token: string } }) {
  const dismiss = Navigation.useDismiss();
  // 2.0.11：這頁的強調色跟背景主題連動。
  const palette = useThemePalette();
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
      <List {...REPO_LIST}
      tint={palette.accent}
      scrollContentBackground="hidden"
      background={<GlassBackground />}

        navigationTitle={t("新增倉庫", "新增仓库", "Create repository")}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          topBarLeading: [<Button title={t("取消", "取消", "Cancel")} systemImage={"xmark"} action={() => dismiss()} />],
          // 2.0.29：右上角加一個按鈕；2.0.31 下面那列「新增倉庫」
          // 拿掉了，右上角是唯一的送出按鈕。2.0.32 圖標改資料夾＋
          //（folder.badge.plus），Kristen 選的；新增中時右上角直接轉
          // 圈圈，不再下面顯示「新增中」文字。2.0.33 圖標改回打勾
          //（checkmark）：裝置上看了資料夾＋，還是打勾好。
          topBarTrailing: creating.value
            ? [<ProgressView tint={palette.accent} />]
            : [<Button title={t("新增倉庫", "新增仓库", "Create repository")} systemImage={"checkmark"} action={handleCreate} />],
        }}
      >
        <Section header={<RepoHeader symbol="person.crop.circle" title={t("帳號", "账号", "Account")} />}>
          <RepoSummary symbol="person.crop.circle" title={account.username} subtitle={t("倉庫擁有者", "仓库所有者", "Repository owner")} />
          <Text listRowBackground={<ThemeCardBackground />} font={"footnote"} foregroundStyle={"secondaryLabel"}>
            {t("新增的倉庫會建立在這個帳號下。", "新增的仓库会建立在这个账号下。", "The new repository will be created under this account.")}
          </Text>
        </Section>
        <Section header={<RepoHeader symbol="shippingbox" title={t("倉庫資訊", "仓库信息", "Repository information")} />}>
          <TextField listRowBackground={<ThemeCardBackground />} title={t("倉庫名稱", "仓库名称", "Repository name")} value={name} onChanged={setName} prompt={t("倉庫名稱", "仓库名称", "Repository name")} />
          <TextField listRowBackground={<ThemeCardBackground />} title={t("描述", "描述", "Description")} value={description} onChanged={setDescription} prompt={t("描述（可留空）", "描述（可留空）", "Description (optional)")} />
          <Toggle listRowBackground={<ThemeCardBackground />} title={t("公開", "公开", "Public")} value={publicValue} />
          <Text listRowBackground={<ThemeCardBackground />} font={"footnote"} foregroundStyle={"secondaryLabel"}>
            {t("公開開關關著就是私人倉庫。倉庫名稱不能有空格，同一個帳號下不能重複。", "公开开关关着就是私人仓库。仓库名称不能有空格，同一个账号下不能重复。", "With the Public switch off, the repository is private. Repository names cannot contain spaces and must be unique under the same account.")}
          </Text>
        </Section>
        <Section>
          <Text listRowBackground={<ThemeCardBackground />} font={"footnote"} foregroundStyle={"secondaryLabel"}>
            {t("新增的倉庫一開始是空的，沒有 README，之後可以在倉庫裡上傳或新增檔案。", "新增的仓库一开始是空的，没有 README，之后可以在仓库里上传或新增文件。", "The new repository starts empty, with no README. You can upload or create files in it later.")}
          </Text>
        </Section>
      </List>
    </NavigationStack>
  );
}

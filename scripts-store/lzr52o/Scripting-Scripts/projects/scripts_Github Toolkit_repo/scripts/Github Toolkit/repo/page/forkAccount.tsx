import { ThemeCardBackground, useThemePalette } from "../../components/themePalette";
import { REPO_LIST, RepoHeader, RepoSummary, RepoEntry, RepoIcon } from "../../components/repoUI";
import {
  List,
  Navigation,
  NavigationStack,
  Button,
  Section,
  Text,
  HStack,
  Image,
  Spacer,
  Rectangle,
} from "scripting";
import { t } from "../class/i18n";
import { PAGE_BACKGROUND, CARD_BACKGROUND } from "../../components/theme";
import { GlassBackground } from "../../components/glass";

interface Account {
  username: string;
  token: string;
}

// v1.50：Fork 選帳號頁。瀏覽頁點 Fork 後先到這裡，點哪個帳號就把那個帳號
// 回傳給瀏覽頁，瀏覽頁再跳一次確認、用那個帳號的 Token 去 Fork。
// 頭像讀使用者頁同一張快取（repo_editor_avatars），還沒快取的帳號就顯示
// 預設的用戶圖示，不會為了選帳號多打一次 /user。
// 右上角 X 是取消，回傳空值，瀏覽頁就不 Fork。
function loadAvatarCache(): Record<string, string> {
  try {
    const raw = Storage.get("repo_editor_avatars") || "";
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

export function View({ accounts }: { accounts: Account[] }) {
  const dismiss = Navigation.useDismiss();
  // 2.0.11：本頁強調色跟背景主題連動。
  const palette = useThemePalette();
  const avatars = loadAvatarCache();

  return (
    <NavigationStack>
      <List {...REPO_LIST}
      tint={palette.accent}
      scrollContentBackground="hidden"
      background={<GlassBackground />}

        navigationTitle={t("選擇 Fork 帳號", "选择 Fork 账号", "Choose account to fork to")}
        navigationBarTitleDisplayMode={"inline"}
        toolbar={{
          cancellationAction: [<Button title={t("取消", "取消", "Cancel")} systemImage={"xmark"} action={() => dismiss()} />],
        }}
      >
        <Section header={<RepoHeader symbol="person.2" title={t("目標帳號", "目标账号", "Destination account")} />}>
          {accounts.map((a) => (
            <Button listRowBackground={<ThemeCardBackground />}
              key={a.token}
              action={() => dismiss(a)}
            >
              <HStack alignment={"center"} spacing={10}>
                {avatars[a.token] ? (
                  <Image
                    imageUrl={avatars[a.token]}
                    resizable={true}
                    frame={{ width: 28, height: 28 }}
                    clipShape={"circle"}
                  />
                ) : (
                  <Image systemName={"person.crop.circle"} frame={{ width: 28, height: 28 }} foregroundStyle={"#8e8e93"} />
                )}
                <RepoEntry symbol="arrow.triangle.branch" title={a.username} subtitle={t("將 Fork 建立於此帳號", "将 Fork 建立于此账号", "Create the fork under this account")} />
                <Spacer />
                <Image systemName={"chevron.right"} foregroundStyle={"#8e8e93"} />
              </HStack>
            </Button>
          ))}
        </Section>
      </List>
    </NavigationStack>
  );
}

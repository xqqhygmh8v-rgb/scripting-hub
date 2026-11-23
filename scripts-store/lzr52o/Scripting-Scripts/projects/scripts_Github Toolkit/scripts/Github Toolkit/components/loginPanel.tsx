import { ScrollView, VStack, HStack, Text, Image, TextField, SecureField, Button, Link, Spacer } from "scripting";
import { GlassBackground } from "./glass";
import { useThemePalette } from "./themePalette";
import { t } from "./i18n";

export function LoginPanel({ username, token, loading, error, setUsername, setToken, onLogin }: {
  username: string; token: string; loading: boolean; error: string;
  setUsername: (value: string) => void; setToken: (value: string) => void; onLogin: () => void;
}) {
  const { accent, muted, card } = useThemePalette();
  return <ScrollView background={<GlassBackground />}>
    <VStack alignment="leading" spacing={18} padding={{ horizontal: 26, top: 20, bottom: 36 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack><Text font={10} monospaced kerning={2} foregroundStyle={accent}>{t("GITHUB / 控制中心", "GITHUB / 控制中心", "GITHUB / CONTROL CENTER")}</Text><Spacer /><Text font={10} monospaced foregroundStyle={muted}>V.02</Text></HStack>
      <VStack alignment="leading" spacing={10}>
        <HStack spacing={12}>
          <Image systemName="square.stack.3d.up.fill" font={24} foregroundStyle={accent} frame={{ width: 52, height: 52 }} background={{ style: card, shape: { type: "rect", cornerRadius: 24 } }} />
          <Text font={28} fontWeight="bold" lineLimit={1} minScaleFactor={0.7} frame={{ maxWidth: "infinity", alignment: "leading" }} foregroundStyle={{ light: "#122B42", dark: "#EAF5FF" }}>GitHub Toolkit</Text>
        </HStack>
        <Text font={16} foregroundStyle={muted}>{t("你的 GitHub，盡在掌握。", "你的 GitHub，尽在掌握。", "Your GitHub, under control.")}</Text>
        <HStack spacing={14} foregroundStyle={accent} font={10} monospaced><Text>{t("倉庫", "仓库", "REPOSITORY")}</Text><Text>/</Text><Text>{t("程式片段", "代码片段", "GIST")}</Text><Text>/</Text><Text>{t("工作流程", "工作流", "ACTIONS")}</Text></HStack>
      </VStack>
      <VStack alignment="leading" spacing={16} padding={20} frame={{ maxWidth: "infinity", alignment: "leading" }} background={{ style: card, shape: { type: "rect", cornerRadius: 24 } }}>
        <Text font={11} monospaced foregroundStyle={accent}>{t("連結帳號", "连接账号", "CONNECT ACCOUNT")}</Text>
        <Text font={23} fontWeight="bold">{t("連結你的工作空間", "连接你的工作空间", "Connect your workspace")}</Text>
        <VStack alignment="leading" spacing={8}>
          <Text font={12} foregroundStyle={muted}>{t("GitHub 使用者名稱", "GitHub 用户名", "GitHub username")}</Text>
          <TextField title={t("使用者名稱", "用户名", "Username")} value={username} onChanged={setUsername} prompt={t("使用者名稱", "用户名", "Username")} textInputAutocapitalization="never" autocorrectionDisabled textFieldStyle="roundedBorder" />
        </VStack>
        <VStack alignment="leading" spacing={8}>
          <Text font={12} foregroundStyle={muted}>Personal Access Token</Text>
          <SecureField title="Token" value={token} onChanged={setToken} prompt="ghp_••••••••" textFieldStyle="roundedBorder" />
        </VStack>
        {error ? <Text font={12} foregroundStyle="#FF6868">{error}</Text> : null}
        <Button action={onLogin} disabled={loading} buttonStyle="plain" frame={{ maxWidth: "infinity" }}>
          <HStack padding={14} foregroundStyle="#062A38" background={{ style: accent, shape: { type: "rect", cornerRadius: 14 } }}><Text font={15} fontWeight="semibold">{loading ? t("正在驗證…", "正在验证…", "Verifying…") : t("連結帳號", "连接账号", "Login")}</Text><Spacer /><Image systemName="arrow.up.right" /></HStack>
        </Button>
      </VStack>
      <VStack alignment="leading" spacing={12}>
        <HStack spacing={8}><Image systemName="lock.shield" foregroundStyle={accent} /><Text font={12} fontWeight="semibold">{t("存取權限", "访问权限", "Access permissions")}</Text></HStack>
        <VStack alignment="leading" spacing={12} padding={14} frame={{ maxWidth: "infinity", alignment: "leading" }} background={{ style: card, shape: { type: "rect", cornerRadius: 16 } }}>
          <Text font={12} fontWeight="semibold" foregroundStyle={muted}>Classic Personal Access Token</Text>
          <VStack alignment="leading" spacing={5}>
            <Text font={11} foregroundStyle={muted}>{t("必要權限", "必要权限", "Required permissions")}</Text>
            <Text font={12} monospaced foregroundStyle={accent}>repo · gist · workflow · user:follow</Text>
          </VStack>
          <VStack alignment="leading" spacing={5}>
            <Text font={11} foregroundStyle={muted}>{t("刪除倉庫時另需啟用", "删除仓库时另需启用", "Also required to delete repositories")}</Text>
            <Text font={12} monospaced foregroundStyle={accent}>delete_repo</Text>
          </VStack>
        </VStack>
        <Link url="https://github.com/settings/tokens"><Text font={13} fontWeight="semibold" foregroundStyle={accent}>{t("取得 GitHub 存取權杖 ↗", "获取 GitHub 访问令牌 ↗", "Get a GitHub Token ↗")}</Text></Link>
      </VStack>
    </VStack>
  </ScrollView>;
}

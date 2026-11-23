import { ThemeCardBackground, useThemePalette } from "./themePalette";
import { HStack, VStack, Image, Text, Spacer, Rectangle, ProgressView } from "scripting";
import { CARD_BACKGROUND } from "./theme";

export const REPO_ACCENT = { light: "#087F78", dark: "#49D6C5" } as const;
// 2.0.6：同步 Fork 跟 PR 按鈕共用的淺色底。取 REPO_ACCENT 的 RGB
//（light #087F78 = 8,127,120；dark #49D6C5 = 73,214,197），
// 不發明新色相，只是把實心 accent 改淺。
export const REPO_ACCENT_SOFT = { light: "rgba(8,127,120,0.16)", dark: "rgba(73,214,197,0.20)" } as const;
export const REPO_LIST = {
  tint: REPO_ACCENT,
  listStyle: "insetGroup",
  listSectionSpacing: 12,
  listRowSpacing: 0,
  font: "callout",
} as const;

export function RepoIcon({ symbol }: { symbol: string }) {
  const { accent: REPO_ACCENT } = useThemePalette();
  return <Image systemName={symbol} font={17} foregroundStyle={REPO_ACCENT} frame={{ width: 28, height: 28 }} />;
}

export function RepoHeader({ symbol, title, detail }: { symbol: string; title: string; detail?: string }) {
  const { accent: REPO_ACCENT } = useThemePalette();
  return <HStack spacing={8}>
    <Image systemName={symbol} foregroundStyle={REPO_ACCENT} />
    <Text font={"subheadline"} fontWeight={"semibold"} foregroundStyle={"label"}>{title}</Text>
    <Spacer />
    {detail ? <Text font={"caption"} foregroundStyle={"secondaryLabel"}>{detail}</Text> : null}
  </HStack>;
}

// 2.1.9：檔案頁的資訊區每一欄上下太寬（使用者回饋）。加了 compact 選項，
// 只給需要縮窄的頁面用；其他頁（新增檔案、倉庫頁等）不帶就維持原樣。
export function RepoSummary({ symbol, title, subtitle, detail, compact }: { symbol: string; title: string; subtitle: string; detail?: string; compact?: boolean }) {
  const { accent: REPO_ACCENT } = useThemePalette();
  return <HStack spacing={10} padding={{ vertical: compact ? 1 : 5 }} listRowInsets={compact ? { top: 4, leading: 16, bottom: 4, trailing: 16 } : undefined} listRowBackground={<ThemeCardBackground />}>
    <RepoIcon symbol={symbol} />
    <VStack alignment={"leading"} spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Text font={"headline"} foregroundStyle={"label"} lineLimit={2}>{title}</Text>
      <Text font={"caption"} foregroundStyle={"secondaryLabel"}>{subtitle}</Text>
    </VStack>
    {detail ? <Text font={"caption"} fontWeight={"semibold"} foregroundStyle={REPO_ACCENT}>{detail}</Text> : null}
  </HStack>;
}

export function RepoEntry({ symbol, title, subtitle, busy }: { symbol: string; title: string; subtitle?: string; busy?: boolean }) {
  return <HStack spacing={10} padding={{ vertical: 2 }}>
    {busy ? <ProgressView /> : <RepoIcon symbol={symbol} />}
    <VStack alignment={"leading"} spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Text font={"callout"} fontWeight={"medium"} foregroundStyle={"label"} lineLimit={1}>{title}</Text>
      {subtitle ? <Text font={"caption"} foregroundStyle={busy ? "red" : "secondaryLabel"} lineLimit={1}>{subtitle}</Text> : null}
    </VStack>
  </HStack>;
}

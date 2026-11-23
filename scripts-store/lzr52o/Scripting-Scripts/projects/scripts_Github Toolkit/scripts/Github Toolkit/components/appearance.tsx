import { t } from "./i18n";
import { ThemeCardBackground } from "./themePalette";
import { Section, HStack, VStack, Text, Button, Rectangle, Image } from "scripting";
import { BACKGROUND_THEMES, useBackgroundTheme, saveBackgroundTheme } from "./glass";
import { CARD_BACKGROUND } from "./theme";
import { RepoHeader } from "./repoUI";

export function AppearanceSection() {
  const selected = useBackgroundTheme();
  const rows = [BACKGROUND_THEMES.slice(0, 3), BACKGROUND_THEMES.slice(3, 6)];
  return <Section header={<RepoHeader symbol="paintpalette" title={t("背景", "背景", "Background")} />}>
    <VStack spacing={10} padding={{ vertical: 6 }} listRowBackground={<ThemeCardBackground />}>
      {rows.map((row, index) => <HStack key={index} spacing={10}>
        {row.map(theme => <Button key={theme.id} action={() => saveBackgroundTheme(theme.id)} buttonStyle="plain" frame={{ maxWidth: "infinity" }} accessibilityLabel={t(`背景：${theme.nameHant}`, `背景：${theme.nameHans}`, `Background: ${theme.nameEn}`)}>
          <VStack spacing={7} frame={{ maxWidth: "infinity" }}>
            <Rectangle fill={theme.fill} frame={{ height: 46 }} clipShape={{ type: "rect", cornerRadius: 10 }}
              overlay={selected === theme.id ? <Image systemName="checkmark.circle.fill" foregroundStyle="white" font={20} shadow={{ color: "#333333", radius: 2 }} /> : undefined} />
            <Text font={10} lineLimit={1} minScaleFactor={0.8} foregroundStyle={selected === theme.id ? { light: "#087F78", dark: "#67E8D9" } : "secondaryLabel"}>{t(theme.nameHant, theme.nameHans, theme.nameEn)}</Text>
          </VStack>
        </Button>)}
      </HStack>)}
    </VStack>
  </Section>;
}

// 共用「載入中」列：旋轉圖示在左、「載入中...」文字在右。
// 三個首頁（Actions / Gist / Repository）+ 檔案詳情頁的載入列都用
// 同一個，樣式統一：不要有的只有文字、有的圖示在上文字在下。
//
// listRowBackground 直接寫在根 HStack 上（不要經由 props 傳進來）：
// 自訂組件不會把外層傳的 modifier 轉發給裡面的 view，寫在裡面才生效。
import { HStack, ProgressView, Text } from "scripting";
import { t } from "./i18n";
import { useThemePalette, ThemeCardBackground } from "./themePalette";

export function LoadingRow({ leadingIndent = 0 }: { leadingIndent?: number } = {}) {
  const { accent } = useThemePalette();
  return (
    <HStack
      spacing={10}
      alignment="center"
      padding={{ vertical: 8, leading: leadingIndent }}
      listRowBackground={<ThemeCardBackground />}
    >
      <ProgressView tint={accent} />
      <Text font={13} foregroundStyle="secondaryLabel">{t("載入中...", "载入中...", "Loading...")}</Text>
    </HStack>
  );
}

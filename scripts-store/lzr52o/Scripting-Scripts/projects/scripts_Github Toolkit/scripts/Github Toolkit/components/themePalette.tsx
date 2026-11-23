import { Rectangle } from "scripting";
import { useBackgroundTheme, type BackgroundThemeId } from "./glass";
type Paint = `#${string}` | `rgba(${number},${number},${number},${number})`;
const rgba = (rgb: string, opacity: number): Paint => `rgba(${rgb},${opacity})` as Paint;
// 2.0.12：實色版卡片底。列背景只要帶透明度，拖曳排序時系統的拖曳預覽／
// 灰色佔位會跟它疊在一起，看起來就是上面多一層奇怪的顏色。
// 這裡先把半透明色混到該主題背景漸層的中間色上，算成不透明的近似色，
// 卡片外觀維持一樣，但拖曳時不會再多一層。
const CARD_BASE: Record<string, { light: number[]; dark: number[] }> = {
  plain: { light: [255, 255, 255], dark: [32, 32, 34] },
  // 2026-11-18：藍綠換成「左藍 → 中青 → 右綠」橫向漸層，卡片基準色跟著換成新中間色，
  // 否則 cardSolid（拖曳排序的實色底）會跟實際的半透明卡片對不上。
  // 2026-11-19：跟著換成湖水青 B 的中間色（淺 #1ACED0、深 #0B5A5C）。
  blueGreen: { light: [26, 206, 208], dark: [11, 90, 92] },
  bluePurple: { light: [223, 220, 235], dark: [53, 67, 95] },
  grayWhite: { light: [224, 224, 224], dark: [44, 44, 49] },
  matcha: { light: [216, 230, 210], dark: [90, 122, 104] },
  orangeYellow: { light: [238, 216, 185], dark: [86, 52, 26] },
};
function blend(rgb: string, opacity: number, base: number[]): Paint {
  const parts = rgb.split(",").map((n) => Number(n));
  const mix = (c: number, b: number) => Math.round(b + (c - b) * opacity);
  const hex = (v: number) => v.toString(16).padStart(2, "0");
  return `#${hex(mix(parts[0], base[0]))}${hex(mix(parts[1], base[1]))}${hex(mix(parts[2], base[2]))}` as Paint;
}
type Color = { light: Paint; dark: Paint };
export type ThemePalette = { accent: Color; action: Color; muted: Color; card: Color; cardSolid: Color; selected: Color; border: Color; glow: Paint };
const palettes: Record<BackgroundThemeId, ThemePalette> = {
  plain: make("plain", "#45566B", "#D4DFEE", "#334154", "#45566B", "255,255,255", "150,154,164", "110,130,155"),
  blueGreen: make("blueGreen", "#087F78", "#75DECE", "#06635E", "#08756D", "234,255,249", "111,160,151", "75,190,170"),
  bluePurple: make("bluePurple", "#4957AE", "#B2B9FF", "#353F88", "#4957AE", "241,243,255", "129,143,185", "140,150,235"),
  grayWhite: make("grayWhite", "#545465", "#DDDDEB", "#3F4050", "#545465", "250,250,255", "160,160,174", "175,175,195"),
  matcha: make("matcha", "#3F6445", "#D0E6BB", "#315036", "#3F6445", "244,251,235", "149,174,143", "165,195,140"),
  // 2.0.11：橘黃色那組的卡片底、淡底、撥邊原本偏褐（194,158,113），
  // 疊在橘色漸層上看起來灰灰髒髒的。改成暖一點、亮一點的橘黃，
  // 卡不再發灰；accent 也暖一點、飽和一點，跟背景同一個色系。
  // 2026-11-18：Kristen 截圖回報橘黃漸層下分頁文字看不清。量出來的數據：
  // 原本的卡片疊在漸層上是 #C5894E（L≈0.30），跟預設 muted #B8C2CB
  // （偏藍的灰）對比只有 1.64:1——遠低於正常文字的 4.5:1，連大字要求的 3:1 都不夠。
  // 而且那塊米色底太亮，就算換成純白也只有 2.96:1，換文字顏色救不了。
  // 所以只動橘黃這一組（其他漸層不動）：
  //   1. 卡片底 RGB 255,214,166 → 86,52,26（霧面暖褐），
  //      疊到漸層上約 #9A5F29（L≈0.15），跟白字對比從 2.96:1 提升到 5.5:1。
  //   2. muted 改成暖色 #FFE9CE（原本是冷灰 #B8C2CB，冷暖相立更顯髒），
  //      跟新卡片底對比約 4.5:1，分頁那顆的倉庫／程式片段與 01/02/03 都看得清了。
  // 淺色不變。
  orangeYellow: make("orangeYellow", "#8A5A20", "#FFC978", "#6A4315", "#8A5A20", "255,246,232", "86,52,26", "255,184,92", { light: "#586572", dark: "#FFE9CE" }),
};
function make(id: BackgroundThemeId, light: Paint, dark: Paint, actionLight: Paint, actionDark: Paint, lightRGB: string, darkRGB: string, accentRGB: string, mutedOverride?: Color): ThemePalette {
  const base = CARD_BASE[id];
  // 2026-11-18：muted 改成可覆寫。原本所有主題共用一組固定值，
  // 但冷灰的 muted 疊在暖色系（橘黃）背景上會發濁、對比也不夠。
  // 沒傳的就用原本的預設，其他主題行為完全不變。
  return { accent: {light,dark}, action: {light:actionLight,dark:actionDark}, muted: mutedOverride ?? {light:"#586572",dark:"#B8C2CB"}, card: {light:rgba(lightRGB,0.62),dark:rgba(darkRGB,0.26)}, cardSolid: {light:blend(lightRGB,0.62,base.light),dark:blend(darkRGB,0.26,base.dark)}, selected: {light:rgba(accentRGB,0.26),dark:rgba(accentRGB,0.30)}, border: {light:rgba(accentRGB,0.38),dark:rgba(accentRGB,0.28)}, glow:rgba(accentRGB,0.24) };
}
export function themePalette(id: BackgroundThemeId): ThemePalette { return palettes[id]; }
export function useThemePalette(): ThemePalette { return themePalette(useBackgroundTheme()); }
export function ThemeCardBackground() { const palette = useThemePalette(); return <Rectangle fill={palette.card} />; }
// 拖曳排序列專用：實色卡片底，拖曳時不會跟系統預覽叠出另一層顏色。
export function ThemeCardSolidBackground() { const palette = useThemePalette(); return <Rectangle fill={palette.cardSolid} />; }

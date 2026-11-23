import { Rectangle, RoundedRectangle } from "scripting";
import { useThemePalette } from "./themePalette";

// 滑動列的背景：
// 未滑開時是直角矩形，跟同一個 Section 的卡片連成一整張。
// 滑開時四角全部變成圓弧，避免露出的那一側出現方角。
// side 參數保留給舊呼叫端相容，實際不再影響形狀。
export const SWIPE_ROW_RADIUS = 18;

export function SwipeRowBackground({ isPresented, side = "trailing" }: { isPresented: boolean; side?: "leading" | "trailing" }) {
  const { card } = useThemePalette();
  return isPresented
    ? <RoundedRectangle cornerRadius={SWIPE_ROW_RADIUS} fill={card} />
    : <Rectangle fill={card} />;
}

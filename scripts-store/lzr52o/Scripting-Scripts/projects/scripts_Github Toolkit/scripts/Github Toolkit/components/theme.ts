// Shared theme. One place for the page colour so the login page,
// the three home Lists and every sub-page List all match — previously
// each place hardcoded its own grey (#1c1c1e in some, #2c2c2e in others)
// and the navigation bar kept its own black, which is why the top bar
// looked cut off from the page.
//
// PAGE_BACKGROUND / CARD_BACKGROUND are DynamicShapeStyle objects
// ({ light, dark }): the system picks the right value from the device's
// current colour scheme, live — no reload needed. Dark keeps the v1.2.x
// greys; light is a real light theme (white page, light-grey cards),
// NOT a forced-dark render. The values flow through unchanged because
// every call site passes them into a prop that accepts DynamicShapeStyle:
//   background={<Rectangle fill={...} />}  (Rectangle fill)
//   toolbarBackground={{ style: ... }}     (toolbar style)
//   listRowBackground={<Rectangle fill={...} />}
// Props that only take a plain colour *string* (style.backgroundColor /
// style.color) cannot take these objects — for those, use adaptiveColor()
// below, which reads Device.colorScheme at render time.
//
// PAGE_BACKGROUND: dark #202022 (one step blacker than the v1.2.0
// #242426 the user found not dark enough, but still visibly grey next
// to pure black). It cannot go darker than this without swallowing the
// List rows: the system row colour is #1c1c1e (28,28,30, measured from
// the user's screenshot), so #202022 (32,32,34) is the darkest body that
// still leaves the cards readable. Light #ffffff: a true white page,
// as the user asked for ("白底").
//
// 頂欄（v2.0.0 修訂）：頂欄不再用實色。v1.2.0 那時頂欄設了實色＋
// toolbarBackgroundVisibility "visible"，是因為當時頁面底是實色、
// 頂欄用預設 automatic 會透出後面全黑的宿主背景，量出來是純黑
// #000000。2.0.0 起頁面底改成 ignoresSafeArea 的漸層（見
// components/glass.tsx），頂欄改成跟參考腳本一樣不設任何背景，
// 用系統預設半透明材質透出後面的漸層，頂欄跟頁面之間就沒有接縫、
// 不會割裂。app.tsx 外殼的底也改成 <GlassBackground />。
// The app shell VStack ignores the bottom safe area so the gradient
// extends under the home-indicator strip; the top safe area must NOT
// be ignored (v1.2.1's "vertical" made the List start behind the
// toolbar, eating the first row and the title menu).
export const PAGE_BACKGROUND = { light: "#F2FBFA", dark: "#071B2A" };
// v2.0.0：深色 #202022 → #172D48（藍紫漸層中間色）→ #0B3E4B（藍綠漸層
// 中間色，2026-11-07 Kristen 改要藍綠色；漸層本體在 components/glass.tsx：
// #062A38 → #0B3E4B → #0E4F43）。這裡的純色現在只留給少數仍用實色底的
// 地方（兩個編輯頁的 ScrollView 載入態等）當底，不再用在頂欄。淺色維持 #ffffff。
export const TOOLBAR_BACKGROUND = PAGE_BACKGROUND;
// Card / row background: dark #1a1a1c (darker than the page so the cards
// read as cards again, but only just — v1.2.2's #17171a was a touch too
// dark. The system row colour is #1c1c1e, only 4 levels below the
// #202022 page, which is why the rows looked fused into the background).
// Light #f2f2f7 mirrors that relationship on white: the cards are a
// touch darker than the page, so they still read as cards.
// Applied with listRowBackground on the Lists' rows (the system clips row
// backgrounds to the section's rounded shape, so the cards keep their
// pill look, just darker).
export const CARD_BACKGROUND = { light: "rgba(255, 255, 255, 0.72)", dark: "rgba(28, 28, 30, 0.62)" } as const;
// 2026-11-07 Kristen 選定 B 方案：深色 #1a1a1c → #2e2e33 → 半透明玻璃白
// rgba(255,255,255,0.12)（漸層微微透出來，跟玻璃主題搭）。淺色維持 #f2f2f7。

// 分割線顏色（2026-11-08，1.1.11／1.1.12）：列跟列中間的橫線（List 分隔線）
// 系統預設太淡，Kristen 要加深一點點，改用 listRowSeparatorTint 設這個顏色。
// 深色用白 0.28（比卡片底 0.12 明顯一點，但不搶眼）；淺色用深灰 0.4
//（比系統預設 0.29 深一點）。直線（格子中間的 Divider）1.1.12 改回系統原本的。
export const DIVIDER_COLOR = { light: "rgba(60, 60, 67, 0.4)", dark: "rgba(255, 255, 255, 0.28)" };

// Plain-string colours for props that cannot take a DynamicShapeStyle
// object (style.backgroundColor / style.color). Reads the live scheme
// at render time; falls back to dark (the long-standing behaviour) if
// the scheme cannot be read. Prefer the PAGE_BACKGROUND / CARD_BACKGROUND
// objects above wherever the prop accepts them — those update live when
// the system scheme changes, while this helper only re-reads on render.
export function adaptiveColor(light: string, dark: string): string {
  try {
    const g: any = typeof globalThis !== "undefined" ? (globalThis as any) : {};
    const device: any = g.Device;
    if (device && device.colorScheme === "light") return light;
  } catch {}
  return dark;
}

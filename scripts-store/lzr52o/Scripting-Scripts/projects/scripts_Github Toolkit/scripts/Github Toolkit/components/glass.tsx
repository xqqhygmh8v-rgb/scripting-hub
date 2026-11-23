// 玻璃特效 helper＋元件（v2.0.0 新增）：參考腳本 Github_Action-2 的
// 玻璃系統（design/AllPatternDesign.ts、design/glassTokens.ts、
// services/glassMaterialCache.ts、components/GlassSurface.tsx、
// components/AppBackground.tsx）。
//
// 做法跟參考腳本一樣：系統支援 liquid glass（iOS 主版本 >= 26 且
// UIGlass 全域存在）時用官方 UIGlass，否則 fallback 到系統 material
//（ultraThinMaterial / regularMaterial），舊裝置也不會破圖。
//
//   <GlassBackground />       全頁漸層底（深色藍紫漸層、淺色純白）
//   <GlassCard>…</GlassCard>   玻璃大卡（圓角 22，參考腳本 GlassCard）
//   <GlassNodeCard>…</…>      流程圖步驟節點卡（圓角 12）
//
// List 列刻意不用玻璃：每列單獨上 glassEffect，系統會每列各畫一顆
// 玻璃膠囊（圓角＋亮邊），列跟列拼不回一大塊，看起來又擠又碎；
// 列的底改回以前的實色 Rectangle fill={CARD_BACKGROUND} cornerRadius
// 10（theme.ts），系統會把同色列裁成一個 Section 一大塊包著的樣子，
// 跟 v1.0.0 一模一樣。玻璃只留在頁面漸層底、GlassCard、登入輸入框、
// 流程圖節點這些整塊的地方。
//
// 深色漸層：v2.0.0 第一版是參考腳本 visual.config.ts 的 background.dark
// 藍紫漸層 #081522 → #172D48 → #302543；2026-11-07 Kristen 改要藍綠色，
// 改成深藍 → 藍綠 → 綠青 #062A38 → #0B3E4B → #0E4F43
//（topLeading → bottomTrailing）。
// 淺色：1.2.0 之前是純白 #ffffff，Kristen 說漸層淺色模式下也要能用，
// 改成各主題同色系的淡色漸層；玻璃照樣套。頂欄不設實色底
//（見 app.tsx 註解：半透明透出漸層才不割裂）；
// 少數仍用實色底的地方見 theme.ts 的 PAGE_BACKGROUND（深色是漸層中間色 #0B3E4B）。
//
// 注意：esbuild 不做型別檢查，這裡的 UIGlass 只以 `typeof UIGlass`
// 判斷存在與否（未宣告的全域用 typeof 不會拋錯）；型別註解會在轉換時
// 抹掉，不影響執行。
import { Rectangle, TimelineCanvas, VStack, useState, useEffect } from "scripting";

export const GLASS_CARD_RADIUS = 22;
export const GLASS_NODE_RADIUS = 12;

// 深色漸層（參考腳本 visual.config.ts background.dark）；淺色 1.2.0 起有淡色漸層。
// 1.1.24：讓漸層顏色變換快一點。三個顏色平均分（色標 0%、50%、100%）時，
// 每段過渡要走半個畫面，顏色變化太緩、看不出來。頭尾各複製一次變成
// 五個顏色（色標 0%、25%、50%、75%、100%），頭尾各有一段純色，
// 顏色在中間 25% 一段內轉完，變化快一倍、看得出來。
// 1.2.0：複製拿掉（Kristen 截圖：中間形成一條明顯的色帶邊，動畫上下滑時
// 那條線跟著平行移動）。改回平滑三色，轉場平均鋪滿整個畫面，沒有那條線。
// 1.1.25 把最亮那格大幅提亮，Kristen 說太醜，1.1.26 退回 1.1.24 的顏色。
// 1.1.35：Kristen 要藍綠的綠多一點。往綠色方向調（藍色成分減少、綠色變多）：
// #062A38 → #06382E、#0B3E4B → #0B4B3E、#0E4F43 → #0E5C3A。
// 1.1.36：Kristen 要綠偏松柏綠、藍是蒼青。綠改松柏綠 #1E3A2F（深沉的松樹綠），
// 藍改蒼青 #7398AB（從她傳的截圖取色，最右邊那根，灰藍色），中間用 #3E5A52 過渡。
// 1.1.37：Kristen 要試試看青碧和群青。青碧 #49C0A4（綠色截圖第 5 根）、
// 群青 #4C8DAD（藍色截圖第 4 根），都是從她傳的截圖取色，中間用 #4AA6A8 過渡。
// 1.1.38：Kristen 說太亮，要像原本那樣暗暗的。青碧跟群青壓暗到原本
// 深色漸層的亮度，色相不變：群青 #4C8DAD → #16303E、青色 #4AA6A8 → #1C4444、
// 青碧 #49C0A4 → #20564A。
// 淺色：1.2.0 之前是全白，Kristen 說漸層淺色模式下也要能用，
// 改成淺色版的同色漸層（淡青綠），深色還是原本的。
// 1.2.0（修橫線）：1.1.24 的頭尾複製拿掉，改回平滑三色。
// 複製讓轉場壓到中間 25%，中間形成一條明顯的色帶邊，
// 動畫上下滑時那條線就跟著平行移動。平滑三色轉場平均鋪滿整個畫面，就沒有那條線。
export const APP_BACKGROUND_GRADIENT = {
  // 2026-11-18：Kristen 拿了一張「左藍、中青、右綠」的參考圖，改成同一組配色。
  // 從圖上取樣：左邊藍 #0AB5E2、中間青 #1AD3BE、右邊綠 #2AEF9C。
  // 這三色比前一版（Tiffany Green 那組）飽和很多，是這張圖原本的濃度。
  // startPoint／endPoint 只影響「設定頁的主題色塊」預覽，實際背景是
  // TimelineCanvas 畫的（見下面的 drawBlueGreenFlow），那才是會動的版本。
  //
  // 2026-11-19：Kristen 改選示意圖的 B「湖水青」（綠收掉一點那組）。
  // 淺色 #0AB5E2 → #1ACED0 → #33DDC2（右端從 #38E2A8 收回來，綠不再搶眼），
  // 深色 #0A4A63 → #0B5A5C → #0C6A5E（灰青，不是之前那個近黑的墨綠）。
  // 深色中段亮度夠，白字對比正常，所以深淺模式各自一組、不再鎖外觀。
  light: {
    colors: ["#0AB5E2", "#1ACED0", "#33DDC2"],
    startPoint: "leading",
    endPoint: "trailing",
  },
  dark: {
    colors: ["#0A4A63", "#0B5A5C", "#0C6A5E"],
    startPoint: "leading",
    endPoint: "trailing",
  },
};

// 背景主題（2026-11-10，1.1.21）：使用者設定最下面可以選背景。
// 除了原本的藍綠色漸層，再加橘黃、藍紫、灰白三種漸層，
// 以及素版的純黑／白（實色、按設備深淺色模式切換）。
// 淺色模式：1.2.0 之前四種漸層都是純白（跟原本一樣），差別在深色；
// 1.2.0 Kristen 說漸層淺色模式下也要能用，五種漸層都有淺色版
//（同色系的淡色漸層，不再是全白）；純黑／白那個深色是素版的
// #202022、淺色 #ffffff，沒有漸層。
// 預設主題：1.2.0 之前是藍綠色，Kristen 說默認顏色是純黑／白，
// 改成純黑／白（loadBackgroundTheme 預設回 "plain"）。
export type BackgroundThemeId = "blueGreen" | "orangeYellow" | "bluePurple" | "grayWhite" | "plain" | "matcha";

export const BACKGROUND_THEME_KEY = "github_toolkit_background_theme";

export interface BackgroundTheme {
  id: BackgroundThemeId;
  nameHant: string;
  nameHans: string;
  nameEn: string;
  // fill：漸層用 {light:{colors…}, dark:{colors…}}，純色用 {light, dark} 字串。
  fill: any;
}

function gradientFill(lightColors: string[], darkColors: string[]): any {
  // 1.1.24 曾把頭尾色各複製一次（變五個顏色），讓顏色在中間 25% 一段內轉完、
  // 變化快一倍。1.2.0 Kristen 截圖回報：複製讓中間形成一條明顯的色帶邊，
  // 動畫上下滑時那條線跟著平行移動，很明顯。改回平滑三色（色標 0%、50%、100%），
  // 轉場平均鋪滿整個畫面，沒有那條線；動畫還是上下滑，只是變柔順。
  return {
    light: { colors: lightColors, startPoint: "topLeading", endPoint: "bottomTrailing" },
    dark: { colors: darkColors, startPoint: "topLeading", endPoint: "bottomTrailing" },
  };
}

// 1.1.23：順序是選單顯示的順序。1.1.24 再改：純黑／白第一、藍綠第二、
// 藍紫第三、灰白第四、抹綠第五、橘黃第六（Kristen 手寫編號）。
// 名字 1.1.24 也改短：純黑／白（素版）→ 純黑/白、抹茶綠／蒂芬妮綠漸層 → 抹綠漸層。
// 預設主題是純黑／白（1.2.0 改的，之前是藍綠色），順序只影響選單。
export const BACKGROUND_THEMES: BackgroundTheme[] = [
  {
    id: "plain",
    nameHant: "純黑/白色",
    nameHans: "纯黑/白色",
    nameEn: "Black / White",
    // 素版的實色：深色 #202022、淺色 #ffffff，按設備深淺色模式切換。
    fill: { light: "#ffffff", dark: "#202022" },
  },
  {
    id: "blueGreen",
    nameHant: "藍綠色漸變",
    nameHans: "蓝绿色渐变",
    nameEn: "Blue-Green Gradient",
    fill: APP_BACKGROUND_GRADIENT,
  },
  {
    id: "bluePurple",
    nameHant: "藍紫色漸變",
    nameHans: "蓝紫色渐变",
    nameEn: "Blue-Purple Gradient",
    // 深色以灰藍為主、少量灰紫，拉開上下明暗差，讓三色由上而下平滑漸變更明顯。
    // 淺色採同色系的柔和淡紫／灰藍，保留深色文字的可讀性。
    fill: {
      light: { colors: ["#EFE5ED", "#DFDCEB", "#CFD5E2"], startPoint: "top", endPoint: "bottom" },
      dark: { colors: ["#4D5069", "#35435F", "#1E3047"], startPoint: "top", endPoint: "bottom" },
    },
  },
  {
    id: "grayWhite",
    nameHant: "灰白色漸變",
    nameHans: "灰白色渐变",
    nameEn: "Gray-White Gradient",
    // 1.2.0：淺色不再全白，改成淡灰漸層。
    fill: gradientFill(["#F5F5F5", "#E0E0E0", "#BDBDBD"], ["#17171A", "#2C2C31", "#55555E"]),
  },
  {
    id: "matcha",
    nameHant: "抹綠色漸變",
    nameHans: "抹绿色渐变",
    nameEn: "Matcha Green Gradient",
    // 1.1.22 新增：深抹茶 → 抹茶綠 → 蒂芬妮綠（最淺那格是 Mina 頭像那個綠 #6BC4B1）。
    // 1.1.27：最上面那格 #0F2A20 太黑，Kristen 說抹綠上面太黑了，調亮到 #1E5C46。
    // 1.1.34：Kristen 要霧一點、不要太亮。改成霧面鼠尾草綠（降飽和、降亮度）。
    // 1.1.39：Kristen 說抹綠有一部分太亮，最亮那格 #8FA89A 再調灰一點點 → #849B8E。
    // 1.2.0：淺色不再全白，改成淡鼠尾草綠漸層。
    // 2026-11-18：Kristen 說抹綠漸變下面（右下角那格）有點亮，要加一點灰。
    // 第一次降彩度降太多（#77837C，S 5%），變成中性灰、綠色調不見了。
    // 改成只壓亮度、保留彩度：#849B8E → #688D78
    // （HSL 146°,10%,56% → 146°,15%,48%）。彩度跟中間格 #5A7A68 一致，
    // 三格同一個綠色調，只靠亮度做出斜坡，不會再冒出一塊灰。
    // #2E4A3E、#5A7A68 兩格不動。
    fill: gradientFill(["#EDF3EA", "#D8E6D2", "#C0D6B5"], ["#2E4A3E", "#5A7A68", "#688D78"]),
  },
  {
    id: "orangeYellow",
    nameHant: "橘黃色漸變",
    nameHans: "橘黄色渐变",
    nameEn: "Orange-Yellow Gradient",
    // 深色採乾淨暖橘 → 琥珀，減少黑灰褐感，控制黃色亮度以襯托白字。
    // 淺色採淡暖橘黃，維持深色文字可讀；深淺模式皆由上而下平滑過渡。
    // 2026-11-18：Kristen 說橘黃漸變「有黑黑的」，要改成偏灰的橘。
    // 原因是最深那格 #985024 亮度只有 37%、彩度卻 62%，是偏深的麥芽褐，
    // 鋪滿整個畫面就像一塊黑。
    // 第一次改成 H26°／S30% 的霧橘，Kristen 回「太偏褐了，想要橘一點」。
    // 褐感來自兩個地方：色相壓到 26°（色環上已經偏紅橘）、彩度壓到 30%
    //（低彩度的橘一定看起來像褐）。所以第二版把色相推回 30°（純橘 #FF7F00
    // 就是 H30°）、彩度拉回 57～58%，亮度仍維持在 44～50% 不往下沉。
    //   #8F6A4D（HSL 26°,30%,43%）→ #B16E2F（HSL 29°,58%,44%）
    //   #9C7454（HSL 27°,30%,47%）→ #BD7832（HSL 30°,58%,47%）
    //   #A87E5D（HSL 26°,30%,51%）→ #C88237（HSL 31°,57%,50%）
    // 白字對比約 3.2～3.9:1（原本 3.7:1），卡片是半透明白底、實際會再亮一些。
    fill: {
      light: { colors: ["#F8EBDD", "#EED8B9", "#E4C89C"], startPoint: "top", endPoint: "bottom" },
      dark: { colors: ["#B16E2F", "#BD7832", "#C88237"], startPoint: "top", endPoint: "bottom" },
    },
  },
];

export function loadBackgroundTheme(): BackgroundThemeId {
  try {
    const raw = Storage.get(BACKGROUND_THEME_KEY) || "";
    if (raw === "orangeYellow" || raw === "bluePurple" || raw === "grayWhite" || raw === "plain" || raw === "matcha" || raw === "blueGreen") return raw;
  } catch {}
  return "bluePurple";
}

const themeListeners = new Set<(id: BackgroundThemeId) => void>();
export function useBackgroundTheme(): BackgroundThemeId {
  const [id, setId] = useState<BackgroundThemeId>(() => loadBackgroundTheme());
  useEffect(() => {
    themeListeners.add(setId);
    setId(loadBackgroundTheme());
    return () => { themeListeners.delete(setId); };
  }, []);
  return id;
}
export function saveBackgroundTheme(id: BackgroundThemeId): void {
  try { Storage.set(BACKGROUND_THEME_KEY, id); } catch {}
  for (const listener of themeListeners) listener(id);
}

export function backgroundFill(themeId: BackgroundThemeId): any {
  const found = BACKGROUND_THEMES.find((th) => th.id === themeId);
  // 1.2.0：找不到就回預設純黑／白（之前是藍綠色）。不能回 BACKGROUND_THEMES[0]，
  // 因為選單順序改了，[0] 現在是純黑／白，預設必須還是純黑／白。
  const fallback = BACKGROUND_THEMES.find((th) => th.id === "plain");
  return found ? found.fill : (fallback ? fallback.fill : BACKGROUND_THEMES[0].fill);
}

export function liquidGlassAvailable(): boolean {
  try {
    const device: any = (globalThis as any).Device;
    const version: string = device && device.systemVersion ? String(device.systemVersion) : "";
    const major: number = Number.parseInt(version.split(".")[0], 10);
    return Number.isFinite(major) && major >= 26 && typeof UIGlass !== "undefined";
  } catch (_) {
    return false;
  }
}

type GlassMaterialKind = "clear" | "regular";
const glassMaterials: Map<string, any> = new Map<string, any>();

// 官方修飾方法回傳新實例，基礎材質可安全共享（跟參考腳本同一做法）。
export function glassMaterial(kind: GlassMaterialKind, interactive: boolean): any {
  const key: string = `${kind}:${interactive}`;
  const cached: any = glassMaterials.get(key);
  if (cached) return cached;
  const glass: any = (kind === "clear" ? UIGlass.clear() : UIGlass.regular()).interactive(interactive);
  glassMaterials.set(key, glass);
  return glass;
}

// 卡片／列共用的表面 props：liquid glass 時用 glassEffect，否則用
// 系統 material 當底。shape 由呼叫端決定（卡片 22、列 18、節點 12）。
export function glassSurface(kind: GlassMaterialKind, shape: any, interactive: boolean = false, tint?: string): any {
  if (!liquidGlassAvailable()) {
    return { background: { style: kind === "clear" ? "ultraThinMaterial" : "regularMaterial", shape } };
  }
  const glass: any = glassMaterial(kind, interactive);
  return { glassEffect: { glass: tint ? glass.tint(tint) : glass, shape } };
}

// 玻璃過渡動畫：參考腳本 visual.glass.transition 預設是 'materialize'
//（玻璃出現時慢慢變形顯現）；2026-11-07 Kristen 嫌底色切換太慢，
// 改成 'identity'（參考腳本外觀設定裡的「保持原樣」選項）：玻璃出現
// 時不做變形動畫，直接顯示，切換頁面／模組時底色跟膠囊不再慢慢變形。
export function glassTransitionProps(): any {
  return liquidGlassAvailable() ? { glassEffectTransition: "identity" } : {};
}

// 玻璃按鈕樣式（流程圖「暫停動效」按鈕用）：有 liquid glass 時用
// glass，否則用 bordered（跟參考腳本 glassButtonStyle 同一做法）。
export function glassButtonStyle(prominent: boolean = false): string {
  return liquidGlassAvailable() ? (prominent ? "glassProminent" : "glass") : (prominent ? "borderedProminent" : "bordered");
}

// 1.1.26：背景漸層會動了。做法是 Action 流程圖那套 TimelineCanvas
//（schedule + draw(ctx, size, time)，跟 flow 動畫同一個元件）：
// 漸層方向以對角線為中心、左右慢慢擺（±26 度，36 秒一個來回），
// 顏色就跟著在畫面上流動。時間用 Date.now()（不是 canvas 傳進來的 time），
// 這樣每個頁面的背景都在同一個相位，換頁不會跳一下。
// 純黑／白是實色、沒有漸層，不用動，直接用 Rectangle。
// 1.1.27：1.1.26 沒動，因為漏了 paused——flow 那邊每次都明確傳
// paused，沒傳預設就是暫停，只畫一次。補上 paused={false} 才會一直重畫。
// 另外擺動加大（±26 度 → ±34 度）、加快（36 秒 → 24 秒一個來回），
// 動得更明顯。
// 1.1.28：Kristen 說還是看不出來在動，再加快：擺動 ±34 度 → ±46 度、
// 24 秒 → 12 秒一個來回。
// 1.1.29：Kristen 要換一種動法。左右擺改成一直轉：漸層方向不停地順時針
// 轉，20 秒一圈，顏色一直繞著畫面流，不會來回折返。
// 1.1.30：Kristen 說轉太快，改成 40 秒一圈。
// 1.1.31：Kristen 要上下流動。改成直向漸層（上到下），整條漸層上下滑動、
// 20 秒一個來回，幅度是畫面高度的四分之一，顏色上下流。
// 1.1.32：Kristen 傳影片參考，改成色相漂移（漸層不動、顏色慢慢變）。
// 1.1.33：Kristen 說色相漂移顏色不好看、太多顏色了，只要原本的顏色。
// 色相漂移拿掉，動法回到 1.1.31 的上下流動，只用原本主題的顏色。
//
function hexToRgb(hex: string): number[] {
  const s = hex.replace("#", "");
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}
function mixHex(a: string, b: string, k: number): string {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  let out = "#";
  for (let i = 0; i < 3; i++) {
    const v = Math.round(A[i] + (B[i] - A[i]) * k);
    out += v.toString(16).padStart(2, "0");
  }
  return out;
}
// 藍 → 青 → 綠 → 青 → 藍 的閉合循環（頭尾同色，所以繞回起點不會有斷層）。
function loopColor(colors: string[], u: number): string {
  const seq = [colors[0], colors[1], colors[2], colors[1], colors[0]];
  const x = ((u % 1) + 1) % 1;
  const seg = Math.floor(x * (seq.length - 1));
  const k = x * (seq.length - 1) - seg;
  return mixHex(seq[seg], seq[seg + 1], k);
}

// 2026-11-18：藍綠主題改成 Kristen 指定的「循環流動、左下到左上擴散」。
// 只有藍綠走這條，其他漸層主題仍然走下面原本的上下流動（行為完全不變）。
//
// 為什麼前兩版「感覺沒在流動」：
//   第一版是靜態橫向漸層 + 一顆徑向光暈。光暈是藍色疊在藍色底上，
//   深色模式 #0B4F49 疊 #0A4256 幾乎同一個顏色，等於沒東西在動。
// 這版改成讓顏色本身在畫面上跑：
//   沿著「左下 → 偏上」的方向鋪一條藍→青→綠→青→藍的閉合色帶，
//   相位隨時間一直往前推。這樣畫面上每一點的颜色都會在藍／青／綠之間
//   真的循環跑一輪，不是亮度微動，深淺模式都看得出來。
//   色帶頭尾同色（閉合），所以總回到起點時不會有斷層。
//   色標全部是不透明色、而且只用主題那三個顏色互相混，沒有額外色相，
//   也不依賴半透明色字串，不會出現圓形硬邊。
function drawBlueGreenFlow(ctx: any, size: { width: number; height: number }, colors: string[], t: number): void {
  const W = size.width;
  const H = size.height;
  const CYCLE = 14;
  const phase = (t % CYCLE) / CYCLE;
  // 一次只看到色帶的一半，所以左下偏藍、上方偏綠／青，
  // 跟 Kristen 參考圖的藍在左、綠在右是同一組顏色。
  const WINDOW = 0.5;

  // 軸線：左下 → 左上偏中（比對角線陡，流向看起來是往上而不是往右）。
  const g = ctx.createLinearGradient(0, H, W * 0.30, 0);
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const pos = i / N;
    g.addColorStop(pos, loopColor(colors, pos * WINDOW + phase));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}
function isLightMode(): boolean {
  try {
    const device: any = (globalThis as any).Device;
    return device && device.colorScheme === "light";
  } catch {}
  return false;
}

export function GlassBackground({ theme }: { theme?: BackgroundThemeId } = {}) {
  // 1.1.23：接受一個明確的主題。沒傳就重讀 Storage（原本的行為，各頁照舊）。
  // 傳了就用傳進來的那個——首頁（repoList）把主題放進 state，換主題時
  // setState 觸發重畫，這裡跟著換，不用等退出重進。
  const current = useBackgroundTheme();
  const id = theme ?? current;
  const fill = backgroundFill(id);
  if (typeof fill.light === "string" || typeof fill.dark === "string") {
    return (
      <Rectangle
        fill={fill}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        ignoresSafeArea={true}
        allowsHitTesting={false}
      />
    );
  }
  const lightColors: string[] = fill.light.colors;
  const darkColors: string[] = fill.dark.colors;
  return (
    <TimelineCanvas
      opaque={true}
      paused={false}
      schedule={{ minimumInterval: 1 / 15 }}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      ignoresSafeArea={true}
      allowsHitTesting={false}
      accessibilityHidden
      draw={(ctx, size): void => {
        const colors = isLightMode() ? lightColors : darkColors;
        const t = Date.now() / 1000;
        if (id === "blueGreen") {
          drawBlueGreenFlow(ctx, size, colors, t);
          return;
        }
        const cx = size.width / 2;
        const offset = size.height * 0.25 * Math.sin((2 * Math.PI * t) / 20);
        const g = ctx.createLinearGradient(cx, offset, cx, size.height + offset);
        const n = colors.length;
        for (let i = 0; i < n; i++) {
          g.addColorStop(i / (n - 1), colors[i]);
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size.width, size.height);
      }}
    />
  );
}

// padding 12 / spacing 8 跟 Toolkit 原本的 Card 相同，換過去不會
// 改變排版，只換材質。
export function GlassCard({ children }: { children: any }) {
  return (
    <VStack
      alignment="leading"
      spacing={8}
      padding={12}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
      {...glassSurface("clear", { type: "rect", cornerRadius: GLASS_CARD_RADIUS, style: "continuous" }, true)}
      {...glassTransitionProps()}
    >
      {children}
    </VStack>
  );
}

export function GlassNodeCard({ children }: { children: any }) {
  return (
    <VStack
      alignment="leading"
      spacing={5}
      padding={8}
      frame={{ maxWidth: "infinity", minHeight: 72, maxHeight: 72, alignment: "leading" }}
      {...glassSurface("clear", { type: "rect", cornerRadius: GLASS_NODE_RADIUS, style: "continuous" }, true)}
      {...glassTransitionProps()}
    >
      {children}
    </VStack>
  );
}

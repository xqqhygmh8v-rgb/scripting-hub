import type { ServiceResult } from "./model"

export type Lang = "zh-Hant" | "zh-Hans" | "en"

const COPY = {
  "zh-Hant": {
    title: "流媒體解鎖檢測",
    checking: "檢測中…",
    recheck: "重新檢測",
    updating: "更新中…",
    updatedAt: "更新時間",
    close: "關閉",
    style: "樣式",
    name: "名稱",
    appearance: "外觀",
    layout: "版面",
    standard: "標準文字",
    compact: "緊湊文字",
    textColor: "文字顏色",
    preview: "預覽",
    previewThis: "預覽這個樣式",
    previewWidget: "預覽小組件",
    chooseSize: "選擇尺寸",
    small: "小尺寸",
    medium: "中尺寸",
    large: "大尺寸",
    styleName: "樣式名稱",
    widgetTitle: "標題",
    showLocation: "顯示 IP 與位置",
    maskIP: "IP 隱碼",
    showTime: "顯示更新時間",
    node: "目前節點",
    services: "服務",
    widgetStyle: "小組件樣式",
    noResult: "尚無結果",
    fresh: "10 分鐘內的結果",
    stale: "較早的結果",
    emptyHint: "尚未檢測。右上角可以立即檢測 YouTube、Netflix、ChatGPT 與 Disney+。",
    styleHint: "這是唯一的小組件樣式。標題、版面和文字顏色會套用到小尺寸與中尺寸。",
    listLine1: "可以改標題、版面和文字顏色。",
    listLine2: "點小組件上更新時間會重新檢測IP、解鎖狀態。",
    previewHint: "預覽會先用 10 分鐘內的檢測結果；沒有的話會實測後再畫。可切換小、中、大三種尺寸。",
    previewFailed: "無法預覽小組件",
    checkFailed: "檢測失敗",
    unknownError: "發生未知錯誤",
    textPrefix: "文字",
    ok: "可解鎖",
    warn: "部分可用",
    soon: "即將上線",
    no: "不支援",
    na: "檢測失敗",
    premium: "可看 Premium",
    fullCatalog: "完整目錄",
    partial: "僅部分內容",
    webAndApp: "網頁與 App 都可用",
    appLimited: "網頁可用，App 被限制",
    unavailable: "此區未開放",
    timeout: "檢測逾時",
    error: "檢測異常",
  },
  "zh-Hans": {
    title: "流媒体解锁检测",
    checking: "检测中…",
    recheck: "重新检测",
    updating: "更新中…",
    updatedAt: "更新时间",
    close: "关闭",
    style: "样式",
    name: "名称",
    appearance: "外观",
    layout: "版面",
    standard: "标准文字",
    compact: "紧凑文字",
    textColor: "文字颜色",
    preview: "预览",
    previewThis: "预览这个样式",
    previewWidget: "预览小组件",
    chooseSize: "选择尺寸",
    small: "小尺寸",
    medium: "中尺寸",
    large: "大尺寸",
    styleName: "样式名称",
    widgetTitle: "标题",
    showLocation: "显示 IP 与位置",
    maskIP: "IP 隐码",
    showTime: "显示更新时间",
    node: "当前节点",
    services: "服务",
    widgetStyle: "小组件样式",
    noResult: "尚无结果",
    fresh: "10 分钟内的结果",
    stale: "较早的结果",
    emptyHint: "尚未检测。右上角可以立即检测 YouTube、Netflix、ChatGPT 与 Disney+。",
    styleHint: "这是唯一的小组件样式。标题、版面和文字颜色会套用到小尺寸与中尺寸。",
    listLine1: "可以改标题、版面和文字颜色。",
    listLine2: "点小组件上更新时间会重新检测IP、解锁状态。",
    previewHint: "预览会先用 10 分钟内的检测结果；没有的话会实测后再画。可切换小、中、大三种尺寸。",
    previewFailed: "无法预览小组件",
    checkFailed: "检测失败",
    unknownError: "发生未知错误",
    textPrefix: "文字",
    ok: "可解锁",
    warn: "部分可用",
    soon: "即将上线",
    no: "不支持",
    na: "检测失败",
    premium: "可看 Premium",
    fullCatalog: "完整目录",
    partial: "仅部分内容",
    webAndApp: "网页与 App 都可用",
    appLimited: "网页可用，App 被限制",
    unavailable: "此区未开放",
    timeout: "检测超时",
    error: "检测异常",
  },
  en: {
    title: "Streaming Unlock",
    checking: "Checking…",
    recheck: "Check again",
    updating: "Updating…",
    updatedAt: "Updated",
    close: "Close",
    style: "Style",
    name: "Name",
    appearance: "Appearance",
    layout: "Layout",
    standard: "Standard",
    compact: "Compact",
    textColor: "Text color",
    preview: "Preview",
    previewThis: "Preview this style",
    previewWidget: "Preview widget",
    chooseSize: "Choose size",
    small: "Small",
    medium: "Medium",
    large: "Large",
    styleName: "Style name",
    widgetTitle: "Title",
    showLocation: "Show IP and location",
    maskIP: "Mask IP address",
    showTime: "Show update time",
    node: "Current node",
    services: "Services",
    widgetStyle: "Widget style",
    noResult: "No result yet",
    fresh: "Result from the last 10 minutes",
    stale: "Older result",
    emptyHint: "Not checked yet. Use Check again to test YouTube, Netflix, ChatGPT and Disney+.",
    styleHint: "This is the only widget style. The title, layout and text color apply to both sizes.",
    listLine1: "You can change the title, layout and text color.",
    listLine2: "Tap the update time on the widget to check the IP and unlock status again.",
    previewHint: "Preview uses a result from the last 10 minutes, or runs a new check. Small, medium and large sizes are available.",
    previewFailed: "Can’t preview the widget",
    checkFailed: "Check failed",
    unknownError: "Unknown error",
    textPrefix: "Text",
    ok: "Unlocked",
    warn: "Partial",
    soon: "Coming soon",
    no: "Unavailable",
    na: "Failed",
    premium: "Premium available",
    fullCatalog: "Full catalog",
    partial: "Partial catalog",
    webAndApp: "Web and app",
    appLimited: "Web only, app limited",
    unavailable: "Not available here",
    timeout: "Timed out",
    error: "Check error",
  },
} as const

const COLORS: Record<Lang, Record<string, string>> = {
  "zh-Hant": {
    label: "自動", "#FFFFFF": "白色", "#000000": "黑色", "#8E8E93": "灰色",
    "#FF2D55": "紅色", "#FF9F0A": "橘色", "#FFD60A": "金色",
    "#30D158": "綠色", "#0A84FF": "藍色", "#BF5AF2": "紫色", "#64D2FF": "青色",
  },
  "zh-Hans": {
    label: "自动", "#FFFFFF": "白色", "#000000": "黑色", "#8E8E93": "灰色",
    "#FF2D55": "红色", "#FF9F0A": "橙色", "#FFD60A": "金色",
    "#30D158": "绿色", "#0A84FF": "蓝色", "#BF5AF2": "紫色", "#64D2FF": "青色",
  },
  en: {
    label: "Auto", "#FFFFFF": "White", "#000000": "Black", "#8E8E93": "Gray",
    "#FF2D55": "Red", "#FF9F0A": "Orange", "#FFD60A": "Gold",
    "#30D158": "Green", "#0A84FF": "Blue", "#BF5AF2": "Purple", "#64D2FF": "Cyan",
  },
}

const DEFAULT_TITLES = new Set([
  "流媒體解鎖檢測",
  "流媒体解锁检测",
  "Streaming Unlock",
  "🔓 流媒體解鎖檢測",
  "流媒體解鎖",
  "解鎖檢測",
])

function languageSource(): string {
  const device = Device as {
    preferredLanguage?: string
    preferredLanguages?: string[]
    systemLanguageTag?: string
    systemLocale?: string
    systemLanguageCode?: string
    systemScriptCode?: string
    systemLocales?: string[]
  }
  const values = [
    device.systemLanguageTag,
    device.systemLocale,
    Array.isArray(device.systemLocales) ? device.systemLocales[0] : "",
    Array.isArray(device.preferredLanguages) ? device.preferredLanguages[0] : "",
    device.preferredLanguage,
  ]
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value
  }
  const code = typeof device.systemLanguageCode === "string" ? device.systemLanguageCode : ""
  const script = typeof device.systemScriptCode === "string" ? device.systemScriptCode : ""
  return script ? `${code}-${script}` : code
}

export function currentLanguage(): Lang {
  const device = Device as { systemScriptCode?: string }
  const script = typeof device.systemScriptCode === "string" ? device.systemScriptCode.toLowerCase() : ""
  const code = languageSource().toLowerCase().replace(/_/g, "-")
  if (script === "hans" || code.includes("hans")) return "zh-Hans"
  if (script === "hant" || code.includes("hant")) return "zh-Hant"
  if (code.startsWith("zh")) {
    if (code.includes("-cn") || code.includes("-sg")) return "zh-Hans"
    return "zh-Hant"
  }
  return "en"
}

export function text() {
  return COPY[currentLanguage()]
}

export function colorName(id: string): string {
  return COLORS[currentLanguage()][id] ?? id
}

export function styleDisplayName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed || trimmed === "經典" || trimmed === "卡片" || trimmed === "精簡" || trimmed === "樣式" || trimmed === "Style") {
    return text().style
  }
  return trimmed
}

export function updatePrefix(): string {
  return currentLanguage() === "en" ? `${text().updatedAt}: ` : `${text().updatedAt}：`
}

export function displayTitle(title: string): string {
  const trimmed = title.trim()
  if (!trimmed || DEFAULT_TITLES.has(trimmed)) return text().title
  return trimmed
}

export function stateText(state: ServiceResult["state"]): string {
  const copy = text()
  switch (state) {
    case "ok": return copy.ok
    case "warn": return copy.warn
    case "soon": return copy.soon
    case "no": return copy.no
    default: return copy.na
  }
}

export function serviceDetail(service: ServiceResult): string {
  const copy = text()
  const region = service.region
  const withRegion = (label: string) => region ? `${region} ${label}` : label
  if (service.state === "soon") return withRegion(copy.soon)
  if (service.state === "no") return copy.unavailable
  if (service.state === "na") return service.detail.includes("逾時") || service.detail.includes("超时") || service.detail.includes("Timed") ? copy.timeout : copy.error
  if (service.id === "youtube") return withRegion(copy.premium)
  if (service.id === "netflix") return withRegion(service.state === "warn" ? copy.partial : copy.fullCatalog)
  if (service.id === "chatgpt") return withRegion(service.state === "warn" ? copy.appLimited : copy.webAndApp)
  return withRegion(copy.ok)
}

export function formatLocalizedTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  if (currentLanguage() === "en") {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} - ${hours}:${minutes}`
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 - ${hours}:${minutes}`
}

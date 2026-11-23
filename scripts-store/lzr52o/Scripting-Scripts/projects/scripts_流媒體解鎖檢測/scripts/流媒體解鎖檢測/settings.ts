import { emptyReport, isUnlockReport, type LayoutId, type UnlockReport } from "./model"

export const ACCENTS = [
  { id: "#FFD60A", name: "金色" },
  { id: "#FF2D55", name: "紅色" },
  { id: "#FF9F0A", name: "橘色" },
  { id: "#0A84FF", name: "藍色" },
  { id: "#30D158", name: "綠色" },
  { id: "#BF5AF2", name: "紫色" },
  { id: "#64D2FF", name: "青色" },
] as const

export type AccentId = (typeof ACCENTS)[number]["id"]

export const TEXT_COLORS = [
  { id: "label", name: "自動" },
  { id: "#FFFFFF", name: "白色" },
  { id: "#000000", name: "黑色" },
  { id: "#8E8E93", name: "灰色" },
  { id: "#FF2D55", name: "紅色" },
  { id: "#FF9F0A", name: "橘色" },
  { id: "#FFD60A", name: "金色" },
  { id: "#30D158", name: "綠色" },
  { id: "#0A84FF", name: "藍色" },
  { id: "#BF5AF2", name: "紫色" },
  { id: "#64D2FF", name: "青色" },
] as const

export type TextColorId = (typeof TEXT_COLORS)[number]["id"]

export type WidgetStyle = {
  id: string
  name: string
  title: string
  layout: LayoutId
  accent: AccentId
  textColor: TextColorId
  showLocation: boolean
  maskIP: boolean
  showTime: boolean
  showHint: boolean
}

const STYLES_KEY = "stream.unlock.styles"
const STYLE_VERSION_KEY = "stream.unlock.styleVersion"
const STYLE_VERSION = 3
const CACHE_KEY = "stream.unlock.report"
const FORCE_KEY = "stream.unlock.force"
const SCRIPTABLE_TITLE = "流媒體解鎖檢測"
const LEGACY_TITLES = new Set([
  "🔓 流媒體解鎖檢測",
  "流媒體解鎖",
  "解鎖檢測",
  SCRIPTABLE_TITLE,
])
const FRESH_MS = 10 * 60 * 1000

export function classicStyle(): WidgetStyle {
  return {
    id: "classic",
    name: "經典",
    title: "流媒體解鎖檢測",
    layout: "classic",
    accent: "#FFD60A",
    textColor: "label",
    showLocation: true,
    maskIP: false,
    showTime: true,
    showHint: true,
  }
}

export function cardStyle(): WidgetStyle {
  return {
    id: "cards",
    name: "卡片",
    title: "流媒體解鎖檢測",
    layout: "classic",
    accent: "#FFD60A",
    textColor: "label",
    showLocation: true,
    maskIP: false,
    showTime: true,
    showHint: true,
  }
}

export function compactStyle(): WidgetStyle {
  return {
    id: "compact",
    name: "精簡",
    title: "流媒體解鎖檢測",
    layout: "compact",
    accent: "#FFD60A",
    textColor: "label",
    showLocation: true,
    maskIP: false,
    showTime: true,
    showHint: true,
  }
}

export function defaultStyles(): WidgetStyle[] {
  return [classicStyle()]
}

function normalizeAccent(value: unknown): AccentId {
  const found = ACCENTS.find(item => item.id === value)
  return found ? found.id : "#FF2D55"
}

function normalizeTextColor(value: unknown): TextColorId {
  const found = TEXT_COLORS.find(item => item.id === value)
  return found ? found.id : "label"
}

function normalizeLayout(value: unknown): LayoutId {
  if (value === "cards" || value === "compact" || value === "classic") return value
  return "classic"
}

export function normalizeStyle(raw: Partial<WidgetStyle> | null | undefined, fallback?: WidgetStyle): WidgetStyle {
  const base = fallback ?? classicStyle()
  const source = raw ?? {}
  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id : base.id,
    name: typeof source.name === "string" && source.name.trim() ? source.name.trim() : base.name,
    title: normalizeTitle(source.title, base.title),
    layout: normalizeLayout(source.layout ?? base.layout),
    accent: normalizeAccent(source.accent ?? base.accent),
    textColor: normalizeTextColor(source.textColor ?? base.textColor),
    showLocation: typeof source.showLocation === "boolean" ? source.showLocation : base.showLocation,
    maskIP: typeof source.maskIP === "boolean" ? source.maskIP : base.maskIP,
    showTime: typeof source.showTime === "boolean" ? source.showTime : base.showTime,
    showHint: typeof source.showHint === "boolean" ? source.showHint : base.showHint,
  }
}

function normalizeTitle(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback
  const trimmed = value.trim()
  if (!trimmed || LEGACY_TITLES.has(trimmed)) return SCRIPTABLE_TITLE
  return trimmed
}

export function loadStyles(): WidgetStyle[] {
  const raw = Storage.get<WidgetStyle[]>(STYLES_KEY)
  if (!Array.isArray(raw)) return defaultStyles()
  let styles = raw.map(item => normalizeStyle(item)).filter(item => item.id)
  if (styles.length === 0) return defaultStyles()
  const first = styles[0] ?? classicStyle()
  if (Storage.get<number>(STYLE_VERSION_KEY) !== STYLE_VERSION) {
    const builtin = first.name === "經典" || first.name === "卡片" || first.name === "精簡"
    const single = normalizeStyle({
      ...first,
      id: "classic",
      name: builtin ? "樣式" : first.name,
    })
    Storage.set(STYLES_KEY, [single])
    Storage.set(STYLE_VERSION_KEY, STYLE_VERSION)
    return [single]
  }
  return [first]
}

export function saveStyles(styles: WidgetStyle[]): void {
  Storage.set(STYLES_KEY, styles.map(item => normalizeStyle(item)))
}

export function newStyleId(): string {
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

export function layoutName(layout: LayoutId): string {
  switch (layout) {
    case "cards": return "標準文字"
    case "compact": return "緊湊文字"
    default: return "標準文字"
  }
}

export function resolveStyle(parameter: string, styles: WidgetStyle[]): WidgetStyle {
  const list = styles.length > 0 ? styles : defaultStyles()
  const raw = parameter.trim()
  if (!raw) return list[0]
  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as { id?: string }
      if (parsed && typeof parsed.id === "string") {
        const found = list.find(item => item.id === parsed.id)
        if (found) return found
      }
    } catch {
      // 參數不是 JSON 時，改用名稱比對。
    }
  }
  const found = list.find(item => item.id === raw || item.name === raw)
  return found ?? list[0]
}

export function previewOptions(styles: WidgetStyle[]): { options: Record<string, string>; names: string[] } {
  const options: Record<string, string> = {}
  const names: string[] = []
  styles.forEach((style, index) => {
    let name = style.name.trim() || `樣式 ${index + 1}`
    if (options[name]) name = `${name} ${index + 1}`
    options[name] = JSON.stringify({ id: style.id })
    names.push(name)
  })
  return { options, names }
}

export function loadCache(): UnlockReport | null {
  const raw = Storage.get<unknown>(CACHE_KEY)
  if (!isUnlockReport(raw)) return null
  return raw
}

export function saveCache(report: UnlockReport): void {
  Storage.set(CACHE_KEY, report)
}

export function isFresh(report: UnlockReport, maxAge = FRESH_MS): boolean {
  const time = Date.parse(report.timestamp)
  return Number.isFinite(time) && Date.now() - time < maxAge
}

export function requestRefresh(): void {
  Storage.set(FORCE_KEY, Date.now())
}

export function refreshRequested(): boolean {
  const stamp = Storage.get<number>(FORCE_KEY)
  if (typeof stamp !== "number") return false
  if (Date.now() - stamp > 2 * 60 * 1000) {
    Storage.remove(FORCE_KEY)
    return false
  }
  return true
}

export function clearRefreshRequest(): void {
  Storage.remove(FORCE_KEY)
}

export function consumeForceRefresh(): boolean {
  const stamp = Storage.get<number>(FORCE_KEY)
  if (typeof stamp !== "number") return false
  Storage.remove(FORCE_KEY)
  return Date.now() - stamp < 2 * 60 * 1000
}

export const WIDGET_STYLES = ["classic", "glass", "ice", "iceMedium"] as const
export type WidgetStyle = typeof WIDGET_STYLES[number]
export type IceAppearance = "dark" | "light"
export type StoredWidgetGradient = {
  id: string
  label: string
  colors: string[]
  tone: "light" | "dark"
  custom?: boolean
}

export const WIDGET_METRIC_IDS = [
  "balance",
  "monthUsage",
  "monthBill",
  "previousBill",
  "yesterdayUsage",
] as const
export type WidgetMetricId = typeof WIDGET_METRIC_IDS[number]

export type WidgetConfiguration = {
  widgetStyle: WidgetStyle
  widgetMetricIds: WidgetMetricId[]
  iceAppearance: IceAppearance
  widgetGradientId: string
  customWidgetGradients: StoredWidgetGradient[]
}

export const DEFAULT_WIDGET_STYLE: WidgetStyle = "glass"
export const DEFAULT_ICE_APPEARANCE: IceAppearance = "dark"
export const DEFAULT_WIDGET_GRADIENT_ID = "mist-blue"
export const DEFAULT_WIDGET_METRIC_IDS: WidgetMetricId[] = [
  "balance",
  "monthUsage",
  "previousBill",
  "yesterdayUsage",
]

export const WIDGET_METRIC_LABELS: Record<WidgetMetricId, string> = {
  balance: "电费余额",
  monthUsage: "本月用电",
  monthBill: "本月账单",
  previousBill: "上月账单",
  yesterdayUsage: "昨日用电",
}

const LEGACY_CLASSIC_SUPPLEMENTAL_PRIORITY: WidgetMetricId[] = [
  "yesterdayUsage",
  "monthBill",
  "monthUsage",
  "previousBill",
  "balance",
]

export function updateWidgetMetricSlot(
  currentIds: readonly WidgetMetricId[],
  targetIndex: number,
  nextMetricId: WidgetMetricId,
) {
  const next = normalizeWidgetMetricIds(currentIds)
  if (targetIndex < 0 || targetIndex >= DEFAULT_WIDGET_METRIC_IDS.length) {
    return next
  }

  const duplicateIndex = next.indexOf(nextMetricId)
  if (duplicateIndex >= 0 && duplicateIndex !== targetIndex) {
    [next[targetIndex], next[duplicateIndex]] = [next[duplicateIndex], next[targetIndex]]
  } else {
    next[targetIndex] = nextMetricId
  }
  return next
}

export function normalizeWidgetConfiguration(input: unknown): WidgetConfiguration {
  const raw = isRecord(input) ? input : {}
  const customWidgetGradients = normalizeStoredCustomGradients(
    raw.customWidgetGradients,
    raw.customWidgetGradient,
  )
  const requestedGradientId = typeof raw.widgetGradientId === "string"
    ? raw.widgetGradientId
    : DEFAULT_WIDGET_GRADIENT_ID
  return {
    widgetStyle: isWidgetStyle(raw.widgetStyle) ? raw.widgetStyle : DEFAULT_WIDGET_STYLE,
    widgetMetricIds: normalizeWidgetMetricIds(raw.widgetMetricIds),
    iceAppearance: raw.iceAppearance === "light" ? "light" : DEFAULT_ICE_APPEARANCE,
    widgetGradientId: requestedGradientId === "custom" && customWidgetGradients.length > 0
      ? customWidgetGradients[0].id
      : requestedGradientId,
    customWidgetGradients,
  }
}

export function normalizeWidgetMetricIds(input: unknown): WidgetMetricId[] {
  const result: WidgetMetricId[] = []
  const candidates = Array.isArray(input) ? input : []
  const legacyThreeSlotConfiguration = new Set(candidates.filter(isWidgetMetricId)).size === 3

  for (const candidate of candidates) {
    if (isWidgetMetricId(candidate) && !result.includes(candidate)) {
      result.push(candidate)
    }
    if (result.length === DEFAULT_WIDGET_METRIC_IDS.length) {
      return result
    }
  }

  const fallbackOrder = legacyThreeSlotConfiguration
    ? LEGACY_CLASSIC_SUPPLEMENTAL_PRIORITY
    : DEFAULT_WIDGET_METRIC_IDS
  for (const fallback of [...fallbackOrder, ...DEFAULT_WIDGET_METRIC_IDS, ...WIDGET_METRIC_IDS]) {
    if (!result.includes(fallback)) {
      result.push(fallback)
    }
    if (result.length === DEFAULT_WIDGET_METRIC_IDS.length) {
      break
    }
  }
  return result
}

export function resolveClassicMetricIds(input: unknown): WidgetMetricId[] {
  return normalizeWidgetMetricIds(input)
}

export function resolveWidgetConfiguration(parameter: string | null | undefined, fallback: unknown) {
  if (parameter?.trim()) {
    try {
      return normalizeWidgetConfiguration(JSON.parse(parameter))
    } catch (error) {
      console.log("[CSG] widget:invalidParameter", String((error as Error)?.message ?? error))
    }
  }
  return normalizeWidgetConfiguration(fallback)
}

export function isWidgetMetricId(value: unknown): value is WidgetMetricId {
  return typeof value === "string" && WIDGET_METRIC_IDS.includes(value as WidgetMetricId)
}

function isWidgetStyle(value: unknown): value is WidgetStyle {
  return typeof value === "string" && WIDGET_STYLES.includes(value as WidgetStyle)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null
}

function normalizeStoredCustomGradients(value: unknown, legacyValue: unknown): StoredWidgetGradient[] {
  const candidates = Array.isArray(value)
    ? value
    : isRecord(legacyValue)
      ? [legacyValue]
      : []
  const gradients: StoredWidgetGradient[] = []

  for (const candidate of candidates) {
    const normalized = normalizeStoredCustomGradient(candidate, gradients)
    if (normalized) gradients.push(normalized)
  }
  return gradients
}

function normalizeStoredCustomGradient(
  value: unknown,
  existing: readonly StoredWidgetGradient[],
): StoredWidgetGradient | null {
  if (!isRecord(value) || !Array.isArray(value.colors)) return null
  const colors = value.colors
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => /^#[0-9A-F]{6}$/.test(item))
    .slice(0, 3)
  if (colors.length < 2) {
    return null
  }
  const requestedId = typeof value.id === "string" && /^custom-\d+$/.test(value.id)
    ? value.id
    : null
  let index = 1
  while (existing.some((item) => item.id === `custom-${index}`)) index += 1
  const id = requestedId && !existing.some((item) => item.id === requestedId)
    ? requestedId
    : `custom-${index}`
  const labelIndex = Number(id.slice("custom-".length))
  return {
    id,
    label: `导入配色 ${labelIndex}`,
    colors,
    tone: value.tone === "dark" ? "dark" : "light",
    custom: true,
  }
}

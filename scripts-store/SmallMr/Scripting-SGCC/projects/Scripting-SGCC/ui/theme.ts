import { Widget } from 'scripting'
import type { WidgetTheme } from '../core/settings'

type Palette = { light: string; dark: string }
export type ThemePalette = {
  background: Palette
  surface: Palette
  module: Palette
  line: Palette
  label: Palette
  faint: Palette
  title: Palette
  tierTrack: Palette
}

const palette = (light: string, dark: string): Palette => ({ light, dark })

export const WIDGET_BG = palette('#FFFFFF', '#141917')
export const INK = palette('#17211C', '#F7FAF8')
export const MUTED = palette('#61716A', '#BECBC5')
export const QUIET = palette('#7B8A83', '#9EAEA7')
export const FAINT = palette('#A0ACA6', '#6F7E77')
export const LINE = palette('#E4ECE8', '#2C3A34')
export const MONEY = palette('#55645E', '#C7D1CC')
export const UNIT = palette('#788881', '#AAB8B2')
export const PILL_BG = palette('#F0F6F3', '#22302B')

/** 两套桌面主题：浮岛是鼠尾草画布 + 白卡，格栅是纯白画布 + 灰模块。 */
export const THEME_PALETTES: Record<WidgetTheme, ThemePalette> = {
  island: {
    background: palette('#FFFFFF', '#121815'),
    surface: palette('#FFFFFF', '#121815'),
    module: palette('#EAF3EE', '#22302B'),
    line: palette('#E4EEE8', '#2E3C35'),
    label: palette('#8A9C93', '#A9B8B0'),
    faint: palette('#A9B6B0', '#7C8C84'),
    title: palette('#647A70', '#B9C7C0'),
    tierTrack: palette('#DDE8E2', '#2E3C35')
  },
  grid: {
    background: palette('#FFFFFF', '#101412'),
    surface: palette('#FFFFFF', '#101412'),
    module: palette('#F1F2EF', '#1D2421'),
    line: palette('#E8EDEA', '#2C3530'),
    label: palette('#7A8A81', '#A8B5AF'),
    faint: palette('#A3AFA8', '#7F8C86'),
    title: palette('#5D6A63', '#BAC6C0'),
    tierTrack: palette('#E4EAE7', '#2E3833')
  }
}

export function themePalette(theme: WidgetTheme = 'island'): ThemePalette {
  return THEME_PALETTES[theme] ?? THEME_PALETTES.island
}

export const RED = '#C96A60'
export const RED_TEXT = '#AC4C43'
export const BLUE = '#6D97BE'
export const BLUE_TEXT = '#47739C'
export const AMBER = '#DDAA56'
export const AMBER_TEXT_ON_LIGHT = '#91641E'
export const TIER_GREEN = '#159B7E'
export const TIER_AMBER = '#E0A84C'
export const TIER_THIRD = '#C89674'
export const CALENDAR_RED = '#BF5B4E'
export const CALENDAR_BLUE = '#4E7CA6'
export const CALENDAR_AMBER = '#A9762A'
export const CALENDAR_DATE = '#98A6A0'

export const GRID_MARK_URL =
  'https://cdn.jsdelivr.net/gh/SmallMr/Scripting-SGCC@main/assets/logo.png'

/**
 * 设计稿按 2 倍像素标注；这里统一换算成当前组件上的点。
 * 组件比例固定，所以只按宽度缩放，窗口尺寸不会改变版式。
 */
export function px(value: number) {
  const width = Widget.displaySize.width || 338
  const nominal = Widget.family === 'systemSmall' ? 158 : 338
  return (value / 2) * (width / nominal)
}

/** 设计稿按点标注时使用；组件比例固定，只随实际宽度等比缩放。 */
export function pt(value: number) {
  const width = Widget.displaySize.width || 338
  const nominal = Widget.family === 'systemSmall' ? 158 : 338
  return value * (width / nominal)
}

/**
 * 数字格式：千分位总开关、日历保留几位小数、本月是否保留小数。
 * 组件渲染是同步的，所以在每次渲染开头按当前设置刷新即可。
 */
type NumberFormat = {
  group: boolean
  calendarDigits: 1 | 2
  monthDigits: 0 | 1
}

let numberFormat: NumberFormat = {
  group: true,
  calendarDigits: 1,
  monthDigits: 1
}

export function applyNumberFormat(settings: {
  useThousands?: boolean
  calendarTwoDecimals?: boolean
  monthDecimals?: boolean
}) {
  numberFormat = {
    group: settings.useThousands !== false,
    calendarDigits: settings.calendarTwoDecimals === true ? 2 : 1,
    monthDigits: settings.monthDecimals === false ? 0 : 1
  }
}

function groupDigits(text: string, group = numberFormat.group) {
  return group ? text.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : text
}

/** 数字格式场景：普通、日历、本月。 */
export type UsageKind = 'plain' | 'calendar' | 'month'

/** 去掉无意义的尾零；日历和本月各自按设置决定小数位。 */
export function formatUsage(value: number, kind: UsageKind = 'plain') {
  const safe = Number.isFinite(value) ? value : 0
  const digits =
    kind === 'calendar'
      ? numberFormat.calendarDigits
      : kind === 'month'
        ? numberFormat.monthDigits
        : 1
  const factor = digits === 2 ? 100 : 10
  const rounded = Math.round(safe * factor) / factor
  const [integer, decimal] = rounded.toFixed(digits).split('.')
  const grouped = groupDigits(integer)
  if (!decimal || Number(decimal) === 0) return grouped
  return `${grouped}.${decimal.replace(/0+$/, '')}`
}

export function formatMoney(value: number | string) {
  const safe = Number(value)
  if (!Number.isFinite(safe)) return '0.00'
  const [integer, decimal] = safe.toFixed(2).split('.')
  return `${groupDigits(integer)}.${decimal}`
}

export function clockText(timestamp: number) {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`
}

export function monthStamp(timestamp: number) {
  const month = new Date(timestamp).getMonth() + 1
  return `${month}月`
}

export function updatedAtText(timestamp: number) {
  return `更新 ${clockText(timestamp)}`
}

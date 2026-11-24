export type WeekStart = 'sunday' | 'monday'

export type CalendarSettings = {
  background: string
  weekStart: WeekStart
  fontScale: number
  fontWeightStep: number
  showIntlFestivals: boolean
}

export const DEFAULT_SETTINGS: CalendarSettings = {
  background: '#F8F8FA',
  weekStart: 'sunday',
  fontScale: 1,
  fontWeightStep: -1,
  showIntlFestivals: true
}

const SETTINGS_KEY = 'calendar-settings'

export const FONT_SCALE_MIN = 0.85
export const FONT_SCALE_MAX = 1.25
export const FONT_SCALE_STEP = 0.05
export const FONT_WEIGHT_MIN = -2
export const FONT_WEIGHT_MAX = 2
export const FONT_WEIGHT_STEP = 1

function normalizeFontScale(value: unknown) {
  if (typeof value !== 'number' || !isFinite(value)) {
    return DEFAULT_SETTINGS.fontScale
  }
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value))
}

function normalizeFontWeightStep(value: unknown) {
  if (typeof value !== 'number' || !isFinite(value)) {
    return DEFAULT_SETTINGS.fontWeightStep
  }
  return Math.min(
    FONT_WEIGHT_MAX,
    Math.max(FONT_WEIGHT_MIN, Math.round(value))
  )
}

export function readSettings(): CalendarSettings {
  let saved: Partial<CalendarSettings> = {}
  try {
    saved = Storage.get<Partial<CalendarSettings>>(SETTINGS_KEY) ?? {}
  } catch (error) {
    console.error(error)
  }
  return {
    background:
      typeof saved.background === 'string' && saved.background.trim()
        ? saved.background
        : DEFAULT_SETTINGS.background,
    weekStart: saved.weekStart === 'monday' ? 'monday' : 'sunday',
    fontScale: normalizeFontScale(saved.fontScale),
    fontWeightStep: normalizeFontWeightStep(saved.fontWeightStep),
    showIntlFestivals: saved.showIntlFestivals !== false
  }
}

export function writeSettings(settings: CalendarSettings) {
  try {
    Storage.set(SETTINGS_KEY, settings)
  } catch (error) {
    console.error(error)
  }
}

import { Storage } from 'scripting'

export type WeekStart = 'sunday' | 'monday'

export type CalendarSettings = {
  background: string
  weekStart: WeekStart
}

export const DEFAULT_SETTINGS: CalendarSettings = {
  background: '#F8F8FA',
  weekStart: 'sunday'
}

const SETTINGS_KEY = 'calendar-settings'

export function readSettings(): CalendarSettings {
  const saved = Storage.get<Partial<CalendarSettings>>(SETTINGS_KEY) ?? {}
  return {
    background:
      typeof saved.background === 'string' && saved.background.trim()
        ? saved.background
        : DEFAULT_SETTINGS.background,
    weekStart: saved.weekStart === 'monday' ? 'monday' : 'sunday'
  }
}

export function writeSettings(settings: CalendarSettings) {
  Storage.set(SETTINGS_KEY, settings)
}

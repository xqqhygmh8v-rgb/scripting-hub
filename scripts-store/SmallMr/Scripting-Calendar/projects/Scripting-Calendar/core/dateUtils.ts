import type { WeekStart } from './settings'

export function pad2(value: number) {
  return String(value).padStart(2, '0')
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`
}

export function dateFromKey(key: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const [year, month, day] = key.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

export function sameDay(a: Date, b: Date) {
  return dateKey(a) === dateKey(b)
}

export function isWeekend(date: Date) {
  const day = date.getDay()
  return day === 0 || day === 6
}

export const WEEKDAYS_SUNDAY = [
  '周日',
  '周一',
  '周二',
  '周三',
  '周四',
  '周五',
  '周六'
]

export const WEEKDAYS_MONDAY = [
  '周一',
  '周二',
  '周三',
  '周四',
  '周五',
  '周六',
  '周日'
]

export function getWeekLabels(weekStart: WeekStart) {
  return weekStart === 'monday' ? WEEKDAYS_MONDAY : WEEKDAYS_SUNDAY
}

export type MonthCursor = {
  year: number
  month: number
}

const MONTH_KEY = 'calendar-month-cursor'

function isValidCursor(value: MonthCursor) {
  return (
    Number.isInteger(value.year) &&
    value.year >= 1901 &&
    value.year <= 2099 &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  )
}

export function readMonthCursor(): MonthCursor | null {
  const raw = Storage.get<string>(MONTH_KEY)
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null
  const [year, month] = raw.split('-').map(Number)
  const value = { year, month }
  return isValidCursor(value) ? value : null
}

export function writeMonthCursor(cursor: MonthCursor) {
  if (!isValidCursor(cursor)) return
  Storage.set(
    MONTH_KEY,
    `${cursor.year}-${String(cursor.month).padStart(2, '0')}`
  )
}

export function resetMonthCursor() {
  Storage.remove(MONTH_KEY)
}

export function shiftMonthCursor(delta: number) {
  const now = new Date()
  const current =
    readMonthCursor() ?? { year: now.getFullYear(), month: now.getMonth() + 1 }
  const target = new Date(current.year, current.month - 1 + delta, 1)
  writeMonthCursor({
    year: target.getFullYear(),
    month: target.getMonth() + 1
  })
}

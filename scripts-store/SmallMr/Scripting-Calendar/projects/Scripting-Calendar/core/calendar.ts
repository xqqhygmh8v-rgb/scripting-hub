import solarLunar from '../vendor/solarlunar'
import {
  dateKey,
  getWeekLabels,
  isWeekend,
  pad2,
  sameDay
} from './dateUtils'
import type { WeekStart } from './settings'

export {
  dateFromKey,
  dateKey,
  getWeekLabels,
  isWeekend,
  pad2,
  sameDay,
  WEEKDAYS_MONDAY,
  WEEKDAYS_SUNDAY
} from './dateUtils'

export type SolarLunarResult = {
  lYear: number
  lMonth: number
  lDay: number
  animal: string
  yearCn: string
  monthCn: string
  dayCn: string
  cYear: number
  cMonth: number
  cDay: number
  gzYear: string
  gzMonth: string
  gzDay: string
  isToday: boolean
  isLeap: boolean
  nWeek: number
  ncWeek: string
  isTerm: boolean
  term: string
}

type SolarLunarApi = {
  solar2lunar(
    year: number,
    month: number,
    day: number
  ): SolarLunarResult | -1
  getFestivals(year: number, month: number, day: number): string[]
}

const lunarApi = solarLunar as SolarLunarApi

export type CalendarCell = {
  date: Date
  key: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  isWeekend: boolean
  lunar: SolarLunarResult | null
  eventLabel: string
}

const SOLAR_FESTIVALS: Record<string, string> = {
  '01-01': '元旦',
  '05-01': '劳动节',
  '10-01': '国庆节'
}

const FESTIVAL_NAMES: Record<string, string> = {
  元宵节: '元宵',
  端午节: '端午',
  七夕节: '七夕',
  中秋节: '中秋',
  重阳节: '重阳',
  腊八节: '腊八',
  小年: '小年'
}

const LUNAR_FESTIVALS: Record<string, string> = {
  '1-1': '春节',
  '1-15': '元宵',
  '2-2': '龙抬头',
  '5-5': '端午',
  '7-7': '七夕',
  '7-15': '中元',
  '8-15': '中秋',
  '9-9': '重阳',
  '10-1': '寒衣节',
  '10-15': '下元',
  '12-8': '腊八',
  '12-23': '小年'
}

const INTL_FIXED_FESTIVALS: Record<string, string> = {
  '02-14': '情人节',
  '03-08': '妇女节',
  '04-01': '愚人节',
  '10-31': '万圣夜',
  '11-01': '万圣节',
  '12-24': '平安夜',
  '12-25': '圣诞节'
}

function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  nth: number
) {
  const first = new Date(year, month - 1, 1, 12)
  const offset = (weekday - first.getDay() + 7) % 7
  return 1 + offset + (nth - 1) * 7
}

function easterDate(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

function getIntlFestival(date: Date) {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  const fixed = INTL_FIXED_FESTIVALS[`${pad2(month)}-${pad2(day)}`]
  if (fixed) return fixed

  if (month === 5 && day === nthWeekdayOfMonth(year, 5, 0, 2)) {
    return '母亲节'
  }
  if (month === 6 && day === nthWeekdayOfMonth(year, 6, 0, 3)) {
    return '父亲节'
  }
  if (month === 11 && day === nthWeekdayOfMonth(year, 11, 4, 4)) {
    return '感恩节'
  }
  const easter = easterDate(year)
  if (month === easter.month && day === easter.day) {
    return '复活节'
  }
  return ''
}

export function getLunar(date: Date): SolarLunarResult | null {
  try {
    const result = lunarApi.solar2lunar(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate()
    )
    return result === -1 ? null : result
  } catch (error) {
    console.error(error)
    return null
  }
}

function normalizeFestival(name: string) {
  if (!name || name === '农历新年') return ''
  return FESTIVAL_NAMES[name] ?? name
}

function getLunarFestival(date: Date, lunar: SolarLunarResult) {
  if (!lunar.isLeap) {
    const fixed = LUNAR_FESTIVALS[`${lunar.lMonth}-${lunar.lDay}`]
    if (fixed) return fixed
  }

  let festivals: string[] = []
  try {
    festivals = lunarApi.getFestivals(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate()
    )
  } catch (error) {
    console.error(error)
    return ''
  }
  for (const name of festivals) {
    const normalized = normalizeFestival(name)
    if (normalized) return normalized
  }

  if (lunar.lMonth === 12 && lunar.lDay >= 29) {
    const tomorrow = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + 1,
      12
    )
    const nextLunar = getLunar(tomorrow)
    if (
      nextLunar &&
      nextLunar.lMonth === 1 &&
      nextLunar.lDay === 1 &&
      !nextLunar.isLeap
    ) {
      return '除夕'
    }
  }
  return ''
}

export function getEventLabel(
  date: Date,
  lunar: SolarLunarResult | null,
  showIntlFestivals = false
) {
  if (!lunar) return ''
  if (lunar.isTerm && lunar.term) return lunar.term

  const lunarFestival = getLunarFestival(date, lunar)
  if (lunarFestival) return lunarFestival

  const solarFestival =
    SOLAR_FESTIVALS[
      `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    ] ?? ''
  if (solarFestival) return solarFestival

  return showIntlFestivals ? getIntlFestival(date) : ''
}

export function buildMonthGrid(
  year: number,
  month: number,
  weekStart: WeekStart,
  showIntlFestivals = false
): CalendarCell[] {
  const first = new Date(year, month - 1, 1, 12)
  const startOffset =
    weekStart === 'monday'
      ? (first.getDay() + 6) % 7
      : first.getDay()
  const gridStart = new Date(year, month - 1, 1 - startOffset, 12)
  const today = new Date()

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(
      gridStart.getFullYear(),
      gridStart.getMonth(),
      gridStart.getDate() + index,
      12
    )
    const lunar = getLunar(date)
    return {
      date,
      key: dateKey(date),
      day: date.getDate(),
      isCurrentMonth:
        date.getFullYear() === year && date.getMonth() === month - 1,
      isToday: sameDay(date, today),
      isWeekend: isWeekend(date),
      lunar,
    eventLabel: getEventLabel(date, lunar, showIntlFestivals)
    }
  })
}

export function getWeekNumber(date: Date) {
  const year = date.getFullYear()
  const dayOfYear =
    Math.floor(
      (Date.UTC(year, date.getMonth(), date.getDate()) -
        Date.UTC(year, 0, 1)) /
        86400000
    ) + 1
  return Math.ceil(dayOfYear / 7)
}

export function getFooterParts(date: Date) {
  const lunar = getLunar(date)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const week = getWeekNumber(date)
  if (!lunar) {
    return {
      dateLabel: `${month}月${day}日`,
      detailLabel: `第${week}周`
    }
  }
  return {
    dateLabel: `${month}月${day}日`,
    detailLabel: `第${week}周 · ${lunar.gzYear}(${lunar.animal})年 ${lunar.monthCn}${lunar.dayCn}`
  }
}

export function getLunarDayLabel(lunar: SolarLunarResult | null) {
  return lunar?.dayCn ?? ''
}

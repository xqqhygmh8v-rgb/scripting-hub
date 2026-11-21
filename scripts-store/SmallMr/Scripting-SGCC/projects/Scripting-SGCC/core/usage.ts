/** 网上国网接口返回的户号数据（只列出用到的字段）。 */
export type GridAccountPayload = {
  userInfo?: {
    consNo?: string
    consNo_dst?: string
    consName_dst?: string
    orgName?: string
    proNo?: string
  }
  arrearsOfFees?: boolean
  /** 后付费户才有 `accountBalance`（账户预存款）。 */
  eleBill?: { sumMoney?: number | string; accountBalance?: number | string }
  dayElecQuantity31?: {
    sevenEleList?: { day: string; dayElePq: number | string }[]
  }
  monthElecQuantity?: {
    mothEleList?: {
      month: string
      monthEleNum: number | string
      monthEleCost: number | string
    }[]
    dataInfo?: { totalEleNum?: number | string; totalEleCost?: number | string }
  }
  /** 当月累计用电量，由查询层直接返回。 */
  monthTotal?: number | string
}

export type DayUsage = { day: string; value: number }
export type MonthUsage = { month: string; pq: number; cost: number }
export type WeekStart = 'monday' | 'sunday'

export type CalendarMonthCell = {
  /** 0 表示用来补齐整周的空白格。 */
  day: number
  key: string
  value: number | null
  /** 当月最后一个有数据的日子，用琥珀色强调。 */
  isLatest: boolean
  isFuture: boolean
  isMax: boolean
  isMin: boolean
}

export type CalendarMonth = {
  leading: number
  /** 当月占用的周数，最少 5 行、最多 6 行。 */
  weeks: number
  cells: CalendarMonthCell[]
}

/** 小组件真正会用到的汇总数据。 */
export type UsageSummary = {
  hasArrears: boolean
  balance: string
  monthUsage: number
  yesterdayUsage: number
  previousCost: string
  previousUsage: number
  yearUsage: number
  yearCost: string
  /** 计入年度阶梯的电量。 */
  tierUsage: number
  days: DayUsage[]
  months: MonthUsage[]
}

export type Tier = 1 | 2 | 3

const asNumber = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const currentMonthKey = () => {
  const now = new Date()
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
}

function dayKey(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(
    2,
    '0'
  )}${String(date.getDate()).padStart(2, '0')}`
}

function shiftDay(date: Date, offset: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset)
}

/** 当前月每天的用电情况，按周一开头补齐六周。 */
export function calendarForMonth(
  days: DayUsage[],
  now = new Date(),
  weekStart: WeekStart = 'monday'
): CalendarMonth {
  const year = now.getFullYear()
  const monthIndex = now.getMonth()
  const monthKey = `${year}${String(monthIndex + 1).padStart(2, '0')}`
  const today = now.getDate()
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const leading =
    weekStart === 'sunday' ? firstWeekday : (firstWeekday + 6) % 7
  const dayCount = new Date(year, monthIndex + 1, 0).getDate()
  const values: Record<string, number> = {}
  for (const item of days) {
    if (item.day.startsWith(monthKey)) values[item.day] = item.value
  }

  const known = Array.from({ length: today }, (_, index) => index + 1)
    .map((day) => values[`${monthKey}${String(day).padStart(2, '0')}`])
    .filter((value): value is number => Number.isFinite(value) && value > 0)
  const maximum = known.length ? Math.max(...known) : 0
  const minimum = known.length ? Math.min(...known) : 0
  const latestDay = Object.keys(values).reduce((latest, key) => {
    const dayNumber = Number(key.slice(-2))
    return dayNumber <= today && dayNumber > latest ? dayNumber : latest
  }, 0)
  const weeks = Math.max(5, Math.ceil((leading + dayCount) / 7))

  const cells: CalendarMonthCell[] = []
  for (let index = 0; index < leading; index++) {
    cells.push({
      day: 0,
      key: `blank-leading-${index}`,
      value: null,
      isLatest: false,
      isFuture: false,
      isMax: false,
      isMin: false
    })
  }
  for (let day = 1; day <= dayCount; day++) {
    const key = `${monthKey}${String(day).padStart(2, '0')}`
    const value = values[key]
    const hasValue = Number.isFinite(value) && day <= today
    cells.push({
      day,
      key,
      value: hasValue ? Number(value) : null,
      isLatest: hasValue && day === latestDay,
      isFuture: day > today,
      isMax: hasValue && known.length > 1 && Number(value) === maximum,
      isMin: hasValue && known.length > 1 && Number(value) === minimum
    })
  }
  while (cells.length < weeks * 7) {
    cells.push({
      day: 0,
      key: `blank-trailing-${cells.length}`,
      value: null,
      isLatest: false,
      isFuture: false,
      isMax: false,
      isMin: false
    })
  }
  return { leading, weeks, cells }
}

/** 当前阶梯，以及本阶梯剩余额度（第三阶梯改为显示本年总量）。 */
export function tierDisplay(
  usage: number,
  firstCap: number,
  secondCap: number
) {
  const tier = resolveTier(usage, firstCap, secondCap)
  const safeFirst = Math.max(1, firstCap)
  const safeSecond = Math.max(safeFirst + 1, secondCap)
  const ratio =
    tier === 1
      ? usage / safeFirst
      : tier === 2
        ? (usage - safeFirst) / (safeSecond - safeFirst)
        : (usage - safeSecond) / (safeSecond - safeFirst)
  const percent = Math.max(0, Math.min(1, ratio))
  const remaining = Math.max(0, (tier === 1 ? safeFirst : safeSecond) - usage)
  const amount = tier === 3 ? usage : remaining
  const detail =
    tier === 3
      ? `本年 ${Math.round(usage * 10) / 10} 度`
      : `本阶梯剩余 ${Math.round(remaining * 10) / 10} 度`
  const shortDetail =
    tier === 3
      ? detail
      : `剩余 ${Math.round(remaining * 10) / 10} 度`
  return {
    tier,
    percent,
    fraction: ((tier - 1) + percent) / 3,
    remaining,
    amount,
    label: tier === 3 ? '本年' : '本阶梯剩余',
    detail,
    shortDetail
  }
}

/** 把接口原始数据整理成组件直接可用的结构。 */
export function buildUsageSummary(payload: GridAccountPayload): UsageSummary {
  const { eleBill = {}, dayElecQuantity31 = {}, monthElecQuantity = {} } = payload

  const days = (dayElecQuantity31.sevenEleList || [])
    .filter(
      ({ dayElePq }) =>
        dayElePq !== '' &&
        dayElePq != null &&
        !Number.isNaN(Number(dayElePq))
    )
    .map(({ day, dayElePq }) => ({ day: String(day), value: Number(dayElePq) }))
    .sort((a, b) => a.day.localeCompare(b.day))

  const months = (monthElecQuantity.mothEleList || [])
    .map(({ month, monthEleNum, monthEleCost }) => ({
      month: String(month),
      pq: asNumber(monthEleNum),
      cost: asNumber(monthEleCost)
    }))
    .sort((a, b) => a.month.localeCompare(b.month))

  const monthKey = currentMonthKey()
  const now = new Date()
  const yesterdayKey = dayKey(shiftDay(now, -1))
  // 最近一个已经结算的月份作为“上期”
  const settled = months.filter(
    ({ month, pq, cost }) => month < monthKey && (pq > 0 || cost > 0)
  )
  const lastSettled = settled[settled.length - 1]
  const yearUsage = asNumber(monthElecQuantity.dataInfo?.totalEleNum)
  // 阶梯电量 = 年度已结算电量 + 本月尚未结算的日用电
  const pendingUsage = months.some(({ month }) => month === monthKey)
    ? 0
    : days
        .filter(({ day }) => day.startsWith(monthKey))
        .reduce((sum, { value }) => sum + value, 0)
  const monthRow = months.find(({ month }) => month === monthKey)
  const dailyMonthUsage = days
    .filter(({ day }) => day.startsWith(monthKey))
    .reduce((sum, { value }) => sum + value, 0)
  const payloadMonthUsage = asNumber(payload.monthTotal)
  const monthUsage =
    payloadMonthUsage > 0
      ? payloadMonthUsage
      : monthRow && monthRow.pq > 0
        ? monthRow.pq
        : dailyMonthUsage
  const yesterday =
    days.find(({ day }) => day === yesterdayKey) ??
    [...days]
      .reverse()
      .find(({ day }) => day < dayKey(now) && day.startsWith(monthKey))

  const hasArrears = !!payload.arrearsOfFees
  // 后付费用户的 sumMoney 是应缴账单，余额要取 accountBalance
  const isPostPaid = Object.prototype.hasOwnProperty.call(
    eleBill,
    'accountBalance'
  )
  const balance =
    isPostPaid && !hasArrears ? eleBill.accountBalance : eleBill.sumMoney

  return {
    hasArrears,
    balance: asNumber(balance).toFixed(2),
    monthUsage,
    yesterdayUsage: yesterday ? yesterday.value : 0,
    previousCost: lastSettled ? lastSettled.cost.toFixed(2) : '0.00',
    previousUsage: lastSettled ? lastSettled.pq : 0,
    yearUsage,
    yearCost: asNumber(monthElecQuantity.dataInfo?.totalEleCost).toFixed(2),
    tierUsage: Math.round(yearUsage + pendingUsage),
    days,
    months
  }
}

export function resolveTier(
  total: number,
  firstCap: number,
  secondCap: number
): Tier {
  return total > secondCap ? 3 : total > firstCap ? 2 : 1
}

/**
 * 当前阶梯以及在该阶梯里的进度。第三阶梯没有上限，按和第二阶梯相同的
 * 宽度（`2 * secondCap - firstCap`）来归一化。
 */
export function tierPosition(
  usage: number,
  firstCap: number,
  secondCap: number
): { tier: Tier; percent: number } {
  const tier = resolveTier(usage, firstCap, secondCap)
  const cap = [firstCap, secondCap, secondCap * 2 - firstCap][tier - 1]
  const percent = cap > 0 ? Math.min(usage / cap, 1) : 0
  return { tier, percent }
}

export const TIER_CAPTIONS: Record<Tier, string> = { 1: '一', 2: '二', 3: '三' }

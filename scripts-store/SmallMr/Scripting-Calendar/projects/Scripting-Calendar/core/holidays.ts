import { fetch } from 'scripting'
import { pad2 } from './dateUtils'

export type HolidayMarker = 'rest' | 'work' | 'none'
export type HolidaySource = 'online' | 'manual'

export type HolidayYearData = {
  year: number
  rest: string[]
  work: string[]
  updatedAt: number
  source: HolidaySource
  provider?: string
}

const HOLIDAY_KEY_PREFIX = 'calendar-holidays-v2-'
const LEGACY_HOLIDAY_KEY_PREFIX = 'calendar-holidays-'
const FETCH_FAILURE_KEY = 'calendar-holidays-fetch-failure'

export type HolidayFetchFailure = { year: number; message: string }

export type HolidayFetchFailureState = {
  time: number
  failures: HolidayFetchFailure[]
}

export function readFetchFailure(): HolidayFetchFailureState | null {
  try {
    const value = Storage.get<HolidayFetchFailureState>(FETCH_FAILURE_KEY)
    if (!value || !Array.isArray(value.failures)) return null
    return {
      time: Number(value.time) || 0,
      failures: value.failures.filter(
        (item) =>
          item &&
          typeof item.year === 'number' &&
          typeof item.message === 'string'
      )
    }
  } catch (error) {
    console.error(error)
    return null
  }
}

export function writeFetchFailure(failures: HolidayFetchFailure[]) {
  try {
    if (failures.length === 0) {
      Storage.remove(FETCH_FAILURE_KEY)
      return
    }
    Storage.set<HolidayFetchFailureState>(FETCH_FAILURE_KEY, {
      time: Date.now(),
      failures
    })
  } catch (error) {
    console.error(error)
  }
}

function storageKey(year: number) {
  return `${HOLIDAY_KEY_PREFIX}${year}`
}

function legacyStorageKey(year: number) {
  return `${LEGACY_HOLIDAY_KEY_PREFIX}${year}`
}

function isWeekendKey(key: string) {
  const day = new Date(`${key}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

function dayDistance(first: string, second: string) {
  const a = Date.parse(`${first}T00:00:00Z`)
  const b = Date.parse(`${second}T00:00:00Z`)
  return Math.round((b - a) / 86400000)
}

// 旧版数据把每个普通周末都写进了休息日，这里只保留含工作日的连续假期段。
function dropPlainWeekendRuns(dates: string[]) {
  const sorted = [...dates].sort()
  const kept: string[] = []
  let index = 0
  while (index < sorted.length) {
    let end = index
    while (
      end + 1 < sorted.length &&
      dayDistance(sorted[end], sorted[end + 1]) === 1
    ) {
      end += 1
    }
    const run = sorted.slice(index, end + 1)
    if (run.some((key) => !isWeekendKey(key))) kept.push(...run)
    index = end + 1
  }
  return kept
}

function isValidDateForYear(value: string, year: number) {
  return (
    typeof value === 'string' &&
    value.startsWith(`${year}-`) &&
    /^\d{4}-\d{2}-\d{2}$/.test(value)
  )
}

function uniqueSorted(values: string[], year: number) {
  return Array.from(
    new Set(values.filter((value) => isValidDateForYear(value, year)))
  ).sort()
}

function normalizeData(
  value: HolidayYearData | null,
  year: number
): HolidayYearData | null {
  if (!value || value.year !== year) return null
  return {
    year,
    rest: uniqueSorted(Array.isArray(value.rest) ? value.rest : [], year),
    work: uniqueSorted(Array.isArray(value.work) ? value.work : [], year),
    updatedAt: Number(value.updatedAt) || 0,
    source: value.source === 'online' ? 'online' : 'manual',
    provider:
      typeof value.provider === 'string' ? value.provider : undefined
  }
}

export function readHolidayYear(year: number): HolidayYearData | null {
  try {
    const current = normalizeData(
      Storage.get<HolidayYearData>(storageKey(year)),
      year
    )
    if (current) return current

    const legacy = normalizeData(
      Storage.get<HolidayYearData>(legacyStorageKey(year)),
      year
    )
    if (!legacy) return null

    const migrated: HolidayYearData = {
      ...legacy,
      rest: dropPlainWeekendRuns(legacy.rest)
    }
    writeHolidayYear(migrated)
    return migrated
  } catch (error) {
    console.error(error)
    return null
  }
}

export function writeHolidayYear(data: HolidayYearData) {
  try {
    Storage.set(storageKey(data.year), {
      ...data,
      rest: uniqueSorted(data.rest, data.year),
      work: uniqueSorted(data.work, data.year)
    })
  } catch (error) {
    console.error(error)
  }
}

export function clearHolidayYear(year: number) {
  Storage.remove(storageKey(year))
  Storage.remove(legacyStorageKey(year))
}

export function makeEmptyHolidayYear(
  year: number,
  source: HolidaySource = 'manual'
): HolidayYearData {
  return {
    year,
    rest: [],
    work: [],
    updatedAt: 0,
    source
  }
}

export function getEffectiveHolidayYear(year: number) {
  return readHolidayYear(year) ?? makeEmptyHolidayYear(year)
}

export function applyHolidayMarker(
  data: HolidayYearData,
  key: string,
  marker: HolidayMarker
): HolidayYearData {
  if (!isValidDateForYear(key, data.year)) return data
  const rest = new Set(data.rest)
  const work = new Set(data.work)

  if (marker === 'rest') {
    rest.add(key)
    work.delete(key)
  } else if (marker === 'work') {
    work.add(key)
    rest.delete(key)
  } else {
    rest.delete(key)
    work.delete(key)
  }

  return {
    ...data,
    rest: Array.from(rest).sort(),
    work: Array.from(work).sort(),
    source: 'manual',
    updatedAt: Date.now()
  }
}

export function getMarker(
  data: HolidayYearData,
  key: string
): HolidayMarker {
  if (data.work.includes(key)) return 'work'
  if (data.rest.includes(key)) return 'rest'
  return 'none'
}

export function formatUpdatedAt(timestamp: number) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

type OnlineDay = {
  date: string
  off: boolean
}

async function requestJson(url: string) {
  const response = await fetch(url, {
    timeout: 18,
    headers: {
      Accept: 'application/json'
    },
    debugLabel: 'Calendar holidays'
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return response.json()
}

async function fetchFromTimor(year: number) {
  const payload = await requestJson(
    `https://timor.tech/api/holiday/year/${year}`
  )
  if (!payload || payload.code !== 0 || !payload.holiday) {
    throw new Error('接口未返回有效数据')
  }
  const days: OnlineDay[] = []
  for (const value of Object.values<any>(payload.holiday)) {
    const key = typeof value?.date === 'string' ? value.date : ''
    if (!isValidDateForYear(key, year) || typeof value?.holiday !== 'boolean') {
      continue
    }
    days.push({ date: key, off: value.holiday })
  }
  if (days.length === 0) throw new Error('接口没有节假日记录')
  return { days, provider: 'timor.tech' }
}

async function fetchFromHolidayCn(year: number) {
  const payload = await requestJson(
    `https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/${year}.json`
  )
  if (
    !payload ||
    payload.year !== year ||
    !Array.isArray(payload.days) ||
    payload.days.length === 0
  ) {
    throw new Error('接口未返回有效数据')
  }
  const days: OnlineDay[] = []
  for (const value of payload.days) {
    if (
      typeof value?.date !== 'string' ||
      typeof value?.isOffDay !== 'boolean' ||
      !isValidDateForYear(value.date, year)
    ) {
      continue
    }
    days.push({ date: value.date, off: value.isOffDay })
  }
  if (days.length === 0) throw new Error('接口没有节假日记录')
  return { days, provider: 'holiday-cn' }
}

export async function fetchHolidayYear(
  year: number
): Promise<HolidayYearData> {
  const errors: string[] = []
  let result: { days: OnlineDay[]; provider: string } | null = null

  try {
    result = await fetchFromTimor(year)
  } catch (error) {
    errors.push(`timor.tech: ${String(error)}`)
  }

  if (!result) {
    try {
      result = await fetchFromHolidayCn(year)
    } catch (error) {
      errors.push(`holiday-cn: ${String(error)}`)
    }
  }

  if (!result) {
    throw new Error(`在线获取失败。${errors.join('；')}`)
  }

  const rest = new Set<string>()
  const work = new Set<string>()

  for (const day of result.days) {
    if (day.off) {
      rest.add(day.date)
      work.delete(day.date)
    } else {
      work.add(day.date)
      rest.delete(day.date)
    }
  }

  return {
    year,
    rest: Array.from(rest).sort(),
    work: Array.from(work).sort(),
    updatedAt: Date.now(),
    source: 'online',
    provider: result.provider
  }
}

import type { LadderInfo, MonthDayRecord, WidgetData } from "../types"

const RECORD_CONTAINER_KEYS = [
  "result",
  "list",
  "rows",
  "records",
  "items",
  "data",
  "pageData",
] as const

const DATE_KEYS = ["date", "day", "dataDate", "electricityDate", "statDate"] as const
const KWH_KEYS = ["power", "dayPower", "electricity", "electricQuantity", "kwh", "usage"] as const
const CHARGE_KEYS = ["charge", "dayCharge", "electricityCharge", "amount"] as const
const INCOMPLETE_CACHE_RETRY_MS = 60 * 60 * 1000
const BILL_FETCH_COOLDOWN_MS = 6 * 60 * 60 * 1000

export function extractSurplusValues(raw: unknown) {
  const records = extractRecords(raw)
  return {
    balance: readFirstNumber(records, ["balance", "accountBalance", "surplus", "availableBalance"]),
    arrears: readFirstNumber(records, ["arrears", "arrearsAmount", "oweFee", "debt"]),
  }
}

export function extractMonthTotalKwh(raw: unknown) {
  const records = extractRecords(raw)
  const direct = readFirstNumber(records, [
    "totalPower",
    "totalKwh",
    "totalUsage",
    "monthPower",
    "monthElectricity",
  ])
  if (direct != null) return direct

  const dailyValues = records.flatMap((record) => {
    if (!readDate(record)) return []
    const value = readNumber(record, KWH_KEYS)
    return value == null ? [] : [value]
  })
  return dailyValues.length > 0 ? dailyValues.reduce((sum, value) => sum + value, 0) : null
}

export function extractYesterdayKwh(raw: unknown) {
  return readFirstNumber(extractRecords(raw), KWH_KEYS)
}

export function extractChargeTotal(raw: unknown) {
  return readFirstNumber(extractRecords(raw), [
    "totalElectricity",
    "totalEleCharge",
    "totalCharge",
    "payableAmount",
    "receivableAmount",
    "billAmount",
    "amount",
  ])
}

export function extractLadderInfo(raw: unknown): LadderInfo {
  const records = extractRecords(raw)
  return {
    ladder: readFirstNumber(records, ["ladderEle", "currentLadder", "ladder"]),
    remainingKwh: readFirstNumber(records, ["ladderEleSurplus", "remainingPower", "remainingKwh"]),
    tariff: readFirstNumber(records, ["ladderEleTariff", "ladderPrice", "tariff"]),
  }
}

export function pickLatestDayRecord(raw: unknown): MonthDayRecord | null {
  const candidates = extractRecords(raw).flatMap((record) => {
    const date = readDate(record)
    const charge = readNumber(record, CHARGE_KEYS)
    const kwh = readNumber(record, KWH_KEYS)
    if (!date || (charge == null && kwh == null)) return []
    return [{
      date,
      charge: charge ?? 0,
      kwh: kwh ?? 0,
    }]
  })

  candidates.sort((left, right) => left.date.localeCompare(right.date))
  return candidates.at(-1) ?? null
}

export function evaluateCachePolicy(cached: WidgetData | null, now: Date, accountNumber: string) {
  if (!cached || cached.account.accountNumber !== accountNumber) {
    return {
      useCache: false,
      reason: "no-matching-cache",
    }
  }

  if (hasIncompleteCoreData(cached)) {
    const refreshedAt = Date.parse(cached.refreshedAt)
    const ageMs = now.getTime() - refreshedAt
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < INCOMPLETE_CACHE_RETRY_MS) {
      return {
        useCache: true,
        reason: "recent-incomplete-cache",
      }
    }
    return {
      useCache: false,
      reason: "incomplete-cache-retry",
    }
  }

  if (now.getHours() < 16) {
    return {
      useCache: true,
      reason: "before-refresh-window",
    }
  }

  if (isSameDayRecord(cached.latestDay?.date ?? null, now)) {
    return {
      useCache: true,
      reason: "already-has-today-data",
    }
  }

  return {
    useCache: false,
    reason: "need-refresh-after-16",
  }
}

export function shouldFetchBillData(
  cached: Pick<WidgetData, "account" | "lastBillAttemptAt"> | null,
  now: Date,
  accountNumber: string,
) {
  if (!cached || cached.account.accountNumber !== accountNumber || !cached.lastBillAttemptAt) return true
  const attemptedAt = Date.parse(cached.lastBillAttemptAt)
  if (!Number.isFinite(attemptedAt)) return true
  const ageMs = now.getTime() - attemptedAt
  return ageMs < 0 || ageMs >= BILL_FETCH_COOLDOWN_MS
}

function hasIncompleteCoreData(data: WidgetData) {
  return data.monthTotalCharge == null
    || data.previousMonthCharge == null
    || data.monthTotalKwh == null
    || data.yesterdayKwh == null
    || data.latestDay == null
}

function extractRecords(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 5 || value == null) return []
  if (Array.isArray(value)) {
    return value.flatMap((item) => extractRecords(item, depth + 1))
  }
  if (!isRecord(value)) return []

  const nested = RECORD_CONTAINER_KEYS
    .filter((key) => value[key] != null)
    .flatMap((key) => extractRecords(value[key], depth + 1))
  return [value, ...nested]
}

function readFirstNumber(records: readonly Record<string, unknown>[], keys: readonly string[]) {
  for (const record of records) {
    const value = readNumber(record, keys)
    if (value != null) return value
  }
  return null
}

function readNumber(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = toFiniteNumber(record[key])
    if (value != null) return value
  }
  return null
}

function toFiniteNumber(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null
  const match = value.replaceAll(",", "").match(/[-+]?\d+(?:\.\d+)?/)
  if (!match) return null
  const number = Number(match[0])
  return Number.isFinite(number) ? number : null
}

function readDate(record: Record<string, unknown>) {
  for (const key of DATE_KEYS) {
    const date = normalizeDate(record[key])
    if (date) return date
  }
  return null
}

function normalizeDate(value: unknown) {
  const text = String(value ?? "").trim()
  const compact = text.replace(/\D/g, "")
  const match = compact.match(/^(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/)
  if (!match) return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

function isSameDayRecord(dateText: string | null, now: Date) {
  if (!dateText) return false
  const normalized = normalizeDate(dateText)
  const today = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}-${`${now.getDate()}`.padStart(2, "0")}`
  return normalized === today
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value)
}

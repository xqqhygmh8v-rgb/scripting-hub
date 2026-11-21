import type { CSGAccount } from "../types"

export type BillLookupContext = {
  account: CSGAccount
  authToken: string
  customerNumber: string
  yearMonths: string[]
}

type OfficialBillRequest = (
  path: string,
  payload: Record<string, unknown>,
  options: {
    authToken: string
    customerNumber: string
    timeout: number
  },
) => Promise<unknown>

export function summarizeBillResponseShape(value: unknown) {
  const items = extractBillItems(value)

  return {
    container: Array.isArray(value) ? "array" : value == null ? "null" : typeof value,
    itemCount: items.length,
    itemKeys: isRecord(items[0]) ? Object.keys(items[0]).sort() : [],
  }
}

export async function probeOfficialBillList(
  request: OfficialBillRequest,
  context: BillLookupContext,
) {
  const requestOptions = {
    authToken: context.authToken,
    customerNumber: context.customerNumber,
    timeout: 8,
  }
  const sortedMonths = [...context.yearMonths].sort()
  const responses: unknown[] = []

  const collect = (path: string, data: unknown) => {
    console.log("[CSG] billFallback:shape", path, JSON.stringify(summarizeBillResponseShape(data)))
    responses.push(data)
    return hasEveryRequestedMonth(responses, context.yearMonths)
  }

  try {
    const path = "charge/queryEleBills"
    const data = await request(path, {
      areaCode: context.account.areaCode,
      eleCustId: context.account.eleCustomerId,
      startTime: sortedMonths[0] ?? "",
      endTime: sortedMonths.at(-1) ?? "",
      queryType: "2",
      pageNum: 1,
      pageSize: 24,
    }, requestOptions)
    if (collect(path, data)) return finishResponses(responses)
  } catch {
    console.log("[CSG] billFallback:failed", "charge/queryEleBills", "request-failed")
  }

  const years = [...new Set(context.yearMonths.map((month) => month.slice(0, 4)).filter(Boolean))]
  for (const electricityBillYear of years) {
    for (const path of ["charge/selectElecBill", "charge/selectElecBillList"]) {
      try {
        const data = await request(path, {
          eleCustId: context.account.eleCustomerId,
          electricityBillYear,
          areaCode: context.account.areaCode,
          pageNum: 1,
          pageSize: 24,
        }, requestOptions)
        if (collect(path, data)) return finishResponses(responses)
      } catch {
        console.log("[CSG] billFallback:failed", path, "request-failed")
      }
    }
  }

  return finishResponses(responses)
}

export function selectOfficialBillAmounts(raw: unknown, yearMonths: readonly string[]) {
  const requestedMonths = new Set(yearMonths)
  const result: Partial<Record<string, number>> = {}

  for (const item of extractBillItems(raw)) {
    if (!isRecord(item)) continue
    const month = normalizeYearMonth(
      item.electricityBillYearMonth
      ?? item.startMonthDate
      ?? item.billMonth
      ?? item.billYearMonth
      ?? item.chargeMonth
      ?? item.settleMonth
      ?? item.yearMonth
      ?? item.month,
    )
    if (!month || !requestedMonths.has(month)) continue

    const amount = toNonNegativeNumber(
      item.totalElectricity
      ?? item.totalEleCharge
      ?? item.totalCharge
      ?? item.payableAmount
      ?? item.receivableAmount
      ?? item.billAmount
      ?? item.actualAmount
      ?? item.amount
      ?? item.charge,
    )
    if (amount != null && result[month] == null) {
      result[month] = amount
    }
  }

  return result
}

function extractBillItems(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (isRecord(item) && hasBillContainer(item)) {
        return extractBillItems(item)
      }
      return [item]
    })
  }
  if (!isRecord(value)) return []

  const nestedItems = BILL_CONTAINER_KEYS
    .filter((key) => value[key] != null)
    .flatMap((key) => extractBillItems(value[key]))
  if (nestedItems.length > 0) {
    return nestedItems
  }
  return [value]
}

function hasBillContainer(value: Record<string, any>) {
  return BILL_CONTAINER_KEYS.some((key) => value[key] != null)
}

const BILL_CONTAINER_KEYS = [
  "billList",
  "billUserAndYear",
  "result",
  "list",
  "rows",
  "records",
  "items",
  "data",
  "pageData",
] as const

function normalizeYearMonth(value: unknown) {
  const text = String(value ?? "").trim()
  const compact = text.replace(/\D/g, "")
  if (/^20\d{4}/.test(compact)) {
    const month = Number(compact.slice(4, 6))
    return month >= 1 && month <= 12 ? `${compact.slice(0, 4)}${`${month}`.padStart(2, "0")}` : null
  }
  const match = text.match(/(20\d{2})\D+(\d{1,2})/)
  if (!match) return null
  const month = Number(match[2])
  return month >= 1 && month <= 12 ? `${match[1]}${`${month}`.padStart(2, "0")}` : null
}

function toNonNegativeNumber(value: unknown) {
  if (value == null || value === "") return null
  const normalized = typeof value === "string"
    ? value.replaceAll(",", "").match(/[-+]?\d+(?:\.\d+)?/)?.[0]
    : value
  const number = Number(normalized)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function hasEveryRequestedMonth(raw: unknown, yearMonths: readonly string[]) {
  const amounts = selectOfficialBillAmounts(raw, yearMonths)
  return yearMonths.every((month) => amounts[month] != null)
}

function finishResponses(responses: unknown[]) {
  if (responses.length === 0) return null
  return responses.length === 1 ? responses[0] : responses
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value != null && !Array.isArray(value)
}

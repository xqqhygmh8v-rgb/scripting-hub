import type { AppConfig } from "./config"
import { configScope, localDateKey, recordTrafficSnapshot, type DailyUsagePoint } from "./traffic_history"

export type ECSStatus = "Running" | "Stopped" | "Starting" | "Stopping" | "Unknown"
export interface ECSInstanceRecord {
  InstanceId?: string
  Status?: string
  StoppedMode?: string
  PublicIpAddress?: { IpAddress?: string | string[] }
  EipAddress?: { IpAddress?: string | string[] }
  PublicIpAddresses?: string | string[]
  EipAddresses?: string | string[]
}
export interface ECSInfo { status: ECSStatus; publicIp?: string; instanceName?: string; stoppedMode?: string }
export interface MonitorSnapshot {
  scope: string
  updatedAt: string
  trafficUpdatedAt: string
  billingCycle: string
  totalGB: number
  thresholdGB: number
  cutoffGB: number
  remainingGB: number
  cutoffRemainingGB: number
  percentage: number
  daysRemaining: number
  dailyBudgetGB: number
  monthTimeProgress: number
  dailyUsage: DailyUsagePoint[]
  ecs: ECSInfo
}

export const SNAPSHOT_STORAGE_KEY = "aliyun_cdt_dashboard_cache_v2"

function firstIp(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.find(item => typeof item === "string" && item.trim())?.trim()
  if (typeof value !== "string" || !value.trim()) return undefined
  if (value.trim().startsWith("[")) {
    try { return firstIp(JSON.parse(value)) } catch { return undefined }
  }
  return value.trim()
}

export function getInstanceInfo(record?: ECSInstanceRecord): ECSInfo {
  return {
    status: (record?.Status as ECSStatus) || "Unknown",
    publicIp: firstIp(record?.EipAddress?.IpAddress)
      || firstIp(record?.PublicIpAddress?.IpAddress)
      || firstIp(record?.EipAddresses)
      || firstIp(record?.PublicIpAddresses),
    instanceName: record?.InstanceId,
    stoppedMode: record?.StoppedMode
  }
}

function localBillCycle(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export async function fetchCoreSnapshot(config: AppConfig, now = new Date(), persist = true): Promise<MonitorSnapshot> {
  const { AliyunService } = await import("./aliyun")
  const service = new AliyunService(config)
  const [traffic, ecs] = await Promise.all([
    service.getCDTTraffic(),
    service.getECSStatus(config.ecsInstanceId)
  ])

  const dailyUsage = recordTrafficSnapshot(config, traffic.totalGB, now)
  const day = now.getDate()
  const daysRemaining = Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - day + 1)
  const percentage = config.trafficThresholdGB > 0
    ? Number(((traffic.totalGB / config.trafficThresholdGB) * 100).toFixed(1))
    : 0
  const cutoffGB = Math.min(config.vpsCutoffReferenceGB, config.trafficThresholdGB)

  const snapshot: MonitorSnapshot = {
    scope: configScope(config),
    updatedAt: now.toISOString(),
    trafficUpdatedAt: now.toISOString(),
    billingCycle: localBillCycle(now),
    totalGB: traffic.totalGB,
    thresholdGB: config.trafficThresholdGB,
    cutoffGB,
    remainingGB: Math.max(0, Number((config.trafficThresholdGB - traffic.totalGB).toFixed(2))),
    cutoffRemainingGB: Number((cutoffGB - traffic.totalGB).toFixed(2)),
    percentage,
    daysRemaining,
    dailyBudgetGB: Number((Math.max(0, cutoffGB - traffic.totalGB) / daysRemaining).toFixed(2)),
    monthTimeProgress: Number(((day / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100).toFixed(1)),
    dailyUsage,
    ecs: { status: ecs.status, publicIp: ecs.publicIp, instanceName: ecs.instanceName, stoppedMode: ecs.stoppedMode }
  }

  if (persist) {
    try {
      Storage.set(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
    } catch {
      // The live snapshot remains usable even when caching is unavailable.
    }
  }
  return snapshot
}

export interface DashboardSnapshot extends MonitorSnapshot {
  balance: Awaited<ReturnType<AliyunServiceType["getAccountBalance"]>>
  bill: Awaited<ReturnType<AliyunServiceType["getMonthlyBill"]>>
  balanceStatus: "available" | "unavailable"
  billStatus: "available" | "unavailable"
  stale: boolean
}

type AliyunServiceType = import("./aliyun").AliyunService

export function loadCachedSnapshot(config: AppConfig, allowStale = false): MonitorSnapshot | null {
  try {
    const expectedScope = configScope(config)
    const raw = Storage.get<MonitorSnapshot | string | Record<string, unknown>>(SNAPSHOT_STORAGE_KEY)
    const value: unknown = typeof raw === "string" ? JSON.parse(raw) : raw
    if (!value || typeof value !== "object") return null
    const parsed = value as Partial<MonitorSnapshot> & { ecsStatus?: string; publicIp?: string }
    if (parsed.scope !== expectedScope) return null
    if (!Number.isFinite(Number(parsed.totalGB)) || (!parsed.ecs && typeof parsed.ecsStatus !== "string")) return null

    const updatedAt = new Date(String(parsed.updatedAt ?? ""))
    const now = new Date()
    if (!Number.isFinite(updatedAt.getTime()) || updatedAt.getTime() > now.getTime() + 60_000) return null
    if (updatedAt.getFullYear() !== now.getFullYear() || updatedAt.getMonth() !== now.getMonth()) return null
    if (!allowStale && localDateKey(updatedAt) !== localDateKey(now)) return null

    const dailyUsage = Array.isArray(parsed.dailyUsage) ? parsed.dailyUsage as DailyUsagePoint[] : []
    const cacheDate = localDateKey(updatedAt)
    const today = localDateKey(now)
    const normalizedDailyUsage = dailyUsage.map(point => {
      const dayNumber = Number(point.date.slice(8, 10))
      const isToday = point.date === today
      return {
        ...point,
        label: isToday ? "今" : `${dayNumber}日`,
        isToday,
        valueGB: allowStale && point.date > cacheDate ? null : point.valueGB
      }
    })
    return {
      scope: expectedScope,
      updatedAt: updatedAt.toISOString(),
      trafficUpdatedAt: String(parsed.trafficUpdatedAt ?? updatedAt.toISOString()),
      billingCycle: localBillCycle(now),
      totalGB: Number(parsed.totalGB),
      thresholdGB: config.trafficThresholdGB,
      cutoffGB: Math.min(config.vpsCutoffReferenceGB, config.trafficThresholdGB),
      remainingGB: Math.max(0, config.trafficThresholdGB - Number(parsed.totalGB)),
      cutoffRemainingGB: Math.min(config.vpsCutoffReferenceGB, config.trafficThresholdGB) - Number(parsed.totalGB),
      percentage: Number(((Number(parsed.totalGB) / config.trafficThresholdGB) * 100).toFixed(1)),
      daysRemaining: Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1),
      dailyBudgetGB: Math.max(0, Math.min(config.vpsCutoffReferenceGB, config.trafficThresholdGB) - Number(parsed.totalGB)) / Math.max(1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1),
      monthTimeProgress: Number(((now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100).toFixed(1)),
      dailyUsage: normalizedDailyUsage,
      ecs: (parsed.ecs as ECSInfo) ?? { status: parsed.ecsStatus as ECSStatus, publicIp: parsed.publicIp }
    }
  } catch {
    return null
  }
}

export async function fetchFinancialSnapshot(config: AppConfig, core: MonitorSnapshot): Promise<DashboardSnapshot> {
  const { AliyunService } = await import("./aliyun")
  const service = new AliyunService(config)
  const [balanceResult, billResult] = await Promise.allSettled([
    service.getAccountBalance(),
    service.getMonthlyBill()
  ])
  return {
    ...core,
    balance: balanceResult.status === "fulfilled" ? balanceResult.value : null,
    bill: billResult.status === "fulfilled" ? billResult.value : null,
    balanceStatus: balanceResult.status === "fulfilled" && balanceResult.value ? "available" : "unavailable",
    billStatus: billResult.status === "fulfilled" && billResult.value ? "available" : "unavailable",
    stale: false
  }
}

export async function loadCore(config: AppConfig, now?: Date): Promise<MonitorSnapshot> {
  return fetchCoreSnapshot(config, now)
}

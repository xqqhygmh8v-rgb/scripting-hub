import type { AppConfig } from "./config"

export interface DailyUsagePoint {
  date: string
  label: string
  valueGB: number | null
  isToday: boolean
}

interface TrafficSnapshot {
  date: string
  totalGB: number
  updatedAt: number
}

interface TrafficHistory {
  version: 1
  scope: string
  month: string
  snapshots: TrafficSnapshot[]
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function configScope(config: AppConfig): string {
  const source = `${config.accessKeyId.trim()}|${config.regionId.trim()}|${config.ecsInstanceId.trim()}`
  let hash = 2166136261
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function trafficScope(config: AppConfig): string {
  return configScope({ ...config, ecsInstanceId: "" })
}

function loadTrafficHistory(): TrafficHistory | null {
  try {
    const saved = Storage.get<TrafficHistory | string>("aliyun_cdt_daily_history_v2")
    const parsed = typeof saved === "string" ? JSON.parse(saved) : saved
    if (parsed?.version !== 1 || !Array.isArray(parsed.snapshots)) return null
    return parsed as TrafficHistory
  } catch {
    return null
  }
}

export function recordTrafficSnapshot(config: AppConfig, totalGB: number, now = new Date()): DailyUsagePoint[] {
  const today = localDateKey(now)
  const month = today.slice(0, 7)
  const scope = trafficScope(config)
  let history = loadTrafficHistory()

  if (history?.scope !== scope || history.month !== month) {
    history = { version: 1, scope, month, snapshots: [] }
  }

  const snapshots = history.snapshots
    .filter(item => item?.date?.startsWith(month) && Number.isFinite(item.totalGB) && item.totalGB >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  const latest = snapshots[snapshots.length - 1]

  if (latest && totalGB + 0.005 < latest.totalGB) snapshots.length = 0

  const todaySnapshot = snapshots.find(item => item.date === today)
  if (todaySnapshot) {
    todaySnapshot.totalGB = totalGB
    todaySnapshot.updatedAt = now.getTime()
  } else {
    snapshots.push({ date: today, totalGB, updatedAt: now.getTime() })
  }

  history.snapshots = snapshots.slice(-32)
  try {
    Storage.set("aliyun_cdt_daily_history_v2", JSON.stringify(history))
  } catch {
    // Continue without local history when storage is unavailable.
  }

  const byDate = new Map(history.snapshots.map(item => [item.date, item]))
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"]
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + index - 6)
    const dateKey = localDateKey(date)
    const previousKey = localDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1))
    const current = byDate.get(dateKey)
    const previous = byDate.get(previousKey)
    const valueGB = current && previous && current.totalGB + 0.005 >= previous.totalGB
      ? Math.max(0, Number((current.totalGB - previous.totalGB).toFixed(2)))
      : null

    return {
      date: dateKey,
      label: index === 6 ? "今" : `${date.getDate()}日`,
      valueGB,
      isToday: index === 6
    }
  })
}

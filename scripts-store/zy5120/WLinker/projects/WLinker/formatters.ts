// WLinker - 格式化工具
import type { ChargingState, Freshness, LockState, OpenState, VehicleSnapshot } from "./domain"

// ---- 锁状态（五菱 API：0=已锁定, 1=未锁定）----

export function lockState(value?: number): LockState {
  if (value == null) return "unknown"
  return value === 0 ? "locked" : "unlocked"
}

export function lockLabel(snapshot: VehicleSnapshot): string {
  const s = lockState(snapshot.status.doorLockStatus)
  return s === "locked" ? "已上锁" : s === "unlocked" ? "已解锁" : "未知"
}

export function lockIcon(snapshot: VehicleSnapshot): string {
  const s = lockState(snapshot.status.doorLockStatus)
  return s === "locked" ? "lock.fill" : s === "unlocked" ? "lock.open.fill" : "lock.slash"
}

// ---- 开关状态 ----

export function openState(value?: number): OpenState {
  if (value == null) return "unknown"
  return value === 0 ? "closed" : "open"
}

export function openLabel(value?: number, closedText = "已关闭", openText = "开启中"): string {
  const s = openState(value)
  return s === "closed" ? closedText : s === "open" ? openText : "未知"
}

// ---- 充电状态 ----

export function chargingState(snapshot: VehicleSnapshot): ChargingState {
  const charging = snapshot.status.charging
  const wire = snapshot.status.wireConnect
  if (charging == null && wire == null) return "unknown"
  if (charging === 1) return "charging"
  if (wire === 1 && charging === 0) return "complete"
  if (wire === 1) return "stopped"
  return "disconnected"
}

export function chargingLabel(snapshot: VehicleSnapshot): string {
  const s = chargingState(snapshot)
  switch (s) {
    case "charging": return "充电中"
    case "complete": return "已充满"
    case "stopped": return "已停止"
    case "disconnected": return "未充电"
    default: return "未知"
  }
}

export function chargingIcon(snapshot: VehicleSnapshot): string {
  const s = chargingState(snapshot)
  return s === "charging" ? "bolt.fill" : s === "complete" ? "checkmark.circle.fill" : "bolt.slash"
}

// ---- 数值格式化 ----

export function km(value?: number): string {
  return value != null ? `${value} km` : "—"
}

export function percent(value?: number): string {
  return value != null ? `${Math.round(value)}%` : "—"
}

export function celsius(value?: number): string {
  return value != null ? `${Math.round(value)}°C` : "—"
}

export function volt(value?: number): string {
  return value != null ? `${value} V` : "—"
}

// ---- 新鲜度 ----

export function freshness(snapshot: VehicleSnapshot, now = Date.now()): Freshness {
  if (!snapshot?.fetchedAt) return "missing"
  const fetched = Date.parse(snapshot.fetchedAt)
  if (Number.isNaN(fetched)) return "invalid"
  const ageMinutes = (now - fetched) / 60000
  if (ageMinutes < 0) return "invalid"
  if (ageMinutes <= 30) return "fresh"
  if (ageMinutes <= 60 * 6) return "stale"
  return "expired"
}

export function freshnessLabel(snapshot: VehicleSnapshot): string {
  const f = freshness(snapshot)
  switch (f) {
    case "fresh": return "刚刚更新"
    case "stale": return "数据较旧"
    case "expired": return "数据过期"
    case "missing": return "暂无数据"
    default: return "数据异常"
  }
}

export function freshnessColor(f: Freshness): string {
  switch (f) {
    case "fresh": return "#30D158"
    case "stale": return "#FF9F0A"
    case "expired": return "#FF453A"
    default: return "#8E8E93"
  }
}

// ---- 时间 ----

export function formatSyncTime(snapshot: VehicleSnapshot): string {
  if (!snapshot?.fetchedAt) return "—"
  const d = new Date(snapshot.fetchedAt)
  if (Number.isNaN(d.getTime())) return "—"
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// ---- 摘要 ----

export function batterySummary(snapshot: VehicleSnapshot): string {
  const soc = snapshot.status.batterySoc
  const range = snapshot.status.leftMileage
  if (soc != null && range != null) return `${Math.round(soc)}% · ${range}km`
  if (soc != null) return `${Math.round(soc)}%`
  return "—"
}

export interface SafetySummary {
  ok: boolean
  text: string
}

export function safetySummary(snapshot: VehicleSnapshot): SafetySummary {
  const s = snapshot.status
  if (s.doorLockStatus === 0) {
    if (s.doorOpenStatus === 1) return { ok: false, text: "已锁车但车门未关" }
    return { ok: true, text: "已锁车 · 门窗已关" }
  }
  return { ok: false, text: "车辆未上锁" }
}

export function gearLabel(value?: number): string {
  switch (value) {
    case 10: return "P"
    case 12: return "D"
    case 13: return "N"
    case 14: return "R"
    default: return value != null ? String(value) : "—"
  }
}

export function keyLabel(value?: number): string {
  switch (value) {
    case 0: return "无钥匙"
    case 1: return "已连接"
    case 2: return "已启动"
    default: return value != null ? String(value) : "—"
  }
}

// 展示用车名：接口 carName 可能是怪值（如"霾"），优先用 carTypeName（宏光MINIEV）
export function displayCarName(snapshot: VehicleSnapshot): string {
  const info = snapshot.info
  return info.carTypeName || info.carName || "五菱宏光 MINIEV"
}

// ---- 车辆体检（check/all）----
// 电池/电机类：1=正常，0=异常
export function checkStatusLabel(value?: string): string {
  if (value == null || value === "") return "未知"
  return value === "1" ? "正常" : value === "0" ? "异常" : value
}

// 评分：1=优，0=差
export function checkScoreLabel(value?: string): string {
  if (value == null || value === "") return "未知"
  return value === "1" ? "优" : value === "0" ? "差" : value
}

// 系统类（ABS/助力/转向）：0=正常，1=异常
export function checkSystemLabel(value?: string): string {
  if (value == null || value === "") return "未知"
  return value === "0" ? "正常" : value === "1" ? "异常" : value
}

// CDU 状态（电池运行状态）：5=正常
export function cduLabel(value?: string): string {
  if (value == null || value === "") return "未知"
  return value === "5" ? "正常" : value
}

// ---- 充电相关（映射自五菱 App 显示文案）----

// 充电线连接状态（wireConnect）
export function wireLabel(value?: number): string {
  if (value == null) return "未知"
  return value === 1 ? "已连接" : value === 0 ? "未连接" : String(value)
}

// 充电系统状态（rechargeStatus）
export function rechargeStatusLabel(value?: number): string {
  if (value == null) return "未知"
  return value === 1 ? "正常" : value === 0 ? "异常" : String(value)
}

// 充电标志 / 插枪状态（vecChrgingSts）
export function plugLabel(value?: number): string {
  if (value == null) return "未知"
  return value === 1 ? "已插枪" : value === 0 ? "未插枪" : String(value)
}

// 充电枪四态：充电中 / 已充满 / 已连接 / 未连接
export function plugStateLabel(snapshot: VehicleSnapshot): string {
  const charging = snapshot.status.charging
  const wire = snapshot.status.wireConnect
  if (charging === 1) return "充电中"
  if (wire === 1) {
    const soc = snapshot.status.batterySoc
    if (soc != null && soc >= 100) return "已充满"
    return "已连接"
  }
  if (wire === 0) return "未连接"
  return "未知"
}

// 车灯 / 开关类状态（0=关闭 1=开启）
export function lightLabel(value?: number): string {
  if (value == null) return "未知"
  return value === 1 ? "开启" : value === 0 ? "关闭" : String(value)
}

// WGS-84 → GCJ-02（火星坐标）转换
// 五菱接口返回 WGS-84 原始坐标，中国地图（Apple 地图/高德）使用 GCJ-02，不转换会偏移约数百米。
export function wgs84ToGcj02(latitude: number, longitude: number): { latitude: number; longitude: number } {
  const a = 6378245.0
  const ee = 0.00669342162296594323
  const transformLat = (x: number, y: number): number => {
    let ret = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x))
    ret += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3
    ret += (20 * Math.sin(y * Math.PI) + 40 * Math.sin(y / 3 * Math.PI)) * 2 / 3
    ret += (160 * Math.sin(y / 12 * Math.PI) + 320 * Math.sin(y * Math.PI / 30)) * 2 / 3
    return ret
  }
  const transformLng = (x: number, y: number): number => {
    let ret = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x))
    ret += (20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2 / 3
    ret += (20 * Math.sin(x * Math.PI) + 40 * Math.sin(x / 3 * Math.PI)) * 2 / 3
    ret += (150 * Math.sin(x / 12 * Math.PI) + 300 * Math.sin(x / 30 * Math.PI)) * 2 / 3
    return ret
  }
  // 中国境外不需要偏移
  if (longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271) {
    return { latitude, longitude }
  }
  const dLat = transformLat(longitude - 105, latitude - 35)
  const dLng = transformLng(longitude - 105, latitude - 35)
  const radLat = (latitude / 180) * Math.PI
  let magic = Math.sin(radLat)
  magic = 1 - ee * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  const mLat = (dLat * 180) / (((a * (1 - ee)) / (magic * sqrtMagic)) * Math.PI)
  const mLng = (dLng * 180) / ((a / sqrtMagic) * Math.cos(radLat) * Math.PI)
  return { latitude: latitude + mLat, longitude: longitude + mLng }
}

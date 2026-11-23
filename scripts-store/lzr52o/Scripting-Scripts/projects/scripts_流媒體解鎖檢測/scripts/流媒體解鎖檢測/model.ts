import type { Color } from "scripting"

export type ServiceId = "youtube" | "netflix" | "chatgpt" | "disney"
export type ServiceState = "ok" | "warn" | "soon" | "no" | "na"
export type LayoutId = "classic" | "cards" | "compact"

export type ServiceResult = {
  id: ServiceId
  name: string
  shortName: string
  state: ServiceState
  region: string
  detail: string
}

export type UnlockReport = {
  ip: string
  location: string
  services: ServiceResult[]
  timestamp: string
  stale: boolean
}

export const SERVICE_ORDER: ServiceId[] = ["youtube", "netflix", "chatgpt", "disney"]

const SERVICE_META: Record<ServiceId, { name: string; shortName: string }> = {
  youtube: { name: "YouTube", shortName: "YouTube" },
  netflix: { name: "Netflix", shortName: "Netflix" },
  chatgpt: { name: "ChatGPT", shortName: "ChatGPT" },
  disney: { name: "Disney+", shortName: "Disney" },
}

export function makeService(id: ServiceId, state: ServiceState, region: string, detail: string): ServiceResult {
  return {
    id,
    name: SERVICE_META[id].name,
    shortName: SERVICE_META[id].shortName,
    state,
    region,
    detail,
  }
}

export function emptyReport(): UnlockReport {
  return {
    ip: "—",
    location: "—",
    services: SERVICE_ORDER.map(id => makeService(id, "na", "", "尚未檢測")),
    timestamp: new Date().toISOString(),
    stale: true,
  }
}

export function isUnlockReport(value: unknown): value is UnlockReport {
  if (!value || typeof value !== "object") return false
  const report = value as UnlockReport
  if (typeof report.ip !== "string" || typeof report.location !== "string" || typeof report.timestamp !== "string") return false
  if (!Array.isArray(report.services) || report.services.length !== 4) return false
  return report.services.every(item => item && typeof item.id === "string" && typeof item.state === "string" && typeof item.shortName === "string")
}

export function stateLabel(state: ServiceState): string {
  switch (state) {
    case "ok": return "可解鎖"
    case "warn": return "部分可用"
    case "soon": return "即將上線"
    case "no": return "不支援"
    default: return "檢測失敗"
  }
}

export function stateColor(state: ServiceState): Color {
  switch (state) {
    case "ok": return "#30D158"
    case "warn": return "#FF9F0A"
    case "soon": return "#64D2FF"
    case "no": return "#FF453A"
    default: return "#8E8E93"
  }
}

export function stateMark(state: ServiceState): string {
  switch (state) {
    case "ok": return "✅"
    case "warn": return "⚠️"
    case "soon": return "🔜"
    case "no": return "❌"
    default: return "N/A"
  }
}

export function serviceLine(service: ServiceResult): string {
  if (service.state === "na") return `${service.shortName} ➟ N/A`
  if (service.state === "no") return `${service.shortName} ➟ NO`
  const region = service.region ? ` ${service.region}` : ""
  return `${service.shortName} ➟${region}`
}

function parsedDate(iso: string): Date | null {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(iso: string): string {
  const date = parsedDate(iso)
  if (!date) return "—"
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatClock(iso: string): string {
  const date = parsedDate(iso)
  if (!date) return "—"
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

export function formatShortTime(iso: string): string {
  const date = parsedDate(iso)
  if (!date) return "—"
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${date.getMonth() + 1}/${date.getDate()} - ${hours}:${minutes}`
}

export function formatTime(iso: string): string {
  const date = formatDate(iso)
  const clock = formatClock(iso)
  if (date === "—" || clock === "—") return "—"
  return `${date} - ${clock}`
}

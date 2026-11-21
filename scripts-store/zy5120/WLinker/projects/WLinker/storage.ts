// WLinker - 存储模块
// 参照 BMW MINI Linker：设置存共享域（组件可读），快照也写共享域投影。

import { Script } from "scripting"
import type { Freshness, VehicleSnapshot, WulingSettings } from "./domain"
import { makeDemoSnapshot } from "./fixtures"

export function scriptKeyNamespace(): string {
  const name = typeof Script !== "undefined" && Script.name ? Script.name : "wlinker"
  const safe = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return safe || "wlinker"
}

const NS = scriptKeyNamespace()
const SNAPSHOT_KEY = `wlinker.v1.${NS}.snapshot.connected`
const WIDGET_SNAPSHOT_KEY = `wlinker.v1.${NS}.snapshot.widget-projection`
const RUNTIME_MODE_KEY = `wlinker.v1.${NS}.runtimeMode`
const SETTINGS_KEY = `wlinker.v1.${NS}.settings`

const SHARED = { shared: true }

export const defaultSettings: WulingSettings = {
  schemaVersion: 1,
  freshnessMinutes: 15,
  staleHours: 6,
  selectedVin: "",
  doorCount: 2,
}

export function loadSettings(): WulingSettings {
  const value = Storage.get<WulingSettings>(SETTINGS_KEY, SHARED)
  if (!value || value.schemaVersion !== 1) {
    Storage.set(SETTINGS_KEY, defaultSettings, SHARED)
    return defaultSettings
  }
  return { ...defaultSettings, ...value }
}

export function saveSettings(settings: WulingSettings): WulingSettings {
  const next = { ...defaultSettings, ...settings, schemaVersion: 1 as const }
  Storage.set(SETTINGS_KEY, next, SHARED)
  return next
}

export type RuntimeMode = "demo" | "connected"

export function loadRuntimeMode(): RuntimeMode {
  return Storage.get<RuntimeMode>(RUNTIME_MODE_KEY, SHARED) === "connected" ? "connected" : "demo"
}

export function setRuntimeMode(mode: RuntimeMode): void {
  Storage.set(RUNTIME_MODE_KEY, mode, SHARED)
}

function isValidSnapshot(value: unknown): value is VehicleSnapshot {
  if (!value || typeof value !== "object") return false
  const s = value as VehicleSnapshot
  return s.schemaVersion === 1 &&
    typeof s.vin === "string" &&
    !!s.info && typeof s.info.carName === "string" &&
    !!s.status && typeof s.status.mileage !== "undefined" &&
    typeof s.fetchedAt === "string" &&
    typeof s.cachedAt === "string"
}

export function loadConnectedSnapshot(): VehicleSnapshot | null {
  const value = Storage.get<VehicleSnapshot>(SNAPSHOT_KEY)
  return isValidSnapshot(value) && value.source === "network" ? value : null
}

export function saveConnectedSnapshot(snapshot: VehicleSnapshot): VehicleSnapshot {
  if (!isValidSnapshot(snapshot) || snapshot.source !== "network") {
    throw new Error("CONNECTED_SNAPSHOT_INVALID")
  }
  Storage.set(SNAPSHOT_KEY, snapshot)
  const projection: VehicleSnapshot = { ...snapshot, info: { ...snapshot.info } }
  Storage.set(WIDGET_SNAPSHOT_KEY, projection, SHARED)
  return snapshot
}

export function loadWidgetSnapshot(): VehicleSnapshot {
  if (loadRuntimeMode() === "connected") {
    const projected = Storage.get<VehicleSnapshot>(WIDGET_SNAPSHOT_KEY, SHARED)
    if (isValidSnapshot(projected) && projected.source === "network") return projected
  }
  const demo = makeDemoSnapshot()
  return demo
}

export function getFreshness(snapshot: VehicleSnapshot | null, now = Date.now()): Freshness {
  if (!snapshot) return "missing"
  if (!isValidSnapshot(snapshot)) return "invalid"
  const cachedAt = new Date(snapshot.cachedAt).getTime()
  if (!Number.isFinite(cachedAt)) return "invalid"
  const settings = loadSettings()
  const ageMinutes = Math.max(0, (now - cachedAt) / 60000)
  if (ageMinutes <= settings.freshnessMinutes) return "fresh"
  if (ageMinutes <= settings.staleHours * 60) return "stale"
  return "expired"
}

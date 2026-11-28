/** 共享配置。旧版配置自动迁移，手机端始终只读。 */
export const APP_VERSION = "1.7.0"

export interface AppConfig {
  accessKeyId: string
  accessKeySecret: string
  regionId: string
  ecsInstanceId: string
  trafficThresholdGB: number
  vpsCutoffReferenceGB: number
  resetDayOfMonth: number
}

export const DEFAULT_CONFIG: AppConfig = {
  accessKeyId: "",
  accessKeySecret: "",
  regionId: "cn-hongkong",
  ecsInstanceId: "",
  trafficThresholdGB: 200,
  vpsCutoffReferenceGB: 195,
  resetDayOfMonth: 1
}
export const STORAGE_KEY = "aliyun_cdt_monitor_config"
export const PRIVACY_STORAGE_KEY = "aliyun_cdt_privacy_mode"

export function normalizeConfig(value: unknown): AppConfig {
  const saved = value && typeof value === "object" ? value as Partial<AppConfig> : {}
  const text = (v: unknown, fallback = "") => typeof v === "string" ? v.trim() : fallback
  const quota = Number(saved.trafficThresholdGB)
  const limit = Number.isFinite(quota) && quota > 0 ? quota : DEFAULT_CONFIG.trafficThresholdGB
  const cutoff = Number(saved.vpsCutoffReferenceGB)
  return {
    accessKeyId: text(saved.accessKeyId),
    accessKeySecret: text(saved.accessKeySecret),
    regionId: text(saved.regionId) || DEFAULT_CONFIG.regionId,
    ecsInstanceId: text(saved.ecsInstanceId),
    trafficThresholdGB: limit,
    vpsCutoffReferenceGB: Number.isFinite(cutoff) && cutoff > 0 ? Math.min(cutoff, limit) : Math.min(195, limit),
    resetDayOfMonth: 1
  }
}

export function loadConfig(): AppConfig {
  try {
    const raw = Storage.get<string | AppConfig>(STORAGE_KEY)
    return normalizeConfig(typeof raw === "string" ? JSON.parse(raw) : raw)
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: AppConfig): void {
  // 存储失败应由设置页显示，不能误报“保存成功”。
  if (Storage.set(STORAGE_KEY, JSON.stringify(normalizeConfig(config))) === false) {
    throw new Error("本地配置保存失败")
  }
}

export function isConfigured(config: AppConfig): boolean {
  return Boolean(config.accessKeyId && config.accessKeySecret && config.ecsInstanceId && config.regionId)
}

export function validateConfig(config: AppConfig): string | null {
  if (!config.accessKeyId.trim() || !config.accessKeySecret.trim()) return "请填写 AccessKey ID 和 Secret。"
  if (!config.ecsInstanceId.trim()) return "请填写 ECS 实例 ID。"
  if (!/^[a-z]{2}-[a-z0-9-]+$/.test(config.regionId.trim())) return "请填写有效的 Region ID，例如 cn-hongkong。"
  if (!Number.isFinite(config.trafficThresholdGB) || config.trafficThresholdGB <= 0) return "月流量额度必须大于 0。"
  if (!Number.isFinite(config.vpsCutoffReferenceGB) || config.vpsCutoffReferenceGB <= 0 || config.vpsCutoffReferenceGB > config.trafficThresholdGB) {
    return "VPS 参考线必须大于 0，且不能高于月流量额度。"
  }
  return null
}

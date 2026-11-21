import * as sdk from "scripting"
import { UserError } from "./core"

// Native APIs are supplied as globals by Scripting. Some releases also export
// them. Resolve at the call site so an unavailable API produces visible feedback.
export function nativeAPI(name: string): any {
  const value = (globalThis as any)[name] ?? (sdk as any)[name]
  if (value == null) throw new UserError(`当前 Scripting 未提供 ${name} 接口，请更新 App 后重试。`)
  return value
}

// 钥匙串在 Scripting 里是「按作用域隔离」的（script / execution / workspace 等多种），
// 从快捷指令启动时可能落到另一个作用域，于是读不到上一次写进去的值，
// 表现就是：填过一次 Key，下次打开还要再填。
// 文件是按路径存的，跟启动方式无关，也不受脚本重新导入影响，
// 所以这里以文件为主、钥匙串只作为旧版本的兼容回退。
const KEYCHAIN_KEY = "activity-to-calendar.deepseek-key"
const KEY_FILE_NAME = "activity-to-calendar-key.txt"

function keyFile(): string {
  return `${nativeAPI("FileManager").documentsDirectory}/${KEY_FILE_NAME}`
}

export function loadKey(): string {
  // 1) 文件优先
  try {
    const text = nativeAPI("FileManager").readAsStringSync(keyFile())
    const value = String(text || "").trim()
    if (value) return value
  } catch {
    // 文件不存在时 readAsStringSync 会抛错，落到下面的回退
  }
  // 2) 回退到钥匙串，兼容之前存过 Key 的版本
  try {
    return nativeAPI("Keychain").get(KEYCHAIN_KEY) || ""
  } catch {
    return ""
  }
}

export function rememberKey(key: string): void {
  const value = key.trim()
  let saved = false

  try {
    const fm = nativeAPI("FileManager")
    fm.writeAsStringSync(keyFile(), value)
    // 写完立刻读回来比对，避免"以为存了其实没存"
    if (String(fm.readAsStringSync(keyFile()) || "").trim() === value) saved = true
  } catch {
    // 文件写失败时继续尝试钥匙串
  }

  try {
    if (nativeAPI("Keychain").set(KEYCHAIN_KEY, value, {
      synchronizable: false, accessibility: "unlocked_this_device",
    }) === true) saved = true
  } catch {
    // 钥匙串不可用不影响文件方案
  }

  if (!saved) throw new UserError("密钥未能保存到本机，请检查 Scripting 的文件访问权限后重试。")
}

export function forgetKey(): void {
  try { nativeAPI("FileManager").writeAsStringSync(keyFile(), "") } catch { /* 忽略 */ }
  try { nativeAPI("Keychain").remove(KEYCHAIN_KEY) } catch { /* 忽略 */ }
}

export function safeError(error: unknown, secret: string): string {
  if (error instanceof UserError) return error.message
  let text = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  if (secret) text = text.split(secret).join("[已隐藏]")
  return text.replace(/sk-[A-Za-z0-9_-]+/g, "[已隐藏]")
    .replace(/Bearer\s+\S+/gi, "Bearer [已隐藏]").slice(0, 180)
}

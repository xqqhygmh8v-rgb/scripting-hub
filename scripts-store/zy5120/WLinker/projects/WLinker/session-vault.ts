// WLinker - 凭证存储（Keychain）
// 参照 BMW MINI Linker 的 session-vault：凭证存 Keychain，App 与小组件共享。

import type { WulingCredential } from "./wuling-client"

const SESSION_KEY = "wlinker.v1.credential"
const KEYCHAIN_OPTIONS = {
  accessibility: "first_unlock_this_device" as const,
  synchronizable: false,
}

interface StoredCredential extends WulingCredential {
  schemaVersion: 1
  savedAt: string
}

function isCredential(value: unknown): value is StoredCredential {
  if (!value || typeof value !== "object") return false
  const c = value as Partial<StoredCredential>
  return c.schemaVersion === 1 &&
    typeof c.accessToken === "string" && c.accessToken.length > 10 &&
    typeof c.clientId === "string" && c.clientId.length > 5 &&
    typeof c.clientSecret === "string" && c.clientSecret.length > 5 &&
    typeof c.savedAt === "string"
}

export function loadCredential(): WulingCredential | null {
  const raw = Keychain.get(SESSION_KEY, { synchronizable: false })
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as unknown
    if (!isCredential(value)) return null
    return {
      accessToken: value.accessToken,
      clientId: value.clientId,
      clientSecret: value.clientSecret,
    }
  } catch {
    return null
  }
}

export function saveCredential(credential: WulingCredential): void {
  const stored: StoredCredential = {
    schemaVersion: 1,
    accessToken: credential.accessToken,
    clientId: credential.clientId,
    clientSecret: credential.clientSecret,
    savedAt: new Date().toISOString(),
  }
  if (!isCredential(stored)) throw new Error("CREDENTIAL_INVALID")
  const saved = Keychain.set(SESSION_KEY, JSON.stringify(stored), KEYCHAIN_OPTIONS)
  if (!saved) throw new Error("CREDENTIAL_KEYCHAIN_WRITE_FAILED")
}

export function removeCredential(): void {
  Keychain.remove(SESSION_KEY, { synchronizable: false })
}

export function hasCredential(): boolean {
  return Keychain.contains(SESSION_KEY, { synchronizable: false })
}

// ---- 登录账号（手机号+密码，用于刷新失败时自动重新登录）----

const ACCOUNT_KEY = "wlinker.v1.account"

export interface WulingAccount {
  phone: string
  password: string
}

function isAccount(value: unknown): value is WulingAccount {
  if (!value || typeof value !== "object") return false
  const a = value as Partial<WulingAccount>
  return typeof a.phone === "string" && a.phone.length >= 5 &&
    typeof a.password === "string" && a.password.length > 0
}

export function saveAccount(account: WulingAccount): void {
  if (!isAccount(account)) throw new Error("ACCOUNT_INVALID")
  Keychain.set(ACCOUNT_KEY, JSON.stringify(account), KEYCHAIN_OPTIONS)
}

export function loadAccount(): WulingAccount | null {
  const raw = Keychain.get(ACCOUNT_KEY, { synchronizable: false })
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as unknown
    return isAccount(value) ? value : null
  } catch {
    return null
  }
}

export function removeAccount(): void {
  Keychain.remove(ACCOUNT_KEY, { synchronizable: false })
}

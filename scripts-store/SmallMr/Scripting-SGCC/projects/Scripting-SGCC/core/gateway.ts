import { AbortController, fetch } from 'scripting'
import { K, SgApp, queryAccount } from './protocol'
import {
  SECRET_NAMESPACE,
  readAccountSecret,
  readUsageSnapshot,
  readWidgetSettings,
  writeUsageSnapshot
} from './settings'
import type { UsageSnapshot } from './settings'
import type { GridAccountPayload } from './usage'

/** 设置里没填有效时长时的兜底值。 */
export const FALLBACK_REFRESH_HOURS = 4

export function fetchWindowMs(): number {
  const { refreshHours } = readWidgetSettings()
  const hours =
    Number.isFinite(refreshHours) && refreshHours > 0
      ? refreshHours
      : FALLBACK_REFRESH_HOURS
  return hours * 60 * 60 * 1000
}

const MAX_LINKED_ACCOUNTS = 6

/**
 * 国网协议层需要的运行环境：一次性的短信码、钥匙串存储和 POST 请求。
 */
function createProtocolBridge(smsCode = '') {
  return {
    env: { SGCC_SMS: smsCode },
    storage: {
      getJSON: (key: string) => {
        const stored = SECRET_NAMESPACE + key
        return Keychain.contains(stored)
          ? JSON.parse(Keychain.get(stored) ?? 'null')
          : null
      },
      setJSON: (key: string, value: unknown) =>
        Keychain.set(SECRET_NAMESPACE + key, JSON.stringify(value))
    },
    http: {
      post: async (
        url: string,
        {
          headers = {},
          body = '',
          timeout = 20000
        }: { headers?: Record<string, unknown>; body?: string; timeout?: number }
      ) => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeout)
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: Object.fromEntries(
              Object.entries(headers).map(([key, value]) => [
                key,
                value == null ? '' : String(value)
              ])
            ),
            body,
            signal: controller.signal,
            timeout: timeout / 1000
          })
          const text = await response.text()
          return { status: response.status, text: async () => text }
        } finally {
          clearTimeout(timer)
        }
      }
    }
  }
}

function openGridSession() {
  const { phone, smsCode } = readWidgetSettings()
  const password = readAccountSecret()
  if (!phone || !password) {
    throw new Error('请先在设置中填写网上国网手机号和密码')
  }
  return new SgApp(createProtocolBridge(String(smsCode || '').trim()), phone, password)
}

async function downloadAccountList(): Promise<(GridAccountPayload | null)[]> {
  const session = openGridSession()
  const { accounts = [] } = await session.ensure()
  if (!accounts.length) throw new Error('该网上国网账号未绑定户号')

  const list: (GridAccountPayload | null)[] = []
  let failure: unknown
  for (const account of accounts.slice(0, MAX_LINKED_ACCOUNTS)) {
    try {
      list.push(await queryAccount(session, account))
    } catch (error) {
      console.error(error)
      failure = error
      // 占位，保证小组件参数下标和户号顺序对得上
      list.push(null)
    }
  }
  if (list.every((item) => !item)) throw failure
  return list
}

export type UsageFeed = UsageSnapshot & {
  /** 刷新失败、退回旧快照时带上原因。 */
  error?: string
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * 快照在有效期（设置里的“数据更新”）内直接用，过期才重新请求。
 * 请求失败时退回旧快照；完全没有快照才抛错。
 */
export async function loadUsageFeed({ force = false } = {}): Promise<UsageFeed> {
  const snapshot = readUsageSnapshot()
  if (
    !force &&
    snapshot &&
    Date.now() - snapshot.fetchedAt < fetchWindowMs()
  ) {
    return snapshot
  }
  try {
    const next: UsageSnapshot = {
      fetchedAt: Date.now(),
      list: await downloadAccountList()
    }
    writeUsageSnapshot(next)
    return next
  } catch (error) {
    console.error(error)
    if (!snapshot) throw error
    return { ...snapshot, error: toErrorMessage(error) }
  }
}

/** 发送新设备验证码，返回打码后的手机号。 */
export async function sendDeviceCode(): Promise<string> {
  // `user` 在 vendored 构造函数里赋值，TS 看不到（文件带 @ts-nocheck）。
  const session = openGridSession() as SgApp & { user: string }
  const codeKey = await session.sendDeviceSms()
  session.st(session.sk(K.sms), {
    user: session.user,
    codeKey,
    ts: Date.now(),
    used: ''
  })
  return `${session.user.slice(0, 3)}****${session.user.slice(-4)}`
}

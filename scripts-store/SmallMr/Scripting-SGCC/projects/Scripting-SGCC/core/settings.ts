import type { GridAccountPayload, WeekStart } from './usage'

/** 桌面组件主题：浮岛 / 格栅。 */
export type WidgetTheme = 'island' | 'grid'

/** 小号组件的三种信息组合。 */
export type CompactStyle = 'month' | 'bill' | 'tier'

/**
 * 用户可见的设置项。
 *
 * 键名与已落盘的 JSON 保持一致，改名会让旧设置读不出来，所以这里只调整
 * 类型名和读写函数名。
 */
export type WidgetSettings = {
  phone: string
  smsCode: string
  showStepProgress: boolean
  oneLevelPq: number
  twoLevelPq: number
  weekStart: WeekStart
  theme: WidgetTheme
  useThousands: boolean
  calendarTwoDecimals: boolean
  monthDecimals: boolean
  accountIndex: number
  smallWidgetMode: CompactStyle
  refreshHours: number
}

/** 一次抓取的结果，按户号顺序保存；抓取失败的户号留 `null` 占位。 */
export type UsageSnapshot = {
  fetchedAt: number
  list: (GridAccountPayload | null)[]
}

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  phone: '',
  smsCode: '',
  showStepProgress: true,
  oneLevelPq: 2760,
  twoLevelPq: 4800,
  weekStart: 'monday',
  theme: 'island',
  useThousands: true,
  calendarTwoDecimals: false,
  monthDecimals: false,
  accountIndex: 0,
  smallWidgetMode: 'month',
  refreshHours: 4
}

/**
 * 钥匙串里与国网协议相关的键都带这个前缀，包括密码、设备种子和会话令牌。
 * 值必须保持 `sgcc.`，否则已登录的设备需要重新验证。
 */
export const SECRET_NAMESPACE = 'sgcc.'

const SETTINGS_KEY = 'preference'
const SNAPSHOT_KEY = 'data'
const PASSWORD_KEY = `${SECRET_NAMESPACE}password`

export function readWidgetSettings(): WidgetSettings {
  const saved = Storage.get<Partial<WidgetSettings>>(SETTINGS_KEY) ?? {}
  const legacyMode = saved.smallWidgetMode as string | undefined
  const smallWidgetMode: CompactStyle =
    legacyMode === 'month' || legacyMode === 'bill' || legacyMode === 'tier'
      ? legacyMode
      : legacyMode === 'compact'
        ? 'bill'
        : 'month'
  const accountIndex =
    Number.isInteger(saved.accountIndex) && Number(saved.accountIndex) >= 0
      ? Number(saved.accountIndex)
      : DEFAULT_WIDGET_SETTINGS.accountIndex
  const weekStart: WeekStart =
    saved.weekStart === 'sunday' ? 'sunday' : 'monday'
  return {
    ...DEFAULT_WIDGET_SETTINGS,
    ...saved,
    theme: saved.theme === 'grid' ? 'grid' : 'island',
    useThousands: saved.useThousands !== false,
    calendarTwoDecimals: saved.calendarTwoDecimals === true,
    monthDecimals: saved.monthDecimals === true,
    accountIndex,
    weekStart,
    smallWidgetMode
  }
}

export function writeWidgetSettings(settings: WidgetSettings) {
  Storage.set(SETTINGS_KEY, settings)
}

export function readAccountSecret(): string {
  try {
    return Keychain.get(PASSWORD_KEY) ?? ''
  } catch {
    return ''
  }
}

export function writeAccountSecret(password: string) {
  if (password === '') {
    Keychain.remove(PASSWORD_KEY)
  } else {
    Keychain.set(PASSWORD_KEY, password)
  }
}

export function readUsageSnapshot(): UsageSnapshot | null {
  return Storage.get<UsageSnapshot>(SNAPSHOT_KEY) ?? null
}

export function writeUsageSnapshot(snapshot: UsageSnapshot) {
  Storage.set(SNAPSHOT_KEY, snapshot)
}

export function clearUsageSnapshot() {
  Storage.remove(SNAPSHOT_KEY)
}

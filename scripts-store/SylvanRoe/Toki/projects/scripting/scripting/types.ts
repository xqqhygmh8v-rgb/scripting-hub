// Toki shared data model — mirrors web/app.js state (atlas.v1).
// Only metadata is ever written to the widget snapshot; secret `value` is stripped.

export type IdentityType = "email" | "phone" | "login"

export interface Identity {
  id: string
  type: IdentityType
  value: string
  label?: string
  color: string
  notes?: string
  order?: number
  esim?: boolean
  provider?: "wechat" | "apple"
  via?: string
  updatedAt?: number
}

export interface Account {
  id: string
  name: string
  domain: string
  category: string
  identityIds: string[]
  notes?: string
  handle?: string
  createdAt?: number
  updatedAt?: number
  icon?: string
}

export interface Token {
  id: string
  name: string
  domain: string
  category: string
  color: string
  value: string
  notes?: string
  expiresAt: number
  createdAt: number
  updatedAt: number
}

export interface TokiState {
  identities: Identity[]
  accounts: Account[]
  tokens: Token[]
  deleted: Record<string, number>
  demo?: boolean
}

export interface TokiSettings {
  privacy: boolean
  theme: "system" | "light" | "dark"
}

export function defaultSettings(): TokiSettings {
  return { privacy: false, theme: "system" }
}

/** Widget-facing, de-identified snapshot. NEVER include token.value or identity.value. */
export interface WidgetSnapshot {
  v: 1
  at: number
  counts: { identities: number; accounts: number; tokens: number }
  tokens: Array<Pick<Token, "id" | "name" | "category" | "color" | "expiresAt">>
  soon: number
}

export const TOKEN_CATEGORIES = ["AI API", "GitHub", "云服务", "数据库", "支付", "OAuth", "其他"]
export const ACCOUNT_CATEGORIES = ["社交", "购物", "支付金融", "开发", "AI", "娱乐", "游戏", "出行", "工具", "加密", "其他"]

export function emptyState(): TokiState {
  return { identities: [], accounts: [], tokens: [], deleted: {} }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

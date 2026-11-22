import { TokiState, WidgetSnapshot, TokiSettings, defaultSettings, emptyState, Identity, Account, Token } from "./types"

// Toki keeps one JSON file in the App Group directory so the home-screen
// widget (a separate extension context) can read a de-identified snapshot.
const DIR = FileManager.appGroupDocumentsDirectory
const DATA_FILE = DIR + "/toki-state.json"
const SNAP_FILE = DIR + "/toki-widget.json"
const DAY = 86400000

export function loadState(): TokiState {
  try {
    if (!FileManager.existsSync(DATA_FILE)) return emptyState()
    const raw = FileManager.readAsStringSync(DATA_FILE)
    const d = JSON.parse(raw)
    return {
      identities: Array.isArray(d.identities) ? d.identities : [],
      accounts: Array.isArray(d.accounts) ? d.accounts : [],
      tokens: Array.isArray(d.tokens) ? d.tokens : [],
      deleted: d.deleted && typeof d.deleted === "object" ? d.deleted : {},
      demo: d.demo,
    }
  } catch {
    return emptyState()
  }
}

export function saveState(state: TokiState): void {
  FileManager.writeAsStringSync(DATA_FILE, JSON.stringify(state))
  writeSnapshot(state)
}

/** Write ONLY metadata — never secret values or full identity values. */
export function writeSnapshot(state: TokiState): WidgetSnapshot {
  const now = Date.now()
  const tokens = state.tokens
    .filter(t => !(state.deleted[t.id] >= (t.updatedAt || 0)))
    .map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
      color: t.color,
      expiresAt: t.expiresAt,
    }))
  const soon = tokens.filter(t => t.expiresAt && t.expiresAt - now > 0 && t.expiresAt - now < 7 * DAY).length
  const snap: WidgetSnapshot = {
    v: 1,
    at: now,
    counts: {
      identities: state.identities.length,
      accounts: state.accounts.length,
      tokens: tokens.length,
    },
    tokens,
    soon,
  }
  FileManager.writeAsStringSync(SNAP_FILE, JSON.stringify(snap))
  return snap
}

/** Parse a web-exported Toki JSON payload (supports old Atlas backups). */
export function importPayload(raw: string): TokiState {
  const d = JSON.parse(raw)
  if (!Array.isArray(d.identities) || !Array.isArray(d.accounts)) throw new Error("不是 Toki 备份文件")
  return {
    identities: d.identities,
    accounts: d.accounts,
    tokens: Array.isArray(d.tokens) ? d.tokens : [],
    deleted: d.deleted && typeof d.deleted === "object" ? d.deleted : {},
  }
}

export function exportPayload(state: TokiState): string {
  return JSON.stringify({ app: "toki", version: 2, exportedAt: new Date().toISOString(), ...state }, null, 2)
}

// ---- settings (Storage persists asynchronously, no need to touch the state file) ----
const SETTINGS_KEY = "toki.settings"
export function loadSettings(): TokiSettings {
  return (Storage.get<TokiSettings>(SETTINGS_KEY) as TokiSettings) || defaultSettings()
}
export function saveSettings(s: TokiSettings): void {
  Storage.set(SETTINGS_KEY, s)
}

// ---- CRUD helpers with tombstones (mirrors web/app.js save()) ----
function tombstone(state: TokiState, id: string, ts: number): TokiState {
  const deleted = { ...state.deleted, [id]: ts }
  return { ...state, deleted }
}

export function upsertIdentity(state: TokiState, item: Identity): TokiState {
  const exists = state.identities.some(x => x.id === item.id)
  const identities = exists
    ? state.identities.map(x => (x.id === item.id ? item : x))
    : [...state.identities, item]
  return { ...state, identities }
}
export function upsertAccount(state: TokiState, item: Account): TokiState {
  const exists = state.accounts.some(x => x.id === item.id)
  const accounts = exists
    ? state.accounts.map(x => (x.id === item.id ? item : x))
    : [...state.accounts, item]
  return { ...state, accounts }
}
export function upsertToken(state: TokiState, item: Token): TokiState {
  const exists = state.tokens.some(x => x.id === item.id)
  const tokens = exists
    ? state.tokens.map(x => (x.id === item.id ? item : x))
    : [item, ...state.tokens]
  return { ...state, tokens }
}

export function deleteIdentity(state: TokiState, id: string): TokiState {
  const next: TokiState = {
    ...state,
    identities: state.identities.filter(x => x.id !== id),
    accounts: state.accounts.map(a => ({ ...a, identityIds: a.identityIds.filter(i => i !== id) })),
  }
  return tombstone(next, id, Date.now())
}
export function deleteAccount(state: TokiState, id: string): TokiState {
  return tombstone({ ...state, accounts: state.accounts.filter(x => x.id !== id) }, id, Date.now())
}
export function deleteToken(state: TokiState, id: string): TokiState {
  return tombstone({ ...state, tokens: state.tokens.filter(x => x.id !== id) }, id, Date.now())
}
export function clearAll(state: TokiState): TokiState {
  const ts = Date.now()
  const deleted = { ...state.deleted }
  for (const x of [...state.identities, ...state.accounts, ...state.tokens]) deleted[x.id] = ts
  return { identities: [], accounts: [], tokens: [], deleted }
}

export const PATHS = { DATA_FILE, SNAP_FILE }

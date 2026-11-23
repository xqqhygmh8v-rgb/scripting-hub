import {
  NavigationStack,
  List,
  Section,
  TextField,
  SecureField,
  Button,
  Text,
  Picker,
  ForEach,
  HStack,
  VStack,
  Divider,
  Spacer,
  Image,
  EditButton,
  useObservable,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  Navigation,
  Script,
  Widget,
  fetch,
} from 'scripting'
// 後台追加目標的讀寫與 intent.tsx 共用同一份存儲鍵
import { loadIntentTarget, saveIntentTarget } from './services/rule_append'
import { t } from './components/i18n'

declare const Storage: {
  get<T>(key: string): T | null
  set<T>(key: string, value: T): boolean
  remove(key: string): boolean
}
declare const Data: {
  fromBase64String(base64: string): { toRawString(): string | null } | null
  fromRawString(str: string, encoding: string): { toBase64String(): string } | null
}
declare const Dialog: {
  actionSheet(opts: { title?: string; message?: string; actions: { label: string; destructive?: boolean }[] }): Promise<number>
  alert(opts: { title?: string; message?: string }): Promise<void>
}
declare const EditMode: { active(): unknown }

// =============== 類型與常量 ===============

type RuleStatus = 'unchanged' | 'added' | 'modified'
const RAW_TYPE = '__RAW__'   // 佔位類型：註釋/空行/無法解析的行
const ALL_TYPES = '__ALL__'

interface Rule {
  id: string
  type: string       // 如 DOMAIN-SUFFIX；RAW_TYPE 表示原樣保留行
  value: string      // 如 github.io；RAW_TYPE 時即整行原文
  trailing: string   // 緊跟值的剩餘部分，如 ',Proxy,no-resolve'（含前導逗號）
  comment: string    // 行尾註釋，如 '# github 域名'
  status: RuleStatus
}

interface ParsedFile {
  preamble: string[]   // 首條規則之前的註釋/空行（保留原樣）
  rules: Rule[]
  trailingNewline: boolean
}

interface FileItem {
  id: string
  name: string
  path: string
  sha: string
}

interface BrowserItem {
  id: string                      // 用於 ForEach key（即 path）
  name: string
  path: string                    // 完整路徑
  type: 'file' | 'dir'
  sha: string
  size: number                    // 字節，僅 file 有意義
}

interface Config {
  token: string
  owner: string
  repo: string
  path: string                    // 起始路徑（可選），下次進入預設到此
  branch: string
}

const CONFIG_KEY = 'github_config'
const LAST_PATH_KEY = 'github_last_path'   // 記憶上次瀏覽到的目錄

// =============== Path 工具 ===============

/** 路徑每段單獨 encode（保留 `/` 分隔） */
function encodeURIPath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/')
}

/** 取上級目錄路徑（根目錄返回 ''） */
function parentPath(p: string): string {
  const segs = p.split('/').filter(Boolean)
  segs.pop()
  return segs.join('/')
}

/** 把 GitHub 錯誤狀態碼轉成更友好的 Error */
function friendlyError(status: number, fallback?: string): Error {
  if (status === 401) return new Error(t('鑑權失敗：token 無效或已過期', '鉴权失败：token 无效或已过期', 'Authentication failed: token is invalid or expired'))
  if (status === 403) return new Error(t('權限不足：私有倉庫需要 token 包含 repo scope', '权限不足：私有仓库需要 token 包含 repo scope', 'Insufficient permissions: private repositories require a token with repo scope'))
  if (status === 404) return new Error(t('找不到路徑或倉庫（私有倉庫請檢查 token 權限）', '找不到路径或仓库（私有仓库请检查 token 权限）', 'Path or repository not found (for private repositories, check the token permissions)'))
  if (status === 409) return new Error(t('遠端已變更，請刷新後重試', '远端已变更，请刷新后重试', 'Remote has changed, please refresh and try again'))
  if (status === 422) return new Error(t('提交參數有誤', '提交参数有误', 'Invalid submit parameters'))
  return new Error(fallback ?? t(`請求失敗 (${status})`, `请求失败 (${status})`, `Request failed (${status})`))
}

/** 檔案大小友好顯示 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// =============== 解析與序列化 ===============

let _idCounter = 0
const newId = () => `r${Date.now().toString(36)}_${++_idCounter}`

function isCommentOrBlank(line: string): boolean {
  const trimmed = line.trim()
  return trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith(';') || trimmed.startsWith('//')
}

/**
 * 解析單行規則；非規則（註釋/空行/不規範）返回 null。
 * 兼容 Surge / Clash / QuanX 通用 `TYPE,VALUE[,REST]  # comment` 格式。
 */
function parseRuleLine(raw: string): { type: string; value: string; trailing: string; comment: string } | null {
  let body = raw
  let comment = ''
  // 僅當 # 前面有非空內容才視為行尾註釋（避免誤吞整行註釋）
  const hashIdx = raw.indexOf('#')
  if (hashIdx > 0 && /\S/.test(raw.slice(0, hashIdx))) {
    body = raw.slice(0, hashIdx).trimEnd()
    comment = raw.slice(hashIdx)
  }

  const parts = body.split(',')
  if (parts.length < 2) return null

  const type = parts[0].trim()
  const value = parts[1].trim()
  if (!type || !value) return null
  // 類型要像 UPPER-CASE 標識符（適配 DOMAIN / DOMAIN-SUFFIX / IP-CIDR / USER-AGENT 等）
  if (!/^[A-Z][A-Z0-9-]*$/.test(type)) return null

  const trailing = parts.length > 2 ? ',' + parts.slice(2).join(',') : ''
  return { type, value, trailing, comment }
}

function parseFile(content: string): ParsedFile {
  const trailingNewline = content.endsWith('\n')
  const lines = content.split('\n')
  if (trailingNewline) lines.pop()

  const preamble: string[] = []
  const rules: Rule[] = []
  let foundFirstRule = false

  for (const line of lines) {
    if (!foundFirstRule) {
      const tryParse = parseRuleLine(line)
      if (!tryParse) {
        preamble.push(line)
        continue
      }
      foundFirstRule = true
      rules.push({ id: newId(), ...tryParse, status: 'unchanged' })
      continue
    }

    if (isCommentOrBlank(line)) {
      // 中間的註釋/空行用 RAW 佔位，保留位置
      rules.push({
        id: newId(), type: RAW_TYPE, value: line,
        trailing: '', comment: '', status: 'unchanged',
      })
      continue
    }

    const parsed = parseRuleLine(line)
    if (parsed) {
      rules.push({ id: newId(), ...parsed, status: 'unchanged' })
    } else {
      // 無法識別的行原樣保留
      rules.push({
        id: newId(), type: RAW_TYPE, value: line,
        trailing: '', comment: '', status: 'unchanged',
      })
    }
  }

  return { preamble, rules, trailingNewline }
}

function formatRule(r: Rule): string {
  if (r.type === RAW_TYPE) return r.value
  const cmt = r.comment ? '  ' + r.comment.trim() : ''
  return `${r.type},${r.value}${r.trailing}${cmt}`
}

function serializeFile(file: ParsedFile, currentRules: Rule[]): string {
  const out: string[] = [...file.preamble]
  for (const r of currentRules) out.push(formatRule(r))
  return out.join('\n') + (file.trailingNewline ? '\n' : '')
}

// =============== GitHub 接口 ===============

async function ghGet(url: string, token: string): Promise<any> {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
}

/** 列目錄：返回檔案夾 + 檔案，檔案夾優先，按名字升序 */
async function fetchFolderContents(cfg: Config, path: string): Promise<BrowserItem[]> {
  const ref = encodeURIComponent(cfg.branch || 'main')
  const url = path
    ? `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIPath(path)}?ref=${ref}`
    : `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents?ref=${ref}`
  const res = await ghGet(url, cfg.token)
  if (!res.ok) throw friendlyError(res.status)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error(t('該路徑不是檔案夾', '该路径不是文件夹', 'This path is not a folder'))
  return data
    .map((it: any) => ({
      id: it.path,
      name: it.name,
      path: it.path,
      type: it.type === 'dir' ? 'dir' : 'file',
      sha: it.sha,
      size: it.size ?? 0,
    } as BrowserItem))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

async function fetchFileContent(
  cfg: Config, path: string,
): Promise<{ content: string; sha: string }> {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIPath(path)}?ref=${encodeURIComponent(cfg.branch || 'main')}`
  const res = await ghGet(url, cfg.token)
  if (!res.ok) throw friendlyError(res.status)
  const data = await res.json()
  if (!data.content) throw new Error(data.message || t('讀取檔案失敗', '读取文件失败', 'Failed to read file'))
  const decoded = Data.fromBase64String(data.content.replace(/\n/g, ''))
  return { content: decoded?.toRawString() ?? '', sha: data.sha }
}

async function commitFileContent(
  cfg: Config, path: string, content: string, sha: string, message: string,
): Promise<{ ok: boolean; error?: string; newSha?: string }> {
  const data = Data.fromRawString(content, 'utf-8')
  const res = await fetch(
    `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${encodeURIPath(path)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        content: data?.toBase64String() ?? '',
        sha,
        branch: cfg.branch || 'main',
      }),
    },
  )
  if (res.ok) {
    const body = await res.json()
    return { ok: true, newSha: body.content?.sha }
  }
  const err = await res.json().catch(() => ({}))
  return { ok: false, error: err.message ?? friendlyError(res.status).message }
}

// =============== 配置存儲 ===============

function getConfig(): Config {
  const c = Storage.get<Config>(CONFIG_KEY) ?? { token: '', owner: '', repo: '', path: '', branch: 'main' }
  // 兼容舊版沒有 branch 字段的配置
  if (!c.branch) c.branch = 'main'
  return c
}
function saveConfig(c: Config) { Storage.set(CONFIG_KEY, c) }

// =============== Add Rules 規則類型（17 種） ===============
// 直接沿用 Github_Add_Rules（v1.2.6）類型 Picker 的全部選項。
// 規則編輯器的「從已有類型選擇」改成這份固定清單，不再只列檔案裡已有的類型。
const RULE_TYPES = [
  'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-WILDCARD',
  'IP-CIDR', 'IP-CIDR6', 'GEOIP', 'USER-AGENT', 'URL-REGEX', 'SCRIPT',
  'PROTOCOL', 'DEST-PORT', 'DOMAIN-SET', 'SUBNET', 'CELLULAR-RADIO',
  'IP-ASN', 'HOSTNAME-TYPE',
]

// =============== 多帳號（Add Rules 設定頁） ===============

interface Account {
  username: string
  token: string
}

interface RepoItem {
  id: string        // full_name，如 KristenYT/rules
  owner: string
  name: string
  defaultBranch: string
}

interface GistItem {
  id: string
  title: string
  files: string[]
}

interface HomeDraft {
  username: string
  source: string    // 'github' | 'gist'
  repo: string      // full_name
  gistId: string
  path: string      // 首頁當前瀏覽目錄
}

interface HistoryEntry {
  platform: 'github' | 'gist'
  username: string
  owner: string
  repo: string      // github 時為 full_name，gist 時為空
  gistId: string
  gistTitle: string
  branch: string
  path: string      // 檔案完整路徑（gist 時為檔案名）
  name: string
  editedAt: number  // ms 時間戳
  ruleCount: number
}

const ACCOUNTS_KEY = 'rules_accounts'
const AVATARS_KEY = 'rules_avatars'
const HOME_DRAFT_KEY = 'rules_home_draft'
const HISTORY_KEY = 'github_rules_history'
const LEGACY_CONFIG_KEY = 'github_config'
const MAX_HISTORY = 10

function loadAccounts(): Account[] {
  try {
    const raw = Storage.get(ACCOUNTS_KEY) || ''
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((a: any) => a && a.token)
  } catch {
    return []
  }
}

function saveAccounts(accounts: Account[]) {
  Storage.set(ACCOUNTS_KEY, JSON.stringify(accounts))
}

// 舊版規則更新只有一份 github_config（單帳號），第一次打開自動遷移成多帳號列表
function loadAccountsOrMigrate(): Account[] {
  const current = loadAccounts()
  if (current.length > 0) return current
  try {
    const legacy = Storage.get<any>(LEGACY_CONFIG_KEY)
    if (legacy && legacy.token) {
      const migrated: Account[] = [{ username: legacy.owner || t('帳號 1', '账号 1', 'Account 1'), token: legacy.token }]
      saveAccounts(migrated)
      return migrated
    }
  } catch {}
  return []
}

function loadAvatarCache(): Record<string, string> {
  try {
    const raw = Storage.get(AVATARS_KEY) || ''
    if (!raw) return {}
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    const out: Record<string, string> = {}
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'string') out[k] = obj[k]
    }
    return out
  } catch {
    return {}
  }
}

function saveAvatarCache(cache: Record<string, string>) {
  try {
    Storage.set(AVATARS_KEY, JSON.stringify(cache))
  } catch {}
}

function loadHomeDraft(): HomeDraft {
  const empty: HomeDraft = { username: '', source: 'github', repo: '', gistId: '', path: '' }
  try {
    const raw = Storage.get(HOME_DRAFT_KEY) || ''
    if (!raw) return empty
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return empty
    return {
      username: typeof obj.username === 'string' ? obj.username : '',
      source: obj.source === 'gist' ? 'gist' : 'github',
      repo: typeof obj.repo === 'string' ? obj.repo : '',
      gistId: typeof obj.gistId === 'string' ? obj.gistId : '',
      path: typeof obj.path === 'string' ? obj.path : '',
    }
  } catch {
    return empty
  }
}

function saveHomeDraft(draft: HomeDraft) {
  try {
    Storage.set(HOME_DRAFT_KEY, JSON.stringify(draft))
  } catch {}
}

// =============== 歷史紀錄：上一個編輯的檔案 ===============

function loadHistory(): HistoryEntry[] {
  try {
    const raw = Storage.get(HISTORY_KEY) || ''
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((e: any) => e && e.path && e.name)
  } catch {
    return []
  }
}

function saveHistory(list: HistoryEntry[]) {
  try {
    Storage.set(HISTORY_KEY, JSON.stringify(list))
  } catch {}
}

/** 記一筆：同一檔案去重後放最前面，最多保留 MAX_HISTORY 筆；返回新列表 */
function recordHistory(entry: Omit<HistoryEntry, 'editedAt'> & { editedAt?: number }): HistoryEntry[] {
  const next: HistoryEntry = { ...entry, editedAt: entry.editedAt ?? Date.now() }
  const key = (e: HistoryEntry) => `${e.platform}|${e.gistId || e.repo}|${e.path}`
  const rest = loadHistory().filter(e => key(e) !== key(next))
  const list = [next, ...rest].slice(0, MAX_HISTORY)
  saveHistory(list)
  return list
}

function formatHistoryTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const diffDays = Math.floor((dayStart - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000)
  if (diffDays <= 0) return t(`今天 ${hh}:${mm}`, `今天 ${hh}:${mm}`, `Today ${hh}:${mm}`)
  if (diffDays === 1) return t(`昨天 ${hh}:${mm}`, `昨天 ${hh}:${mm}`, `Yesterday ${hh}:${mm}`)
  if (diffDays < 7) return t(`${diffDays} 天前`, `${diffDays} 天前`, `${diffDays} days ago`)
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`
}

// =============== 倉庫 / Gist 清單（Add Rules 的拉取邏輯） ===============

async function fetchReposForAccount(account: Account): Promise<RepoItem[]> {
  const all: RepoItem[] = []
  let page = 1
  while (true) {
    const res = await fetch(`https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated`, {
      headers: { Authorization: `Bearer ${account.token}`, Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw friendlyError(res.status, t('取得倉庫清單失敗', '获取仓库清单失败', 'Failed to fetch repository list'))
    const data = await res.json()
    if (!Array.isArray(data)) break
    all.push(...data.map((r: any) => ({
      id: r.full_name,
      owner: r.owner ? r.owner.login : '',
      name: r.name,
      defaultBranch: r.default_branch || 'main',
    })))
    if (data.length < 100) break
    page++
  }
  return all
}

async function fetchGistsForAccount(account: Account): Promise<GistItem[]> {
  const all: GistItem[] = []
  let page = 1
  while (true) {
    const res = await fetch(`https://api.github.com/gists?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${account.token}`, Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) throw friendlyError(res.status, t('取得 Gist 清單失敗', '获取 Gist 清单失败', 'Failed to fetch Gist list'))
    const data = await res.json()
    if (!Array.isArray(data)) break
    all.push(...data.map((g: any) => {
      const fileNames: string[] = g.files ? Object.keys(g.files) : []
      const title = g.description ? g.description : fileNames.length > 0 ? fileNames[0] : t('未命名 Gist', '未命名 Gist', 'Untitled Gist')
      return { id: g.id, title, files: fileNames }
    }))
    if (data.length < 100) break
    page++
  }
  return all
}

// =============== Gist 檔案讀寫 ===============

async function fetchGistFileContent(
  token: string, gistId: string, fileName: string,
): Promise<{ content: string; sha: string }> {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw friendlyError(res.status)
  const data = await res.json()
  const f = data.files ? data.files[fileName] : null
  if (!f) throw new Error(t('Gist 裡找不到這個檔案', 'Gist 里找不到这个文件', 'File not found in this Gist'))
  if (typeof f.content === 'string') return { content: f.content, sha: '' }
  if (f.raw_url) {
    const raw = await fetch(f.raw_url)
    if (!raw.ok) throw new Error(t('讀取檔案失敗', '读取文件失败', 'Failed to read file'))
    return { content: await raw.text(), sha: '' }
  }
  throw new Error(t('讀取檔案失敗', '读取文件失败', 'Failed to read file'))
}

async function commitGistFileContent(
  token: string, gistId: string, fileName: string, content: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ files: { [fileName]: { content } } }),
  })
  if (res.ok) return { ok: true }
  const err = await res.json().catch(() => ({}))
  return { ok: false, error: err.message ?? friendlyError(res.status).message }
}

/** 把當前選擇同步回 github_config，讓小組件與後台追加（intent）繼續用同一份配置 */
function syncWidgetConfig(cfg: Config) {
  saveConfig(cfg)
}

// =============== 後台追加目標挑選器：像首頁一樣選用戶 / 平台 / 倉庫 / 檔案 ===============

/** 後台追加挑選器選中的檔案（存進 github_intent_target 的上下文） */
interface IntentTargetCtx {
  platform: 'github' | 'gist'
  username: string
  owner: string
  repo: string      // full_name
  gistId: string
  gistTitle: string
  branch: string
  path: string      // 相對倉庫根的完整路徑；Gist 時為檔案名
  name: string
}

function TargetPickerView({
  accounts, onSelect, onCancel,
}: {
  accounts: Account[]
  onSelect: (ctx: IntentTargetCtx) => void
  onCancel: () => void
}) {
  const [selectedUser, setSelectedUser] = useState(accounts.length > 0 ? accounts[0].username : '')
  const [source, setSource] = useState('github')
  const [repos, setRepos] = useState<RepoItem[]>([])
  const [gists, setGists] = useState<GistItem[]>([])
  const [selectedRepo, setSelectedRepo] = useState('')
  const [selectedGist, setSelectedGist] = useState('')
  const [repoBranch, setRepoBranch] = useState('main')
  const [currentPath, setCurrentPath] = useState('')
  const [listsLoading, setListsLoading] = useState(true)
  const [listsError, setListsError] = useState('')
  const items = useObservable<BrowserItem[]>([])
  const loading = useObservable(false)
  const errorMsg = useObservable('')

  const account = accounts.find(a => a.username === selectedUser)
  const gist = gists.find(g => g.id === selectedGist)

  const fetchLists = async (acc: Account | undefined, src: string) => {
    if (!acc) {
      setListsLoading(false)
      return
    }
    setListsLoading(true)
    setListsError('')
    try {
      if (src === 'gist') {
        setGists(await fetchGistsForAccount(acc))
      } else {
        const list = await fetchReposForAccount(acc)
        setRepos(list)
        const match = list.find(r => r.id === selectedRepo)
        if (match) setRepoBranch(match.defaultBranch)
      }
    } catch (e: any) {
      setListsError(e.message ?? t('取得清單失敗', '获取清单失败', 'Failed to fetch list'))
    }
    setListsLoading(false)
  }

  useEffect(() => {
    const acc = accounts.length > 0 ? accounts[0] : undefined
    if (acc) fetchLists(acc, 'github')
    // 只在打開時拉一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshItems = async () => {
    if (!account) {
      errorMsg.setValue(t('請先在設定新增帳號', '请先在设置新增账号', 'Please add an account in Settings first'))
      items.setValue([])
      return
    }
    if (source === 'gist') {
      if (!gist) {
        errorMsg.setValue(t('請先選擇 Gist', '请先选择 Gist', 'Please select a Gist first'))
        items.setValue([])
        return
      }
      items.setValue(gist.files.map(name => ({
        id: name, name, path: name, type: 'file' as const, sha: '', size: 0,
      })))
      errorMsg.setValue('')
      return
    }
    if (!selectedRepo) {
      errorMsg.setValue(t('請先選擇倉庫', '请先选择仓库', 'Please select a repository first'))
      items.setValue([])
      return
    }
    const parts = selectedRepo.split('/')
    const cfg: Config = {
      token: account.token,
      owner: parts[0],
      repo: parts.slice(1).join('/'),
      path: currentPath,
      branch: repoBranch || 'main',
    }
    loading.setValue(true)
    errorMsg.setValue('')
    try {
      items.setValue(await fetchFolderContents(cfg, currentPath))
    } catch (e: any) {
      errorMsg.setValue(e.message ?? t('獲取失敗', '获取失败', 'Failed to fetch'))
      items.setValue([])
    }
    loading.setValue(false)
  }

  useEffect(() => { refreshItems() }, [currentPath, selectedRepo, repoBranch, selectedGist, source, selectedUser])

  const handleUserChange = (v: string) => {
    setSelectedUser(v)
    setSelectedRepo('')
    setSelectedGist('')
    setRepoBranch('main')
    setCurrentPath('')
    fetchLists(accounts.find(a => a.username === v), source)
  }

  const handleSourceChange = (v: string) => {
    setSource(v)
    setSelectedRepo('')
    setSelectedGist('')
    setRepoBranch('main')
    setCurrentPath('')
    fetchLists(account, v)
  }

  const handleRepoChange = (v: string) => {
    setSelectedRepo(v)
    setCurrentPath('')
    const item = repos.find(r => r.id === v)
    setRepoBranch(item ? item.defaultBranch : 'main')
  }

  const pickFile = (f: BrowserItem) => {
    if (!account) return
    if (source === 'gist') {
      if (!gist) return
      onSelect({
        platform: 'gist', username: selectedUser, owner: '', repo: '',
        gistId: gist.id, gistTitle: gist.title, branch: '',
        path: f.path, name: f.name,
      })
      return
    }
    const parts = selectedRepo.split('/')
    onSelect({
      platform: 'github', username: selectedUser, owner: parts[0], repo: selectedRepo,
      gistId: '', gistTitle: '', branch: repoBranch || 'main',
      path: f.path, name: f.name,
    })
  }

  const dirs = useMemo(
    () => items.value.filter(it => it.type === 'dir'),
    [items.value],
  )
  const files = useMemo(
    () => items.value.filter(it => it.type === 'file'),
    [items.value],
  )

  return (
    <List
      navigationTitle={t('選擇目標檔案', '选择目标文件', 'Select Target File')}
      navigationBarTitleDisplayMode="inline"
      toolbar={{ topBarLeading: <Button title={t('取消', '取消', 'Cancel')} action={onCancel} /> }}
    >
      <Section header={<Text>{t('選擇用戶', '选择用户', 'Select User')}</Text>}>
        <Picker title={t('用戶', '用户', 'User')} value={selectedUser} onChanged={handleUserChange} pickerStyle="menu">
          {accounts.length === 0 ? <Text tag="">{t('請先在設定新增帳號', '请先在设置新增账号', 'Please add an account in Settings first')}</Text> : null}
          {accounts.map(a => (
            <Text key={a.token} tag={a.username}>{a.username}</Text>
          ))}
        </Picker>
      </Section>
      <Section header={<Text>{t('選擇平台', '选择平台', 'Select Platform')}</Text>}>
        <Picker title={t('平台', '平台', 'Platform')} value={source} onChanged={handleSourceChange} pickerStyle="menu">
          <Text tag="github">GitHub</Text>
          <Text tag="gist">Gist</Text>
        </Picker>
      </Section>
      {source === 'github' ? (
        <Section header={<Text>{t('選擇倉庫', '选择仓库', 'Select Repository')}</Text>}>
          {listsLoading && repos.length === 0 ? (
            <Text foregroundStyle="secondaryLabel">{t('載入中…', '加载中…', 'Loading…')}</Text>
          ) : (
            <Picker title={t('倉庫', '仓库', 'Repository')} value={selectedRepo} onChanged={handleRepoChange} pickerStyle="menu">
              <Text tag="">{t('請選擇倉庫', '请选择仓库', 'Please select a repository')}</Text>
              {repos.map(r => (
                <Text key={r.id} tag={r.id}>{r.id}</Text>
              ))}
            </Picker>
          )}
          <HStack>
            <Spacer />
            <Button
              title={listsLoading ? t('載入中…', '加载中…', 'Loading…') : t('刷新倉庫清單', '刷新仓库清单', 'Refresh Repository List')}
              buttonStyle="borderless"
              disabled={listsLoading}
              action={() => fetchLists(account, source)}
            />
            <Spacer />
          </HStack>
          {listsError ? (
            <Text foregroundStyle="systemRed">{listsError}</Text>
          ) : null}
        </Section>
      ) : (
        <Section header={<Text>{t('選擇 Gist', '选择 Gist', 'Select Gist')}</Text>}>
          {listsLoading && gists.length === 0 ? (
            <Text foregroundStyle="secondaryLabel">{t('載入中…', '加载中…', 'Loading…')}</Text>
          ) : (
            <Picker title="Gist" value={selectedGist} onChanged={(v: string) => { setSelectedGist(v); setCurrentPath('') }} pickerStyle="menu">
              <Text tag="">{t('請選擇 Gist', '请选择 Gist', 'Please select a Gist')}</Text>
              {gists.map(g => (
                <Text key={g.id} tag={g.id}>{g.title}</Text>
              ))}
            </Picker>
          )}
          <HStack>
            <Spacer />
            <Button
              title={listsLoading ? t('載入中…', '加载中…', 'Loading…') : t('刷新 Gist 清單', '刷新 Gist 清单', 'Refresh Gist List')}
              buttonStyle="borderless"
              disabled={listsLoading}
              action={() => fetchLists(account, source)}
            />
            <Spacer />
          </HStack>
          {listsError ? (
            <Text foregroundStyle="systemRed">{listsError}</Text>
          ) : null}
        </Section>
      )}
      {errorMsg.value ? (
        <Section>
          <Text foregroundStyle="systemRed">{errorMsg.value}</Text>
        </Section>
      ) : null}
      {dirs.length > 0 ? (
        <Section header={<Text>{t(`檔案夾 (${dirs.length})`, `文件夹 (${dirs.length})`, `Folders (${dirs.length})`)}</Text>}>
          {dirs.map(d => (
            <Button
              key={d.id}
              title={d.name}
              systemImage="folder.fill"
              action={() => setCurrentPath(d.path)}
            />
          ))}
        </Section>
      ) : null}
      {files.length > 0 ? (
        <Section
          header={<Text>{t(`檔案 (${files.length})`, `文件 (${files.length})`, `Files (${files.length})`)}</Text>}
          footer={<Text>{t('點一下設為後台追加的目標檔案', '点一下设为后台追加的目标文件', 'Tap to set as the background append target file')}</Text>}
        >
          {files.map(f => (
            <Button key={f.id} action={() => pickFile(f)}>
              <HStack spacing={8}>
                <Image systemName="doc.text" foregroundStyle="secondaryLabel" />
                <Text foregroundStyle="label">{f.name}</Text>
                <Spacer />
                {f.size > 0 ? (
                  <Text font="caption" foregroundStyle="secondaryLabel">
                    {formatSize(f.size)}
                  </Text>
                ) : null}
              </HStack>
            </Button>
          ))}
        </Section>
      ) : null}
      {!loading.value && !errorMsg.value && items.value.length === 0 ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">{t('空檔案夾', '空文件夹', 'Empty folder')}</Text>
        </Section>
      ) : null}
    </List>
  )
}

// =============== 設定頁（Add Rules 多帳號設定頁） ===============
// 舊版單帳號 ConfigView 已由本頁取代：多帳號（用戶名 + Token，頭像、拖移排序、
// 長按刪除、Token 與用戶名一致性驗證、退出自動清空）全部照 Add Rules 的做法。
// 另外保留規則更新原有的「後台追加」目標設定，intent（分享菜單 / 快捷指令）繼續用它。

function SettingsView({ onBack }: { onBack: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccountsOrMigrate())
  const [showAdd, setShowAdd] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newToken, setNewToken] = useState('')
  const [adding, setAdding] = useState(false)
  const [avatars, setAvatars] = useState<Record<string, string>>(() => loadAvatarCache())
  const showToast = useObservable(false)
  const toastMsg = useObservable('')

  // 後台追加（分享菜單 / 快捷指令）的目標，intent.tsx 無界面，只能靠這裡預先配好
  const initialIntentTarget = loadIntentTarget()
  const intentRuleType = useObservable(initialIntentTarget.ruleType)
  const [intentTargetCtx, setIntentTargetCtx] = useState<IntentTargetCtx | null>(() =>
    initialIntentTarget.filePath
      ? {
          platform: initialIntentTarget.platform === 'gist' ? 'gist' : 'github',
          username: initialIntentTarget.username,
          owner: initialIntentTarget.owner,
          repo: initialIntentTarget.repo,
          gistId: initialIntentTarget.gistId,
          gistTitle: initialIntentTarget.gistTitle,
          branch: initialIntentTarget.branch,
          path: initialIntentTarget.filePath,
          name: initialIntentTarget.filePath.split('/').filter(Boolean).pop() ?? initialIntentTarget.filePath,
        }
      : null,
  )
  const [showTargetPicker, setShowTargetPicker] = useState(false)

  const accountItems = useObservable(
    loadAccountsOrMigrate().map((a) => ({ id: a.token, username: a.username, token: a.token })),
  )
  const editMode = useObservable(() => EditMode.active())

  function showMsg(msg: string) {
    toastMsg.setValue(msg)
    showToast.setValue(true)
  }

  function syncAccounts(next: Account[]) {
    saveAccounts(next)
  }

  useEffect(() => {
    const next = accounts.map((a) => ({ id: a.token, username: a.username, token: a.token }))
    if (JSON.stringify(next) !== JSON.stringify(accountItems.value)) {
      accountItems.setValue(next)
    }
  }, [accounts])

  useEffect(() => {
    const next: Account[] = accountItems.value.map((item: any) => ({ username: item.username, token: item.token }))
    if (JSON.stringify(next) !== JSON.stringify(accounts)) {
      setAccounts(next)
      syncAccounts(next)
    }
  }, [accountItems.value])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next = loadAvatarCache()
      let changed = false
      for (const acc of accounts) {
        if (next[acc.token]) continue
        try {
          const res = await fetch('https://api.github.com/user', {
            headers: { Authorization: `Bearer ${acc.token}`, Accept: 'application/vnd.github+json' },
          })
          if (res.ok) {
            const me = await res.json()
            if (me && me.avatar_url) {
              next[acc.token] = me.avatar_url
              changed = true
            }
          }
        } catch {}
      }
      if (changed && !cancelled) {
        saveAvatarCache(next)
        setAvatars(next)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [accounts])

  async function addAccount() {
    const trimmedUsername = newUsername.trim()
    const trimmedToken = newToken.trim()
    if (!trimmedUsername || !trimmedToken) {
      showMsg(
        !trimmedUsername && !trimmedToken
          ? t('請先填寫 Username 和 Token', '请先填写 Username 和 Token', 'Please enter a Username and Token first')
          : !trimmedUsername
            ? t('請填寫 Username', '请填写 Username', 'Please enter a Username')
            : t('請填寫 Token', '请填写 Token', 'Please enter a Token'),
      )
      return
    }
    if (accounts.some((a) => a.token === trimmedToken)) {
      showMsg(t('這個 Token 已經新增過了。', '这个 Token 已经新增过了。', 'This Token has already been added.'))
      return
    }
    setAdding(true)
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${trimmedToken}`, Accept: 'application/vnd.github+json' },
      })
      if (!res.ok) {
        showMsg(t('新增失敗：Token 無效，請檢查 Token 是否正確。', '新增失败：Token 无效，请检查 Token 是否正确。', 'Failed to add: Token is invalid, please check that the Token is correct.'))
        setAdding(false)
        return
      }
      const me = await res.json()
      if (!me || !me.login || me.login.toLowerCase() !== trimmedUsername.toLowerCase()) {
        showMsg(t('Username 跟 Token 的帳號不符\n請檢查 Username 是否正確！', 'Username 跟 Token 的账号不符\n请检查 Username 是否正确！', 'The Username does not match the Token account.\nPlease check that the Username is correct!'))
        setAdding(false)
        return
      }
      if (me.avatar_url) {
        const nextAvatars = { ...loadAvatarCache(), [trimmedToken]: me.avatar_url }
        saveAvatarCache(nextAvatars)
        setAvatars(nextAvatars)
      }
      const next = [...accounts, { username: trimmedUsername, token: trimmedToken }]
      setAccounts(next)
      syncAccounts(next)
      setNewUsername('')
      setNewToken('')
      setShowAdd(false)
      showMsg(t('帳號已新增', '账号已新增', 'Account added'))
    } catch {
      showMsg(t('新增失敗：網路錯誤', '新增失败：网络错误', 'Failed to add: network error'))
    }
    setAdding(false)
  }

  async function deleteAccountByToken(token: string) {
    const account = accounts.find((a) => a.token === token)
    if (!account) return
    const idx = await Dialog.actionSheet({
      title: t('刪除帳號', '删除账号', 'Delete Account'),
      message: t(`確定要刪除 "${account.username}" 嗎？\n此操作不可撤銷！`, `确定要删除 "${account.username}" 吗？\n此操作不可撤销！`, `Are you sure you want to delete "${account.username}"?\nThis cannot be undone!`),
      actions: [{ label: t('確認', '确认', 'Confirm'), destructive: true }],
    })
    if (idx !== 0) return
    const next = accounts.filter((a) => a.token !== token)
    const nextAvatars = loadAvatarCache()
    delete nextAvatars[token]
    saveAvatarCache(nextAvatars)
    setAvatars(nextAvatars)
    setAccounts(next)
    syncAccounts(next)
  }

  return (
    <List
      navigationTitle={t('使用者設定', '用户设置', 'User Settings')}
      navigationBarTitleDisplayMode="inline"
      toast={{ isPresented: showToast, message: toastMsg.value, position: 'bottom' }}
      environments={{ editMode }}
      toolbar={{ topBarLeading: <Button title={t('返回', '返回', 'Back')} action={onBack} /> }}
      sheet={[
        {
          isPresented: showTargetPicker,
          onChanged: (v: boolean) => { if (!v) setShowTargetPicker(false) },
          content: (
            <NavigationStack>
              <TargetPickerView
                accounts={accounts}
                onSelect={(ctx) => {
                  setIntentTargetCtx(ctx)
                  setShowTargetPicker(false)
                }}
                onCancel={() => setShowTargetPicker(false)}
              />
            </NavigationStack>
          ),
        },
      ]}
    >
      <Section header={<Text>{t('GitHub 帳號', 'GitHub 账号', 'GitHub Accounts')}</Text>} footer={<Text>{t('第一個帳號為首頁預設用戶；長按帳號列可刪除', '第一个账号为首页默认用户；长按账号列可删除', 'The first account is the default user on the home page; long-press an account row to delete it')}</Text>}>
        {accounts.length > 0 ? (
          <ForEach
            data={accountItems}
            editActions="move"
            builder={(item: any) => (
              <HStack
                key={item.id}
                alignment="center"
                spacing={10}
                contextMenu={{
                  menuItems: (
                    <>
                      <Section>
                        <Button title={t('刪除', '删除', 'Delete')} systemImage="trash" role="destructive" action={() => deleteAccountByToken(item.token)} />
                      </Section>
                    </>
                  ),
                }}
              >
                {avatars[item.token] ? (
                  <Image imageUrl={avatars[item.token]} resizable={true} frame={{ width: 28, height: 28 }} clipShape="circle" />
                ) : null}
                <Text lineLimit={1}>{item.username}</Text>
              </HStack>
            )}
          />
        ) : (
          <Text font="callout" foregroundStyle="secondaryLabel">{t('尚未新增帳號，請按下方添加。', '尚未新增账号，请按下方添加。', 'No accounts added yet. Tap Add below.')}</Text>
        )}
      </Section>
      <Section>
        <Button title={t('添加帳號', '添加账号', 'Add Account')} systemImage="plus.circle.fill" action={() => setShowAdd(!showAdd)} />
      </Section>
      {showAdd ? (
        <Section header={<Text>{t('新增帳號', '新增账号', 'Add Account')}</Text>}>
          <TextField title={t('使用者名稱', '用户名', 'Username')} value={newUsername} onChanged={setNewUsername} prompt="Github_Username" />
          <SecureField title="Token" value={newToken} onChanged={setNewToken} prompt="ghp_xxxxxxxx" />
          <VStack alignment="leading">
            <HStack alignment="center">
              <Image systemName="lock.shield.fill" />
              <Text font="subheadline">{t('Token 權限設定', 'Token 权限设置', 'Token Permissions')}</Text>
            </HStack>
            <Text font="footnote">{t('• repo：存取及修改倉庫', '• repo：存取及修改仓库', '• repo: Access and modify repositories')}</Text>
            <Text font="footnote">{t('• gist：建立及修改 Gist', '• gist：建立及修改 Gist', '• gist: Create and modify Gists')}</Text>
            <Text font="footnote" foregroundStyle="secondaryLabel">{t('注意：若缺少所需權限，操作可能會失敗並回傳 403 錯誤', '注意：若缺少所需权限，操作可能会失败并回传 403 错误', 'Note: Without the required permissions, operations may fail with a 403 error')}</Text>
          </VStack>
          <Button action={addAccount} disabled={adding}>
            <HStack alignment="center">
              <Image systemName="checkmark" foregroundStyle="green" />
              <Text foregroundStyle="green">{adding ? t('驗證中…', '验证中…', 'Verifying…') : t('儲存帳號', '保存账号', 'Save Account')}</Text>
            </HStack>
          </Button>
          <Button
            action={() => {
              setShowAdd(false)
              setNewUsername('')
              setNewToken('')
            }}
          >
            <HStack alignment="center">
              <Image systemName="xmark" foregroundStyle="red" />
              <Text foregroundStyle="red">{t('取消', '取消', 'Cancel')}</Text>
            </HStack>
          </Button>
        </Section>
      ) : null}
      <Section
        header={<Text>{t('後台追加', '后台追加', 'Background Append')}</Text>}
        footer={<Text>{t('從分享菜單或快捷指令「Run Script」傳入文本 / 鏈接時，自動追加到這裡指定的檔案（無界面，故須預先配好）。鏈接會自動取主機名；已存在的規則會跳過。', '从分享菜单或快捷指令「Run Script」传入文本 / 链接时，自动追加到这里指定的文件（无界面，故须预先配好）。链接会自动取主机名；已存在的规则会跳过。', 'When text / links are passed in from the share sheet or the Shortcuts “Run Script” action, they are automatically appended to the file specified here (no UI, so set it up in advance). Links use their hostname automatically; rules that already exist are skipped.')}</Text>}
      >
        <Button action={() => setShowTargetPicker(true)}>
          {intentTargetCtx ? (
            <VStack alignment="leading" spacing={2}>
              <Text>{intentTargetCtx.name}</Text>
              <Text font="caption" foregroundStyle="secondaryLabel">
                {(() => {
                  const platform = intentTargetCtx.platform === 'gist' ? 'Gist' : 'GitHub'
                  const middle = intentTargetCtx.platform === 'gist' ? intentTargetCtx.gistTitle : intentTargetCtx.repo
                  const head = intentTargetCtx.username ? `${intentTargetCtx.username}/${platform}` : platform
                  return `${head}•${middle}/${intentTargetCtx.path}`
                })()}
              </Text>
            </VStack>
          ) : (
            <Text foregroundStyle="secondaryLabel">{t('點一下選擇目標檔案', '点一下选择目标文件', 'Tap to select a target file')}</Text>
          )}
        </Button>
        <Picker
          title={t('規則類型', '规则类型', 'Rule Type')}
          value={intentRuleType.value}
          onChanged={(v: string) => { if (v) intentRuleType.setValue(v) }}
          pickerStyle="menu"
        >
          {RULE_TYPES.map(t => (
            <Text key={t} tag={t}>{t}</Text>
          ))}
        </Picker>
        <Button
          title={t('保存後台追加設定', '保存后台追加设置', 'Save Background Append Settings')}
          action={() => {
            if (!intentTargetCtx) {
              showMsg(t('請先選擇目標檔案', '请先选择目标文件', 'Please select a target file first'))
              return
            }
            saveIntentTarget({
              filePath: intentTargetCtx.path,
              ruleType: intentRuleType.value.trim(),
              platform: intentTargetCtx.platform,
              username: intentTargetCtx.username,
              owner: intentTargetCtx.owner,
              repo: intentTargetCtx.repo,
              gistId: intentTargetCtx.gistId,
              gistTitle: intentTargetCtx.gistTitle,
              branch: intentTargetCtx.branch,
            })
            showMsg(t('已保存後台追加設定', '已保存后台追加设置', 'Background append settings saved'))
          }}
        />
      </Section>
    </List>
  )
}

// =============== 首頁：先選用戶 / 平台 / 倉庫，下方瀏覽檔案夾與檔案 ===============

const FILE_SIZE_LIMIT = 1024 * 1024  // 1MB，超過則不讓進編輯器

/** 打開檔案時帶給 App 的上下文：用來記歷史紀錄、決定提交目標 */
type HistoryCtx = Omit<HistoryEntry, 'editedAt' | 'ruleCount'>

function HomeView({
  accounts, avatars, selectedUser, source, repos, gists, selectedRepo, repoBranch,
  selectedGist, currentPath, history, listsLoading, listsError,
  onUserChange, onSourceChange, onRepoChange, onGistChange, onRefreshLists,
  onNavigate, onPickFile, onOpenHistoryEntry, onShowSettings, onShowHistory,
}: {
  accounts: Account[]
  avatars: Record<string, string>
  selectedUser: string
  source: string
  repos: RepoItem[]
  gists: GistItem[]
  selectedRepo: string
  repoBranch: string
  selectedGist: string
  currentPath: string
  history: HistoryEntry[]
  listsLoading: boolean
  listsError: string
  onUserChange: (v: string) => void
  onSourceChange: (v: string) => void
  onRepoChange: (v: string) => void
  onGistChange: (v: string) => void
  onRefreshLists: () => void
  onNavigate: (newPath: string) => void
  onPickFile: (f: FileItem, sha: string, parsed: ParsedFile, ctx: HistoryCtx) => void
  onOpenHistoryEntry: (e: HistoryEntry) => Promise<boolean>
  onShowSettings: () => void
  onShowHistory: () => void
}) {
  const items = useObservable<BrowserItem[]>([])
  const loading = useObservable(false)
  const errorMsg = useObservable('')
  const showToast = useObservable(false)
  const toastMsg = useObservable('')

  const showMsg = (msg: string) => {
    toastMsg.setValue(msg)
    showToast.setValue(true)
  }

  const account = accounts.find(a => a.username === selectedUser)
  const repoParts = selectedRepo.split('/')
  const cfg: Config | null = account && selectedRepo
    ? {
        token: account.token,
        owner: repoParts[0],
        repo: repoParts.slice(1).join('/'),
        path: currentPath,
        branch: repoBranch || 'main',
      }
    : null
  const gist = gists.find(g => g.id === selectedGist)

  const refresh = async () => {
    if (!account) {
      errorMsg.setValue(t('請先在設定新增帳號', '请先在设置新增账号', 'Please add an account in Settings first'))
      items.setValue([])
      return
    }
    if (source === 'gist') {
      if (!gist) {
        errorMsg.setValue(t('請先選擇 Gist', '请先选择 Gist', 'Please select a Gist first'))
        items.setValue([])
        return
      }
      loading.setValue(true)
      errorMsg.setValue('')
      items.setValue(gist.files.map(name => ({
        id: name, name, path: name, type: 'file' as const, sha: '', size: 0,
      })))
      loading.setValue(false)
      return
    }
    if (!cfg) {
      errorMsg.setValue(t('請先選擇倉庫', '请先选择仓库', 'Please select a repository first'))
      items.setValue([])
      return
    }
    loading.setValue(true)
    errorMsg.setValue('')
    try {
      items.setValue(await fetchFolderContents(cfg, currentPath))
    } catch (e: any) {
      errorMsg.setValue(e.message ?? t('獲取失敗', '获取失败', 'Failed to fetch'))
      items.setValue([])
    }
    loading.setValue(false)
  }

  // 選擇或路徑變化時重新拉
  useEffect(() => { refresh() }, [currentPath, selectedRepo, repoBranch, selectedGist, source, selectedUser])

  const openFile = async (f: BrowserItem) => {
    if (source === 'gist') {
      if (!account || !gist) return
      loading.setValue(true)
      try {
        const { content } = await fetchGistFileContent(account.token, gist.id, f.path)
        if (content.length > FILE_SIZE_LIMIT) {
          showMsg(t(`檔案過大（${formatSize(content.length)}），暫不支持編輯`, `文件过大（${formatSize(content.length)}），暂不支持编辑`, `File too large (${formatSize(content.length)}), editing not supported`))
          return
        }
        const parsed = parseFile(content)
        onPickFile(
          { id: f.id, name: f.name, path: f.path, sha: '' }, '',
          parsed,
          { platform: 'gist', username: selectedUser, owner: '', repo: '', gistId: gist.id, gistTitle: gist.title, branch: '', path: f.path, name: f.name },
        )
      } catch (e: any) {
        showMsg(e.message ?? t('讀取失敗', '读取失败', 'Failed to read'))
      }
      loading.setValue(false)
      return
    }
    if (!cfg) return
    if (f.size > FILE_SIZE_LIMIT) {
      showMsg(t(`檔案過大（${formatSize(f.size)}），暫不支持編輯`, `文件过大（${formatSize(f.size)}），暂不支持编辑`, `File too large (${formatSize(f.size)}), editing not supported`))
      return
    }
    loading.setValue(true)
    try {
      const { content, sha } = await fetchFileContent(cfg, f.path)
      const parsed = parseFile(content)
      onPickFile(
        { id: f.id, name: f.name, path: f.path, sha }, sha,
        parsed,
        { platform: 'github', username: selectedUser, owner: cfg.owner, repo: selectedRepo, gistId: '', gistTitle: '', branch: cfg.branch, path: f.path, name: f.name },
      )
    } catch (e: any) {
      showMsg(e.message ?? t('讀取失敗', '读取失败', 'Failed to read'))
    }
    loading.setValue(false)
  }

  // 派生：分組後的目錄與檔案
  const dirs = useMemo(
    () => items.value.filter(it => it.type === 'dir'),
    [items.value],
  )
  const files = useMemo(
    () => items.value.filter(it => it.type === 'file'),
    [items.value],
  )

  const isRoot = !currentPath
  const segs = currentPath.split('/').filter(Boolean)
  const lastSeg = segs[segs.length - 1] ?? ''
  const navTitle = isRoot ? t('GitHub 規則添加', 'GitHub 规则添加', 'GitHub Add Rules') : lastSeg
  const goUp = () => onNavigate(parentPath(currentPath))

  return (
    <List
      navigationTitle={navTitle}
      navigationBarTitleDisplayMode="inline"
      toast={{ isPresented: showToast, message: toastMsg.value, position: 'bottom' }}
      toolbar={{
        topBarTrailing: [
          <Button key="history" title={t('歷史', '历史', 'History')} systemImage="clock.arrow.circlepath" action={onShowHistory} />,
          <Button key="settings" title={t('使用者設定', '用户设置', 'User Settings')} systemImage="gear" action={onShowSettings} />,
        ],
      }}
    >
      {/* 小總結：當前用戶 / 平台 / 倉庫 / 內容統計 */}
      <Section header={<Text>{t('總覽', '总览', 'Overview')}</Text>}>
        <HStack spacing={10} alignment="center">
          {account && avatars[account.token] ? (
            <Image imageUrl={avatars[account.token]} resizable={true} frame={{ width: 28, height: 28 }} clipShape="circle" />
          ) : (
            <Image systemName="person.circle" foregroundStyle="secondaryLabel" />
          )}
          <VStack alignment="leading" spacing={2}>
            <Text>{selectedUser || t('未新增帳號', '未新增账号', 'No account added')}</Text>
            <Text font="caption" foregroundStyle="secondaryLabel">
              {source === 'gist'
                ? `Gist · ${gist ? gist.title : t('未選擇 Gist', '未选择 Gist', 'No Gist selected')}`
                : `GitHub · ${selectedRepo || t('未選擇倉庫', '未选择仓库', 'No repository selected')}`}
            </Text>
          </VStack>
          <Spacer />
          {cfg || gist ? (
            <Text font="caption" foregroundStyle="secondaryLabel">
              {t(`${dirs.length} 個檔案夾 · ${files.length} 個檔案`, `${dirs.length} 个文件夹 · ${files.length} 个文件`, `${dirs.length} folders · ${files.length} files`)}
            </Text>
          ) : null}
        </HStack>
      </Section>

      {/* 先選用戶 / 平台 / 倉庫 */}
      <Section header={<Text>{t('選擇用戶', '选择用户', 'Select User')}</Text>}>
        <Picker title={t('用戶', '用户', 'User')} value={selectedUser} onChanged={onUserChange} pickerStyle="menu">
          {accounts.length === 0 ? <Text tag="">{t('請先在設定新增帳號', '请先在设置新增账号', 'Please add an account in Settings first')}</Text> : null}
          {accounts.map(a => (
            <Text key={a.token} tag={a.username}>{a.username}</Text>
          ))}
        </Picker>
      </Section>
      <Section header={<Text>{t('選擇平台', '选择平台', 'Select Platform')}</Text>}>
        <Picker title={t('平台', '平台', 'Platform')} value={source} onChanged={onSourceChange} pickerStyle="menu">
          <Text tag="github">GitHub</Text>
          <Text tag="gist">Gist</Text>
        </Picker>
      </Section>
      {source === 'github' ? (
        <Section header={<Text>{t('選擇倉庫', '选择仓库', 'Select Repository')}</Text>}>
          {listsLoading && repos.length === 0 ? (
            <Text foregroundStyle="secondaryLabel">{t('載入中…', '加载中…', 'Loading…')}</Text>
          ) : (
            <Picker title={t('倉庫', '仓库', 'Repository')} value={selectedRepo} onChanged={onRepoChange} pickerStyle="menu">
              <Text tag="">{t('請選擇倉庫', '请选择仓库', 'Please select a repository')}</Text>
              {repos.map(r => (
                <Text key={r.id} tag={r.id}>{r.id}</Text>
              ))}
            </Picker>
          )}
          <HStack>
            <Spacer />
            <Button
              title={listsLoading ? t('載入中…', '加载中…', 'Loading…') : t('刷新倉庫清單', '刷新仓库清单', 'Refresh Repository List')}
              buttonStyle="borderless"
              disabled={listsLoading}
              action={onRefreshLists}
            />
            <Spacer />
          </HStack>
          {listsError ? (
            <Text foregroundStyle="systemRed">{listsError}</Text>
          ) : null}
        </Section>
      ) : (
        <Section header={<Text>{t('選擇 Gist', '选择 Gist', 'Select Gist')}</Text>}>
          {listsLoading && gists.length === 0 ? (
            <Text foregroundStyle="secondaryLabel">{t('載入中…', '加载中…', 'Loading…')}</Text>
          ) : (
            <Picker title="Gist" value={selectedGist} onChanged={onGistChange} pickerStyle="menu">
              <Text tag="">{t('請選擇 Gist', '请选择 Gist', 'Please select a Gist')}</Text>
              {gists.map(g => (
                <Text key={g.id} tag={g.id}>{g.title}</Text>
              ))}
            </Picker>
          )}
          <HStack>
            <Spacer />
            <Button
              title={listsLoading ? t('載入中…', '加载中…', 'Loading…') : t('刷新 Gist 清單', '刷新 Gist 清单', 'Refresh Gist List')}
              buttonStyle="borderless"
              disabled={listsLoading}
              action={onRefreshLists}
            />
            <Spacer />
          </HStack>
          {listsError ? (
            <Text foregroundStyle="systemRed">{listsError}</Text>
          ) : null}
        </Section>
      )}

      {/* 目前位置：只有路徑＋灰字返回按鈕，刷新已拿掉；目錄內容靠切換選擇／進出目錄時自動重拉。
          注意：同一列兩顆 Button 要加 borderless + 各佔一半寬 + 中間 Divider，
          否則 List 列的點按會混淆，點上級也會觸發返回根目錄（v2.0.1 的 bug）。 */}
      <Section header={<Text>{t('目前位置', '目前位置', 'Current Location')}</Text>}>
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
          {isRoot
            ? (source === 'gist' ? t(`Gist 檔案（${gist ? gist.title : '?'}）`, `Gist 文件（${gist ? gist.title : '?'}）`, `Gist file (${gist ? gist.title : '?'})`) : t(`倉庫根目錄 (${cfg ? `${cfg.owner}/${cfg.repo}` : '?'})`, `仓库根目录 (${cfg ? `${cfg.owner}/${cfg.repo}` : '?'})`, `Repository root (${cfg ? `${cfg.owner}/${cfg.repo}` : '?'})`))
            : currentPath}
        </Text>
        {!isRoot && source === 'github' ? (
          <HStack spacing={0} alignment="center">
            <Button buttonStyle="borderless" frame={{ maxWidth: 'infinity' }} action={goUp}>
              <Text foregroundStyle="secondaryLabel">{t('上一層', '上一层', 'Up One Level')}</Text>
            </Button>
            <Divider />
            <Button buttonStyle="borderless" frame={{ maxWidth: 'infinity' }} action={() => onNavigate('')}>
              <Text foregroundStyle="secondaryLabel">{t('返回根目錄', '返回根目录', 'Back to Root')}</Text>
            </Button>
          </HStack>
        ) : null}
      </Section>

      {/* 錯誤 */}
      {errorMsg.value ? (
        <Section>
          <Text foregroundStyle="systemRed">{errorMsg.value}</Text>
        </Section>
      ) : null}

      {/* 檔案夾分組 */}
      {dirs.length > 0 ? (
        <Section header={<Text>{t(`檔案夾 (${dirs.length})`, `文件夹 (${dirs.length})`, `Folders (${dirs.length})`)}</Text>}>
          {dirs.map(d => (
            <Button
              key={d.id}
              title={d.name}
              systemImage="folder.fill"
              action={() => onNavigate(d.path)}
            />
          ))}
        </Section>
      ) : null}

      {/* 檔案分組 */}
      {files.length > 0 ? (
        <Section
          header={<Text>{t(`檔案 (${files.length})`, `文件 (${files.length})`, `Files (${files.length})`)}</Text>}
          footer={<Text>{t('點擊檔案進入編輯模式', '点击文件进入编辑模式', 'Tap a file to enter edit mode')}</Text>}
        >
          {files.map(f => (
            <Button key={f.id} action={() => openFile(f)}>
              <HStack spacing={8}>
                <Image systemName="doc.text" foregroundStyle="secondaryLabel" />
                <Text foregroundStyle="label">{f.name}</Text>
                <Spacer />
                {f.size > 0 ? (
                  <Text font="caption" foregroundStyle="secondaryLabel">
                    {formatSize(f.size)}
                  </Text>
                ) : null}
              </HStack>
            </Button>
          ))}
        </Section>
      ) : null}

      {/* 空目錄 */}
      {!loading.value && !errorMsg.value && items.value.length === 0 ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">{t('空檔案夾', '空文件夹', 'Empty folder')}</Text>
        </Section>
      ) : null}
    </List>
  )
}

// =============== 歷史紀錄頁 ===============

function HistoryView({
  history, onBack, onOpenEntry, onDeleteEntries, onClear,
}: {
  history: HistoryEntry[]
  onBack: () => void
  onOpenEntry: (e: HistoryEntry) => Promise<boolean>
  onDeleteEntries: (indices: number[]) => void
  onClear: () => void
}) {
  const showToast = useObservable(false)
  const toastMsg = useObservable('')

  const showMsg = (msg: string) => {
    toastMsg.setValue(msg)
    showToast.setValue(true)
  }

  const openEntry = async (entry: HistoryEntry) => {
    const ok = await onOpenEntry(entry)
    if (!ok) showMsg(t('打不開這個檔案：帳號或檔案可能已不存在', '打不开这个文件：账号或文件可能已不存在', 'Cannot open this file: the account or file may no longer exist'))
  }

  return (
    <List
      navigationTitle={t('歷史紀錄', '历史记录', 'History')}
      navigationBarTitleDisplayMode="inline"
      toast={{ isPresented: showToast, message: toastMsg.value, position: 'bottom' }}
      toolbar={{ topBarLeading: <Button title={t('返回', '返回', 'Back')} action={onBack} /> }}
    >
      {history.length > 0 ? (
        <Section
          header={<Text>{t(`最近編輯 (${history.length})`, `最近编辑 (${history.length})`, `Recent Edits (${history.length})`)}</Text>}
          footer={<Text>{t('點一下重新進入檔案繼續編輯 · 左滑可刪除單筆', '点一下重新进入文件继续编辑 · 左滑可删除单笔', 'Tap to reopen a file and keep editing · Swipe left to delete an entry')}</Text>}
        >
          <ForEach
            count={history.length}
            itemBuilder={(i: number) => {
              const e = history[i]
              return (
                <Button key={`${e.platform}|${e.gistId || e.repo}|${e.path}`} action={() => openEntry(e)}>
                  <HStack spacing={8}>
                    <Image systemName="doc.text" foregroundStyle="secondaryLabel" />
                    <VStack alignment="leading" spacing={2}>
                      <Text>{e.name}</Text>
                      <Text font="caption" foregroundStyle="secondaryLabel">
                        {e.platform === 'gist'
                          ? `${e.gistTitle} · ${e.path}`
                          : `${e.repo} · ${e.path}`}
                      </Text>
                    </VStack>
                    <Spacer />
                    <Text font="caption" foregroundStyle="secondaryLabel">
                      {formatHistoryTime(e.editedAt)}
                    </Text>
                  </HStack>
                </Button>
              )
            }}
            onDelete={onDeleteEntries}
          />
        </Section>
      ) : (
        <Section>
          <Text foregroundStyle="secondaryLabel">{t('還沒有編輯紀錄', '还没有编辑记录', 'No edit history yet')}</Text>
        </Section>
      )}
      {history.length > 0 ? (
        <Section>
          <Button title={t('清空歷史紀錄', '清空历史记录', 'Clear History')} role="destructive" action={onClear} />
        </Section>
      ) : null}
    </List>
  )
}

// =============== 單條規則的行視圖 ===============

function statusBadge(status: RuleStatus): { text: string; color: 'green' | 'orange' } | null {
  if (status === 'added') return { text: '+', color: 'green' }
  if (status === 'modified') return { text: '~', color: 'orange' }
  return null
}

function RuleRow({
  rule, onTap,
}: {
  rule: Rule
  onTap: () => void
}) {
  if (rule.type === RAW_TYPE) {
    return (
      <Text key={rule.id} foregroundStyle="secondaryLabel" font="caption">
        {rule.value || t('(空行)', '(空行)', '(Empty line)')}
      </Text>
    )
  }
  const badge = statusBadge(rule.status)
  return (
    <Button key={rule.id} action={onTap}>
      <HStack spacing={8}>
        {badge ? (
          <Text foregroundStyle={badge.color} font="caption" bold>
            {badge.text}
          </Text>
        ) : null}
        <Text font="caption" foregroundStyle="secondaryLabel">{rule.type}</Text>
        <Text>{rule.value}</Text>
        {rule.trailing ? (
          <Text font="caption" foregroundStyle="secondaryLabel">{rule.trailing}</Text>
        ) : null}
        <Spacer />
      </HStack>
    </Button>
  )
}

// =============== 單條規則編輯/新增 Sheet ===============

function RuleEditorView({
  rule, title, onSave, onCancel, onDelete,
}: {
  rule: Rule
  title: string
  onSave: (next: Rule) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const type = useObservable(rule.type === RAW_TYPE ? '' : rule.type)
  const value = useObservable(rule.value)
  const trailing = useObservable(rule.trailing)
  const comment = useObservable(rule.comment)
  const error = useObservable('')

  const save = () => {
    const typeVal = type.value.trim().toUpperCase()
    const v = value.value.trim()
    if (!typeVal || !/^[A-Z][A-Z0-9-]*$/.test(typeVal)) {
      error.setValue(t('類型不合法（示例：DOMAIN-SUFFIX）', '类型不合法（示例：DOMAIN-SUFFIX）', 'Invalid type (e.g. DOMAIN-SUFFIX)'))
      return
    }
    if (!v) {
      error.setValue(t('值不能為空', '值不能为空', 'Value cannot be empty'))
      return
    }
    let tr = trailing.value.trim()
    if (tr && !tr.startsWith(',')) tr = ',' + tr
    let cm = comment.value.trim()
    if (cm && !cm.startsWith('#')) cm = '# ' + cm
    onSave({ ...rule, type: typeVal, value: v, trailing: tr, comment: cm })
  }

  return (
    <List
      navigationTitle={title}
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        topBarLeading: <Button title={t('取消', '取消', 'Cancel')} action={onCancel} />,
        topBarTrailing: <Button title={t('完成', '完成', 'Done')} action={save} />,
      }}
    >
      {error.value ? (
        <Section>
          <Text foregroundStyle="systemRed">{error.value}</Text>
        </Section>
      ) : null}

      <Section header={<Text>{t('類型', '类型', 'Type')}</Text>} footer={<Text>{t('Add Rules 的規則類型：選一個', 'Add Rules 的规则类型：选一个', 'Add Rules rule types: pick one')}</Text>}>
        <Picker
          title={t('規則類型', '规则类型', 'Rule Type')}
          value={type.value}
          onChanged={(v: string) => { if (v) type.setValue(v) }}
          pickerStyle="menu"
        >
          <Text tag="">{t('— 選擇 —', '— 选择 —', '— Select —')}</Text>
          {RULE_TYPES.map(t => (
            <Text key={t} tag={t}>{t}</Text>
          ))}
        </Picker>
      </Section>

      <Section header={<Text>{t('值', '值', 'Value')}</Text>} footer={<Text>{t('例如 github.io、1.2.3.4/24', '例如 github.io、1.2.3.4/24', 'e.g. github.io, 1.2.3.4/24')}</Text>}>
        <TextField
          title={t('值', '值', 'Value')}
          value={value}
          prompt={t('規則值', '规则值', 'Rule Value')}
          autocorrectionDisabled
          textInputAutocapitalization="never"
          autofocus={!rule.value}
        />
      </Section>

      <Section
        header={<Text>{t('額外參數（可選）', '额外参数（可选）', 'Extra Parameters (Optional)')}</Text>}
        footer={<Text>{t('逗號分隔，例如 ,Proxy,no-resolve（保存時自動補上前導逗號）', '逗号分隔，例如 ,Proxy,no-resolve（保存时自动补上前导逗号）', 'Comma-separated, e.g. ,Proxy,no-resolve (a leading comma is added automatically on save)')}</Text>}
      >
        <TextField title="trailing" value={trailing} prompt=",Proxy" autocorrectionDisabled textInputAutocapitalization="never" />
      </Section>

      <Section header={<Text>{t('註釋（可選）', '注释（可选）', 'Comment (Optional)')}</Text>}>
        <TextField title={t('註釋', '注释', 'Comment')} value={comment} prompt={t('# 備註', '# 备注', '# Note')} autocorrectionDisabled textInputAutocapitalization="never" />
      </Section>

      {onDelete ? (
        <Section>
          <Button title={t('刪除此規則', '删除此规则', 'Delete This Rule')} role="destructive" action={onDelete} />
        </Section>
      ) : null}
    </List>
  )
}

// =============== Diff & 提交 Sheet ===============

interface ModifiedPair { before: Rule; after: Rule }

function DiffView({
  fileName, added, modified, deleted, reorder, moved, message, busy, onCancel, onConfirm, submitHint,
}: {
  fileName: string
  added: Rule[]
  modified: ModifiedPair[]
  deleted: Rule[]
  reorder: boolean
  moved: { rule: Rule; oldIndex: number; newIndex: number }[]
  message: { value: string; setValue: (s: string) => void; readonly setValue2?: never } & { value: string }
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
  submitHint?: string
}) {
  // 注意：上面 message 類型用寬鬆形式，因為它是 Observable<string>
  const total = added.length + modified.length + deleted.length + (reorder ? 1 : 0)
  const movedPreview = moved.slice(0, 30)
  const movedRest = Math.max(0, moved.length - movedPreview.length)

  return (
    <List
      navigationTitle={t('確認提交', '确认提交', 'Confirm Submit')}
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        topBarLeading: <Button title={t('取消', '取消', 'Cancel')} disabled={busy} action={onCancel} />,
        topBarTrailing: (
          <Button
            title={busy ? t('提交中…', '提交中…', 'Submitting…') : t(`確認提交 (${total})`, `确认提交 (${total})`, `Confirm Submit (${total})`)}
            disabled={busy || total === 0}
            action={onConfirm}
          />
        ),
      }}
    >
      <Section header={<Text>{fileName}</Text>} footer={<Text>{submitHint ?? t('提交後將直接寫入遠端 main 分支', '提交后将直接写入远端 main 分支', 'Will be written directly to the remote main branch after submitting')}</Text>}>
        <TextField title="commit message" value={message as any} prompt={t('提交說明', '提交说明', 'Commit Message')} axis="vertical" />
      </Section>

      {added.length > 0 ? (
        <Section header={<Text foregroundStyle="systemGreen">{t(`+ 新增 ${added.length}`, `+ 新增 ${added.length}`, `+ Added ${added.length}`)}</Text>}>
          {added.map(r => (
            <Text key={r.id} foregroundStyle="systemGreen" font="caption">
              {formatRule(r)}
            </Text>
          ))}
        </Section>
      ) : null}

      {modified.length > 0 ? (
        <Section header={<Text foregroundStyle="systemOrange">{t(`~ 修改 ${modified.length}`, `~ 修改 ${modified.length}`, `~ Modified ${modified.length}`)}</Text>}>
          {modified.map(({ before, after }) => (
            <VStack key={after.id} alignment="leading" spacing={2}>
              <Text foregroundStyle="systemRed" font="caption">- {formatRule(before)}</Text>
              <Text foregroundStyle="systemGreen" font="caption">+ {formatRule(after)}</Text>
            </VStack>
          ))}
        </Section>
      ) : null}

      {deleted.length > 0 ? (
        <Section header={<Text foregroundStyle="systemRed">{t(`- 刪除 ${deleted.length}`, `- 删除 ${deleted.length}`, `- Deleted ${deleted.length}`)}</Text>}>
          {deleted.map(r => (
            <Text key={r.id} foregroundStyle="systemRed" font="caption" strikethrough="systemRed">
              {formatRule(r)}
            </Text>
          ))}
        </Section>
      ) : null}

      {reorder ? (
        <Section
          header={<Text foregroundStyle="systemBlue">{t('↕ 順序變化', '↕ 顺序变化', '↕ Order changed')}{moved.length > 0 ? ` (${moved.length})` : ''}</Text>}
          footer={
            movedRest > 0
              ? <Text>{t(`已省略其餘 ${movedRest} 項 · 提交時按當前列表順序寫入`, `已省略其余 ${movedRest} 项 · 提交时按当前列表顺序写入`, `Skipped ${movedRest} more items · will write in the current list order on submit`)}</Text>
              : <Text>{t('提交後按當前列表順序寫入檔案', '提交后按当前列表顺序写入文件', 'After submitting, writes to the file in the current list order')}</Text>
          }
        >
          {movedPreview.length > 0 ? (
            movedPreview.map(m => (
              <Text key={m.rule.id} foregroundStyle="systemBlue" font="caption">
                {t(`第 ${m.oldIndex + 1} → ${m.newIndex + 1} 行  ${formatRule(m.rule)}`, `第 ${m.oldIndex + 1} → ${m.newIndex + 1} 行  ${formatRule(m.rule)}`, `Line ${m.oldIndex + 1} → ${m.newIndex + 1}  ${formatRule(m.rule)}`)}
              </Text>
            ))
          ) : (
            <Text foregroundStyle="secondaryLabel" font="caption">
              {t('規則的相對順序已被調整', '规则的相对顺序已被调整', 'The relative order of rules has been changed')}
            </Text>
          )}
        </Section>
      ) : null}

      {total === 0 ? (
        <Section>
          <Text foregroundStyle="secondaryLabel">{t('沒有任何變更', '没有任何变更', 'No changes')}</Text>
        </Section>
      ) : null}
    </List>
  )
}

// =============== 批量追加 Sheet（Add Rules 式：同一類型 + 多行內容） ===============

function BatchAddView({
  defaultType, onSave, onCancel,
}: {
  defaultType: string
  onSave: (batch: Rule[]) => void
  onCancel: () => void
}) {
  const type = useObservable(defaultType || 'DOMAIN-SUFFIX')
  const content = useObservable('')
  const trailing = useObservable('')
  const error = useObservable('')

  const save = () => {
    const typeVal = type.value.trim().toUpperCase()
    if (!typeVal || !/^[A-Z][A-Z0-9-]*$/.test(typeVal)) {
      error.setValue(t('類型不合法（示例：DOMAIN-SUFFIX）', '类型不合法（示例：DOMAIN-SUFFIX）', 'Invalid type (e.g. DOMAIN-SUFFIX)'))
      return
    }
    const lines = content.value.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      error.setValue(t('請至少輸入一行規則內容', '请至少输入一行规则内容', 'Please enter at least one rule'))
      return
    }
    let tr = trailing.value.trim()
    if (tr && !tr.startsWith(',')) tr = ',' + tr
    onSave(lines.map(v => ({
      id: newId(), type: typeVal, value: v,
      trailing: tr, comment: '', status: 'added' as RuleStatus,
    })))
  }

  return (
    <List
      navigationTitle={t('批量追加', '批量追加', 'Batch Add')}
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        topBarLeading: <Button title={t('取消', '取消', 'Cancel')} action={onCancel} />,
        topBarTrailing: <Button title={t('完成', '完成', 'Done')} action={save} />,
      }}
    >
      {error.value ? (
        <Section>
          <Text foregroundStyle="systemRed">{error.value}</Text>
        </Section>
      ) : null}

      <Section header={<Text>{t('規則類型', '规则类型', 'Rule Type')}</Text>} footer={<Text>{t('以下每一行都會套用這個類型', '以下每一行都会套用这个类型', 'This type applies to every line below')}</Text>}>
        <Picker
          title={t('規則類型', '规则类型', 'Rule Type')}
          value={type.value}
          onChanged={(v: string) => { if (v) type.setValue(v) }}
          pickerStyle="menu"
        >
          {RULE_TYPES.map(t => (
            <Text key={t} tag={t}>{t}</Text>
          ))}
        </Picker>
      </Section>

      <Section header={<Text>{t('規則內容', '规则内容', 'Rule Content')}</Text>} footer={<Text>{t('每行一個，如 google.com', '每行一个，如 google.com', 'One per line, e.g. google.com')}</Text>}>
        <TextField
          title={t('內容', '内容', 'Content')}
          value={content}
          prompt={t('每行一個', '每行一个', 'One per line')}
          axis="vertical"
          autocorrectionDisabled
          textInputAutocapitalization="never"
          autofocus
        />
      </Section>

      <Section
        header={<Text>{t('額外參數（可選）', '额外参数（可选）', 'Extra Parameters (Optional)')}</Text>}
        footer={<Text>{t('逗號分隔，例如 ,Proxy,no-resolve（保存時自動補上前導逗號）', '逗号分隔，例如 ,Proxy,no-resolve（保存时自动补上前导逗号）', 'Comma-separated, e.g. ,Proxy,no-resolve (a leading comma is added automatically on save)')}</Text>}
      >
        <TextField title="trailing" value={trailing} prompt=",Proxy" autocorrectionDisabled textInputAutocapitalization="never" />
      </Section>
    </List>
  )
}

// =============== 編輯器主頁 ===============

type CommitTarget =
  | { kind: 'repo'; cfg: Config }
  | { kind: 'gist'; token: string; gistId: string }

function EditorView({
  file, sha, parsed, commitTarget, onBack, onCommitted,
}: {
  file: FileItem
  sha: string
  parsed: ParsedFile
  commitTarget: CommitTarget
  onBack: () => void
  onCommitted?: (ruleCount: number) => void
}) {
  // === 狀態 ===
  const rules = useObservable<Rule[]>(parsed.rules)
  // 已刪除的「原本就在檔案裡」的規則快照（用於 diff 展示）
  const deletedSnapshots = useObservable<Rule[]>([])
  // 當前編輯/新增 Sheet
  const editingId = useObservable<string | null>(null)
  const draftRule = useObservable<Rule | null>(null)
  const showBatch = useObservable(false)
  const showDiff = useObservable(false)
  const showToast = useObservable(false)
  const toastMsg = useObservable('')
  const submitting = useObservable(false)
  // 篩選
  const typeFilter = useObservable(ALL_TYPES)
  const searchText = useObservable('')
  // 提交 sha & 提交資訊
  const currentSha = useObservable(sha)
  const commitMessage = useObservable('')
  // 新增規則時預設的類型
  const lastUsedType = useObservable(
    parsed.rules.find(r => r.type !== RAW_TYPE)?.type ?? 'DOMAIN-SUFFIX',
  )

  // 原始快照 Map（用於檢測「修改」&「刪除原項」）。useRef 不觸發重渲。
  const originalRef = useRef<Map<string, Rule> | null>(null)
  if (!originalRef.current) {
    originalRef.current = new Map(parsed.rules.map(r => [r.id, r]))
  }
  // 原始位置序列（用於檢測「拖拽排序」）
  const originalOrderRef = useRef<string[] | null>(null)
  if (!originalOrderRef.current) {
    originalOrderRef.current = parsed.rules.map(r => r.id)
  }
  const getOriginal = (id: string) => originalRef.current!.get(id)

  const showMsg = (msg: string) => {
    toastMsg.setValue(msg)
    showToast.setValue(true)
  }

  // === 派生資料 ===
  // 檔案裡實際出現的類型（只用於上方「類型分組」篩選；新增/編輯的類型清單改用 RULE_TYPES）
  const distinctTypes = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const r of rules.value) {
      if (r.type === RAW_TYPE) continue
      if (!seen.has(r.type)) {
        seen.add(r.type)
        out.push(r.type)
      }
    }
    return out
  }, [rules.value])

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of rules.value) {
      if (r.type === RAW_TYPE) continue
      m[r.type] = (m[r.type] ?? 0) + 1
    }
    return m
  }, [rules.value])

  const filteredRules = useMemo(() => {
    const q = searchText.value.trim().toLowerCase()
    const ft = typeFilter.value
    return rules.value.filter(r => {
      if (r.type === RAW_TYPE) {
        // 僅在「全部 + 無搜索」時顯示原樣行
        return ft === ALL_TYPES && !q
      }
      if (ft !== ALL_TYPES && r.type !== ft) return false
      if (q && !r.value.toLowerCase().includes(q) && !r.type.toLowerCase().includes(q)) return false
      return true
    })
  }, [rules.value, typeFilter.value, searchText.value])

  const stats = useMemo(() => {
    let added = 0, modified = 0
    for (const r of rules.value) {
      if (r.status === 'added') added++
      else if (r.status === 'modified') modified++
    }
    const deleted = deletedSnapshots.value.length
    // 檢測拖拽排序：僅看「原本就在檔案裡」的規則的相對順序
    const origOrder = originalOrderRef.current!
    const presentIds = new Set(rules.value.map(r => r.id))
    const expected = origOrder.filter(id => presentIds.has(id))
    const actual = rules.value
      .filter(r => originalRef.current!.has(r.id))
      .map(r => r.id)
    let reorder = false
    if (actual.length === expected.length) {
      for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) { reorder = true; break }
      }
    }
    const total = added + modified + deleted + (reorder ? 1 : 0)
    return { added, modified, deleted, reorder, total }
  }, [rules.value, deletedSnapshots.value])

  // === 操作 ===
  const onMove = useCallback((indices: number[], newOffset: number) => {
    // indices/newOffset 都是相對於當前 filteredRules 的下標
    const fr = filteredRules
    const moving = indices.map(i => fr[i])
    const reduced = fr.filter((_, i) => !indices.includes(i))
    reduced.splice(newOffset, 0, ...moving)

    // 把過濾後的新順序合併回 master 數組（保持非可見項位置不變）
    const ids = new Set(fr.map(r => r.id))
    let f = 0
    const newMaster = rules.value.map(r => (ids.has(r.id) ? reduced[f++] : r))
    rules.setValue(newMaster)
  }, [filteredRules])

  const onDelete = useCallback((indices: number[]) => {
    const fr = filteredRules
    const idsToDelete = new Set(indices.map(i => fr[i].id))
    const removed: Rule[] = []
    const newMaster = rules.value.filter(r => {
      if (!idsToDelete.has(r.id)) return true
      const orig = getOriginal(r.id)
      if (orig && orig.type !== RAW_TYPE) removed.push(orig)
      return false
    })
    rules.setValue(newMaster)
    if (removed.length > 0) {
      deletedSnapshots.setValue([...deletedSnapshots.value, ...removed])
    }
  }, [filteredRules])

  const startAdd = () => {
    draftRule.setValue({
      id: newId(),
      type: lastUsedType.value || 'DOMAIN-SUFFIX',
      value: '',
      trailing: '',
      comment: '',
      status: 'added',
    })
  }

  // 類型＋值跟檔案裡已有規則一模一樣即重複（類型不分大小寫比對，值完全相同；額外參數與註解不列入比對）
  const isDuplicateRule = (next: Rule, excludeId?: string) =>
    rules.value.some(r =>
      r.id !== excludeId &&
      r.type.toUpperCase() === next.type.toUpperCase() &&
      r.value === next.value,
    )
  const dupListText = (dups: Rule[]) => {
    const shown = dups.slice(0, 5).map(r => `${r.type},${r.value}`)
    return dups.length > 5 ? [...shown, t(`…等共 ${dups.length} 條`, `…等共 ${dups.length} 条`, `… ${dups.length} in total`)].join('\n') : shown.join('\n')
  }

  const saveDraft = async (next: Rule) => {
    if (isDuplicateRule(next)) {
      await Dialog.alert({ title: t('規則重複', '规则重复', 'Duplicate Rule'), message: t(`檔案裡已經有這條規則了：\n${next.type},${next.value}`, `文件里已经有这条规则了：\n${next.type},${next.value}`, `This rule already exists in the file:\n${next.type},${next.value}`) })
      return
    }
    rules.setValue([...rules.value, next])
    if (next.type !== RAW_TYPE) lastUsedType.setValue(next.type)
    draftRule.setValue(null)
  }

  const saveBatch = async (batch: Rule[]) => {
    if (batch.length === 0) return
    const seen = new Set<string>()
    const fresh: Rule[] = []
    const dups: Rule[] = []
    for (const r of batch) {
      const key = `${r.type.toUpperCase()}\u0000${r.value}`
      if (isDuplicateRule(r) || seen.has(key)) dups.push(r)
      else { seen.add(key); fresh.push(r) }
    }
    if (fresh.length === 0) {
      await Dialog.alert({ title: t('規則重複', '规则重复', 'Duplicate Rule'), message: t(`這 ${dups.length} 條規則檔案裡已經有了：\n${dupListText(dups)}`, `这 ${dups.length} 条规则文件里已经有了：\n${dupListText(dups)}`, `${dups.length} of these rules already exist in the file:\n${dupListText(dups)}`) })
      return
    }
    rules.setValue([...rules.value, ...fresh])
    const lastType = fresh[fresh.length - 1].type
    if (lastType !== RAW_TYPE) lastUsedType.setValue(lastType)
    showBatch.setValue(false)
    if (dups.length > 0) {
      await Dialog.alert({ title: t('已跳過重複規則', '已跳过重复规则', 'Skipped Duplicate Rules'), message: t(`以下 ${dups.length} 條檔案裡已經有了，已跳過：\n${dupListText(dups)}`, `以下 ${dups.length} 条文件里已经有了，已跳过：\n${dupListText(dups)}`, `The following ${dups.length} rules already exist in the file and were skipped:\n${dupListText(dups)}`) })
    }
  }

  const editRule = useMemo(
    () => (editingId.value ? rules.value.find(r => r.id === editingId.value) ?? null : null),
    [editingId.value, rules.value],
  )

  const saveEdit = async (next: Rule) => {
    if (isDuplicateRule(next, next.id)) {
      await Dialog.alert({ title: t('規則重複', '规则重复', 'Duplicate Rule'), message: t(`檔案裡已經有這條規則了：\n${next.type},${next.value}`, `文件里已经有这条规则了：\n${next.type},${next.value}`, `This rule already exists in the file:\n${next.type},${next.value}`) })
      return
    }
    const orig = getOriginal(next.id)
    let final = next
    if (orig) {
      const changed = (
        next.type !== orig.type ||
        next.value !== orig.value ||
        next.trailing !== orig.trailing ||
        next.comment !== orig.comment
      )
      final = { ...next, status: changed ? 'modified' : 'unchanged' }
    } else {
      // 新增項保持 'added'
      final = { ...next, status: 'added' }
    }
    rules.setValue(rules.value.map(r => (r.id === next.id ? final : r)))
    if (next.type !== RAW_TYPE) lastUsedType.setValue(next.type)
    editingId.setValue(null)
  }

  const deleteEditing = () => {
    if (!editRule) return
    const id = editRule.id
    const orig = getOriginal(id)
    rules.setValue(rules.value.filter(r => r.id !== id))
    if (orig && orig.type !== RAW_TYPE) {
      deletedSnapshots.setValue([...deletedSnapshots.value, orig])
    }
    editingId.setValue(null)
  }

  // === 提交流程 ===
  const startCommit = () => {
    if (stats.total === 0) {
      showMsg(t('暫無更改', '暂无更改', 'No changes'))
      return
    }
    const parts: string[] = []
    if (stats.added) parts.push(`+${stats.added}`)
    if (stats.modified) parts.push(`~${stats.modified}`)
    if (stats.deleted) parts.push(`-${stats.deleted}`)
    if (stats.reorder) parts.push('reorder')
    commitMessage.setValue(`Update ${file.name}: ${parts.join(' ')}`)
    showDiff.setValue(true)
  }

  const commit = async () => {
    submitting.setValue(true)
    try {
      const newContent = serializeFile(parsed, rules.value)
      let result: { ok: boolean; error?: string; newSha?: string }
      if (commitTarget.kind === 'gist') {
        result = await commitGistFileContent(commitTarget.token, commitTarget.gistId, file.path, newContent)
      } else {
        result = await commitFileContent(
          commitTarget.cfg, file.path, newContent, currentSha.value, commitMessage.value || `Update ${file.name}`,
        )
      }
      if (result.ok) {
        showMsg(t('提交成功', '提交成功', 'Submitted successfully'))
        // 重置基線：所有未刪除項變成 unchanged，已刪除快照清空
        const reset: Rule[] = rules.value.map(r => ({ ...r, status: 'unchanged' as RuleStatus }))
        rules.setValue(reset)
        deletedSnapshots.setValue([])
        if (result.newSha) currentSha.setValue(result.newSha)
        // 把當前狀態作為新基線，避免下次再次提示「已修改」
        originalRef.current = new Map(reset.map(r => [r.id, r]))
        originalOrderRef.current = reset.map(r => r.id)
        showDiff.setValue(false)
        if (commitTarget.kind === 'repo') Widget.reloadUserWidgets()
        if (onCommitted) onCommitted(reset.filter(r => r.type !== RAW_TYPE).length)
      } else {
        showMsg(t(`提交失敗: ${result.error}`, `提交失败: ${result.error}`, `Submit failed: ${result.error}`))
      }
    } catch (e: any) {
      showMsg(t(`提交失敗: ${e.message ?? t('網路錯誤', '网络错误', 'network error')}`, `提交失败: ${e.message ?? t('網路錯誤', '网络错误', 'network error')}`, `Submit failed: ${e.message ?? t('網路錯誤', '网络错误', 'network error')}`))
    }
    submitting.setValue(false)
  }

  // === 派生：filtered 中可見項數（用於 header 顯示） ===
  const visibleRuleCount = useMemo(
    () => rules.value.filter(r => r.type !== RAW_TYPE).length,
    [rules.value],
  )

  // === 修改對（用於 Diff） ===
  const modifiedPairs = useMemo<ModifiedPair[]>(() => {
    const pairs: ModifiedPair[] = []
    for (const r of rules.value) {
      if (r.status !== 'modified') continue
      const before = getOriginal(r.id)
      if (before) pairs.push({ before, after: r })
    }
    return pairs
  }, [rules.value])

  const addedItems = useMemo(
    () => rules.value.filter(r => r.status === 'added'),
    [rules.value],
  )

  // === 拖拽細節：哪些規則從「原第幾行」移到了「現第幾行」 ===
  const movedItems = useMemo(() => {
    if (!stats.reorder) return []
    const origOrder = originalOrderRef.current!
    const presentIds = new Set(rules.value.map(r => r.id))
    const expected = origOrder.filter(id => presentIds.has(id))
    const moved: { rule: Rule; oldIndex: number; newIndex: number }[] = []
    let actualIdx = 0
    for (const r of rules.value) {
      if (!originalRef.current!.has(r.id)) continue
      if (expected[actualIdx] !== r.id) {
        const oldIdx = expected.indexOf(r.id)
        if (oldIdx >= 0) {
          moved.push({ rule: r, oldIndex: oldIdx, newIndex: actualIdx })
        }
      }
      actualIdx++
    }
    return moved
  }, [rules.value, stats.reorder])

  // === 渲染 ===
  return (
    <List
      navigationTitle={file.name}
      navigationBarTitleDisplayMode="inline"
      toast={{ isPresented: showToast, message: toastMsg.value, position: 'bottom' }}
      toolbar={{
        topBarLeading: <Button title={t('返回', '返回', 'Back')} action={onBack} />,
        topBarTrailing: [
          <EditButton key="edit" />,
          <Button
            key="save"
            title={stats.total > 0 ? t(`保存(${stats.total})`, `保存(${stats.total})`, `Save (${stats.total})`) : t('保存', '保存', 'Save')}
            disabled={stats.total === 0 || submitting.value}
            action={startCommit}
          />,
        ],
      }}
      sheet={[
        // —— 編輯已有規則 ——
        {
          isPresented: editingId.value !== null && editRule !== null,
          onChanged: (v: boolean) => { if (!v) editingId.setValue(null) },
          content: editRule ? (
            <NavigationStack>
              <RuleEditorView
                rule={editRule}
                title={t('編輯規則', '编辑规则', 'Edit Rule')}
                onSave={saveEdit}
                onCancel={() => editingId.setValue(null)}
                onDelete={deleteEditing}
              />
            </NavigationStack>
          ) : <Text>{''}</Text>,
        },
        // —— 新增規則 ——
        {
          isPresented: draftRule.value !== null,
          onChanged: (v: boolean) => { if (!v) draftRule.setValue(null) },
          content: draftRule.value ? (
            <NavigationStack>
              <RuleEditorView
                rule={draftRule.value}
                title={t('新增規則', '新增规则', 'Add Rule')}
                onSave={saveDraft}
                onCancel={() => draftRule.setValue(null)}
              />
            </NavigationStack>
          ) : <Text>{''}</Text>,
        },
        // —— 批量追加（Add Rules 式） ——
        {
          isPresented: showBatch,
          onChanged: (v: boolean) => { if (!v) showBatch.setValue(false) },
          content: (
            <NavigationStack>
              <BatchAddView
                defaultType={lastUsedType.value || 'DOMAIN-SUFFIX'}
                onSave={saveBatch}
                onCancel={() => showBatch.setValue(false)}
              />
            </NavigationStack>
          ),
        },
        // —— Diff 預覽 & 提交 ——
        {
          isPresented: showDiff,
          content: (
            <NavigationStack>
              <DiffView
                fileName={file.name}
                submitHint={commitTarget.kind === 'gist' ? t('提交後將直接更新這個 Gist 檔案', '提交后将直接更新这个 Gist 文件', 'Will update this Gist file directly after submitting') : undefined}
                added={addedItems}
                modified={modifiedPairs}
                deleted={deletedSnapshots.value}
                reorder={stats.reorder}
                moved={movedItems}
                message={commitMessage as any}
                busy={submitting.value}
                onCancel={() => showDiff.setValue(false)}
                onConfirm={commit}
              />
            </NavigationStack>
          ),
        },
      ]}
    >
      {/* 頂部：篩選 */}
      <Section header={<Text>{t('篩選與搜索', '筛选与搜索', 'Filter & Search')}</Text>}>
        <Picker
          title={t('類型分組', '类型分组', 'Group by Type')}
          value={typeFilter.value}
          onChanged={(v: string) => typeFilter.setValue(v)}
          pickerStyle="menu"
        >
          <Text tag={ALL_TYPES}>{t(`全部 (${visibleRuleCount})`, `全部 (${visibleRuleCount})`, `All (${visibleRuleCount})`)}</Text>
          {distinctTypes.map(t => (
            <Text key={t} tag={t}>{t} ({typeCounts[t] ?? 0})</Text>
          ))}
        </Picker>
        <TextField
          title={t('搜索', '搜索', 'Search')}
          value={searchText}
          prompt={t('按值或類型搜索', '按值或类型搜索', 'Search by value or type')}
          autocorrectionDisabled
          textInputAutocapitalization="never"
        />
      </Section>

      {/* 變更條 */}
      {stats.total > 0 ? (
        <Section>
          <HStack spacing={12}>
            <Text foregroundStyle="systemGreen">+{stats.added}</Text>
            <Text foregroundStyle="systemOrange">~{stats.modified}</Text>
            <Text foregroundStyle="systemRed">-{stats.deleted}</Text>
            {stats.reorder ? (
              <Text foregroundStyle="systemBlue">{t('↕ 順序變化', '↕ 顺序变化', '↕ Order changed')}</Text>
            ) : null}
            <Spacer />
            <Text font="caption" foregroundStyle="secondaryLabel">{t('未保存', '未保存', 'Unsaved')}</Text>
          </HStack>
        </Section>
      ) : null}

      {/* 新增按鈕 */}
      <Section>
        <Button title={t('+ 新增規則', '+ 新增规则', '+ Add Rule')} action={startAdd} />
        <Button title={t('批量追加', '批量追加', 'Batch Add')} action={() => showBatch.setValue(true)} />
      </Section>

      {/* 規則列表 */}
      <Section
        header={<Text>{t(`規則 (${filteredRules.length})`, `规则 (${filteredRules.length})`, `Rules (${filteredRules.length})`)}</Text>}
        footer={
          (searchText.value || typeFilter.value !== ALL_TYPES)
            ? <Text>{t('篩選生效中 · 拖拽排序僅作用於可見項', '筛选生效中 · 拖拽排序仅作用于可见项', 'Filter active · Drag to reorder applies to visible items only')}</Text>
            : <Text>{t('左滑刪除 · 點擊右上角進入編輯模式可拖拽排序', '左滑删除 · 点击右上角进入编辑模式可拖拽排序', 'Swipe left to delete · Tap Edit at the top right to drag and reorder')}</Text>
        }
      >
        <ForEach
          count={filteredRules.length}
          itemBuilder={(i: number) => {
            const r = filteredRules[i]
            return (
              <RuleRow
                key={r.id}
                rule={r}
                onTap={() => {
                  if (r.type === RAW_TYPE) return
                  editingId.setValue(r.id)
                }}
              />
            )
          }}
          onDelete={onDelete}
          onMove={onMove}
        />
      </Section>
    </List>
  )
}

// =============== 頂層路由 ===============

type AppMode =
  | { kind: 'home' }
  | { kind: 'settings' }
  | { kind: 'history' }
  | { kind: 'editor'; file: FileItem; sha: string; parsed: ParsedFile; commitTarget: CommitTarget; historyCtx: HistoryCtx }

function App() {
  const [mode, setMode] = useState<AppMode>({ kind: 'home' })
  const initialDraft = loadHomeDraft()
  const initialAccounts = loadAccountsOrMigrate()
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [avatars, setAvatars] = useState<Record<string, string>>(() => loadAvatarCache())
  const initialUser =
    initialDraft.username && initialAccounts.some((a) => a.username === initialDraft.username)
      ? initialDraft.username
      : initialAccounts.length > 0
        ? initialAccounts[0].username
        : ''
  const [selectedUser, setSelectedUser] = useState(initialUser)
  const [source, setSource] = useState(initialDraft.source)
  const [repos, setRepos] = useState<RepoItem[]>([])
  const [gists, setGists] = useState<GistItem[]>([])
  const [selectedRepo, setSelectedRepo] = useState(initialDraft.repo)
  const [selectedGist, setSelectedGist] = useState(initialDraft.gistId)
  const [repoBranch, setRepoBranch] = useState('main')
  const [listsLoading, setListsLoading] = useState(true)
  const [listsError, setListsError] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory())
  // 瀏覽路徑，跨 mode 切換保持不變；啓動時取上次記憶
  const [currentPath, setCurrentPath] = useState<string>(() =>
    initialDraft.path || Storage.get<string>(LAST_PATH_KEY) || '',
  )

  const accountForUsername = (username: string): Account | undefined =>
    accounts.find((a) => a.username === username)

  const fetchMissingAvatars = async (accs: Account[]) => {
    const next = loadAvatarCache()
    let changed = false
    for (const acc of accs) {
      if (next[acc.token]) continue
      try {
        const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${acc.token}`, Accept: 'application/vnd.github+json' },
        })
        if (res.ok) {
          const me = await res.json()
          if (me && me.avatar_url) {
            next[acc.token] = me.avatar_url
            changed = true
          }
        }
      } catch {}
    }
    if (changed) {
      saveAvatarCache(next)
      setAvatars(next)
    }
  }

  async function fetchListsFor(account: Account | undefined, src: string, repoToMatch?: string) {
    if (!account) {
      setListsLoading(false)
      return
    }
    setListsLoading(true)
    setListsError('')
    try {
      if (src === 'gist') {
        setGists(await fetchGistsForAccount(account))
      } else {
        const list = await fetchReposForAccount(account)
        setRepos(list)
        const match = list.find((r) => r.id === (repoToMatch ?? ''))
        if (match) setRepoBranch(match.defaultBranch)
      }
    } catch (e: any) {
      setListsError(e.message ?? t('取得清單失敗', '获取清单失败', 'Failed to fetch list'))
    }
    setListsLoading(false)
  }

  // 打開時拉一次清單 + 補頭像
  useEffect(() => {
    const account = accountForUsername(initialUser)
    if (account) {
      fetchListsFor(account, initialDraft.source, initialDraft.repo)
    }
    fetchMissingAvatars(initialAccounts)
    // 只在打開時自動刷新一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 選擇變化時存草稿，下次打開回到同樣的用戶 / 平台 / 倉庫 / 目錄
  useEffect(() => {
    saveHomeDraft({
      username: selectedUser,
      source,
      repo: selectedRepo,
      gistId: selectedGist,
      path: currentPath,
    })
  }, [selectedUser, source, selectedRepo, selectedGist, currentPath])

  // 當前選擇同步回 github_config，小組件與後台追加（intent）繼續用同一份配置
  useEffect(() => {
    if (source !== 'github') return
    const account = accountForUsername(selectedUser)
    if (!account || !selectedRepo) return
    const parts = selectedRepo.split('/')
    syncWidgetConfig({
      token: account.token,
      owner: parts[0],
      repo: parts.slice(1).join('/'),
      path: currentPath,
      branch: repoBranch || 'main',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, selectedRepo, repoBranch, currentPath, source])

  const handleUserChange = (v: string) => {
    setSelectedUser(v)
    setSelectedRepo('')
    setSelectedGist('')
    setRepoBranch('main')
    setCurrentPath('')
    fetchListsFor(accountForUsername(v), source)
  }

  const handleSourceChange = (v: string) => {
    setSource(v)
    setSelectedRepo('')
    setSelectedGist('')
    setRepoBranch('main')
    setCurrentPath('')
    fetchListsFor(accountForUsername(selectedUser), v)
  }

  const handleRepoChange = (v: string) => {
    setSelectedRepo(v)
    setCurrentPath('')
    const item = repos.find((r) => r.id === v)
    setRepoBranch(item ? item.defaultBranch : 'main')
  }

  const handleGistChange = (v: string) => {
    setSelectedGist(v)
    setCurrentPath('')
  }

  const handleNavigate = (newPath: string) => {
    setCurrentPath(newPath)
    Storage.set(LAST_PATH_KEY, newPath)
  }

  const buildCommitTarget = (ctx: HistoryCtx): CommitTarget | null => {
    const account = accountForUsername(ctx.username)
    if (!account) return null
    if (ctx.platform === 'gist') {
      return { kind: 'gist', token: account.token, gistId: ctx.gistId }
    }
    const parts = ctx.repo.split('/')
    return {
      kind: 'repo',
      cfg: {
        token: account.token,
        owner: ctx.owner || parts[0],
        repo: parts.slice(1).join('/'),
        path: '',
        branch: ctx.branch || 'main',
      },
    }
  }

  const handlePickFile = (file: FileItem, sha: string, parsed: ParsedFile, ctx: HistoryCtx) => {
    const target = buildCommitTarget(ctx)
    if (!target) return
    setHistory(recordHistory({
      ...ctx,
      ruleCount: parsed.rules.filter((r) => r.type !== RAW_TYPE).length,
    }))
    // 讓首頁選擇跟上這次打開的檔案（從歷史紀錄點進來時尤其重要）
    setSelectedUser(ctx.username)
    if (ctx.platform === 'gist') {
      setSource('gist')
      setSelectedGist(ctx.gistId)
      setSelectedRepo('')
    } else {
      setSource('github')
      setSelectedRepo(ctx.repo)
      setSelectedGist('')
      setRepoBranch(ctx.branch || 'main')
    }
    setCurrentPath(parentPath(file.path))
    setMode({ kind: 'editor', file, sha, parsed, commitTarget: target, historyCtx: ctx })
  }

  /** 從歷史紀錄重進檔案：找不到帳號或檔案時返回 false，由調用方提示 */
  const openHistoryEntry = async (entry: HistoryEntry): Promise<boolean> => {
    const account = accountForUsername(entry.username)
    if (!account) return false
    try {
      const ctx: HistoryCtx = {
        platform: entry.platform,
        username: entry.username,
        owner: entry.owner,
        repo: entry.repo,
        gistId: entry.gistId,
        gistTitle: entry.gistTitle,
        branch: entry.branch,
        path: entry.path,
        name: entry.name,
      }
      if (entry.platform === 'gist') {
        const { content } = await fetchGistFileContent(account.token, entry.gistId, entry.path)
        handlePickFile(
          { id: entry.path, name: entry.name, path: entry.path, sha: '' }, '',
          parseFile(content), ctx,
        )
        return true
      }
      const parts = entry.repo.split('/')
      const cfg: Config = {
        token: account.token,
        owner: entry.owner || parts[0],
        repo: parts.slice(1).join('/'),
        path: '',
        branch: entry.branch || 'main',
      }
      const { content, sha } = await fetchFileContent(cfg, entry.path)
      handlePickFile(
        { id: entry.path, name: entry.name, path: entry.path, sha }, sha,
        parseFile(content), ctx,
      )
      return true
    } catch {
      return false
    }
  }

  const handleSettingsReturn = () => {
    setMode({ kind: 'home' })
    const accs = loadAccountsOrMigrate()
    setAccounts(accs)
    setAvatars(loadAvatarCache())
    let user = selectedUser
    if (!accs.some((a) => a.username === user)) {
      user = accs.length > 0 ? accs[0].username : ''
      setSelectedUser(user)
      setSelectedRepo('')
      setSelectedGist('')
      setCurrentPath('')
    }
    const account = accs.find((a) => a.username === user)
    if (!account) return
    fetchListsFor(account, source, selectedRepo)
    fetchMissingAvatars(accs)
  }

  const handleDeleteHistory = (indices: number[]) => {
    const next = history.filter((_, i) => !indices.includes(i))
    saveHistory(next)
    setHistory(next)
  }

  const handleClearHistory = () => {
    saveHistory([])
    setHistory([])
  }

  if (mode.kind === 'settings') {
    return <SettingsView onBack={handleSettingsReturn} />
  }
  if (mode.kind === 'history') {
    return (
      <HistoryView
        history={history}
        onBack={() => setMode({ kind: 'home' })}
        onOpenEntry={openHistoryEntry}
        onDeleteEntries={handleDeleteHistory}
        onClear={handleClearHistory}
      />
    )
  }
  if (mode.kind === 'editor') {
    return (
      <EditorView
        file={mode.file}
        sha={mode.sha}
        parsed={mode.parsed}
        commitTarget={mode.commitTarget}
        onBack={() => setMode({ kind: 'home' })}
        onCommitted={(ruleCount) => {
          // 提交成功也刷新一次歷史紀錄的時間與條數
          setHistory(recordHistory({ ...mode.historyCtx, ruleCount }))
        }}
      />
    )
  }
  return (
    <HomeView
      accounts={accounts}
      avatars={avatars}
      selectedUser={selectedUser}
      source={source}
      repos={repos}
      gists={gists}
      selectedRepo={selectedRepo}
      repoBranch={repoBranch}
      selectedGist={selectedGist}
      currentPath={currentPath}
      history={history}
      listsLoading={listsLoading}
      listsError={listsError}
      onUserChange={handleUserChange}
      onSourceChange={handleSourceChange}
      onRepoChange={handleRepoChange}
      onGistChange={handleGistChange}
      onRefreshLists={() => fetchListsFor(accountForUsername(selectedUser), source, selectedRepo)}
      onNavigate={handleNavigate}
      onPickFile={handlePickFile}
      onOpenHistoryEntry={openHistoryEntry}
      onShowSettings={() => setMode({ kind: 'settings' })}
      onShowHistory={() => setMode({ kind: 'history' })}
    />
  )
}

function View() {
  return (
    <NavigationStack>
      <App />
    </NavigationStack>
  )
}

Navigation.present({ element: <View /> }).then(() => Script.exit())

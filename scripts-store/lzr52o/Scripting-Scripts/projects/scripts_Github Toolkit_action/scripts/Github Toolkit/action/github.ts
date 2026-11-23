import { t } from "../components/i18n";
export interface WidgetTarget {
  owner: string
  repo: string
  workflowId?: number
  branch: string
}

export interface RunLite {
  id: number
  run_number: number
  status: string
  conclusion: string | null
  created_at: string
  event: string
}

// 多帳號時，這裡讀的還是舊鍵 github_username / github_token，
// 主程式在帳號清單變動時會同步寫回舊鍵（v1.3.0 起是清單第一個帳號），
// 但 v1.5.0 起舊鍵只是找不到所屬帳號時的後備：小工具跟 App Intent
// 會先用下面那張「工作流程目標 -> 帳號」對照表找帳號，找不到才用舊鍵。
export function getStoredAuth(): { token: string; username: string } | null {
  const username = Storage.get<string>('github_username')
  const token = Storage.get<string>('github_token')
  if (username && token) return { username, token }
  return null
}

export function loadGithubAccounts(): { username: string; token: string }[] {
  try {
    const raw = Storage.get<string>('github_toolkit_accounts')
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((a: any) => a && a.token && a.username)
  } catch (_) {
    return []
  }
}

// v1.5.0：工作流程目標 -> 帳號使用者名稱的對照表，主程式在小工具設定頁
// 選工作流程時寫入（key 是 "owner/repo/workflowId"，value 是帳號的使用者名稱，
// 不是 Token，Token 永遠只留在共用帳號清單裡）。
const WIDGET_TARGET_ACCOUNTS_KEY = 'widget_target_accounts'
export function getWidgetTargetAccounts(): Record<string, string> {
  try {
    const raw = Storage.get<string>(WIDGET_TARGET_ACCOUNTS_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    const out: Record<string, string> = {}
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'string') out[k] = obj[k]
    }
    return out
  } catch (_) {
    return {}
  }
}
export function setWidgetTargetAccount(target: string, username: string) {
  const map = getWidgetTargetAccounts()
  map[target] = username
  try { Storage.set(WIDGET_TARGET_ACCOUNTS_KEY, JSON.stringify(map)) } catch (_) { }
}
export function removeWidgetTargetAccount(target: string) {
  const map = getWidgetTargetAccounts()
  delete map[target]
  try { Storage.set(WIDGET_TARGET_ACCOUNTS_KEY, JSON.stringify(map)) } catch (_) { }
}
export function clearWidgetTargetAccounts() {
  try { Storage.remove(WIDGET_TARGET_ACCOUNTS_KEY) } catch (_) { }
}

// 找一個工作流程目標該用哪個帳號：先查對照表，再看目標的 owner
// 是不是就是某個帳號的使用者名稱（自己的倉庫最常見的情況，舊目標沒有
// 對照表時靠這條也能找回帳號），最後才退回舊鍵（清單第一個帳號）。
export function getAccountForWidgetTarget(target: string): { username: string; token: string } | null {
  const accounts = loadGithubAccounts()
  const byUsername = (u: string) => accounts.find((a) => a.username.toLowerCase() === u.toLowerCase())
  const mapped = getWidgetTargetAccounts()[target]
  if (mapped) {
    const acc = byUsername(mapped)
    if (acc) return acc
  }
  const owner = target.split('/').filter(Boolean)[0]
  if (owner) {
    const acc = byUsername(owner)
    if (acc) return acc
  }
  return getStoredAuth()
}
export function getTokenForWidgetTarget(target: string): string | null {
  const acc = getAccountForWidgetTarget(target)
  return acc ? acc.token : null
}

// v1.5.4：小工具觸發不再寫追蹤、不再發完成通知，所以 v1.5.2 那張
// widget_run_watches 追蹤清單已經刪掉，不再有任何地方寫它；
// 主程式打開時會把殘留的舊清單清掉，避免舊追蹤還發通知。

export async function ghRequest<T>(
  path: string,
  token: string,
  options?: { method?: string; body?: string }
): Promise<T> {
  const resp = await fetch(`https://api.github.com${path}`, {
    method: options?.method ?? 'GET',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: options?.body,
  })
  if (!resp.ok) throw new Error(`GitHub API error (${resp.status})`)
  const text = await resp.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export function parseTarget(param: string): { owner: string; repo: string; workflowRef?: string } {
  const parts = (param || '').split('/').filter(Boolean)
  if (parts.length >= 2) {
    return { owner: parts[0], repo: parts[1], workflowRef: parts[2] }
  }
  return { owner: '', repo: '' }
}

export function getWidgetTargets(): string[] {
  const list = Storage.get<string>('widget_repos')
  if (list) {
    try {
      const arr = JSON.parse(list)
      if (Array.isArray(arr)) {
        return arr.filter((x): x is string => typeof x === 'string' && x.split('/').filter(Boolean).length >= 2)
      }
    } catch (_) { }
  }
  const legacy = Storage.get<string>('widget_repo')
  if (legacy) return [legacy]
  return []
}

export function setWidgetTargets(targets: string[]) {
  const clean = targets.filter((t) => t.split('/').filter(Boolean).length >= 2)
  if (clean.length === 0) {
    Storage.remove('widget_repos')
    Storage.remove('widget_repo')
    return
  }
  Storage.set('widget_repos', JSON.stringify(clean))
  Storage.remove('widget_repo')
}

export function recordWidgetTrigger(owner: string, repo: string, workflowId: number) {
  Storage.set('widget_last_target', `${owner}/${repo}/${workflowId}`)
}

export async function fetchWorkflowInfo(owner: string, repo: string, token: string, workflowRef?: string) {
  const repoInfo = await ghRequest<{ default_branch: string }>(
    `/repos/${owner}/${repo}`,
    token
  )
  const branch = repoInfo.default_branch || 'main'
  const wfList = await ghRequest<{ workflows: { id: number; name: string; path: string }[] }>(
    `/repos/${owner}/${repo}/actions/workflows`,
    token
  )
  let wf = wfList.workflows[0]
  if (workflowRef) {
    wf =
      wfList.workflows.find((w) => String(w.id) === workflowRef) ??
      wfList.workflows.find((w) => w.name === workflowRef) ??
      wfList.workflows.find((w) => w.path.endsWith('/' + workflowRef)) ??
      wf
  }
  return { branch, workflow: wf, all: wfList.workflows }
}

export async function fetchCron(owner: string, repo: string, branch: string, path: string, token: string): Promise<string | null> {
  const resp = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`, {
    headers: { 'Authorization': `token ${token}` },
  })
  if (!resp.ok) return null
  const content = await resp.text()
  const lines = content.split('\n').filter((l) => !l.trim().startsWith('#'))
  const crons = lines.join('\n').match(/cron\s*:\s*['"]?([^'"\n#]+)['"]?/gi)
  if (!crons) return null
  return crons.map((c: string) => c.replace(/cron\s*:\s*['"]?/i, '').replace(/['"]\s*$/, '').trim())[0] || null
}

export async function fetchLatestRuns(owner: string, repo: string, workflowId: number, token: string): Promise<RunLite[]> {
  const data = await ghRequest<{ workflow_runs: RunLite[] }>(
    `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=5`,
    token
  )
  return data.workflow_runs ?? []
}

interface CronField {
  values: Set<number>
  star: boolean
}

function parseCronField(field: string, min: number, max: number): CronField {
  const values = new Set<number>()
  let star = false
  for (const part of field.split(',')) {
    let range = part
    let step = 1
    if (part.includes('/')) {
      const [r, s] = part.split('/')
      range = r
      step = parseInt(s, 10) || 1
    }
    if (range === '*') {
      star = true
      for (let i = min; i <= max; i += step) values.add(i)
    } else if (range.includes('-')) {
      const [a, b] = range.split('-').map(Number)
      for (let i = a; i <= b; i += step) values.add(i)
    } else {
      const v = parseInt(range, 10)
      if (!isNaN(v)) values.add(v)
    }
  }
  return { values, star }
}

function parseCron(expr: string): { minutes: CronField; hours: CronField; dom: CronField; months: CronField; dow: CronField } | null {
  const fields = expr.trim().split(/\s+/)
  if (fields.length < 5) return null
  return {
    minutes: parseCronField(fields[0], 0, 59),
    hours: parseCronField(fields[1], 0, 23),
    dom: parseCronField(fields[2], 1, 31),
    months: parseCronField(fields[3], 1, 12),
    dow: parseCronField(fields[4], 0, 7),
  }
}

function dayMatches(date: Date, c: NonNullable<ReturnType<typeof parseCron>>): boolean {
  const month = date.getUTCMonth() + 1
  const dom = date.getUTCDate()
  const dow = date.getUTCDay()
  if (!c.months.values.has(month)) return false
  const domOk = c.dom.values.has(dom)
  const dowOk = c.dow.values.has(dow) || (dow === 0 && c.dow.values.has(7))
  const domRestricted = !c.dom.star
  const dowRestricted = !c.dow.star
  return domRestricted && dowRestricted ? domOk || dowOk : domOk && dowOk
}

export function nextCronRun(expr: string, from: Date = new Date()): Date | null {
  const c = parseCron(expr)
  if (!c) return null
  for (let d = 0; d <= 366; d++) {
    const day = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + d))
    if (!dayMatches(day, c)) continue
    const minutes = Array.from(c.minutes.values).sort((a, b) => a - b)
    for (let h = 0; h < 24; h++) {
      if (!c.hours.values.has(h)) continue
      for (const m of minutes) {
        const t = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m, 0, 0))
        if (t.getTime() > from.getTime()) return t
      }
    }
  }
  return null
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('剛剛', '刚刚', 'Just now')
  if (min < 60) return t(`${min} 分鐘前`, `${min} 分钟前`, `${min} min ago`)
  const h = Math.floor(min / 60)
  if (h < 24) return t(`${h} 小時前`, `${h} 小时前`, `${h} h ago`)
  return t(`${Math.floor(h / 24)} 天前`, `${Math.floor(h / 24)} 天前`, `${Math.floor(h / 24)} d ago`)
}

export function runStatusText(run: RunLite): string {
  if (run.status === 'completed') {
    return run.conclusion === 'success' ? t('成功', '成功', 'Success') : run.conclusion || t('失敗', '失败', 'Failed')
  }
  if (run.status === 'in_progress') return t('執行中', '执行中', 'Running')
  if (run.status === 'queued') return t('排隊中', '排队中', 'Queued')
  return run.status
}

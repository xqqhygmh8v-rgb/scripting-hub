import { PrivateMarker } from "../components/privateMarker";
import { Overview, SkeletonRows } from "../components/overview";
import { AccountHeader } from "../components/accountHeader";
import { AppearanceSection } from "../components/appearance";
import { REPO_LIST, RepoHeader, RepoSummary } from "../components/repoUI";
import { LoginPanel } from "../components/loginPanel";
import {
  NavigationStack,
  List,
  Section,
  TextField,
  SecureField,
  Button,
  Text,
  HStack,
  VStack,
  Spacer,
  ForEach,
  Image,
  Label,
  NavigationLink,

  Rectangle,  Navigation,
  ProgressView,
  Link,
  Script,
  ScrollView,
  Canvas,
  TimelineCanvas,
  Toggle,
  ZStack,
  Widget,
  Notification,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useObservable,
} from "scripting"
import { TokenPermissions } from "../components/tokenPermissions"
import { t } from "../components/i18n"
import { PAGE_BACKGROUND, adaptiveColor } from "../components/theme";
import { GlassBackground, GlassCard, GlassNodeCard, glassSurface, glassButtonStyle } from "../components/glass";
import { LoadingRow } from "../components/loadingRow";
import { ThemeCardBackground, useThemePalette } from "../components/themePalette";
import { SwipeRowBackground } from "../components/swipeRowBackground";
import { describeRunDetail, runDetailStepDigits, type RunDetailContent } from "./runDetailContent";
import { useRunElapsed } from "./useRunElapsed";
import { useFlowClock } from "./useFlowClock";
import { getFlowGeometry, flowNodeHeight, flowRowGap, type FlowGeometry, type FlowNodeGeometry, type FlowSegmentGeometry } from "./flowGeometry";
import { createTransferPlan, transferFrame, advanceTransferPlayback, dockedSignal, type TransferPlan, type TransferPlayback } from "./flowTransfer";
import { arrivalPulse, nodeSweep } from "./flowSignal";
import { flowArrival, type FlowArrival } from "./flowArrival";
import { flowOpacity, flowPhase } from "./flowMotion";
import { flowStatusVisual, type FlowStatusVisual } from "./flowStatusVisual";
import { flowEdgePoint } from "./flowEdgeTrail";

function storageGet(key: string): string | null {
  return Storage.get<string>(key) ?? null
}
function storageSet(key: string, value: string): void {
  Storage.set(key, value)
}
function storageRemove(key: string): void {
  Storage.remove(key)
}

interface Account {
  username: string
  token: string
}

// 多帳號：跟 Github Repository Manager 同一套做法。
// github_toolkit_accounts 是三個模組共用的帳號清單；github_username / github_token 是舊的單一帳號鍵，
// v1.3.0 起 Action 不再有「預設帳號」：舊鍵改成清單第一個帳號的鏡像，
// 小工具（widget.tsx）和 App Intent（app_intents.tsx）讀的還是這兩個舊鍵，
// 所以帳號清單變動時一定要同步寫回舊鍵，小工具才會跟著用第一個帳號的 Token，
// 不用改 widget.tsx / app_intents.tsx。想換小工具用的帳號，把那個帳號拖到最上面即可。
function loadAccounts(): Account[] {
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

function saveAccounts(accounts: Account[]) {
  Storage.set('github_toolkit_accounts', JSON.stringify(accounts))
  if (accounts.length === 0) {
    storageRemove('github_username')
    storageRemove('github_token')
    // 全部刪光就等於原本的登出：小工具設定也一起清掉。
    storageRemove('widget_repo')
    storageRemove('widget_repos')
    return
  }
  const first = accounts[0]
  storageSet('github_username', first.username)
  storageSet('github_token', first.token)
}

// 舊版只有一組 username + token 時，第一次開新版就把它變成帳號清單的第一個帳號，
// 舊的登入不用重填，之後再新增第二個帳號。
function migrateAccounts(): Account[] {
  const list = loadAccounts()
  if (list.length > 0) return list
  const username = storageGet('github_username')
  const token = storageGet('github_token')
  if (username && token) {
    const migrated = [{ username, token }]
    saveAccounts(migrated)
    return migrated
  }
  return []
}

// 每個帳號的頭像快取：Token -> avatar_url，存在 Storage，設定頁帳號列前面顯示。
// 第一次打開設定頁時，沒快取的帳號才用 /user 拉一次，之後直接用快取，不用每次重拉。
const AVATAR_CACHE_KEY = 'github_avatars'
function loadAvatarCache(): Record<string, string> {
  try {
    const raw = Storage.get<string>(AVATAR_CACHE_KEY)
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
function saveAvatarCache(map: Record<string, string>) {
  try {
    Storage.set(AVATAR_CACHE_KEY, JSON.stringify(map))
  } catch (_) { }
}

// 首頁帳號分區的展開/折疊，跟 Github Repository Manager 的做法一樣：
// 存在 Storage，退出再進來還記得；沒記過的預設折疊（v1.49.1 起 Repository 就是預設折疊）。
const EXPANDED_KEY = 'github_action_expanded'

function loadExpanded(): Record<string, boolean> {
  try {
    const raw = Storage.get<string>(EXPANDED_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    const out: Record<string, boolean> = {}
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'boolean') out[k] = obj[k]
    }
    return out
  } catch (_) {
    return {}
  }
}

function getWidgetTargets(): string[] {
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

function setWidgetTargets(targets: string[]) {
  const clean = targets.filter((t) => t.split('/').filter(Boolean).length >= 2)
  if (clean.length === 0) {
    Storage.remove('widget_repos')
    Storage.remove('widget_repo')
    return
  }
  Storage.set('widget_repos', JSON.stringify(clean))
  Storage.remove('widget_repo')
}

function recordWidgetTrigger(owner: string, repo: string, workflowId: number) {
  Storage.set('widget_last_target', `${owner}/${repo}/${workflowId}`)
}

// v1.5.0：工作流程目標 -> 帳號使用者名稱的對照表（跟 github.ts 那份同一個 key，
// 主程式、小工具、App Intent 三邊共用；value 是使用者名稱不是 Token，
// Token 永遠只留在共用帳號清單裡）。
const WIDGET_TARGET_ACCOUNTS_KEY = 'widget_target_accounts'
function getWidgetTargetAccounts(): Record<string, string> {
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
function setWidgetTargetAccount(target: string, username: string) {
  const map = getWidgetTargetAccounts()
  map[target] = username
  try { Storage.set(WIDGET_TARGET_ACCOUNTS_KEY, JSON.stringify(map)) } catch (_) { }
}
function removeWidgetTargetAccount(target: string) {
  const map = getWidgetTargetAccounts()
  delete map[target]
  try { Storage.set(WIDGET_TARGET_ACCOUNTS_KEY, JSON.stringify(map)) } catch (_) { }
}
function clearWidgetTargetAccounts() {
  try { Storage.remove(WIDGET_TARGET_ACCOUNTS_KEY) } catch (_) { }
}
// 找一個工作流程目標該用哪個帳號：先查對照表，再看 owner 是不是某個帳號的
// 使用者名稱，最後才退回舊鍵（清單第一個帳號）。
function getAccountForWidgetTarget(target: string): Account | null {
  const accounts = loadAccounts()
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
  const username = storageGet('github_username')
  const token = storageGet('github_token')
  if (username && token) return { username, token }
  return accounts[0] || null
}

function errorMessage(e: any, fallback: string): string {
  return e?.message || fallback
}

function isRunActive(run: Pick<Run, 'status'>): boolean {
  return run.status === 'in_progress' || run.status === 'queued'
}

function runStatusColor(conclusion: Run['conclusion']): string {
  switch (conclusion) {
    case 'success': return '#34c759'
    case 'failure': return '#ff3b30'
    case 'cancelled': return '#ff9500'
    default: return '#8e8e93'
  }
}

function runStatusInfo(run: Run): { text: string; color: string; backgroundColor: string } {
  if (run.status === 'completed') {
    switch (run.conclusion) {
      case 'success': return { text: t('成功', '成功', 'Success'), color: '#1a7f37', backgroundColor: '#d9f2e0' }
      case 'failure': return { text: t('失敗', '失败', 'Failed'), color: '#b42318', backgroundColor: '#fde3e1' }
      case 'cancelled': return { text: t('已取消', '已取消', 'Cancelled'), color: '#b54708', backgroundColor: '#fde9d2' }
      case 'timed_out': return { text: t('逾時', '超时', 'Timed out'), color: '#b54708', backgroundColor: '#fde9d2' }
      default: return { text: run.conclusion || t('完成', '完成', 'Completed'), color: '#6b7280', backgroundColor: '#eef0f3' }
    }
  }
  if (run.status === 'in_progress') return { text: t('進行中', '进行中', 'In progress'), color: '#175cd3', backgroundColor: '#d7e8fd' }
  if (run.status === 'queued') return { text: t('排隊中', '排队中', 'Queued'), color: '#6b7280', backgroundColor: '#eef0f3' }
  if (run.status === 'pending' || run.status === 'waiting' || run.status === 'requested') return { text: t('等待中', '等待中', 'Waiting'), color: '#6b7280', backgroundColor: '#eef0f3' }
  return { text: run.status, color: '#6b7280', backgroundColor: '#eef0f3' }
}

function runStatusIcon(run: Run): { systemName: string; color: string } {
  if (run.status === 'completed') {
    switch (run.conclusion) {
      case 'success': return { systemName: 'checkmark.circle.fill', color: '#34c759' }
      case 'failure': return { systemName: 'xmark.circle.fill', color: '#ff3b30' }
      case 'cancelled': return { systemName: 'xmark.circle.fill', color: '#ff9500' }
      case 'timed_out': return { systemName: 'clock.fill', color: '#ff9500' }
      default: return { systemName: 'questionmark.circle', color: '#8e8e93' }
    }
  }
  if (run.status === 'in_progress') return { systemName: 'arrow.triangle.2.circlepath', color: '#0a84ff' }
  if (run.status === 'queued' || run.status === 'pending' || run.status === 'waiting' || run.status === 'requested') return { systemName: 'clock.fill', color: '#8e8e93' }
  return { systemName: 'questionmark.circle', color: '#8e8e93' }
}

function StatusBadge({ text, color, backgroundColor }: { text: string; color: string; backgroundColor: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: '600',
        color,
        backgroundColor,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
      }}
    >
      {text}
    </Text>
  )
}

function jobStatusInfo(job: { status: string; conclusion: string | null }): { text: string; color: string; backgroundColor: string } {
  if (job.status === 'completed') {
    switch (job.conclusion) {
      case 'success': return { text: t('成功', '成功', 'Success'), color: '#1a7f37', backgroundColor: '#d9f2e0' }
      case 'failure': return { text: t('失敗', '失败', 'Failed'), color: '#b42318', backgroundColor: '#fde3e1' }
      case 'cancelled': return { text: t('已取消', '已取消', 'Cancelled'), color: '#b54708', backgroundColor: '#fde9d2' }
      case 'timed_out': return { text: t('逾時', '超时', 'Timed out'), color: '#b54708', backgroundColor: '#fde9d2' }
      case 'skipped': return { text: t('略過', '略过', 'Skipped'), color: '#6b7280', backgroundColor: '#eef0f3' }
      default: return { text: job.conclusion || t('完成', '完成', 'Completed'), color: '#6b7280', backgroundColor: '#eef0f3' }
    }
  }
  if (job.status === 'in_progress') return { text: t('進行中', '进行中', 'In progress'), color: '#175cd3', backgroundColor: '#d7e8fd' }
  if (job.status === 'queued' || job.status === 'waiting') return { text: t('排隊中', '排队中', 'Queued'), color: '#6b7280', backgroundColor: '#eef0f3' }
  return { text: job.status, color: '#6b7280', backgroundColor: '#eef0f3' }
}

function jobStatusIcon(job: { status: string; conclusion: string | null }): { systemName: string; color: string } {
  if (job.status === 'completed') {
    switch (job.conclusion) {
      case 'success': return { systemName: 'checkmark.circle.fill', color: '#34c759' }
      case 'failure': return { systemName: 'xmark.circle.fill', color: '#ff3b30' }
      case 'cancelled': return { systemName: 'xmark.circle.fill', color: '#ff9500' }
      case 'timed_out': return { systemName: 'clock.fill', color: '#ff9500' }
      case 'skipped': return { systemName: 'circle.dashed', color: '#8e8e93' }
      default: return { systemName: 'questionmark.circle', color: '#8e8e93' }
    }
  }
  if (job.status === 'in_progress') return { systemName: 'arrow.triangle.2.circlepath', color: '#0a84ff' }
  if (job.status === 'queued' || job.status === 'waiting') return { systemName: 'clock.fill', color: '#8e8e93' }
  return { systemName: 'questionmark.circle', color: '#8e8e93' }
}

function formatTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatShortTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const hhmm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  if (day === startOfDay) return t(`今天 ${hhmm}`, `今天 ${hhmm}`, `Today ${hhmm}`)
  if (day === startOfDay - 86400000) return t(`昨天 ${hhmm}`, `昨天 ${hhmm}`, `Yesterday ${hhmm}`)
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${hhmm}`
}

function timeAgoText(iso?: string): string | null {
  if (!iso) return null
  const ts = new Date(iso).getTime()
  if (isNaN(ts)) return null
  const diff = Date.now() - ts
  if (diff < 0) return null
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('剛剛', '刚刚', 'Just now')
  if (min < 60) return t(`${min} 分鐘前`, `${min} 分钟前`, `${min} min ago`)
  const h = Math.floor(min / 60)
  if (h < 24) return t(`${h} 小時前`, `${h} 小时前`, `${h} h ago`)
  const d = Math.floor(h / 24)
  if (d < 30) return t(`${d} 天前`, `${d} 天前`, `${d} d ago`)
  return formatShortTime(iso)
}

function durationText(start?: string, end?: string): string | null {
  if (!start || !end) return null
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (isNaN(ms) || ms < 0) return null
  const totalSec = Math.floor(ms / 1000)
  if (totalSec < 60) return t(`${totalSec} 秒`, `${totalSec} 秒`, `${totalSec}s`)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (m < 60) return t(`${m} 分 ${s} 秒`, `${m} 分 ${s} 秒`, `${m}m ${s}s`)
  const h = Math.floor(m / 60)
  return t(`${h} 小時 ${m % 60} 分`, `${h} 小时 ${m % 60} 分`, `${h}h ${m % 60}m`)
}

function InfoRow({ label, value, subtitle }: { label: string; value: string; subtitle?: string | null }) {
  // v2.0.0：文字色改用系統 label／secondaryLabel（參考腳本 AppModel
  // 的 InfoRow），深色玻璃底上才看得見；原本寫死的 #1c1c1e 深色字在
  // 玻璃深色底上會糊掉。只在運行詳情用。
  return (
    <HStack spacing={6} alignment="top">
      <Text foregroundStyle="secondaryLabel" style={{ fontSize: 13 }}>{label}</Text>
      <VStack alignment="leading" spacing={2} style={{ flex: 1 }}>
        <Text foregroundStyle="label" style={{ fontSize: 13 }}>{value}</Text>
        {subtitle ? <Text foregroundStyle="secondaryLabel" style={{ fontSize: 11 }}>{subtitle}</Text> : null}
      </VStack>
    </HStack>
  )
}

function Card({ children }: { children: any }) {
  // v2.0.0：原本淺色實心卡（#f6f8fa）改成玻璃卡（components/glass.tsx
  // 的 GlassCard，圓角 22，參考腳本 GlassCard）。padding 12／spacing 8
  // 不變。只在運行詳情（RunDetailPage）用。
  return <GlassCard>{children}</GlassCard>
}

const API_BASE = 'https://api.github.com'
const RERUN_REFRESH_DELAY_MS = 1000
const RUN_POLL_INTERVAL_MS = 15000
const RUN_WATCH_MAX_MS = 90 * 60 * 1000

function runConclusionText(conclusion: Run['conclusion']): string {
  switch (conclusion) {
    case 'success': return t('成功', '成功', 'Success')
    case 'failure': return t('失敗', '失败', 'Failed')
    case 'cancelled': return t('已取消', '已取消', 'Cancelled')
    case 'timed_out': return t('逾時', '超时', 'Timed out')
    case 'skipped': return t('略過', '略过', 'Skipped')
    default: return conclusion || t('完成', '完成', 'Completed')
  }
}

// 執行結束時發系統通知。第一次使用時，Scripting 會跳出通知權限詢問，請允許，
// 否則只會顯示 App 內的橫幅。回傳值代表 schedule 有沒有成功呼叫，
// 呼叫失敗會被 catch，不會讓整個頁面掛掉，但呼叫端會在 App 內明示失敗原因，
// 這樣就不會像之前那樣「什麼都沒發生」卻不知道是哪一關出問題。
// 注意：這個通知只能在 App 還開著、正在追蹤該次執行時發出；
// App 關掉後腳本就停止輪詢，GitHub 也沒有辦法主動推播給 Scripting，
// 所以關掉 App 後才結束的執行不會即時補發通知，要等下次打開 App
// （v1.5.0 起首頁層的全域追蹤會接上 90 分鐘內的 watch）才會追蹤並通知。
// 另外 App 在前景時，iOS 有可能只把通知放進通知中心而不跳橫幅，
// 所以測試時除了看橫幅，也要下拉通知中心確認。
async function scheduleNotification(title: string, body: string, threadIdentifier: string): Promise<boolean> {
  try {
    const n: any = Notification as any
    if (!n || typeof n.schedule !== 'function') return false
    await n.schedule({ title, body, threadIdentifier })
    return true
  } catch (_) {
    return false
  }
}

async function sendRunNotification(run: Pick<Run, 'name' | 'run_number' | 'conclusion' | 'head_branch'>, repoFull: string): Promise<boolean> {
  const ok = run.conclusion === 'success'
  const title = ok
    ? t(`✅ ${repoFull} 執行成功`, `✅ ${repoFull} 执行成功`, `✅ ${repoFull} run succeeded`)
    : t(`❌ ${repoFull} 執行失敗`, `❌ ${repoFull} 执行失败`, `❌ ${repoFull} run failed`)
  const workflowName = run.name || t('工作流程', '工作流程', 'Workflow')
  const body = t(
    `${workflowName} #${run.run_number}：${runConclusionText(run.conclusion)}${run.head_branch ? `（${run.head_branch}）` : ''}`,
    `${workflowName} #${run.run_number}：${runConclusionText(run.conclusion)}${run.head_branch ? `（${run.head_branch}）` : ''}`,
    `${workflowName} #${run.run_number}: ${runConclusionText(run.conclusion)}${run.head_branch ? ` (${run.head_branch})` : ''}`
  )
  // v1.5.2：threadIdentifier 帶上工作流程名稱，同一個倉庫的兩個不同工作流程
  // 完成時就不會被 iOS 歸成同一組、看起來像只收到一則；同一個工作流程的
  // 通知還是歸在同一組。
  return scheduleNotification(title, body, `github-actions-${repoFull}-${run.name || 'workflow'}`)
}

// 背景保持：BackgroundKeeper 是 Scripting 注入的全域，不用 import，
// 只能在前景時先請求，之後 App 切到後台時才有機會繼續跑。
// 官方文件明說：iOS 仍可能中斷、暫停或終止 App，keeper 啟用不保證計時器
// 和網路在鎖定狀態下無限期跑下去，而且它用的是背景音訊資源、會耗電，
// 所以只在追蹤執行時開啟，結束或逾時就釋放，絕不無限期佔著。
async function acquireBackgroundKeepAlive(): Promise<boolean> {
  try {
    const bk: any = (globalThis as any).BackgroundKeeper
    if (!bk || typeof bk.keepAlive !== 'function') return false
    return await bk.keepAlive()
  } catch (_) {
    return false
  }
}

async function releaseBackgroundKeepAlive(): Promise<void> {
  try {
    const bk: any = (globalThis as any).BackgroundKeeper
    if (bk && typeof bk.stopKeepAlive === 'function') await bk.stopKeepAlive()
  } catch (_) { }
}

function runFinishNotice(run: Pick<Run, 'run_number' | 'conclusion'>): { text: string; ok: boolean } {
  const ok = run.conclusion === 'success'
  return {
    text: ok
      ? t(`✅ 執行完成：成功 — #${run.run_number}`, `✅ 执行完成：成功 — #${run.run_number}`, `✅ Run completed: Success — #${run.run_number}`)
      : t(`❌ 執行完成：${runConclusionText(run.conclusion)} — #${run.run_number}`, `❌ 执行完成：${runConclusionText(run.conclusion)} — #${run.run_number}`, `❌ Run completed: ${runConclusionText(run.conclusion)} — #${run.run_number}`),
    ok,
  }
}

interface RunWatch {
  owner: string
  repo: string
  workflowId: number
  since: number
  beforeIds: number[]
}

// 追蹤狀態存在 Storage，離開執行紀錄頁、甚至重開 App 再回到同一頁，
// 只要還在 90 分鐘內，就能恢復追蹤，而不是像之前那樣頁面一重開追蹤就丟了。
function getStoredWatch(owner: string, repo: string, workflowId: number): RunWatch | null {
  try {
    const raw = storageGet('run_watch')
    if (!raw) return null
    const w = JSON.parse(raw) as RunWatch
    if (w.owner !== owner || w.repo !== repo || w.workflowId !== workflowId) return null
    if (typeof w.since !== 'number' || !Array.isArray(w.beforeIds)) return null
    if (Date.now() - w.since > RUN_WATCH_MAX_MS) {
      storageRemove('run_watch')
      return null
    }
    return w
  } catch (_) {
    return null
  }
}

interface Repo {
  id: number
  name: string
  full_name: string
  owner: { login: string }
  private: boolean
  default_branch: string
  // 2026-11-18：小工具設定頁的倉庫列要跟首頁一樣用 Fork 圖標，getRepos 本來就有回這個欄位。
  fork?: boolean
  description?: string | null
  updated_at?: string
  stargazers_count?: number
}

interface Workflow {
  id: number
  name: string
  path: string
  state: 'active' | 'disabled' | 'deleted'
  created_at: string
  updated_at: string
}

// v1.3.7：工作流程收藏（取代歷史紀錄頁）。使用者放棄歷史紀錄了，改成
// 收藏常用的工作流程：長按工作流程卡片加入收藏，首頁星星點進收藏頁，
// 點一筆直接進該工作流程的執行列表。存在 Storage，key 是
// action_workflow_favorites。accountUsername 用來找回該帳號的 Token
//（帳號刪了就找不回來，點進去會提示）；defaultBranch 是執行列表觸發
// 執行時要用的分支，一起存下來。
const WORKFLOW_FAVORITES_KEY = 'action_workflow_favorites'
interface WorkflowFavorite {
  id: string
  owner: string
  repo: string
  workflowId: number
  workflowName: string
  workflowPath: string
  defaultBranch: string
  accountUsername: string
  addedAt: number
}
function loadWorkflowFavorites(): WorkflowFavorite[] {
  try {
    const raw = Storage.get<string>(WORKFLOW_FAVORITES_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.filter((f: any) => f && f.id && f.owner && f.repo && typeof f.workflowId === 'number')
  } catch (_) {
    return []
  }
}
function saveWorkflowFavorites(list: WorkflowFavorite[]): void {
  try { Storage.set(WORKFLOW_FAVORITES_KEY, JSON.stringify(list)) } catch (_) { }
}

interface Run {
  id: number
  name: string
  display_title?: string
  path?: string
  status: 'queued' | 'in_progress' | 'completed' | 'pending' | 'waiting' | 'requested'
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out' | null
  created_at: string
  updated_at: string
  run_started_at?: string
  completed_at?: string
  run_attempt: number
  head_branch: string
  head_sha: string
  head_commit?: {
    message?: string
    author?: { name?: string }
    committer?: { name?: string }
    timestamp?: string
  }
  actor: { login: string }
  triggering_actor?: { login: string }
  check_suite_id?: number
  pull_requests?: Array<{ number: number; title?: string }>
  repository?: { full_name?: string; default_branch?: string; private?: boolean }
  event: string
  workflow_id: number
  run_number: number
  url: string
  html_url: string
}

interface JobStep {
  name: string
  status: string
  conclusion: string | null
  number: number
  started_at: string
  completed_at: string | null
}

interface Job {
  id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string
  completed_at: string | null
  steps?: JobStep[]
  runner_name?: string | null
  labels?: string[]
  workflow_name?: string
  head_branch?: string
}

class GitHubAPI {
  private token: string
  private username: string

  constructor(auth: { token: string; username: string }) {
    this.token = auth.token
    this.username = auth.username
  }

  private async request<T>(path: string, options?: RequestInit): Promise<T> {
    // v1.3.1：不再用 AbortController + setTimeout 做逾時。已證實在這台裝置的
    // Scripting 環境裡 fetch 掛住時 JS 計時器也跟著不跑，逾時永遠不會觸發，
    // 多倉庫並行抓取的 Promise.all 就永遠不 resolve。改用 repo.ts 證實可行的
    // 原生 timeout（單位是秒）+ AbortSignal.timeout，由原生層計時。
    // GET 只帶標頭 + timeout + signal（v1.8 證實帶上 method/body/signal 三件套會掛住超過兩分鐘；v1.3.6 只加 signal，不帶 method/body）。
    const method = options?.method ?? 'GET'
    const url = `${API_BASE}${path}`
    const headers = {
      'Authorization': `token ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
    }
    try {
      const timeoutMs = 60000
      // v1.3.6：GET 也加上原生的 AbortSignal.timeout。v1.6 已證實單靠 timeout
      // 選項，掛住的 fetch 在 15 秒後仍不會翻成失敗；而 v1.4 證實 fetch 掛住時
      // JS 計時器也跟著不跑，所以 45 秒 setTimeout 守門在真正掛住時根本不會跑；
      // 在真正掛住時根本不會跑——一個掛住的 GET 就能讓整頁無止境轉圈。
      // 只有原生的 AbortSignal.timeout 能在原生層把掛住的請求打斷。
      // v1.8 的教訓是 GET 不能帶 method/body/signal 三件套（那個寫法會掛住
      // 超過兩分鐘），所以這裡只在原本最小寫法（標頭 + timeout）上多加
      // signal 一項，不帶 method、不帶 body；逾時一樣以 TimeoutError 拒絕，
      // 下面 catch 已經會翻成逾時訊息。
      const resp =
        method === 'GET'
          ? await fetch(url, {
              headers,
              timeout: 15,
              signal: (AbortSignal as any).timeout
                ? (AbortSignal as any).timeout(15000)
                : undefined,
            } as any)
          : await fetch(url, {
              method,
              headers,
              body: options?.body,
              timeout: timeoutMs / 1000,
              signal: (AbortSignal as any).timeout
                ? (AbortSignal as any).timeout(timeoutMs)
                : undefined,
            } as any)
      if (!resp.ok) {
        const text = await resp.text()
        throw new Error(`GitHub API error (${resp.status}): ${text}`)
      }
      const body = await resp.text()
      if (!body) return undefined as T
      return JSON.parse(body) as T
    } catch (err) {
      if (
        (err as any)?.name === 'TimeoutError' ||
        (err as any)?.name === 'AbortError' ||
        (err as any)?.name === 'TypeError' ||
        String((err as any)?.message || err).includes('TypeError')
      ) {
        throw new Error(t('請求逾時，請檢查網路或 Token 權限', '请求超时，请检查网络或 Token 权限', 'Request timed out. Please check your network or Token permissions'))
      }
      throw err
    }
  }

  async getRepos(): Promise<Repo[]> {
    return this.request<Repo[]>('/user/repos?per_page=100&sort=updated')
  }

  async getUser(): Promise<{ login: string; avatar_url?: string }> {
    return this.request<{ login: string; avatar_url?: string }>('/user')
  }

  async getWorkflows(owner: string, repo: string): Promise<Workflow[]> {
    const data = await this.request<{ workflows: Workflow[] }>(
      `/repos/${owner}/${repo}/actions/workflows`
    )
    return data.workflows
  }

  async getWorkflowRuns(owner: string, repo: string, workflowId: number): Promise<Run[]> {
    const data = await this.request<{ workflow_runs: Run[] }>(
      `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=50`
    )
    return data.workflow_runs
  }

  async getRun(owner: string, repo: string, runId: number): Promise<Run> {
    return this.request<Run>(`/repos/${owner}/${repo}/actions/runs/${runId}`)
  }

  async rerunRun(owner: string, repo: string, runId: number): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`, {
      method: 'POST',
    })
  }

  async cancelRun(owner: string, repo: string, runId: number): Promise<void> {
    await this.request(`/repos/${owner}/${repo}/actions/runs/${runId}/cancel`, {
      method: 'POST',
    })
  }

  async dispatchWorkflow(
    owner: string,
    repo: string,
    workflowId: number,
    ref: string,
    inputs?: Record<string, any>
  ): Promise<void> {
    await this.request(
      `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        body: JSON.stringify({ ref, inputs: inputs || {} }),
      }
    )
  }

  async getRunJobs(owner: string, repo: string, runId: number): Promise<Job[]> {
    const data = await this.request<{ total_count: number; jobs: Job[] }>(
      `/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`
    )
    return data.jobs
  }
}

export function LoginPage({ onLogin }: { onLogin: (auth: { token: string; username: string }) => void }) {
  const [username, setUsername] = useState('')
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = useCallback(async () => {
    if (!username.trim() || !token.trim()) {
      setError(t('請填寫 Username 和 Token', '请填写 Username 和 Token', 'Please enter a username and token'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const api = new GitHubAPI({ token: token.trim(), username: username.trim() })
      // 使用者名稱一定要跟 Token 的帳號對得上：先用 /user 查 Token 的實際 login，
      // 大小寫不一樣沒關係（GitHub 使用者名稱不分大小寫），對不上就不登入。
      const me = await api.getUser()
      if (!me?.login || me.login.toLowerCase() !== username.trim().toLowerCase()) {
        setError(t('Username 跟 Token 的帳號不符\n請檢查 Username 是否正確！', 'Username 跟 Token 的账号不符\n请检查 Username 是否正确！', 'The username does not match the Token account.\nPlease check the username!'))
        return
      }
      await api.getRepos()
      // 只負責驗證，存帳號由呼叫端處理：第一次登入是新增第一個帳號，
      // 帳號管理頁新增時是加進清單，兩邊存法不同，LoginPage 不直接寫 Storage。
      onLogin({ token: token.trim(), username: username.trim() })
    } catch (err: any) {
      setError(errorMessage(err, t('登入失敗，請檢查 Token 權限', '登录失败，请检查 Token 权限', 'Login failed. Please check the Token permissions')))
    } finally {
      setLoading(false)
    }
  }, [username, token, onLogin])

  return <LoginPanel username={username} token={token} loading={loading} error={error} setUsername={setUsername} setToken={setToken} onLogin={handleLogin} />
}

function useLoadList<T>(fetcher: () => Promise<T[]>) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      setData(await fetcher())
    } catch (e: any) {
      setErrorMsg(errorMessage(e, t('載入失敗', '载入失败', 'Failed to load')))
    } finally {
      setLoading(false)
    }
  }, [fetcher])

  useEffect(() => { load() }, [load])

  return { data, loading, errorMsg, setErrorMsg, load }
}

// v1.3.6-cache：跟 Repository 首頁同一套寫法。切換模組重新掛載時，
// reposMap / errorsMap 的初始值直接用上次抓到的列表，先畫舊的、背景
// load() 重抓到新的再換掉；只有第一次啟動、完全沒有快取時才顯示載入中。
// 只在記憶體，不寫 Storage。WidgetRepoList（小工具設定頁）不用這套，不動它。
let cachedHomeReposMap: Record<string, Repo[]> = {}
let cachedHomeErrorsMap: Record<string, string> = {}

function RepoListPage({ accounts, onAccountsChanged, titleMenu, onExit, embedded }: {
  accounts: Account[]
  onAccountsChanged: (accounts: Account[]) => void
  titleMenu?: any
  onExit?: () => void
  // Embedded (Home tab): no presented sheet to close, so the X button is
  // hidden instead of calling dismiss() / Script.exit().
  embedded?: boolean
}) {
  // 多帳號：每個帳號用自己的 Token 抓倉庫，分區顯示，點進去的倉庫
  // 就用那個帳號的 Token，跟 Github Repository Manager 的帳號分區同一個做法。
  // 小工具設定頁現在改成多帳號分區（見 WidgetSetupPage），不再只用第一個帳號的 api。
  const [reposMap, setReposMap] = useState<Record<string, Repo[]>>(() => cachedHomeReposMap)
  const [errorsMap, setErrorsMap] = useState<Record<string, string>>(() => cachedHomeErrorsMap)
  const [loading, setLoading] = useState(() => Object.keys(cachedHomeReposMap).length === 0)
  const palette = useThemePalette()
  // 2026-11-18：左上角 X 的 action 會呼叫 dismiss()，但這個元件從來沒宣告過（TypeScript 一直報
  // Cannot find name 'dismiss'）。現在有 onExit 時會先 return，暫時不會真的執行到，
  // 但這仍是漏寫的參照，先補上避免以後改動就爆 ReferenceError。
  const dismiss = Navigation.useDismiss()
  const [repoQuery, setRepoQuery] = useState("")
  const normalizedRepoQuery = repoQuery.trim().toLowerCase()
  const [visibility, setVisibility] = useState("all")
  const [sortOrder, setSortOrder] = useState("updated")
  const [compact, setCompact] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => loadExpanded())
  const [widgetTargets, setWidgetTargets] = useState<string[]>(() => getWidgetTargets())
  // v1.5.19：上次抓過的帳號內容簽名，見下面 effect 的說明。
  const [loadedAccountsSig, setLoadedAccountsSig] = useState('')
  // v1.3.2：帳號標題列前面顯示各自的頭像。快取 github_avatars（Token -> avatar_url），
  // 設定頁寫過的直接沿用；沒有的用該帳號的 api.getUser() 抓一次。
  const [avatars, setAvatars] = useState<Record<string, string>>(() => loadAvatarCache())

  const load = useCallback(async () => {
    setLoading(true)
    const nextRepos: Record<string, Repo[]> = {}
    const nextErrors: Record<string, string> = {}
    // 2026-11-07：兩個帳號並行抓，而且各帳號回來就先顯示，不用等另一個。
    // 每個 GitHubAPI 實例自己帶自己的 Token，沒有共用的 Token 會互相打架，
    // 所以並行是安全的；之前循序抓是兩個請求的時間相加，現在只算最慢的
    // 那一個，快的帳號還會先出。
    await Promise.all(
      accounts.map(async (acc, i) => {
        const id = `${acc.username}#${i}`
        try {
          const repos = await new GitHubAPI(acc).getRepos()
          nextRepos[id] = repos
          setReposMap((prev) => ({ ...prev, [id]: repos }))
          cachedHomeReposMap = { ...cachedHomeReposMap, [id]: repos }
        } catch (e: any) {
          nextRepos[id] = []
          const msg = errorMessage(e, t('載入失敗', '载入失败', 'Failed to load'))
          nextErrors[id] = msg
          setReposMap((prev) => ({ ...prev, [id]: [] }))
          setErrorsMap((prev) => ({ ...prev, [id]: msg }))
          cachedHomeReposMap = { ...cachedHomeReposMap, [id]: [] }
          cachedHomeErrorsMap = { ...cachedHomeErrorsMap, [id]: msg }
        }
      })
    )
    // 全部回來後再統一寫一次，保證最終狀態一致。
    setReposMap(nextRepos)
    setErrorsMap(nextErrors)
    cachedHomeReposMap = nextRepos
    cachedHomeErrorsMap = nextErrors
    setLoading(false)
    // 沒記過的帳號預設折疊，記過的照上次的樣子，不會被這裡蓋掉。
    setExpanded((prev) => {
      const next = { ...prev }
      accounts.forEach((a, i) => {
        const id = `${a.username}#${i}`
        if (next[id] === undefined) next[id] = true
      })
      return next
    })
  }, [accounts])

  // v1.5.19：從設定頁（使用者）返回首頁時，如果帳號沒有異動就不要自動
  // 刷新。之前首頁是看 accounts 陣列參照變了就重抓，設定頁開開關關
  // 或上層重傳一個內容相同的新陣列都會觸發重抓；現在只比對帳號內容
  // （使用者名稱 + Token，順序也算，換順序會重抓，因為下面 reposMap
  // 的 key 是 username#index，跟順序有關，不重抓會對錯倉庫）。
  // 第一次掛載時 loadedSig 是空的，一定會抓一次；手動按重新整理
  // 是直接叫 load()，不受這個門檻影響。
  const accountsSig = JSON.stringify(accounts.map((a) => ({ username: a.username, token: a.token })))
  useEffect(() => {
    if (accountsSig !== loadedAccountsSig) {
      setLoadedAccountsSig(accountsSig)
      load()
    }
  }, [load])

  // v1.3.2：帳號標題列的頭像。快取裡沒有的帳號，用 /user 拉一次 avatar_url 並快取起來；
  // 帳號順序變了不會重拉（用 Token 當 key，跟順序無關），跟設定頁同一套寫法。
  // 2026-11-07：並行抓。每個 GitHubAPI 實例自己帶自己的 Token，並行不會互相打架。
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next = loadAvatarCache()
      const missing = accounts.filter((acc) => !next[acc.token])
      if (missing.length === 0) return
      const results = await Promise.all(
        missing.map(async (acc) => {
          try {
            const me = await new GitHubAPI(acc).getUser()
            return { token: acc.token, url: me?.avatar_url || '' }
          } catch (_) {
            return { token: acc.token, url: '' }
          }
        })
      )
      let changed = false
      for (const r of results) {
        if (r.url) {
          next[r.token] = r.url
          changed = true
        }
      }
      if (changed && !cancelled) {
        saveAvatarCache(next)
        setAvatars(next)
      }
    })()
    return () => { cancelled = true }
  }, [accounts])

  const openWidgetSetup = useCallback(async () => {
    await Navigation.present({
      element: <WidgetSetupPage accounts={accounts} />,
      modalPresentationStyle: 'pageSheet',
    })
    setWidgetTargets(getWidgetTargets())
  }, [accounts])

  const openAccountPage = useCallback(async () => {
    await Navigation.present({
      element: <AccountPage accounts={accounts} onAccountsChanged={onAccountsChanged} onWidgetSetup={openWidgetSetup} widgetSummary={widgetSummary} />,
      modalPresentationStyle: 'pageSheet',
    })
    // 帳號頁關掉時不用在這裡多抓一次：帳號真的變了，上面那個內容比對
    // effect 會自己重抓；帳號沒變，它就不會抓，剛好就是這次要的
    // 「沒異動不刷新」。
  }, [accounts, onAccountsChanged])

  // v1.3.7：歷史紀錄放棄了，改成工作流程收藏。首頁時鐘按鈕改成星星，
  // 點進去是收藏頁；長按工作流程卡片加入收藏，點收藏直接進執行列表。
  const openFavorites = useCallback(async () => {
    await Navigation.present({
      element: <WorkflowFavoritesPage accounts={accounts} />,
      modalPresentationStyle: 'pageSheet',
    })
  }, [accounts])

  const widgetSummary = widgetTargets.length > 0 ? t(`已選 ${widgetTargets.length} 個工作流程`, `已选 ${widgetTargets.length} 个工作流程`, `${widgetTargets.length} workflows selected`) : ''

  return (
    <List
      listStyle="insetGroup"
      contentMargins={{ edges: "top", insets: 4, placement: "scrollContent" }}
      listSectionSpacing={8}
      navigationTitle="GitHub Toolkit"
      toolbarTitleDisplayMode="inline"
      navigationBarTitleDisplayMode="inline"
      // v1.3.4：toolbarTitleMenu 加回來。使用者要回最原本的系統小箭頭
      // （灰色圓圈），不要 app.tsx principal Menu 的白色大箭頭。
      // 首頁背景：跟 Repository 首頁一樣，List 的系統背景（深色模式下接近
      // 黑色）會蓋掉外層的深灰，藏起來再直接給 List 上深灰（見 components/theme.ts）。
      scrollContentBackground="hidden"
      background="clear"
      refreshable={async () => { await load() }}
      toolbar={{
        principal: <Text font={17} fontWeight="semibold" lineLimit={1} minScaleFactor={0.75}>GitHub Toolkit</Text>,
        // v2.0：首頁左上角加 X，按了就關掉（回到 Scripting）。
        // 嵌入首頁時沒有可以關掉的 sheet，X 按鈕直接不顯示。
        ...(embedded ? {} : {
          topBarLeading: <Button key="close" title={t("關閉", "关闭", "Close")} systemImage="xmark" action={() => { if (onExit) return onExit(); dismiss(); Script.exit() }} />,
        }),
        topBarTrailing: [
          <Button key="favorites" title={t("收藏", "收藏", "Favorites")} systemImage="pin" action={openFavorites} />,
          <Button key="account" title={t("使用者", "用户", "User")} systemImage="person.crop.circle" action={openAccountPage} />,
        ],
      }}
    >
      <Section>
        <Overview title={t("Action 總覽", "Action 总览", "Actions")} query={repoQuery} onQuery={setRepoQuery} visibility={visibility} onVisibility={setVisibility} sort={sortOrder} onSort={setSortOrder} options={[{id:"updated",title:t("最近更新","最近更新","Recently updated")},{id:"name",title:t("名稱","名称","Name")}]} compact={compact} onCompact={() => setCompact(!compact)} />
      </Section>
      {loading && Object.keys(reposMap).length === 0 ? <Section><LoadingRow /></Section> : accounts.map((account, idx) => {
        const id = `${account.username}#${idx}`
        const allRepos = reposMap[id] || []
        const list = allRepos.filter(repo =>
          (visibility === "all" || (visibility === "private" ? repo.private : !repo.private)) &&
          (!normalizedRepoQuery || `${repo.name} ${repo.full_name} ${repo.description || ""}`.toLowerCase().includes(normalizedRepoQuery))
        ).sort((a, b) => {
          if (sortOrder === "name") return a.name.localeCompare(b.name)
          return (b.updated_at || "").localeCompare(a.updated_at || "") || a.name.localeCompare(b.name)
        })
        const err = errorsMap[id] || ''
        // 首頁分區折疊，跟 Repository 一樣：標題列點一下就展開/折疊，右邊是箭頭，
        // 點一下立刻寫進 Storage，退出再進來還是上次的樣子，沒記過的預設折疊。
        const isOpen = expanded[id] !== false
        return (
          <Section key={id}>
            <Button listRowBackground={<ThemeCardBackground />}
              action={() => {
                const next = { ...expanded, [id]: !isOpen }
                setExpanded(next)
                try {
                  Storage.set(EXPANDED_KEY, JSON.stringify(next))
                } catch (_) { }
              }}
            >
              <AccountHeader name={account.username} avatar={avatars[account.token]} count={reposMap[id] ? allRepos.length : undefined} unit="repo" publicCount={reposMap[id] ? allRepos.filter((repo: any) => !repo.private).length : undefined} privateCount={reposMap[id] ? allRepos.filter((repo: any) => repo.private).length : undefined} loading={loading && !reposMap[id]} expanded={isOpen} />
            </Button>
            {isOpen ? (
              <>
                {err ? <Text listRowBackground={<ThemeCardBackground />} foregroundStyle="systemRed">{err}</Text> : null}
                {!err && reposMap[id] && list.length === 0 && !loading ? (
                  <Text listRowBackground={<ThemeCardBackground />} font={11} foregroundStyle="secondaryLabel">{normalizedRepoQuery || visibility !== "all" ? t("沒有符合的倉庫", "没有符合的仓库", "No matching repositories") : t("尚無倉庫", "尚无仓库", "No repositories yet")}</Text>
                ) : null}
                {list.map(repo => (
              <NavigationLink listRowBackground={<ThemeCardBackground />}
                listRowInsets={{ top: 8, leading: 16, bottom: 8, trailing: 16 }}
                key={repo.id}
                destination={
                  <WorkflowListPage
                    api={new GitHubAPI(account)}
                    owner={repo.owner.login}
                    repo={repo.name}
                    defaultBranch={repo.default_branch}
                    accountUsername={account.username}
                  />
                }
              >
                <HStack spacing={12} padding={{ leading: 16 }}>
                  <VStack alignment="center" spacing={0} frame={{ width: 36, height: 36 }} background={{ style: palette.selected, shape: { type: "rect", cornerRadius: 10 } }}>
                    <Image systemName="globe.americas.fill" font={18} foregroundStyle={palette.accent} />
                  </VStack>
                  <VStack alignment="leading" spacing={3} padding={{ vertical: compact ? 2 : 6 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                    <Text font={14} fontWeight="semibold" lineLimit={1}>{repo.name}</Text>
                    {!compact ? <HStack spacing={8} font={10} foregroundStyle="secondaryLabel"><Text frame={{ width: 78, alignment: "leading" }} lineLimit={1}>{`⑂ ${repo.default_branch}`}</Text></HStack> : null}
                  </VStack>
                <PrivateMarker isPrivate={repo.private} />
                  </HStack>
              </NavigationLink>
                ))}
              </>
            ) : null}
          </Section>
        )
      })}
      {embedded ? (
        <Section>
          <HStack listRowBackground={<Rectangle fill={"clear"} />}>
            <Rectangle fill={"clear"} frame={{ maxWidth: "infinity", height: 50 }} />
          </HStack>
        </Section>
      ) : null}
    </List>
  )
}

function AccountPage({ accounts: initialAccounts, onAccountsChanged, onWidgetSetup, widgetSummary }: {
  accounts: Account[]
  onAccountsChanged: (accounts: Account[]) => void
  onWidgetSetup: () => Promise<void>
  widgetSummary: string
}) {
  // v1.3.0：Action 不再有預設帳號，GitHub 帳號、排序、刪除合併成同一個區塊。
  // v1.4.0：當前用戶列刪除（截圖已證明設定頁編輯模式不會黑屏），改成每列前面顯示各自頭像。
  // GitHub 帳號區直接就是帳號列：ForEach 用 editActions="move"，設定頁 List
  // 直接進編輯模式，帳號後面就會自動出現三行線，長按三行線上下拖移，
  // 拖完立刻寫回帳號清單（沒有另外的排序頁，也沒有存檔按鈕）。
  // 注意：設定頁進編輯模式是照使用者要求做的，Repository v1.30 那次在設定頁
  // 進編輯模式曾經黑屏過，這裡要特別在裝置上測：打開設定頁、打開新增帳號
  // 輸入框、拖移、長按刪除，都不能黑屏或閃退，否則要退回專用排序頁。
  // 刪除不用另外一區：長按帳號列叫出選單，點刪除，一樣只跳一次確認。
  // 左滑刪除沒有用未驗證過的 swipe 寫法，長按選單就是這版的刪除入口。
  // 小工具與 App Intent 用的是清單第一個帳號，所以把想用的帳號拖到最上面即可。
  const dismiss = Navigation.useDismiss()
  const palette = useThemePalette()
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [showAdd, setShowAdd] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newToken, setNewToken] = useState('')
  const [adding, setAdding] = useState(false)
  const accountItems = useObservable(
    initialAccounts.map((a) => ({
      id: a.token,
      username: a.username,
      token: a.token,
    })),
  )
  const editMode = useObservable(() => EditMode.active())
  // v1.4.0：當前用戶那列不要了，改成每個帳號列前面顯示各自的頭像。
  const [avatars, setAvatars] = useState<Record<string, string>>(() => loadAvatarCache())

  // 拖移會直接改寫 accountItems，改寫後推回 accounts 並寫 Storage；
  // 新增／刪除改的是 accounts，改完再回寫 accountItems，兩邊用內容比對擋住迴圈。
  useEffect(() => {
    const next = accounts.map((a) => ({ id: a.token, username: a.username, token: a.token }))
    if (JSON.stringify(next) !== JSON.stringify(accountItems.value)) {
      accountItems.setValue(next)
    }
  }, [accounts])
  useEffect(() => {
    const next: Account[] = accountItems.value.map((item: any) => ({
      username: item.username,
      token: item.token,
    }))
    if (JSON.stringify(next) !== JSON.stringify(accounts)) {
      setAccounts(next)
      onAccountsChanged(next)
    }
  }, [accountItems.value])

  // 每列頭像：快取裡沒有的帳號，用 /user 拉一次 avatar_url 並快取起來；
  // 帳號順序變了不會重拉（用 Token 當 key，跟順序無關），新增帳號時
  // addAccount 裡已經拉過一次，這裡只補還沒快取的。
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next = loadAvatarCache()
      let changed = false
      for (const acc of accounts) {
        if (next[acc.token]) continue
        try {
          const me = await new GitHubAPI(acc).getUser()
          if (me?.avatar_url) {
            next[acc.token] = me.avatar_url
            changed = true
          }
        } catch (_) { }
      }
      if (changed && !cancelled) {
        saveAvatarCache(next)
        setAvatars(next)
      }
    })()
    return () => { cancelled = true }
  }, [accounts])

  async function addAccount() {
    // 添加帳號一定要填使用者名稱和 Token，驗證跟之前一樣：
    // /user 查回來的 login 一定要跟填的使用者名稱對得上，再用 getRepos
    // 確認這個 Token 有 repo 權限。新增完只是加到清單最後，不會變成預設帳號，
    // 因為這版已經沒有預設帳號了。
    const trimmedUsername = newUsername.trim()
    const trimmedToken = newToken.trim()
    if (!trimmedUsername || !trimmedToken) {
      await Dialog.alert({ title: !trimmedUsername && !trimmedToken ? t('請填寫 Username 和 Token', '请填写 Username 和 Token', 'Please enter a username and token') : !trimmedUsername ? t('請填寫Username', '请填写Username', 'Please enter a username') : t('請填寫Token', '请填写Token', 'Please enter a token'), message: t('Username 和 Token 都不能為空', 'Username 和 Token 都不能为空', 'Username and Token cannot be empty') })
      return
    }
    if (accounts.some((a) => a.token === trimmedToken)) {
      await Dialog.alert({ title: t('新增失敗', '新增失败', 'Failed to add'), message: t('這個 Token 已經新增過了。', '这个 Token 已经新增过了。', 'This Token has already been added.') })
      return
    }
    setAdding(true)
    try {
      const me = await new GitHubAPI({ token: trimmedToken, username: trimmedUsername }).getUser()
      if (!me?.login || me.login.toLowerCase() !== trimmedUsername.toLowerCase()) {
        throw new Error(t('Username 跟 Token 的帳號不符\n請檢查 Username 是否正確！', 'Username 跟 Token 的账号不符\n请检查 Username 是否正确！', 'The username does not match the Token account.\nPlease check the username!'))
      }
      await new GitHubAPI({ token: trimmedToken, username: trimmedUsername }).getRepos()
      const account: Account = { username: trimmedUsername, token: trimmedToken }
      if (me?.avatar_url) {
        const nextAvatars = { ...loadAvatarCache(), [trimmedToken]: me.avatar_url }
        saveAvatarCache(nextAvatars)
        setAvatars(nextAvatars)
      }
      const next = [...accounts, account]
      setAccounts(next)
      setNewUsername('')
      setNewToken('')
      setShowAdd(false)
      onAccountsChanged(next)
    } catch (e: any) {
      await Dialog.alert({ title: t('新增失敗', '新增失败', 'Failed to add'), message: String(e?.message || e) })
    }
    setAdding(false)
  }

  async function deleteAccount(token: string) {
    const account = accounts.find((a) => a.token === token)
    if (!account) return
    // 刪除只跳一次確認，不再跳第二次。
    // v1.5.14：置中確認框沒辦法把按鈕變紅，所以改用 Dialog.actionSheet：
    // 內建取消在左（白色），destructive 的確認在右（紅色），跟登出彈窗
    // v9 實證過的排版一樣；按確認（index 0）才刪除，按取消或關掉就不動。
    const idx = await Dialog.actionSheet({
      title: t('刪除帳號', '删除账号', 'Delete account'),
      message: t(`確定要刪除 "${account.username}" 嗎？\n此操作不可撤銷！`, `确定要删除 "${account.username}" 吗？\n此操作不可撤销！`, `Are you sure you want to delete "${account.username}"?\nThis cannot be undone!`),
      actions: [{ label: t('確認', '确认', 'Confirm'), destructive: true }],
    })
    if (idx !== 0) return
    const next = accounts.filter((a) => a.token !== token)
    // 刪帳號時，順便清掉這個帳號名下的小工具目標對照，免得殘留的對照
    // 指到已經不存在的帳號；清完後那些目標會退回第一個帳號的 Token。
    const targetMap = getWidgetTargetAccounts()
    let mapChanged = false
    for (const k of Object.keys(targetMap)) {
      if (targetMap[k] === account.username) {
        delete targetMap[k]
        mapChanged = true
      }
    }
    if (mapChanged) {
      try { Storage.set(WIDGET_TARGET_ACCOUNTS_KEY, JSON.stringify(targetMap)) } catch (_) { }
    }
    const nextAvatars = loadAvatarCache()
    delete nextAvatars[token]
    saveAvatarCache(nextAvatars)
    setAvatars(nextAvatars)
    setAccounts(next)
    onAccountsChanged(next)
    // 刪光也不自動關掉：按 X 回去，App 看到帳號是空的就會回到登入頁。
  }

  return (
    <NavigationStack>
      <List {...REPO_LIST}
      tint={palette.accent}
      scrollContentBackground="hidden"
      background={<GlassBackground />}

        navigationTitle={t("使用者設定", "用户设置", "User settings")}
        navigationBarTitleDisplayMode="inline"
        environments={{ editMode }}
        toolbar={{
          // 使用者頁頂部只留左邊一個返回按鈕，不再有取消 X；按返回就只是關掉回首頁，
          // 帳號改完立刻存，改過的都留著，不還原（跟以前按 X 一樣）。
          topBarLeading: <Button title={t("返回", "返回", "Back")} action={() => dismiss()} />,
        }}
      >
        
        <Section header={<RepoHeader symbol="person.2" title={t("GitHub 帳號","GitHub 账号","GitHub Accounts")} />}>
          {accounts.length > 0 ? (
            <ForEach
              data={accountItems}
              editActions="move"
              builder={(item: any) => (
                <HStack listRowBackground={<ThemeCardBackground />}
                  key={item.id}
                  alignment="center"
                  spacing={10}
                  // 2.0.5：這處長按刻意不改左滑。這個 List 永久處於編輯模式
                  //（EditMode.active()，為了拖移排序），SwiftUI 編輯模式下
                  // swipeActions 不會出現，改了會讓刪除按不到，所以留著原本的長按選單。
                  contextMenu={{
                    menuItems: (
                      <>
                        <Section>
                          {/* v1.5.3：v1.4.1 的紅字寫法沒用，因為 iOS 系統選單會直接忽略
                              選單項目的文字顏色設定，只有標示為破壞性動作的項目才會變紅；
                              所以這裡改用 role="destructive"，並改成跟 Repository 長按選單一樣
                              已經驗證過的 title + systemImage 寫法，不再用自訂 HStack 上色。
                              注意：role 是不是 Scripting 有支援的 Button 屬性還沒驗證過，
                              如果 Scripting 忽略這個屬性，選單還是會顯示白字，到時要再換做法。 */}
                          <Button title={t("刪除", "删除", "Delete")} systemImage="trash" role="destructive" action={() => deleteAccount(item.token)} />
                        </Section>
                      </>
                    ),
                  }}
                >
                  {avatars[item.token] ? (
                    <Image
                      imageUrl={avatars[item.token]}
                      resizable={true}
                      frame={{ width: 28, height: 28 }}
                      clipShape="circle"
                    />
                  ) : null}
                  <VStack alignment="leading" spacing={3}><Text fontWeight="semibold" lineLimit={1}>{item.username}</Text></VStack>
                </HStack>
              )}
            />
          ) : (
            <Text listRowBackground={<ThemeCardBackground />} font="callout" foregroundStyle="secondaryLabel">
              {t("尚未新增帳號，請按下方添加。", "尚未新增账号，请按下方添加。", "No account added yet. Tap below to add one.")}
            </Text>
          )}
        </Section>
        <Section>
          <Button listRowBackground={<ThemeCardBackground />}
            title={t("添加帳號", "添加账号", "Add account")}
            systemImage="plus.circle.fill"
            action={() => setShowAdd(!showAdd)}
          />
        </Section>
        {showAdd ? (
          <Section title={t("新增帳號", "新增账号", "Add account")}>
            <TextField listRowBackground={<ThemeCardBackground />} title={t("使用者名稱", "用户名", "Username")} value={newUsername} onChanged={setNewUsername} prompt="Github_Username" textInputAutocapitalization="never" />
            <SecureField listRowBackground={<ThemeCardBackground />} title="Token" value={newToken} onChanged={setNewToken} prompt="ghp_xxxxxxxx" />
            <VStack listRowBackground={<ThemeCardBackground />}><TokenPermissions /></VStack>
            <Button listRowBackground={<ThemeCardBackground />}
              action={addAccount}
              disabled={adding}
            >
              <HStack alignment="center">
                <Image systemName="checkmark" foregroundStyle="green" />
                <Text foregroundStyle="green">{adding ? t('驗證中…', '验证中…', 'Verifying…') : t('儲存帳號', '保存账号', 'Save account')}</Text>
              </HStack>
            </Button>
            <Button listRowBackground={<ThemeCardBackground />}
              action={() => {
                setShowAdd(false)
                setNewUsername('')
                setNewToken('')
              }}
            >
              <HStack alignment="center">
                <Image systemName="xmark" foregroundStyle="red" />
                <Text foregroundStyle="red">{t("取消", "取消", "Cancel")}</Text>
              </HStack>
            </Button>
          </Section>
        ) : null}
        <Section header={<RepoHeader symbol="bolt.fill" title={t("工作流程", "工作流程", "Workflows")} />}>
          <Button listRowBackground={<ThemeCardBackground />} action={onWidgetSetup}>
            <HStack spacing={10} padding={{ vertical: 3 }}>
              <Image systemName="widget.small" font={16} foregroundStyle={palette.accent} frame={{ width: 30, height: 30 }} background={{ style: palette.selected, shape: { type: "rect", cornerRadius: 8 } }} />
              <VStack alignment="leading" spacing={2}><Text font={14} fontWeight="semibold">{t("桌面小工具","桌面小组件","Home Screen Widget")}</Text><Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{widgetSummary || t("尚未指定工作流程","尚未指定工作流程","No workflow selected")}</Text></VStack>
              <Spacer /><Image systemName="chevron.right" font={11} foregroundStyle="secondaryLabel" />
            </HStack>
          </Button>
        </Section>
        <AppearanceSection />
      </List>
    </NavigationStack>
  )
}

// 小工具設定頁的帳號分區展開/折疊，跟首頁分開記（首頁用 github_action_expanded），
// 這裡用自己的 key，預設折疊，點一下立刻寫進 Storage。
const WIDGET_EXPANDED_KEY = 'github_action_widget_expanded'
function loadWidgetExpanded(): Record<string, boolean> {
  try {
    const raw = Storage.get<string>(WIDGET_EXPANDED_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    const out: Record<string, boolean> = {}
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'boolean') out[k] = obj[k]
    }
    return out
  } catch (_) {
    return {}
  }
}

function WidgetSetupPage({ accounts }: { accounts: Account[] }) {
  const [picked, setPicked] = useState<{ account: Account; owner: string; repo: string } | null>(null)
  // 2026-11-18：從工作流程頁返回時，倉庫頁的已選數量跟勾選要重讀一次。
  // 之前只靠首次 useState 初始化，挑完工作流程按返回，倉庫列還停在舊狀態。
  const [targetsVersion, setTargetsVersion] = useState(0)
  // 2026-11-18：跟使用者設定頁一樣包 NavigationStack。之前沒包，Navigation.present 不會自動加，
  // 所以 navigationTitle 跟工具列的返回／重新整理都不會出現，退回只能靠自製的藍字列。
  // 包起來之後標題列、工具列、頁面內距就跟其他設定頁完全一致。
  return (
    <NavigationStack>
      {!picked
        ? <WidgetRepoList accounts={accounts} targetsVersion={targetsVersion} onPick={(account, owner, name) => setPicked({ account, owner, repo: name })} />
        : <WidgetWorkflowList api={new GitHubAPI(picked.account)} account={picked.account} owner={picked.owner} repo={picked.repo} onBack={() => { setPicked(null); setTargetsVersion(v => v + 1) }} />}
    </NavigationStack>
  )
}

function WidgetRepoList({ accounts, onPick, targetsVersion = 0 }: { accounts: Account[]; onPick: (account: Account, owner: string, repo: string) => void; targetsVersion?: number }) {
  const dismiss = Navigation.useDismiss()
  // 2026-11-18：這一頁之前整片寫死藍色（圖示磚 #e8f2fe、勾勾 #0a84ff、標題 #1c1c1e），
  // 換背景主題時完全跟不上，跟首頁倉庫清單、使用者設定頁對不起來。
  // 改成跟那些頁面同一套：palette.accent／palette.selected、RepoHeader、AccountHeader。
  const palette = useThemePalette()
  // 2026-11-18：頭像跟其他頁同一套：先讀共用快取（Token -> avatar_url），
  // 沒快取的帳號才去打一次 /user 補齊。之前直接 loadAvatarCache() 放在 render 裡，
  // 快取空的（沒先開過使用者設定頁）就永遠不會有頭像。
  const [avatars, setAvatars] = useState<Record<string, string>>(() => loadAvatarCache())
  const [reposMap, setReposMap] = useState<Record<string, Repo[]>>({})
  const [errorsMap, setErrorsMap] = useState<Record<string, string>>({})
  const [loadedIds, setLoadedIds] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => loadWidgetExpanded())
  const [targets, setTargets] = useState<string[]>(() => getWidgetTargets())
  const [cleared, setCleared] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const nextRepos: Record<string, Repo[]> = {}
    const nextErrors: Record<string, string> = {}
    // 2026-11-07：並行抓。每個 GitHubAPI 實例自己帶自己的 Token，並行不會互相打架。
    await Promise.all(
      accounts.map(async (acc, i) => {
        const id = `${acc.username}#${i}`
        try {
          nextRepos[id] = await new GitHubAPI(acc).getRepos()
          setReposMap(prev => ({ ...prev, [id]: nextRepos[id] }))
          setLoadedIds(prev => ({ ...prev, [id]: true }))
          setErrorsMap(prev => { const next = { ...prev }; delete next[id]; return next })
        } catch (e: any) {
          nextRepos[id] = []
          nextErrors[id] = errorMessage(e, t('載入失敗', '载入失败', 'Failed to load'))
          setReposMap(prev => ({ ...prev, [id]: [] }))
          setErrorsMap(prev => ({ ...prev, [id]: nextErrors[id] }))
          setLoadedIds(prev => ({ ...prev, [id]: true }))
        }
      })
    )
    setReposMap(nextRepos)
    setErrorsMap(nextErrors)
    setLoading(false)
    setExpanded((prev) => {
      const next = { ...prev }
      accounts.forEach((a, i) => {
        const id = `${a.username}#${i}`
        if (next[id] === undefined) next[id] = false
      })
      return next
    })
  }, [accounts])

  useEffect(() => { load() }, [load])

  // 2026-11-18：工作流程頁改完回來，重讀已選目標（不改 loading，不重抓倉庫）。
  useEffect(() => { setTargets(getWidgetTargets()) }, [targetsVersion])

  // 2026-11-18：頭像快取缺的帳號才補抓，並寫回共用快取（跟使用者設定頁同一個 key）。
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const cached = loadAvatarCache()
      const missing = accounts.filter(acc => !cached[acc.token])
      if (missing.length === 0) { setAvatars(cached); return }
      const results = await Promise.all(missing.map(async acc => {
        try {
          const me = await new GitHubAPI(acc).getUser()
          return { token: acc.token, url: me?.avatar_url || '' }
        } catch (_) {
          return { token: acc.token, url: '' }
        }
      }))
      const next = { ...cached }
      let changed = false
      for (const r of results) {
        if (r.url) { next[r.token] = r.url; changed = true }
      }
      if (changed) saveAvatarCache(next)
      if (!cancelled) setAvatars(next)
    })()
    return () => { cancelled = true }
  }, [accounts])

  const clear = () => {
    setWidgetTargets([])
    clearWidgetTargetAccounts()
    setTargets([])
    setCleared(true)
    Widget.reloadAll()
  }

  const countFor = (owner: string, repo: string) =>
    targets.filter(t => t.split('/').filter(Boolean)[0] === owner && t.split('/').filter(Boolean)[1] === repo).length

  return (
    <List
      {...REPO_LIST}
      tint={palette.accent}
      scrollContentBackground="hidden"
      background={<GlassBackground />}
      navigationTitle={t("小工具設定", "小工具设置", "Widget settings")}
      navigationBarTitleDisplayMode="inline"
      refreshable={async () => { await load() }}
      toolbar={{
        topBarLeading: <Button key="back" title={t("返回", "返回", "Back")} action={dismiss} />,
        topBarTrailing: <Button key="refresh" title={t("重新整理", "刷新", "Refresh")} systemImage="arrow.clockwise" action={load} disabled={loading} />,
      }}
    >
      <Section>
        <Text listRowBackground={<ThemeCardBackground />} font="footnote" foregroundStyle="secondaryLabel">
          {t("點選倉庫後，再挑選要顯示在桌面小工具的工作流程。", "点选仓库后，再挑选要显示在桌面小组件的工作流程。", "Pick a repository, then choose the workflows to show in the Home Screen widget.")}
        </Text>
      </Section>
      {loading && Object.keys(loadedIds).length === 0 ? <Section><SkeletonRows /></Section> : null}
      {cleared ? <Section><Text listRowBackground={<ThemeCardBackground />} font="footnote" foregroundStyle="secondaryLabel">{t("已清除，桌面小工具顯示未指定狀態", "已清除，桌面小组件显示未指定状态", "Cleared. The widget will show as unconfigured")}</Text></Section> : null}
      {accounts.map((account, idx) => {
        const id = `${account.username}#${idx}`
        const list = reposMap[id] || []
        const err = errorsMap[id] || ''
        // 跟首頁分區一樣：標題列點一下就展開/折疊，右邊是箭頭，
        // 點一下立刻寫進 Storage，沒記過的預設折疊。
        const isOpen = expanded[id] === true
        return (
          <Section key={id}>
            <Button listRowBackground={<ThemeCardBackground />}
              action={() => {
                const next = { ...expanded, [id]: !isOpen }
                setExpanded(next)
                try {
                  Storage.set(WIDGET_EXPANDED_KEY, JSON.stringify(next))
                } catch (_) { }
              }}
            >
              <AccountHeader
                name={account.username}
                avatar={avatars[account.token]}
                count={loadedIds[id] ? list.length : undefined}
                unit="repo"
                publicCount={loadedIds[id] ? list.filter(r => !r.private).length : undefined}
                privateCount={loadedIds[id] ? list.filter(r => r.private).length : undefined}
                loading={!loadedIds[id] && loading}
                expanded={isOpen}
              />
            </Button>
            {isOpen ? (
              <>
                {err ? <Text listRowBackground={<ThemeCardBackground />} font="footnote" foregroundStyle="systemRed">{err}</Text> : null}
                {!err && loadedIds[id] && list.length === 0 && !loading ? (
                  <Text listRowBackground={<ThemeCardBackground />} font="footnote" foregroundStyle="secondaryLabel">{t("尚無倉庫", "尚无仓库", "No repositories")}</Text>
                ) : !loadedIds[id] && loading ? <SkeletonRows /> : null}
                {list.map(r => {
                  const count = countFor(r.owner.login, r.name)
                  return (
                    <Button listRowBackground={<ThemeCardBackground />} key={r.id} action={() => onPick(account, r.owner.login, r.name)}>
                      <HStack spacing={12} padding={{ vertical: 6 }}>
                        <Image systemName={r.fork ? 'arrow.triangle.branch' : 'shippingbox'} font={17} foregroundStyle={palette.accent} frame={{ width: 36, height: 36 }} background={{ style: palette.selected, shape: { type: 'rect', cornerRadius: 10 } }} />
                        <VStack alignment="leading" spacing={3} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
                          <Text font={14} fontWeight="semibold" lineLimit={1}>{r.name}</Text>
                          {/* 2026-11-18：使用者指的「小圖標」是 Action 首頁的 ⑂ 字元（U+2442），
                              不是 SF Symbol 的 arrow.triangle.branch。照首頁寫法：⑂ 後面直接接分支名，
                          倉庫名下面一行。 */}
                          <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1}>{`⑂ ${r.default_branch}`}</Text>
                          {count > 0 ? (
                            <Text font={11} foregroundStyle={palette.accent} lineLimit={1}>{t(`已選 ${count} 個工作流程`, `已选 ${count} 个工作流程`, `${count} workflows selected`)}</Text>
                          ) : null}
                        </VStack>
                        {count > 0 ? <Image systemName="checkmark.circle.fill" font={18} foregroundStyle={palette.accent} /> : null}
                        <PrivateMarker isPrivate={r.private} />
                      </HStack>
                    </Button>
                  )
                })}
              </>
            ) : null}
          </Section>
        )
      })}
      <Section>
        <Button listRowBackground={<ThemeCardBackground />} action={clear}>
          <HStack spacing={10} padding={{ vertical: 3 }}>
            <Image systemName="trash" font={16} foregroundStyle="systemRed" frame={{ width: 30, height: 30 }} background={{ style: 'rgba(255,59,48,0.12)', shape: { type: 'rect', cornerRadius: 8 } }} />
            <VStack alignment="leading" spacing={2}><Text font={14} fontWeight="semibold" foregroundStyle="systemRed">{t("清除設定", "清除设置", "Clear settings")}</Text></VStack>
          </HStack>
        </Button>
      </Section>
      <Section>
        <Text listRowBackground={<ThemeCardBackground />} font="footnote" foregroundStyle="secondaryLabel">
          {t(`小工具會用各工作流程所屬帳號的 Token 拉取資料；
私人倉庫也能顯示和執行。`, `小工具会用各工作流程所属账号的 Token 拉取数据；
私人仓库也能显示和执行。`, `The widget fetches data using each workflow's own account Token;
private repositories can also be shown and run.`)}
        </Text>
      </Section>
    </List>
  )
}

function WidgetWorkflowList({ api, account, owner, repo, onBack }: { api: GitHubAPI; account: Account; owner: string; repo: string; onBack: () => void }) {
  // 2026-11-18：跟倉庫頁一樣，改成跟其他頁同一套主題色，不再固定藍色。
  const palette = useThemePalette()
  const { data: workflows, loading, errorMsg, load } = useLoadList(
    useCallback(() => api.getWorkflows(owner, repo), [api, owner, repo])
  )
  const [targets, setTargets] = useState<string[]>(() => getWidgetTargets())
  const [cleared, setCleared] = useState(false)
  // 2026-11-18：摘要列右邊的數字只算「這個倉庫」被選了幾個。
  // 之前用 targets.length，會把其他倉庫已選的也算進去。
  const selectedHere = targets.filter(t => t.startsWith(`${owner}/${repo}/`)).length

  const toggle = (wf: Workflow) => {
    const target = `${owner}/${repo}/${wf.id}`
    const next = targets.includes(target)
      ? targets.filter(t => t !== target)
      : [...targets, target]
    setWidgetTargets(next)
    // v1.5.0：選進來就記下這個工作流程屬於哪個帳號，取消就把對照清掉，
    // 這樣小工具顯示跟 App Intent 執行才能用對的 Token，不用只靠第一個帳號。
    if (next.includes(target)) {
      setWidgetTargetAccount(target, account.username)
    } else {
      removeWidgetTargetAccount(target)
    }
    setTargets(next)
    setCleared(false)
    Widget.reloadAll()
  }

  const clear = () => {
    setWidgetTargets([])
    clearWidgetTargetAccounts()
    setTargets([])
    setCleared(true)
    Widget.reloadAll()
  }

  return (
    <List
      {...REPO_LIST}
      tint={palette.accent}
      scrollContentBackground="hidden"
      background={<GlassBackground />}
      navigationTitle={repo}
      navigationBarTitleDisplayMode="inline"
      refreshable={async () => { await load() }}
      toolbar={{
        topBarLeading: <Button key="back" title={t("返回", "返回", "Back")} action={onBack} />,
        topBarTrailing: <Button key="refresh" title={t("重新整理", "刷新", "Refresh")} systemImage="arrow.clockwise" action={load} disabled={loading} />,
      }}
    >
      <Section>
        <RepoSummary symbol="bolt.horizontal.circle.fill" title={repo} subtitle={`${owner} / ${account.username}`} detail={loading ? undefined : `${selectedHere}/${workflows.length}`} />
      </Section>
      {errorMsg ? <Section><Text listRowBackground={<ThemeCardBackground />} font="footnote" foregroundStyle="systemRed">{errorMsg}</Text></Section> : null}
      {loading ? <Section><SkeletonRows /></Section> : null}
      {cleared ? <Section><Text listRowBackground={<ThemeCardBackground />} font="footnote" foregroundStyle="secondaryLabel">{t("已清除，桌面小工具顯示未指定狀態", "已清除，桌面小组件显示未指定状态", "Cleared. The widget will show as unconfigured")}</Text></Section> : null}
      <Section header={<RepoHeader symbol="bolt.fill" title={t("工作流程", "工作流程", "Workflows")} detail={loading ? undefined : String(workflows.length)} />}>
        {!loading && workflows.length === 0 ? (
          <Text listRowBackground={<ThemeCardBackground />} font="footnote" foregroundStyle="secondaryLabel">{t("這個倉庫沒有可用的工作流程", "这个仓库没有可用的工作流程", "No workflows in this repository")}</Text>
        ) : null}
        {workflows.map(wf => {
          const target = `${owner}/${repo}/${wf.id}`
          const isSelected = targets.includes(target)
          return (
            <Button listRowBackground={<ThemeCardBackground />} key={wf.id} action={() => toggle(wf)}>
              <HStack spacing={10} padding={{ vertical: 3 }}>
                <Image systemName="waveform.path.ecg" font={16} frame={{ width: 32, height: 32 }} foregroundStyle={palette.accent} background={{ style: palette.selected, shape: { type: 'rect', cornerRadius: 9 } }} />
                <VStack alignment="leading" spacing={3} frame={{ maxWidth: 'infinity', alignment: 'leading' }}>
                  <Text font={14} fontWeight="semibold" lineLimit={1}>{wf.name}</Text>
                  <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1}>{wf.path.split('/').pop() || wf.path}</Text>
                </VStack>
                {isSelected ? <Image systemName="checkmark.circle.fill" font={18} foregroundStyle={palette.accent} /> : null}
              </HStack>
            </Button>
          )
        })}
      </Section>
      <Section>
        <Button listRowBackground={<ThemeCardBackground />} action={clear}>
          <HStack spacing={10} padding={{ vertical: 3 }}>
            <Image systemName="trash" font={16} foregroundStyle="systemRed" frame={{ width: 30, height: 30 }} background={{ style: 'rgba(255,59,48,0.12)', shape: { type: 'rect', cornerRadius: 8 } }} />
            <VStack alignment="leading" spacing={2}><Text font={14} fontWeight="semibold" foregroundStyle="systemRed">{t("清除設定", "清除设置", "Clear settings")}</Text></VStack>
          </HStack>
        </Button>
      </Section>
    </List>
  )
}

function WorkflowListPage({
  api,
  owner,
  repo,
  defaultBranch,
  accountUsername,
}: {
  api: GitHubAPI
  owner: string
  repo: string
  defaultBranch: string
  // 收藏要用：GitHubAPI 不對外暴露 username，從呼叫端（首頁）傳進來。
  accountUsername: string
}) {
  const palette = useThemePalette()
  const { data: workflows, loading, errorMsg, load } = useLoadList(
    useCallback(() => api.getWorkflows(owner, repo), [api, owner, repo])
  )
  // v1.3.7：工作流程收藏。長按卡片加入／取消收藏，寫 Storage。
  const [favorites, setFavorites] = useState<WorkflowFavorite[]>(() => loadWorkflowFavorites())
  // 滑動開啟中的 workflow，讓列背景四角變圓弧。
  const [openSwipeWf, setOpenSwipeWf] = useState("")
  const favoriteIds = new Set(favorites.map((f) => f.id))
  const toggleFavorite = (wf: Workflow) => {
    const id = `${owner}/${repo}/${wf.id}`
    const next = favoriteIds.has(id)
      ? favorites.filter((f) => f.id !== id)
      : [...favorites, {
        id,
        owner,
        repo,
        workflowId: wf.id,
        workflowName: wf.name,
        workflowPath: wf.path,
        defaultBranch,
        accountUsername,
        addedAt: Date.now(),
      }]
    saveWorkflowFavorites(next)
    setFavorites(next)
  }

  return (
    <List
      scrollContentBackground="hidden"
      background={<GlassBackground />}

      navigationTitle={t("工作流程", "工作流程", "Workflows")}
      toolbar={{
        topBarTrailing: [
          // 2.1.17：載入中不再換成轉圈圖標，跟「執行紀錄」頁一樣，
          // 只讓重新整理按鈕變灰色（disabled），載入完就恢復可按。
          <Button key="refresh" title={t("重新整理", "刷新", "Refresh")} systemImage="arrow.clockwise" action={load} disabled={loading} />,
        ],
      }}
    >
      {errorMsg ? <Text listRowBackground={<ThemeCardBackground />} style={{ color: 'red' }}>{errorMsg}</Text> : null}
      <Section header={<HStack><Text>{t("工作流程", "工作流程", "Workflows")}</Text><Spacer /><Text foregroundStyle="secondaryLabel">{workflows.length}</Text></HStack>}>
        {workflows.map(wf => {
          const isFav = favoriteIds.has(`${owner}/${repo}/${wf.id}`)
          return (
            <NavigationLink listRowBackground={<SwipeRowBackground isPresented={openSwipeWf === String(wf.id)} />}
              key={wf.id}
              destination={
                <RunListPage
                  api={api}
                  owner={owner}
                  repo={repo}
                  workflowId={wf.id}
                  workflowName={wf.name}
                  defaultBranch={defaultBranch}
                />
              }
            >
              {/* 2.0.7：滑動改回來，照官方範例掛在列本身的 HStack 上
                  （不要掛 NavigationLink）。只有加入收藏／取消收藏一個選項，
                  點了呼叫原本的 toggleFavorite。按鈕是素 Button＋Label 子元件。 */}
              <HStack
                spacing={10}
                padding={{ horizontal: 12, vertical: 8 }}
                trailingSwipeActions={{
                  allowsFullSwipe: false,
                  onPresentationChanged: (presented: boolean) => setOpenSwipeWf(current => presented ? String(wf.id) : current === String(wf.id) ? "" : current),
                  actions: [
                    <Button action={async () => { await toggleFavorite(wf); }} tint="accentColor">
                      <Label title={isFav ? t("取消收藏", "取消收藏", "Remove from favorites") : t("加入收藏", "加入收藏", "Add to favorites")} systemImage={isFav ? "star.slash" : "star"} />
                    </Button>,
                  ],
                }}
              >
                <Image systemName="waveform.path.ecg" font={16} frame={{ width: 32, height: 32 }} foregroundStyle={palette.accent} background={{ style: palette.selected, shape: { type: "rect", cornerRadius: 9 } }} />
                <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  <Text font={14} fontWeight="semibold" lineLimit={1}>{wf.name}</Text>
                  <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1}>{wf.path.split("/").pop() || wf.path}</Text>
                </VStack>
              </HStack>
            </NavigationLink>
          )
        })}
      </Section>
    </List>
  )
}

// v1.3.7：工作流程收藏頁（取代歷史紀錄頁）。首頁星星點進來。
// 一定要包 NavigationStack：這頁是 pageSheet 呈現的，裡面的
// NavigationLink（點進執行列表）沒有 NavigationStack 就推不出去——
// 歷史紀錄頁就是死在這一點上，點進執行是黑畫面。
function WorkflowFavoritesPage({ accounts }: { accounts: Account[] }) {
  const palette = useThemePalette()
  const [favorites, setFavorites] = useState<WorkflowFavorite[]>(() => loadWorkflowFavorites())
  // 滑動開啟中的收藏，讓列背景四角變圓弧。
  const [openSwipeFav, setOpenSwipeFav] = useState("")

  // 收藏時記的帳號找 Token；帳號刪了就找不回來，點進去會提示。
  const accountFor = (fav: WorkflowFavorite): Account | null => {
    const byName = accounts.find((a) => a.username.toLowerCase() === fav.accountUsername.toLowerCase())
    if (byName) return byName
    return accounts.find((a) => a.username.toLowerCase() === fav.owner.toLowerCase()) || null
  }

  async function handleDelete(fav: WorkflowFavorite) {
    const idx = await Dialog.actionSheet({
      title: t('刪除收藏', '删除收藏', 'Remove favorite'),
      message: t(`確定要刪除「${fav.workflowName}」嗎？`, `确定要删除「${fav.workflowName}」吗？`, `Are you sure you want to remove “${fav.workflowName}”?`),
      actions: [{ label: t('確認', '确认', 'Confirm'), destructive: true }],
    })
    if (idx !== 0) return
    const next = favorites.filter((f) => f.id !== fav.id)
    saveWorkflowFavorites(next)
    setFavorites(next)
  }

  async function handleMissingAccount(fav: WorkflowFavorite) {
    await Dialog.alert({
      title: t('找不到帳號', '找不到账号', 'Account not found'),
      message: t(`收藏「${fav.workflowName}」的帳號「${fav.accountUsername}」已經不在了，請到工作流程列表重新加入收藏。`, `收藏「${fav.workflowName}」的账号「${fav.accountUsername}」已经不在了，请到工作流程列表重新加入收藏。`, `The account “${fav.accountUsername}” for “${fav.workflowName}” no longer exists. Please favorite the workflow again from the workflow list.`),
    })
  }

  return (
    <NavigationStack>
      <List
        scrollContentBackground="hidden"
        background={<GlassBackground />}
        navigationTitle={t('收藏', '收藏', 'Favorites')}
        // v1.3.8：標題改 inline 小字置中。之前沒設 displayMode，預設大標題
        // 在 pageSheet 裡一直是糊掉的、定不下來；全專案其他頁都是 inline。
        navigationBarTitleDisplayMode="inline"
      >
        {favorites.length === 0 ? (
          <Section>
            <Text listRowBackground={<ThemeCardBackground />} font={"callout"} foregroundStyle={"secondaryLabel"}>
              {t("尚未收藏工作流程。請到工作流程列表，左滑卡片加入收藏。", "尚未收藏工作流程。请到工作流程列表，左滑卡片加入收藏。", "No favorite workflows yet. Swipe left on a workflow card in the workflow list to add one.")}
            </Text>
          </Section>
        ) : null}
        {favorites.length > 0 ? (
          <Section header={<Text>{t(`工作流程收藏 (${favorites.length})`, `工作流程收藏 (${favorites.length})`, `Workflow favorites (${favorites.length})`)}</Text>}>
            {favorites.map((fav) => {
              const account = accountFor(fav)
              // 2.0.27：滑動刪除改成長按刪除（跟 Gist／Repo 首頁同一招）。
              // 這列本來只有「刪除」一個滑動選項，現在改成長按叫出選單，
              // 沿用 handleDelete 本來的確認流程。
              const inner = (
                <HStack spacing={10} padding={{ horizontal: 12, vertical: 8 }}>
                  <Image systemName="pin.fill" font={15} frame={{ width: 32, height: 32 }} foregroundStyle={palette.accent} background={{ style: palette.selected, shape: { type: "rect", cornerRadius: 9 } }} />
                  <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity", alignment: "leading" }}>
                    <Text font={14} fontWeight="semibold" lineLimit={1}>{fav.workflowName}</Text>
                    <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1}>{`${fav.owner}/${fav.repo}`}</Text>
                    <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1}>{fav.workflowPath.split("/").pop() || fav.workflowPath}</Text>
                  </VStack>
                </HStack>
              )
              if (!account) {
                // 2.0.7：滑動改回來，照官方範例掛在列本身的 HStack 上。
                // 主內容 Button 留著（maxWidth infinity，點了提示找不到帳號），
                // 「⋯」按鈕拿掉。
                return (
                  <HStack
                    key={fav.id}
                    alignment={"center"}
                    spacing={10}
                    listRowBackground={<SwipeRowBackground isPresented={openSwipeFav === fav.id} />}
                    contextMenu={{
                      menuItems: (
                        <>
                          <Section>
                            <Button title={t("刪除", "删除", "Delete")} systemImage="trash" role="destructive" action={async () => { await handleDelete(fav); }} />
                          </Section>
                        </>
                      ),
                    }}
                  >
                    <Button
                      buttonStyle="borderless"
                      frame={{ maxWidth: "infinity", alignment: "leading" }}
                      action={async () => { await handleMissingAccount(fav) }}
                    >
                      {inner}
                    </Button>
                  </HStack>
                )
              }
              return (
                <NavigationLink
                  key={fav.id}
                  listRowBackground={<SwipeRowBackground isPresented={openSwipeFav === fav.id} />}
                  destination={
                    <RunListPage
                      api={new GitHubAPI(account)}
                      owner={fav.owner}
                      repo={fav.repo}
                      workflowId={fav.workflowId}
                      workflowName={fav.workflowName}
                      defaultBranch={fav.defaultBranch}
                    />
                  }
                >
                  {/* 2.0.7：滑動改回來，照官方範例掛在列本身的 HStack 上
                      （不要掛 NavigationLink）。 */}
                  <HStack
                    contextMenu={{
                      menuItems: (
                        <>
                          <Section>
                            <Button title={t("刪除", "删除", "Delete")} systemImage="trash" role="destructive" action={async () => { await handleDelete(fav); }} />
                          </Section>
                        </>
                      ),
                    }}
                  >
                    {inner}
                  </HStack>
                </NavigationLink>
              )
            })}
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}

function RunListPage({
  api,
  owner,
  repo,
  workflowId,
  defaultBranch,
  workflowName,
}: {
  api: GitHubAPI
  owner: string
  repo: string
  workflowId: number
  defaultBranch: string
  workflowName?: string
}) {
  const { data: runs, loading, errorMsg, setErrorMsg, load } = useLoadList(
    useCallback(() => api.getWorkflowRuns(owner, repo, workflowId), [api, owner, repo, workflowId])
  )
  const palette = useThemePalette()
  // 正在追蹤的這次觸發：beforeIds 是觸發前就存在的執行，新的執行一定不在裡面，
  // 這樣就算裝置時間和 GitHub 伺服器時間有落差也不會認錯。
  // 進頁面時先從 Storage 恢復上次的追蹤，這是上一版沒有的：上一版頁面一重開，
  // 追蹤就丟了，執行結束也不會通知，App 內連完成橫幅都不會出現。
  const [watch, setWatch] = useState<RunWatch | null>(() => getStoredWatch(owner, repo, workflowId))
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(() =>
    getStoredWatch(owner, repo, workflowId)
      ? { text: t('已恢復追蹤上次觸發的執行，結束時會通知你', '已恢复追踪上次触发的执行，结束时会通知你', 'Resumed tracking the last triggered run. You will be notified when it finishes.'), ok: true }
      : null
  )
  // 追蹤正在等的那一次執行：顯示編號和狀態，這樣就不會再出現
  // 「明明 #8 完成了還顯示追蹤中」，卻不知道它其實在等 #9 的情況。
  const [trackedRun, setTrackedRun] = useState<Run | null>(null)
  // 提交中的漏斗圖標（v2.0.0，參考腳本 RunListPage 第 71 行）：按「執行」
  // 後、dispatch 回來之前，右上角按鈕變成沙漏 hourglass＋「提交中」並
  // 反灰，避免重複觸發；閒置時是 play.fill＋「執行」。
  const dispatchingRef = useRef<boolean>(false)
  const [dispatching, setDispatching] = useState<boolean>(false)
  // 上次輪詢成功查到 GitHub 的時間：用來區分「輪詢根本沒跑」
  // 和「輪詢有跑、但 App 在後台被 iOS 停住」這兩種完全不同的情況。
  const [lastCheckAt, setLastCheckAt] = useState<number | null>(null)
  // 防重複通知用 Storage（見下方兩條完成路徑）：detail 頁本來就用
  // notified_run_<id>，清單這邊沿用同一個鍵，兩邊同時看到完成時只通知一次。

  const handleStopWatch = useCallback(() => {
    storageRemove('run_watch')
    void releaseBackgroundKeepAlive()
    setWatch(null)
    setTrackedRun(null)
    setNotice({ text: t('已停止追蹤', '已停止追踪', 'Tracking stopped'), ok: true })
  }, [])

  // 手動立即檢查：換一個同內容的 watch 物件，讓追蹤 effect 重新跑、
  // 立刻查一次 GitHub，而不是只重新整理清單。按下去後「上次檢查」時間
  // 應該立刻更新；如果時間沒動，就代表輪詢本身在這台裝置上跑不起來。
  const handleCheckNow = useCallback(() => {
    if (watch) setWatch({ ...watch })
  }, [watch])

  const handleRun = useCallback(async () => {
    if (dispatchingRef.current) return
    dispatchingRef.current = true
    setDispatching(true)
    const beforeIds = runs.map((r) => r.id)
    try {
      await api.dispatchWorkflow(owner, repo, workflowId, defaultBranch, {})
      recordWidgetTrigger(owner, repo, workflowId)
      const w: RunWatch = { owner, repo, workflowId, since: Date.now(), beforeIds }
      storageSet('run_watch', JSON.stringify(w))
      setNotice({ text: t('✅ 已觸發執行，執行結束時會通知你', '✅ 已触发执行，执行结束时会通知你', '✅ Run triggered. You will be notified when it finishes.'), ok: true })
      setTrackedRun(null)
      setWatch(w)
      setTimeout(load, RERUN_REFRESH_DELAY_MS)
      Widget.reloadAll()
    } catch (err: any) {
      storageRemove('run_watch')
      setNotice({ text: t(`❌ 觸發失敗: ${errorMessage(err, t('未知錯誤', '未知错误', 'Unknown error'))}`, `❌ 触发失败: ${errorMessage(err, t('未知錯誤', '未知错误', 'Unknown error'))}`, `❌ Failed to trigger: ${errorMessage(err, t('未知錯誤', '未知错误', 'Unknown error'))}`), ok: false })
      setWatch(null)
      setTrackedRun(null)
    } finally {
      dispatchingRef.current = false
      setDispatching(false)
    }
  }, [api, owner, repo, workflowId, defaultBranch, load, runs])

  // 追蹤剛觸發的執行：進頁面先立刻查一次，再每 15 秒查一次，
  // 新的執行一變成 completed 就通知一次，然後停止追蹤，最多追蹤 90 分鐘。
  // 系統通知發送失敗時，App 內橫幅會明說是通知失敗，而不是假裝沒事。
  useEffect(() => {
    if (!watch) return
    let cancelled = false
    let keeperReleased = false
    // 上次看到的追蹤狀態：狀態沒變就不重複 setTrackedRun，避免每 15 秒
    // 都用新物件觸發一次重新渲染，讓 effect / 計時器被反覆打斷。
    let lastSeenKey = ''
    const releaseKeeper = () => {
      if (!keeperReleased) {
        keeperReleased = true
        void releaseBackgroundKeepAlive()
      }
    }
    // 追蹤開始就請求背景保持：App 切到後台時，輪詢才有機會繼續跑，
    // 而不是像之前那樣一到後台就停住、回到前台才一次補發。
    // 若請求失敗，會在 App 內明說，代表後台通知不可靠，要改用 Remote Push。
    acquireBackgroundKeepAlive().then((kept) => {
      if (!kept && !cancelled) {
        setNotice({ text: t('⚠️ 背景保持開啟失敗，App 切到後台後可能暫停，回到前台才會通知；要保證後台通知請用 Remote Push', '⚠️ 后台保持开启失败，App 切到后台后可能暂停，回到前台才会通知；要保证后台通知请用 Remote Push', '⚠️ Background keep-alive failed. The app may pause in the background and notify only when you return to it. Use Remote Push for reliable background notifications.'), ok: false })
      }
    })
    const check = async () => {
      if (Date.now() - watch.since > RUN_WATCH_MAX_MS) {
        if (!cancelled) {
          storageRemove('run_watch')
          releaseKeeper()
          setWatch(null)
          setTrackedRun(null)
          setNotice({ text: t('追蹤已逾時，請手動重新整理查看結果', '追踪已超时，请手动刷新查看结果', 'Tracking timed out. Please refresh manually to see the result.'), ok: false })
        }
        return
      }
      try {
        const latest = await api.getWorkflowRuns(owner, repo, workflowId)
        if (!cancelled) setLastCheckAt(Date.now())
        // 上一版還多了一個「建立時間要在觸發前後 2 分鐘內」的條件，
        // 只要裝置時間和 GitHub 時間差超過 2 分鐘，或建立時間有落差，
        // 就算執行已經完成也會被濾掉，永遠追蹤不完。
        // 現在只用 beforeIds 判斷：觸發前不存在、觸發後才出現的，就是這次要等的執行，
        // 不管它幾點建立、裝置時間差多少都不會誤判。
        const candidate = latest
          .filter((r) => !watch.beforeIds.includes(r.id))
          .sort((a, b) => b.run_number - a.run_number)[0]
        const seenKey = candidate ? `${candidate.id}:${candidate.status}` : ''
        if (candidate && !cancelled && seenKey !== lastSeenKey) {
          lastSeenKey = seenKey
          setTrackedRun(candidate)
        }
        if (candidate && candidate.status === 'completed' && !cancelled) {
          if (storageGet(`notified_run_${candidate.id}`) === '1') {
            storageRemove('run_watch')
            setWatch(null)
            setTrackedRun(null)
            return
          }
          storageSet(`notified_run_${candidate.id}`, '1')
          const sent = await sendRunNotification(candidate, `${owner}/${repo}`)
          storageRemove('run_watch')
          releaseKeeper()
          setNotice(sent
            ? runFinishNotice(candidate)
            : { text: t(`⚠️ 執行已完成：${runConclusionText(candidate.conclusion)} — #${candidate.run_number}，但系統通知發送失敗，請檢查「設定 > 通知 > Scripting」`, `⚠️ 执行已完成：${runConclusionText(candidate.conclusion)} — #${candidate.run_number}，但系统通知发送失败，请检查「设置 > 通知 > Scripting」`, `⚠️ Run completed: ${runConclusionText(candidate.conclusion)} — #${candidate.run_number}, but the system notification failed to send. Please check "Settings > Notifications > Scripting"`), ok: false })
          setWatch(null)
          setTrackedRun(null)
          Widget.reloadAll()
          load()
        }
      } catch (_) { /* 下次輪詢再試 */ }
    }
    // 不用 setInterval，改用「查完才排下一次」的遞迴 setTimeout：
    // 前一次請求還沒回來就不會疊加新請求，計時器也不會因為
    // 一次請求卡住就整個停在舊狀態。
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const scheduleNext = () => {
      if (cancelled) return
      // 追蹤已清掉（完成、逾時、停止）就不要再排下一次，否則舊的
      // 輪詢鏈會在 watch 變成 null 後還一直查下去。
      if (!storageGet('run_watch')) return
      timeoutId = setTimeout(async () => {
        await check()
        scheduleNext()
      }, RUN_POLL_INTERVAL_MS)
    }
    void check().then(() => scheduleNext())
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      releaseKeeper()
    }
  }, [watch, api, owner, repo, workflowId, load])

  // 第二條完成路徑：清單資料本身看到完成時就通知清掉。
  // 這就是 v4 卡住的落差：清單重新整理已經是完成（綠勾），
  // 但輪詢上次看到的還是排隊中，之後的輪詢又沒跑起來，
  // 追蹤就一直停在舊狀態。現在只要清單一出現完成就立刻處理，
  // 按右上角重新整理也能馬上清掉追蹤，不用再等下一輪輪詢。
  useEffect(() => {
    if (!watch) return
    const candidate = runs
      .filter((r) => !watch.beforeIds.includes(r.id))
      .sort((a, b) => b.run_number - a.run_number)[0]
    if (!candidate) return
    if (candidate.status !== 'completed') {
      setTrackedRun(candidate)
      return
    }
    if (storageGet(`notified_run_${candidate.id}`) === '1') {
      storageRemove('run_watch')
      setWatch(null)
      setTrackedRun(null)
      return
    }
    storageSet(`notified_run_${candidate.id}`, '1')
    void (async () => {
      const sent = await sendRunNotification(candidate, `${owner}/${repo}`)
      storageRemove('run_watch')
      void releaseBackgroundKeepAlive()
      setNotice(sent
        ? runFinishNotice(candidate)
        : { text: t(`⚠️ 執行已完成：${runConclusionText(candidate.conclusion)} — #${candidate.run_number}，但系統通知發送失敗，請檢查「設定 > 通知 > Scripting」`, `⚠️ 执行已完成：${runConclusionText(candidate.conclusion)} — #${candidate.run_number}，但系统通知发送失败，请检查「设置 > 通知 > Scripting」`, `⚠️ Run completed: ${runConclusionText(candidate.conclusion)} — #${candidate.run_number}, but the system notification failed to send. Please check "Settings > Notifications > Scripting"`), ok: false })
      setWatch(null)
      setTrackedRun(null)
      Widget.reloadAll()
    })()
  }, [runs, watch, owner, repo])

  return (
    <List
      {...REPO_LIST}
      tint={palette.accent}
      refreshable={async () => { await load() }}
      scrollContentBackground="hidden"
      background={<GlassBackground />}
      navigationTitle={t("執行紀錄", "执行纪录", "Run history")}
      toolbar={{
        topBarTrailing: [
          <Button key="run" title={dispatching ? t("提交中", "提交中", "Submitting") : t("執行", "执行", "Run")} systemImage={dispatching ? "hourglass" : "play.fill"} action={handleRun} disabled={dispatching} />,
          <Button key="refresh" title={t("重新整理", "刷新", "Refresh")} systemImage="arrow.clockwise" action={load} disabled={loading} />,
        ],
      }}
    >
      <Section><RepoSummary symbol="play.circle.fill" title={workflowName || runs[0]?.name || repo} subtitle={`${owner} / ${defaultBranch}`} detail={String(runs.length)} /></Section>
      {loading ? <Text listRowBackground={<ThemeCardBackground />}>{t("載入中...", "载入中...", "Loading...")}</Text> : null}
      {errorMsg ? <Text listRowBackground={<ThemeCardBackground />} style={{ color: 'red' }}>{errorMsg}</Text> : null}
      {watch || notice ? <Section>
        <VStack alignment="leading" spacing={10} padding={{ vertical: 6 }} listRowBackground={<ThemeCardBackground />}>
          <HStack spacing={9}>
            <Image systemName={watch ? "dot.radiowaves.left.and.right" : notice?.ok ? "checkmark.circle.fill" : "exclamationmark.circle"} foregroundStyle={watch || notice?.ok ? "#49D6C5" : "systemRed"} font={19} />
            <Text font={14} fontWeight="semibold">{watch ? trackedRun ? `#${trackedRun.run_number} · ${runStatusInfo(trackedRun).text}` : t("等待建立執行","等待创建运行","Waiting for run") : t("執行通知","运行通知","Run notifications")}</Text>
            <Spacer />
            {watch ? <Text font={10} foregroundStyle="secondaryLabel">{t("追蹤中","跟踪中","Watching")}</Text> : null}
          </HStack>
          {notice ? <Text font={11} foregroundStyle="secondaryLabel" lineLimit={3}>{notice.text}</Text> : null}
          {watch && lastCheckAt ? <Text font={10} foregroundStyle="secondaryLabel">{t(`上次檢查 ${new Date(lastCheckAt).toLocaleTimeString()}`,`上次检查 ${new Date(lastCheckAt).toLocaleTimeString()}`,`Last checked ${new Date(lastCheckAt).toLocaleTimeString()}`)}</Text> : null}
          {watch ? <HStack spacing={10}>
            <Button title={t("立即檢查","立即检查","Check now")} systemImage="arrow.clockwise" action={handleCheckNow} buttonStyle="bordered" font={12} frame={{ maxWidth: "infinity" }} />
            <Button title={t("停止追蹤","停止跟踪","Stop watching")} systemImage="stop.circle" action={handleStopWatch} buttonStyle="bordered" font={12} tint="secondaryLabel" frame={{ maxWidth: "infinity" }} />
          </HStack> : null}
        </VStack>
      </Section> : null}
      <Section header={<Text>{t(`執行紀錄 (${runs.length})`, `执行纪录 (${runs.length})`, `Runs (${runs.length})`)}</Text>}>
        {runs.map(run => {
          const icon = runStatusIcon(run)
          return (
            // 2026-11-07 Kristen：執行紀錄那張大卡片太寬了。上一版在 List
            // 上加 padding 沒用——量截圖，卡片邊距還是系統預設約 15pt，
            // padding 只把 List 自己的漸層底往內縮，兩邊露出系統灰底
            // （#1C1C1E），卡片本身完全沒變窄。所以 padding 拿掉，改用
            // listRowInsets 直接縮每一列，上下 0（列跟列之間不留縫，整張
            // 大卡片還是連在一起，只變窄）。List 本身保持滿寬，漸層底
            // 照樣鋪滿，兩邊不會再變灰。32pt 那版她覺得太窄，2026-11-07
            // 21:18 改成 16pt（原本 0 跟 32 的中間，再寬一點點）。
            // 2026-11-07 21:27 她又說上下間距想要再寬一點點：上下從 0
            // 改成各 4pt（列內容上下多一點呼吸空間，大卡片還是連在一起）。
            <NavigationLink listRowBackground={<ThemeCardBackground />}
              listRowInsets={{ top: 4, leading: 16, bottom: 4, trailing: 16 }}
              key={run.id}
              destination={<RunDetailPage api={api} owner={owner} repo={repo} run={run} />}
            >
              <HStack spacing={12} padding={{ vertical: 6 }}>
                <Image systemName={icon.systemName} font={20} foregroundStyle={icon.color as any} />
                <VStack spacing={5} alignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  <HStack spacing={7}>
                    <Text font={15} fontWeight="semibold">{`#${run.run_number}`}</Text>
                    <Text font={12} foregroundStyle={palette.accent} lineLimit={1}>{run.head_branch}</Text>
                    <Spacer />
                    <Text font={11} foregroundStyle={icon.color as any} lineLimit={1}>{runStatusInfo(run).text}</Text>
                  </HStack>
                  <HStack spacing={8}>
                    <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1}>{run.event}</Text>
                    <Spacer />
                    <Text font={10} foregroundStyle="secondaryLabel" lineLimit={1} fixedSize={{ horizontal: true, vertical: false }}>{formatShortTime(run.updated_at)}</Text>
                  </HStack>
                </VStack>
              </HStack>
            </NavigationLink>
          )
        })}
      </Section>
    </List>
  )
}

// ===== v2.0.0：運行詳情流程圖（移植自參考腳本 Github_Action-2）=====
// 來源：components/ActionFlowGraph.tsx、components/ActionFlowMap.tsx、
// components/FlowNodeCard.tsx、components/FlowEnergy.tsx、
// components/RunDetailFlow.tsx、components/RunDetailHeader.tsx、
// components/RunDetailMetadata.tsx、components/RunStepRow.tsx。
// 參考腳本的 visual.config.ts 數值直接寫死成本檔常數（不整包搬
// visual 設定檔）；狀態／圖標／時間一律用 Toolkit 現有的
// runStatusInfo、jobStatusInfo、jobStatusIcon、durationText、
// formatTime、timeAgoText、formatShortTime；新文案一律包 t()。
// 動畫開關：參考腳本用 withAnimation 包 setState，這裡直接 setState
//（暫停／播放真正控制的是 TimelineCanvas 的 paused，動效本身照停）。
const FLOW_ACCENT = "#0a84ff";
const FLOW_CYCLE_DURATION = 1.4;
const FLOW_ARRIVAL_START = 0.64;
const FLOW_NODE_SPACING = 8;
const FLOW_LINE_WIDTH = 2;
const FLOW_GLOW_STRENGTH = 0.55;
const FLOW_ENERGY_STRENGTH = 0.65;
const FLOW_TRAIL_LENGTH = 6;

function flowAnimateChange(update: () => void): void {
  update();
}

function stepElapsed(state: { started_at?: string | null; completed_at?: string | null }): string {
  if (!state.started_at || !state.completed_at) return "";
  const seconds: number = Math.round((Date.parse(state.completed_at) - Date.parse(state.started_at)) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function drawNodeFocus(ctx: CanvasRenderingContext, x: number, y: number, width: number, height: number, color: string, opacity: number): void {
  if (FLOW_ENERGY_STRENGTH <= 0 || opacity <= 0) return;
  const left: number = x + 1.5;
  const top: number = y + 1.5;
  const right: number = x + width - 1.5;
  const bottom: number = y + height - 1.5;
  const radius: number = 11;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.arcTo(right, top, right, bottom, radius);
  ctx.arcTo(right, bottom, left, bottom, radius);
  ctx.arcTo(left, bottom, left, top, radius);
  ctx.arcTo(left, top, right, top, radius);
  ctx.closePath();
  ctx.globalAlpha = opacity * FLOW_ENERGY_STRENGTH * 0.12;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.globalAlpha = opacity * FLOW_ENERGY_STRENGTH * 0.7;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawNodeEnergy(ctx: CanvasRenderingContext, x: number, y: number, width: number, height: number, phase: number, color: string, phaseOpacity: number = flowOpacity(phase), incoming?: FlowSegmentGeometry): void {
  const strength: number = FLOW_ENERGY_STRENGTH;
  if (strength <= 0 || width < 32) return;
  ctx.save();
  ctx.lineCap = "round";
  const path: ReturnType<typeof nodeSweep> = nodeSweep({ x, y, width, offset: 0, phase: 0, opacity: 0 }, incoming, phase);
  const fade: number = phaseOpacity * strength;
  const from: { x: number; y: number } = flowEdgePoint(x, y, width, height, Math.max(0, phase - 0.28), incoming);
  const to: { x: number; y: number } = flowEdgePoint(x, y, width, height, phase, incoming);
  const gradient: ReturnType<CanvasRenderingContext["createLinearGradient"]> = ctx.createLinearGradient(from.x, from.y, to.x + 0.01, to.y + 0.01);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, color);
  ctx.strokeStyle = gradient;
  ctx.globalAlpha = fade * 0.22;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  const tail: number = Math.max(0, phase - 0.28);
  for (let sample: number = 1; sample <= 10; sample += 1) {
    const point: { x: number; y: number } = flowEdgePoint(x, y, width, height, tail + (phase - tail) * sample / 10, incoming);
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
  ctx.globalAlpha = fade;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function FlowNodeCard({ title, number, state }: { title: string; number?: number; state: JobStep | Job }) {
  const icon: { systemName: string; color: string } = jobStatusIcon(state);
  const info: ReturnType<typeof jobStatusInfo> = jobStatusInfo(state);
  const elapsed: string = state.conclusion !== "skipped" ? stepElapsed(state) : "";
  return (
    <GlassNodeCard>
      <HStack spacing={4} frame={{ maxWidth: "infinity" }}>
        <Text font={12 * 0.85} fontWeight="medium" foregroundStyle="secondaryLabel" frame={{ maxWidth: "infinity", alignment: "leading" }}>
          {number === undefined ? "JOB" : `STEP ${String(number).padStart(2, "0")}`}
        </Text>
        <Image systemName={icon.systemName} foregroundStyle={icon.color} font={12 * 0.85} />
        <Text font={12 * 0.85} foregroundStyle={icon.color} lineLimit={1}>{`${info.text}${elapsed ? ` · ${elapsed}` : ""}`}</Text>
      </HStack>
      <Text font={14} fontWeight="medium" foregroundStyle="label" lineLimit={2} frame={{ maxWidth: "infinity", minHeight: 34, alignment: "leading" }}>
        {title}
      </Text>
    </GlassNodeCard>
  );
}

function flowStatusColor(appearance: FlowStatusVisual, accent: string): string {
  if (appearance.tone === "running") return accent;
  if (appearance.tone === "success") return "#34c759";
  if (appearance.tone === "failure") return "#ff3b30";
  return "secondaryLabel";
}

function drawFlowSegment(ctx: CanvasRenderingContext, segment: FlowSegmentGeometry, phase: number, phaseOpacity: number, count: number): void {
  const arrival: number = Math.max(0.45, Math.min(0.8, FLOW_ARRIVAL_START));
  const settle: number = (1 / arrival - 1) * 0.4;
  const spacing: number = Math.min(0.045, settle / Math.max(1, count - 1));
  for (let pass: number = 0; pass < 2; pass += 1) {
    ctx.globalAlpha = phaseOpacity * (pass === 0 ? FLOW_GLOW_STRENGTH * 0.24 : 0.9);
    ctx.beginPath();
    let visible: boolean = false;
    for (let index: number = count - 1; index >= 0; index -= 1) {
      const progress: number = phase - index * spacing;
      const signal: ReturnType<typeof dockedSignal> = dockedSignal(progress, true, settle);
      const position: number = signal.position;
      const fade: number = signal.opacity * (1 - index / count);
      if (fade <= 0) continue;
      const x: number = segment.from.x + segment.dx * position;
      const y: number = segment.from.y + segment.dy * position;
      const radius: number = (pass === 0 ? 5 - index * 0.15 : index === 0 ? 2.2 : 1.3) * Math.sqrt(fade);
      ctx.moveTo(x + radius, y);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      visible = true;
    }
    if (visible) ctx.fill();
  }
}

function CompactLane({ job, playing, lane }: { job: Job; playing: boolean; lane: number }) {
  const layout: { steps: JobStep[]; rows: JobStep[][]; completed: number } = useMemo(() => {
    const steps: JobStep[] = job.steps ?? [];
    const rows: JobStep[][] = [];
    for (let index: number = 0; index < steps.length; index += 2) {
      const row: JobStep[] = steps.slice(index, index + 2);
      rows.push(index % 4 === 0 ? row : row.reverse());
    }
    return { steps, rows, completed: steps.filter((step: JobStep) => step.status === "completed").length };
  }, [job.steps]);
  const { steps, rows, completed } = layout;
  const states: (JobStep | Job)[] = steps.length ? steps : [job];
  const styles: { appearance: FlowStatusVisual; color: string }[] = states.map((state: JobStep | Job) => {
    const appearance: FlowStatusVisual = flowStatusVisual(state);
    return { appearance, color: flowStatusColor(appearance, FLOW_ACCENT) };
  });
  const motionKey: string = styles.map((style: { appearance: FlowStatusVisual; color: string }): string => style.appearance.motion).join("|");
  const transfer: TransferPlan = useMemo(
    (): TransferPlan =>
      createTransferPlan(
        styles.map((style: { appearance: FlowStatusVisual; color: string }): boolean => style.appearance.motion !== "none"),
        FLOW_CYCLE_DURATION,
        true
      ),
    [motionKey]
  );
  const playback = useRef<TransferPlayback | null>(null);
  const geometry = useRef<FlowGeometry | null>(null);
  const resolveGeometry = (width: number, height: number): FlowGeometry => {
    const cached: FlowGeometry = getFlowGeometry(geometry.current, width, height, Math.max(1, steps.length), lane);
    geometry.current = cached;
    return cached;
  };
  const icon: { systemName: string; color: string } = jobStatusIcon(job);
  const active: boolean = playing && styles.some((style: { appearance: FlowStatusVisual; color: string }) => style.appearance.motion !== "none");
  const clock: (time: number) => number = useFlowClock(active);
  const height: number = Math.max(1, rows.length) * (flowNodeHeight + flowRowGap) - flowRowGap;
  return (
    <VStack alignment="leading" spacing={10} padding={{ vertical: 8 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack spacing={7}>
        <Image systemName="cpu" foregroundStyle={FLOW_ACCENT} font={18} />
        <Text font={14} fontWeight="semibold" foregroundStyle="label" frame={{ maxWidth: "infinity", alignment: "leading" }} lineLimit={2}>
          {job.name}
        </Text>
        <Image systemName={icon.systemName} foregroundStyle={icon.color} font={12} />
        <Text font={12} foregroundStyle="secondaryLabel">{`${completed}/${steps.length}`}</Text>
      </HStack>
      <Canvas
        opaque={false}
        frame={{ maxWidth: "infinity", height: 2 }}
        accessibilityHidden
        draw={(ctx: CanvasRenderingContext, size: { width: number; height: number }): void => {
          ctx.fillStyle = FLOW_ACCENT;
          ctx.globalAlpha = 0.12;
          ctx.fillRect(0, 0, size.width, 2);
          ctx.globalAlpha = 0.65;
          ctx.fillRect(0, 0, size.width * (steps.length ? completed / steps.length : job.status === "completed" ? 1 : 0), 2);
        }}
      />
      <ZStack alignment="topLeading" frame={{ maxWidth: "infinity", minHeight: height, maxHeight: height }}>
        <Canvas
          opaque={false}
          frame={{ maxWidth: "infinity", minHeight: height, maxHeight: height }}
          allowsHitTesting={false}
          accessibilityHidden
          draw={(ctx: CanvasRenderingContext, size: { width: number; height: number }): void => {
            ctx.fillStyle = FLOW_ACCENT;
            ctx.globalAlpha = 0.055;
            for (let x: number = 8; x < size.width; x += 24) {
              for (let y: number = 6; y < size.height; y += 24) {
                ctx.fillRect(x, y, 1, 1);
              }
            }
          }}
        />
        <VStack spacing={flowRowGap} frame={{ maxWidth: "infinity" }}>
          {rows.length ? (
            rows.map((row: JobStep[], index: number) => (
              <HStack key={index} spacing={flowRowGap} frame={{ maxWidth: "infinity" }}>
                {row.length === 1 && index % 2 === 1 ? <VStack frame={{ maxWidth: "infinity", minHeight: flowNodeHeight }} /> : null}
                {row.map((step: JobStep) => (
                  <FlowNodeCard key={step.number} title={step.name} number={step.number} state={step} />
                ))}
                {row.length === 1 && steps.length > 1 && index % 2 === 0 ? <VStack frame={{ maxWidth: "infinity", minHeight: flowNodeHeight }} /> : null}
              </HStack>
            ))
          ) : (
            <FlowNodeCard title={job.name} state={job} />
          )}
        </VStack>
        <Canvas
          opaque={false}
          frame={{ maxWidth: "infinity", minHeight: height, maxHeight: height }}
          allowsHitTesting={false}
          accessibilityHidden
          draw={(ctx: CanvasRenderingContext, size: { width: number; height: number }): void => {
            ctx.strokeStyle = FLOW_ACCENT;
            ctx.fillStyle = FLOW_ACCENT;
            ctx.lineWidth = FLOW_LINE_WIDTH;
            const cached: FlowGeometry = resolveGeometry(size.width, size.height);
            for (const segment of cached.segments) {
              const style: { appearance: FlowStatusVisual; color: string } = styles[segment.nodeIndex];
              ctx.strokeStyle = style.color;
              ctx.fillStyle = style.color;
              ctx.lineWidth = FLOW_LINE_WIDTH;
              ctx.lineCap = "round";
              ctx.setLineDash(style.appearance.dashed ? [3, 4] : []);
              ctx.globalAlpha = style.appearance.dashed ? 0.22 : 0.28;
              ctx.beginPath();
              ctx.moveTo(segment.from.x, segment.from.y);
              ctx.lineTo(segment.to.x, segment.to.y);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.beginPath();
              ctx.arc(segment.to.x, segment.to.y, 2.2, 0, Math.PI * 2);
              ctx.fill();
              const length: number = Math.hypot(segment.dx, segment.dy) || 1;
              const ux: number = segment.dx / length;
              const uy: number = segment.dy / length;
              const x: number = segment.from.x + segment.dx * 0.55;
              const y: number = segment.from.y + segment.dy * 0.55;
              ctx.globalAlpha = 0.45;
              ctx.lineWidth = 1.2;
              ctx.beginPath();
              ctx.moveTo(x - ux * 3 - uy * 2.5, y - uy * 3 + ux * 2.5);
              ctx.lineTo(x, y);
              ctx.lineTo(x - ux * 3 + uy * 2.5, y - uy * 3 - ux * 2.5);
              ctx.stroke();
            }
            for (let index: number = 0; index < cached.nodes.length; index += 1) {
              const node: FlowNodeGeometry = cached.nodes[index];
              const style: { appearance: FlowStatusVisual; color: string } = styles[index];
              ctx.strokeStyle = style.color;
              if (style.appearance.tone === "failure") {
                ctx.globalAlpha = 0.7;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(node.x + 12, node.y + 2);
                ctx.lineTo(node.x + 32, node.y + 2);
                ctx.stroke();
              }
            }
          }}
        />
        <TimelineCanvas
          opaque={false}
          paused={!active}
          schedule={{ minimumInterval: 1 / 30 }}
          frame={{ maxWidth: "infinity", minHeight: height, maxHeight: height }}
          allowsHitTesting={false}
          accessibilityHidden
          draw={(ctx: CanvasRenderingContext, size: { width: number; height: number }, time: number): void => {
            const elapsed: number = clock(time);
            const cached: FlowGeometry = resolveGeometry(size.width, size.height);
            const current: TransferPlayback = advanceTransferPlayback(playback.current, transfer, elapsed);
            playback.current = current;
            const frame: ReturnType<typeof transferFrame> = transferFrame(current.plan, elapsed - current.origin, FLOW_ARRIVAL_START);
            for (let index: number = 0; index < cached.nodes.length; index += 1) {
              const node: FlowNodeGeometry = cached.nodes[index];
              const style: { appearance: FlowStatusVisual; color: string } = styles[index];
              node.phase = frame.index === index ? frame.phase : -1;
              node.opacity = 0;
              if (node.phase < 0) continue;
              const timing: FlowArrival = flowArrival(node.phase, FLOW_ARRIVAL_START);
              node.opacity = timing.arrival;
              const incoming: FlowSegmentGeometry | undefined = index > 0 ? cached.segments[index - 1] : undefined;
              if (style.appearance.motion === "travel" && timing.arrival > 0)
                drawNodeEnergy(ctx, node.x, node.y, node.width, flowNodeHeight, timing.sweep, style.color, timing.arrival, incoming);
              if (style.appearance.motion !== "none" && timing.arrival > 0 && FLOW_ENERGY_STRENGTH > 0) {
                drawNodeFocus(ctx, node.x, node.y, node.width, flowNodeHeight, style.color, timing.arrival);
                const x: number = incoming?.to.x ?? node.x + 14;
                const y: number = incoming?.to.y ?? node.y + 2;
                const pulses: number = style.appearance.motion === "pulse" ? 2 : 1;
                ctx.strokeStyle = style.color;
                ctx.lineWidth = style.appearance.motion === "pulse" ? 1.8 : 1.1;
                for (let pulse: number = 0; pulse < pulses; pulse += 1) {
                  const opacity: number = pulses === 2 ? arrivalPulse(timing.sweep, pulse === 1) : timing.arrival;
                  if (opacity <= 0) continue;
                  const progress: number = pulse === 1 ? Math.max(0, (timing.sweep - 0.36) / 0.64) : timing.sweep;
                  ctx.globalAlpha = opacity * FLOW_ENERGY_STRENGTH * (pulse === 1 ? 0.65 : 1);
                  ctx.beginPath();
                  ctx.arc(x, y, 2 + progress * 7, 0, Math.PI * 2);
                  ctx.stroke();
                }
              }
            }
            ctx.fillStyle = FLOW_ACCENT;
            ctx.lineCap = "round";
            const trailCount: number = Math.round(FLOW_TRAIL_LENGTH);
            for (const segment of cached.segments) {
              const node: FlowNodeGeometry = cached.nodes[segment.nodeIndex];
              const style: { appearance: FlowStatusVisual; color: string } = styles[segment.nodeIndex];
              if (style.appearance.motion === "none" || node.phase < 0) continue;
              const timing: FlowArrival = flowArrival(node.phase, FLOW_ARRIVAL_START);
              ctx.fillStyle = style.color;
              if (timing.travel >= 0)
                drawFlowSegment(
                  ctx,
                  segment,
                  timing.travel,
                  timing.travel <= 1 ? Math.min(1, timing.travel / 0.2) : Math.max(0, 1 - (timing.travel - 1) / 0.22),
                  trailCount
                );
            }
          }}
        />
      </ZStack>
    </VStack>
  );
}

function FlowRunSummary({ jobs, status, conclusion, playing }: { jobs: Job[]; status: string; conclusion?: string | null; playing: boolean }) {
  const state: { status: string; conclusion: string | null } = { status, conclusion: conclusion ?? null };
  const icon: { systemName: string; color: string } = jobStatusIcon(state);
  const info: { text: string; color: string; backgroundColor: string } = jobStatusInfo(state);
  const appearance: FlowStatusVisual = flowStatusVisual(state);
  const summaryColor: string = icon.color;
  const stats: { completed: number; steps: number; elapsed: string; results: string } = useMemo(() => {
    const completed: number = jobs.filter((job: Job) => job.status === "completed").length;
    const steps: number = jobs.reduce((sum: number, job: Job) => sum + (job.steps?.length ?? 0), 0);
    const starts: number[] = jobs.map((job: Job) => Date.parse(job.started_at)).filter(Number.isFinite);
    const ends: number[] = jobs.map((job: Job) => (job.completed_at ? Date.parse(job.completed_at) : NaN)).filter(Number.isFinite);
    const elapsed: string =
      completed === jobs.length && starts.length === jobs.length && ends.length === jobs.length && jobs.length > 0
        ? stepElapsed({ started_at: new Date(Math.min(...starts)).toISOString(), completed_at: new Date(Math.max(...ends)).toISOString() })
        : "";
    const allSteps: JobStep[] = jobs.flatMap((job: Job) => job.steps ?? []);
    const success: number = allSteps.filter((step: JobStep) => step.status === "completed" && step.conclusion === "success").length;
    const failed: number = allSteps.filter((step: JobStep) => flowStatusVisual(step).tone === "failure").length;
    const skipped: number = allSteps.filter((step: JobStep) => step.status === "completed" && step.conclusion === "skipped").length;
    return {
      completed,
      steps,
      elapsed,
      results: t(`成功 ${success} · 失敗 ${failed} · 跳過 ${skipped}`, `成功 ${success} · 失败 ${failed} · 跳过 ${skipped}`, `Succeeded ${success} · Failed ${failed} · Skipped ${skipped}`),
    };
  }, [jobs]);
  const { completed, steps, elapsed, results } = stats;
  const active: boolean = playing && appearance.motion !== "none";
  const clock: (time: number) => number = useFlowClock(active);
  return (
    <HStack spacing={12} padding={12} frame={{ maxWidth: "infinity" }} {...glassSurface("clear", { type: "rect", cornerRadius: 18, style: "continuous" }, true)}>
      <ZStack frame={{ width: 72, height: 72 }}>
        <Canvas
          opaque={false}
          frame={{ width: 72, height: 72 }}
          accessibilityHidden
          draw={(ctx: CanvasRenderingContext): void => {
            ctx.lineCap = "round";
            ctx.strokeStyle = FLOW_ACCENT;
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = 0.15;
            ctx.beginPath();
            ctx.arc(36, 36, 27, 0, Math.PI * 2);
            ctx.stroke();
            if (completed > 0) {
              ctx.strokeStyle = icon.color;
              ctx.globalAlpha = 0.7;
              ctx.beginPath();
              ctx.arc(36, 36, 27, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * completed) / jobs.length);
              ctx.stroke();
            }
          }}
        />
        <TimelineCanvas
          opaque={false}
          paused={!active || appearance.motion === "none" || FLOW_ENERGY_STRENGTH <= 0}
          schedule={{ minimumInterval: 1 / 30 }}
          frame={{ width: 72, height: 72 }}
          accessibilityHidden
          draw={(ctx: CanvasRenderingContext, _size: { width: number; height: number }, time: number): void => {
            const clockElapsed: number = clock(time);
            if (appearance.motion !== "none" && FLOW_ENERGY_STRENGTH > 0) {
              ctx.lineCap = "round";
              const angle: number = flowPhase(clockElapsed, FLOW_CYCLE_DURATION * 3) * Math.PI * 2;
              ctx.strokeStyle = summaryColor;
              ctx.lineWidth = 1;
              ctx.globalAlpha = FLOW_ENERGY_STRENGTH * (Math.sin(angle / 2) ** 2 * 0.35);
              ctx.beginPath();
              ctx.arc(36, 36, 31, 0, Math.PI * 2);
              ctx.stroke();
            }
          }}
        />
        <VStack spacing={0}>
          <Text font={20} fontWeight="semibold" foregroundStyle="label">{`${completed}/${jobs.length}`}</Text>
          <Text font={9} foregroundStyle="secondaryLabel">{t("任務結束", "任务结束", "Jobs finished")}</Text>
        </VStack>
      </ZStack>
      <VStack alignment="leading" spacing={5} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font={12} foregroundStyle={FLOW_ACCENT}>{t("運行匯總", "运行汇总", "Run summary")}</Text>
        <HStack spacing={5}>
          <Image systemName={icon.systemName} font={18} foregroundStyle={icon.color} />
          <Text font={16} fontWeight="semibold" foregroundStyle={icon.color}>{info.text}</Text>
        </HStack>
        <Text font={12} foregroundStyle="label">{results}</Text>
        <Text font={12} foregroundStyle="secondaryLabel">{`${steps} ${t("個步驟", "个步骤", "steps")}${elapsed ? ` · ${t(`耗時 ${elapsed}`, `耗时 ${elapsed}`, `took ${elapsed}`)}` : ""}`}</Text>
      </VStack>
    </HStack>
  );
}

function ActionFlowMap({ jobs, status, conclusion, playing }: { jobs: Job[]; status: string; conclusion?: string | null; playing: boolean }) {
  return (
    <VStack alignment="leading" spacing={FLOW_NODE_SPACING} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      {jobs.map((job: Job, index: number) => (
        <CompactLane key={job.id} job={job} playing={playing} lane={index} />
      ))}
      <FlowRunSummary jobs={jobs} status={status} conclusion={conclusion} playing={playing} />
    </VStack>
  );
}

function ActionFlowGraph({ jobs, status, conclusion }: { jobs: Job[]; status: string; conclusion?: string | null }) {
  const [playing, setPlaying] = useState<boolean>(true);
  return (
    <VStack alignment="leading" spacing={FLOW_NODE_SPACING} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack>
        <Text font={12} foregroundStyle="secondaryLabel">{t("步驟電路 · 豎向自適應", "步骤电路 · 竖向自适应", "Step circuit · vertical adaptive")}</Text>
        <Spacer />
        <Button
          title={playing ? t("暫停動效", "暂停动效", "Pause animation") : t("播放動效", "播放动效", "Play animation")}
          action={() => flowAnimateChange(() => setPlaying(!playing))}
          buttonStyle={glassButtonStyle(false)}
          tint={FLOW_ACCENT}
        />
      </HStack>
      {jobs.length ? (
        <ActionFlowMap jobs={jobs} status={status} conclusion={conclusion} playing={playing} />
      ) : (
        <Text font={12} foregroundStyle="secondaryLabel">{t("等待 GitHub 分配任務", "等待 GitHub 分配任务", "Waiting for GitHub to assign a job")}</Text>
      )}
      <Text font={12} foregroundStyle="secondaryLabel">
        {t(
          "綠：成功 · 紅：失敗 · 灰虛線：跳過。箭頭表示步驟順序，進度條表示已結束占比。動效僅作演示，任務間不表示依賴。",
          "绿：成功 · 红：失败 · 灰虚线：跳过。箭头表示步骤顺序，进度条表示已结束占比。动效仅作演示，任务间不表示依赖。",
          "Green: success · Red: failure · Grey dashed: skipped. Arrows show step order; the bar shows the finished share. Animation is illustrative only; jobs do not depend on each other."
        )}
      </Text>
    </VStack>
  );
}

// 「顯示運行流程圖」開關（參考腳本 RunDetailFlow.tsx）：存在 Storage，
// 鍵跟參考腳本一樣（github_actions_run_flow_enabled_v1），預設開。
const FLOW_VISIBILITY_KEY = "github_actions_run_flow_enabled_v1";

function RunDetailFlow({
  run,
  jobs,
  loading = false,
  error = "",
  showMessages = true,
}: {
  run: Pick<Run, "id" | "status" | "conclusion">;
  jobs: Job[];
  loading?: boolean;
  error?: string;
  showMessages?: boolean;
}) {
  const [enabled, setEnabled] = useState<boolean>(() => storageGet(FLOW_VISIBILITY_KEY) !== "false");
  function change(next: boolean): void {
    if (next === enabled) return;
    storageSet(FLOW_VISIBILITY_KEY, next ? "true" : "false");
    setEnabled(next);
  }
  return (
    <VStack alignment="leading" spacing={10} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Toggle title={t("顯示運行流程圖", "显示运行流程图", "Show run flow diagram")} value={enabled} onChanged={change} toggleStyle="switch" tint={FLOW_ACCENT} />
      {enabled ? (
        <VStack alignment="leading" spacing={6}>
          {showMessages && loading ? (
            <Text font={13} foregroundStyle="secondaryLabel">{t("正在載入運行任務…", "正在载入运行任务…", "Loading run jobs…")}</Text>
          ) : null}
          {showMessages && error ? (
            <Text font={13} foregroundStyle="#b42318">
              {error}
              {jobs.length ? t("（流程圖保留上次成功載入的數據）", "（流程图保留上次成功载入的数据）", " (flow diagram keeps the last loaded data)") : ""}
            </Text>
          ) : null}
          {showMessages && !loading && !error && jobs.length === 0 ? (
            <Text font={13} foregroundStyle="secondaryLabel">
              {run.status === "completed" ? t("本次運行暫無任務可展示。", "本次运行暂无任务可展示。", "This run has no jobs to show.") : t("暫無任務，等待 GitHub 分配任務。", "暂无任务，等待 GitHub 分配任务。", "No jobs yet, waiting for GitHub to assign one.")}
            </Text>
          ) : null}
          {jobs.length > 0 ? <ActionFlowGraph key={run.id} jobs={jobs} status={run.status} conclusion={run.conclusion} /> : null}
        </VStack>
      ) : null}
    </VStack>
  );
}

function RunStepRow({ step, numberWidth }: { step: JobStep; numberWidth: number }) {
  const status: ReturnType<typeof jobStatusInfo> = jobStatusInfo(step);
  const icon: { systemName: string; color: string } = jobStatusIcon(step);
  const duration: string | null = durationText(step.started_at, step.completed_at || undefined);
  return (
    <HStack spacing={6} alignment="center" frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Text font={11} foregroundStyle="secondaryLabel" frame={{ width: numberWidth, alignment: "trailing" }}>{`${step.number}.`}</Text>
      <Image systemName={icon.systemName} width={12} height={12} foregroundStyle={icon.color} />
      <Text font={12} foregroundStyle="label" lineLimit={1} frame={{ maxWidth: "infinity", alignment: "leading" }}>{step.name}</Text>
      <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1} frame={{ width: 11 * 3.5, alignment: "trailing" }}>{status.text}</Text>
      <Text font={11} foregroundStyle="secondaryLabel" lineLimit={1} frame={{ width: 11 * 5, alignment: "trailing" }}>{duration || "—"}</Text>
    </HStack>
  );
}

function RunDetailHeader({
  run,
  jobs,
  content,
  loading,
  error,
  owner,
  repo,
}: {
  run: Run;
  jobs: Job[];
  content: RunDetailContent;
  loading: boolean;
  error: string;
  owner: string;
  repo: string;
}) {
  const icon: { systemName: string; color: string } = runStatusIcon(run);
  const info: { text: string; color: string; backgroundColor: string } = runStatusInfo(run);
  const focusColor: string = content.focus.tone === "failure" ? "#ff3b30" : FLOW_ACCENT;
  const author: string | undefined = run.head_commit?.author?.name || run.head_commit?.committer?.name;
  const actorLogin: string = run.actor?.login || "";
  return (
    <GlassCard>
      <HStack spacing={8}>
        <Image systemName={icon.systemName} font={22} foregroundStyle={icon.color} />
        <Text font={22} fontWeight="bold" foregroundStyle="label" frame={{ maxWidth: "infinity", alignment: "leading" }}>
          {t(`運行 #${run.run_number}`, `运行 #${run.run_number}`, `Run #${run.run_number}`)}
        </Text>
        <Text font={13} fontWeight="semibold" foregroundStyle={icon.color}>{info.text}</Text>
      </HStack>
      <Text font={12} foregroundStyle="secondaryLabel">{run.repository?.full_name || `${owner}/${repo}`}</Text>
      <Text font={16} fontWeight="semibold" foregroundStyle="label" lineLimit={2}>{run.display_title || run.name}</Text>
      <HStack spacing={6}>
        <Image systemName="arrow.triangle.branch" foregroundStyle={FLOW_ACCENT} font={13} />
        <Text font={13} foregroundStyle="label" frame={{ maxWidth: "infinity", alignment: "leading" }}>
          {run.head_branch || t("未知分支", "未知分支", "Unknown branch")}
        </Text>
        <Text font={12} foregroundStyle="secondaryLabel">{run.head_sha?.slice(0, 7) || ""}</Text>
      </HStack>
      <Text font={12} foregroundStyle="secondaryLabel">
        {`${actorLogin} · ${run.event} · ${t(`第 ${run.run_attempt} 次嘗試`, `第 ${run.run_attempt} 次尝试`, `Attempt ${run.run_attempt}`)}`}
      </Text>
      {content.commit ? (
        <Text font={13} foregroundStyle="secondaryLabel" lineLimit={3}>{content.commit}</Text>
      ) : null}
      {author ? (
        <Text font={12} foregroundStyle="secondaryLabel">
          {`${author}${run.head_commit?.timestamp ? ` · ${formatShortTime(run.head_commit.timestamp)}` : ""}`}
        </Text>
      ) : null}
      {loading ? (
        <Text font={12} foregroundStyle="secondaryLabel">{t("正在讀取任務與步驟…", "正在读取任务与步骤…", "Loading jobs and steps…")}</Text>
      ) : jobs.length ? (
        <Text font={12} foregroundStyle="secondaryLabel">
          {t(
            `已加載 ${jobs.length} 個任務 · 已結束 ${content.completedJobs} · ${content.steps} 個步驟`,
            `已载入 ${jobs.length} 个任务 · 已结束 ${content.completedJobs} · ${content.steps} 个步骤`,
            `Loaded ${jobs.length} jobs · ${content.completedJobs} finished · ${content.steps} steps`
          )}
        </Text>
      ) : null}
      {!loading && content.steps > 0 ? (
        <Text font={12} foregroundStyle="secondaryLabel">
          {t(
            `步驟：成功 ${content.success} · 失敗或需關注 ${content.failed} · 跳過 ${content.skipped}`,
            `步骤：成功 ${content.success} · 失败或需关注 ${content.failed} · 跳过 ${content.skipped}`,
            `Steps: ${content.success} succeeded · ${content.failed} failed or needs attention · ${content.skipped} skipped`
          )}
        </Text>
      ) : null}
      {!loading ? (
        <VStack alignment="leading" spacing={4} padding={{ top: 4 }} frame={{ maxWidth: "infinity", alignment: "leading" }}>
          <Text font={12} fontWeight="semibold" foregroundStyle={focusColor}>{content.focus.title}</Text>
          {content.focus.lines.map((line: string, index: number) => (
            <Text key={index} font={13} foregroundStyle={content.focus.tone === "neutral" ? "secondaryLabel" : "label"}>{line}</Text>
          ))}
        </VStack>
      ) : null}
      {error ? (
        <Text font={12} foregroundStyle="#ff3b30">
          {t(
            `刷新未完成：${error}${jobs.length ? "；任務內容保留上次數據" : ""}`,
            `刷新未完成：${error}${jobs.length ? "；任务内容保留上次数据" : ""}`,
            `Refresh incomplete: ${error}${jobs.length ? "; showing last loaded jobs" : ""}`
          )}
        </Text>
      ) : null}
    </GlassCard>
  );
}

function RunDetailMetadata({ run, content, owner, repo }: { run: Run; content: RunDetailContent; owner: string; repo: string }) {
  const now: number = useRunElapsed(run.status === "in_progress");
  const duration: string | null = durationText(content.durationStart, content.end);
  const elapsed: string | null =
    run.status !== "completed" && run.run_started_at ? durationText(run.run_started_at, new Date(now).toISOString()) : "";
  const trigger: string | undefined = run.triggering_actor?.login !== run.actor?.login ? run.triggering_actor?.login : undefined;
  return (
    <VStack spacing={8} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <GlassCard>
        <HStack spacing={6}>
          <Image systemName="clock.fill" foregroundStyle={FLOW_ACCENT} font={14} />
          <Text font={13} fontWeight="semibold" foregroundStyle="secondaryLabel">{t("運行時間", "运行时间", "Run time")}</Text>
        </HStack>
        <InfoRow label={t("創建", "创建", "Created")} value={formatTime(run.created_at)} subtitle={timeAgoText(run.created_at)} />
        <InfoRow label={t("開始", "开始", "Started")} value={formatTime(run.run_started_at)} />
        <InfoRow
          label={content.inferredEnd ? t("最後任務結束", "最后任务结束", "Last job finished") : t("完成", "完成", "Completed")}
          value={
            content.end
              ? formatTime(content.end)
              : run.status === "completed"
                ? t("未提供", "未提供", "Not provided")
                : run.status === "in_progress"
                  ? t("進行中", "进行中", "In progress")
                  : t("尚未開始", "尚未开始", "Not started yet")
          }
        />
        <InfoRow
          label={content.inferredEnd ? t("任務時間跨度", "任务时间跨度", "Job time span") : t("耗時", "耗时", "Duration")}
          value={duration || (elapsed ? t(`已運行約 ${elapsed}`, `已运行约 ${elapsed}`, `Running for about ${elapsed}`) : t("未提供", "未提供", "Not provided"))}
        />
        {content.inferredEnd ? (
          <Text font={12} foregroundStyle="secondaryLabel">
            {t(
              "運行接口未提供完成時間；以上按已加載任務的起止時間計算。",
              "运行接口未提供完成时间；以上按已载入任务的起止时间计算。",
              "The run API did not provide a completion time; the above is calculated from the loaded jobs’ start and end times."
            )}
          </Text>
        ) : null}
        <InfoRow label={t("更新", "更新", "Updated")} value={formatTime(run.updated_at)} subtitle={timeAgoText(run.updated_at)} />
      </GlassCard>
      <GlassCard>
        <HStack spacing={6}>
          <Image systemName="info.circle.fill" foregroundStyle={FLOW_ACCENT} font={14} />
          <Text font={13} fontWeight="semibold" foregroundStyle="secondaryLabel">{t("工作流與來源", "工作流与来源", "Workflow and source")}</Text>
        </HStack>
        <InfoRow label={t("工作流", "工作流", "Workflow")} value={run.name || String(run.workflow_id)} />
        <InfoRow label={t("倉庫", "仓库", "Repository")} value={run.repository?.full_name || `${owner}/${repo}`} />
        {run.repository?.default_branch ? <InfoRow label={t("預設分支", "默认分支", "Default branch")} value={run.repository.default_branch} /> : null}
        {run.path ? <InfoRow label={t("文件", "文件", "File")} value={run.path} /> : null}
        {trigger ? <InfoRow label={t("實際觸發", "实际触发", "Triggered by")} value={trigger} /> : null}
        {run.check_suite_id ? <InfoRow label="Check Suite" value={`#${run.check_suite_id}`} /> : null}
        {run.pull_requests?.length ? (
          <InfoRow
            label={t("關聯 PR", "关联 PR", "Linked PRs")}
            value={run.pull_requests.map((pr: { number: number }): string => `#${pr.number}`).join(", ")}
          />
        ) : null}
      </GlassCard>
    </VStack>
  );
}

function RunDetailPage({
  api,
  owner,
  repo,
  run: initialRun,
}: {
  api: GitHubAPI
  owner: string
  repo: string
  run: Run
}) {
  // 原本這裡的 run 是傳進來的快照，永遠不會更新，所以詳情頁就算執行結束
  // 也看不到完成狀態；現在改成會輪詢執行本身，結束時通知一次。
  const [run, setRun] = useState(initialRun)
  const [jobs, setJobs] = useState<Job[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)
  const [jobsError, setJobsError] = useState('')
  const [finishNotice, setFinishNotice] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    let cancelled = false
    // 已經通知過的執行不再重複通知：進頁面時如果已完成，就代表不是「剛結束」，不通知。
    // 用 effect 內的變數而非 state，因為 setRun 不會讓這個 effect 重跑，
    // 若只靠第一次的快照，每次輪詢都會再通知一次。
    let notifiedThisPage = storageGet(`notified_run_${initialRun.id}`) === '1'
    let timer: ReturnType<typeof setInterval> | null = null
    if (initialRun.status !== 'completed') void acquireBackgroundKeepAlive()
    const loadAll = async () => {
      // 2026-11-07：任務跟執行狀態並行抓。兩個請求本來是循序等（時間相加），
      // 現在同時打，只算最慢的那一個；執行狀態那條失敗就下次輪詢再試，
      // 不影響任務顯示。已完成的執行不用再查狀態。
      const runPromise = initialRun.status === 'completed'
        ? Promise.resolve<Run | null>(null)
        : api.getRun(owner, repo, initialRun.id).catch(() => null)
      try {
        const data = await api.getRunJobs(owner, repo, initialRun.id)
        if (!cancelled) {
          setJobs(data)
          setJobsLoading(false)
        }
      } catch (err: any) {
        if (!cancelled) {
          setJobsError(errorMessage(err, t("任務載入失敗","任务载入失败","Failed to load jobs")))
          setJobsLoading(false)
        }
      }
      const latest = await runPromise
      if (!latest || cancelled) return
      setRun(latest)
      if (latest.status === 'completed' && !notifiedThisPage) {
        notifiedThisPage = true
        storageSet(`notified_run_${initialRun.id}`, '1')
        const sent = await sendRunNotification(latest, latest.repository?.full_name || `${owner}/${repo}`)
        setFinishNotice(sent
          ? runFinishNotice(latest)
          : { text: t(`⚠️ 執行已完成：${runConclusionText(latest.conclusion)} — #${latest.run_number}，但系統通知發送失敗，請檢查「設定 > 通知 > Scripting」`, `⚠️ 运行已完成：${runConclusionText(latest.conclusion)} — #${latest.run_number}，但系统通知发送失败，请检查「设置 > 通知 > Scripting」`, `⚠️ Run completed: ${runConclusionText(latest.conclusion)} — #${latest.run_number}, but the notification could not be sent. Check Settings > Notifications > Scripting.`), ok: false })
        Widget.reloadAll()
        if (timer) clearInterval(timer)
        void releaseBackgroundKeepAlive()
      }
    }
    loadAll()
    if (initialRun.status !== 'completed') {
      timer = setInterval(loadAll, 10000)
    }
    return () => {
      cancelled = true
      if (timer) clearInterval(timer)
      void releaseBackgroundKeepAlive()
    }
  }, [api, owner, repo, initialRun.id, initialRun.status])

  // v2.0.0：詳情摘要改走參考腳本的 describeRunDetail（任務／步驟統計、
  // 執行結果 focus、commit、推斷結束時間），其餘輪詢／通知邏輯一字不動。
  const content: RunDetailContent = useMemo((): RunDetailContent => describeRunDetail(run, jobs), [run, jobs])
  const stepDigits: number = useMemo((): number => runDetailStepDigits(jobs), [jobs])
  const numberWidth: number = 11 * (stepDigits + 1) * 0.7

  return (
    <ScrollView
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
      navigationTitle={t("運行詳情", "运行详情", "Run detail")}
      navigationBarTitleDisplayMode="inline"
      background={<GlassBackground />}
    >
      {/* v2.0.0：ScrollView 本體的 frame＋內層 VStack 的 maxWidth／
        maxHeight infinity 是 v1.3.11／12 修黑屏的關鍵，絕對不要拿掉。
        註解不能寫在 return ( 和 ScrollView 之間（會被當成空物件）。 */}
      <VStack padding={{ horizontal: 12, top: 8, bottom: 28 }} spacing={8} alignment="leading" frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}>
        {finishNotice ? <Text style={{ fontSize: 14, fontWeight: '600', color: finishNotice.ok ? '#34c759' : '#ff3b30' }}>{finishNotice.text}</Text> : null}
        <RunDetailHeader run={run} jobs={jobs} content={content} loading={jobsLoading} error={jobsError} owner={owner} repo={repo} />
        <RunDetailFlow key={run.id} run={run} jobs={jobs} loading={jobsLoading} error={jobsError} showMessages={false} />
        <Card>
          <HStack spacing={6} alignment="center">
            <Image systemName="list.bullet.rectangle.fill" width={14} height={14} foregroundStyle="#0a84ff" />
            <Text font={13} fontWeight="semibold" foregroundStyle="secondaryLabel">
              {jobsLoading ? t("任務明細", "任务明细", "Job details") : t(`任務明細 · ${jobs.length}`, `任务明细 · ${jobs.length}`, `Job details · ${jobs.length}`)}
            </Text>
          </HStack>
          {jobsLoading ? <Text font={13} foregroundStyle="secondaryLabel">{t("載入中...", "载入中...", "Loading...")}</Text> : null}
          {jobsError ? <Text font={13} foregroundStyle="#b42318">{jobsError}</Text> : null}
          {!jobsLoading && !jobsError && jobs.length === 0 ? (
            <Text font={13} foregroundStyle="secondaryLabel">{t("暫無任務", "暂无任务", "No jobs")}</Text>
          ) : null}
          {jobs.map((job: Job, index: number) => {
            const jobInfo = jobStatusInfo(job)
            const jobIcon = jobStatusIcon(job)
            const jobDuration = durationText(job.started_at, job.completed_at || undefined)
            const runner = job.runner_name || (job.labels && job.labels.length ? job.labels.join(" / ") : null)
            return (
              <VStack key={job.id} alignment="leading" spacing={5}>
                <HStack spacing={8} alignment="center">
                  <Image systemName={jobIcon.systemName} width={14} height={14} foregroundStyle={jobIcon.color} />
                  <Text font={14} fontWeight="medium" foregroundStyle="label" frame={{ maxWidth: "infinity", alignment: "leading" }}>{job.name}</Text>
                  <Text font={12} foregroundStyle={jobIcon.color}>{jobInfo.text}</Text>
                </HStack>
                {jobDuration || runner ? (
                  <Text font={12} foregroundStyle="secondaryLabel">{[jobDuration, runner].filter(Boolean).join(" · ")}</Text>
                ) : null}
                {job.steps && job.steps.length > 0 ? (
                  <VStack alignment="leading" spacing={3}>
                    {job.steps.map((step: JobStep) => (
                      <RunStepRow key={step.number} step={step} numberWidth={numberWidth} />
                    ))}
                  </VStack>
                ) : (
                  <Text font={12} foregroundStyle="secondaryLabel">{t("暫無步驟明細", "暂无步骤明细", "No step details")}</Text>
                )}
                {index < jobs.length - 1 ? <HStack frame={{ maxWidth: "infinity", height: 1 }} background="#e5e7eb" /> : null}
              </VStack>
            )
          })}
        </Card>
        <RunDetailMetadata run={run} content={content} owner={owner} repo={repo} />
      </VStack>
    </ScrollView>
  )
}

// Exported for the unified launcher. The account list is shared by all modules.
export function ActionView({ titleMenu, onExit, embedded }: { titleMenu?: any; onExit?: () => void; embedded?: boolean } = {}) {
  // v1.3.7：帳號改成第一次渲染就同步從 Storage 讀（跟 Repository 首頁
  // 同一套寫法：useState(() => loadAccounts())）。之前是 useState([])
  // + useEffect 補讀，模組一切回來、第一次渲染先回一個沒有底色的
  // 「載入中...」Text 再換成首頁，閃一下；RepoListPage 的檔案層級快取
  // 再完整也被這一層擋住——快取根本沒機會在第一次渲染就畫出來。
  // 現在第一次渲染就直接是首頁，不再閃。migrateAccounts() 是同步讀
  // Storage（舊鍵第一次遷移時會寫一次，跟以前 effect 裡做的事一樣）。
  const [accounts, setAccounts] = useState<Account[]>(() => {
    try { return migrateAccounts() } catch (_) { return [] }
  })

  useEffect(() => {
    // 舊鍵同步：掛載時把舊的單一帳號鍵對齊到清單第一個帳號。
    // migrateAccounts() 已經做過一次了，這裡只補「舊鍵跟第一個帳號
    // 對不起來」的情況，不影響畫面。
    try {
      const list = migrateAccounts()
      if (list.length > 0) {
        const legacyToken = storageGet('github_token')
        if (legacyToken !== list[0].token) saveAccounts(list)
      }
    } catch (_) { }
  }, [])

  // 全域追蹤：主程式裡面觸發的執行（執行紀錄頁寫的 run_watch），主程式打開時
  // 就算不在那個工作流程的執行紀錄頁，這裡也會追蹤它、完成時發通知。
  // 執行紀錄頁自己的追蹤還在，兩邊用 notified_run_<id> 去重，不會通知兩次。
  // v1.5.4：小工具觸發不再追蹤、不再通知（使用者要求），所以 Intent 不再寫
  // 追蹤，這裡也不再追蹤 widget_run_watches；打開主程式時會把 v1.5.2 留下的
  // 舊追蹤清單清掉，避免舊追蹤還發通知。
  // 背景保持的旗標：追蹤空了就釋放並把旗標歸零，下一個追蹤可以重新取得
  // （v1.5.2 修過：之前完成釋放後旗標還停在 true，之後就再也拿不到保持）。
  // 限制要先講清楚：這只能在主程式還開著（或最小化在背景、背景保持還在）
  // 時追蹤；主程式完全關掉後，追蹤就停了，要等下次打開主程式才會恢復
  // 追蹤（90 分鐘內的 watch 才有效），所以主程式裡按了執行後如果主程式
  // 一直沒開，通知就會晚到，不會像系統推播那樣即時。
  useEffect(() => {
    let cancelled = false
    let keeperReleased = false
    let keeperAcquired = false
    const releaseKeeper = () => {
      if (!keeperReleased) {
        keeperReleased = true
        void releaseBackgroundKeepAlive()
      }
    }
    const resetKeeper = () => {
      keeperAcquired = false
      keeperReleased = false
      void releaseBackgroundKeepAlive()
    }
    const readWatch = (): (RunWatch & { accountUsername?: string }) | null => {
      try {
        const raw = storageGet('run_watch')
        if (!raw) return null
        const w = JSON.parse(raw) as RunWatch & { accountUsername?: string }
        if (!w.owner || !w.repo || !w.workflowId) return null
        if (typeof w.since !== 'number' || !Array.isArray(w.beforeIds)) return null
        if (Date.now() - w.since > RUN_WATCH_MAX_MS) {
          storageRemove('run_watch')
          return null
        }
        return w
      } catch (_) {
        return null
      }
    }
    const accountForWatch = (w: RunWatch & { accountUsername?: string }): Account | null => {
      const accounts = loadAccounts()
      if (w.accountUsername) {
        const acc = accounts.find((a) => a.username.toLowerCase() === w.accountUsername!.toLowerCase())
        if (acc) return acc
      }
      return getAccountForWidgetTarget(`${w.owner}/${w.repo}/${w.workflowId}`)
    }
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const poll = async () => {
      if (cancelled) return
      const watch = readWatch()
      if (!watch) {
        // 沒有追蹤時每 30 秒看一次 Storage；同時把背景保持歸零，下次追蹤能重拿。
        resetKeeper()
        timeoutId = setTimeout(poll, 30000)
        return
      }
      if (!keeperAcquired) {
        keeperAcquired = true
        void acquireBackgroundKeepAlive()
      }
      const account = accountForWatch(watch)
      if (!account) {
        timeoutId = setTimeout(poll, 30000)
        return
      }
      try {
        const api = new GitHubAPI(account)
        const runs = await api.getWorkflowRuns(watch.owner, watch.repo, watch.workflowId)
        const candidate = runs
          .filter((r) => !watch.beforeIds.includes(r.id))
          .sort((a, b) => b.run_number - a.run_number)[0]
        if (candidate && candidate.status === 'completed' && !cancelled) {
          if (storageGet(`notified_run_${candidate.id}`) !== '1') {
            storageSet(`notified_run_${candidate.id}`, '1')
            await sendRunNotification(candidate, `${watch.owner}/${watch.repo}`)
          }
          storageRemove('run_watch')
          resetKeeper()
          timeoutId = setTimeout(poll, 30000)
          return
        }
      } catch (_) { /* 下一輪再試 */ }
      timeoutId = setTimeout(poll, RUN_POLL_INTERVAL_MS)
    }
    // v1.5.4：清掉 v1.5.2 留下的小工具追蹤清單，避免舊追蹤還發通知。
    try { storageRemove('widget_run_watches') } catch (_) { }
    void poll()
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      releaseKeeper()
    }
  }, [])

  const handleFirstLogin = (authData: { token: string; username: string }) => {
    const list = [{ username: authData.username, token: authData.token }]
    saveAccounts(list)
    setAccounts(list)
  }

  const handleAccountsChanged = (next: Account[]) => {
    saveAccounts(next)
    setAccounts(next)
  }

  if (accounts.length === 0) return <LoginPage onLogin={handleFirstLogin} />

  // v1.3.10：拿掉這裡自己的 NavigationStack。之前 ActionView 在 app.tsx
  // 外層 NavigationStack 裡面又包了一層自己的 stack（全專案只有 Actions
  // 模組這樣，Repository／Gist 都是直接用外層那個）；原版獨立腳本也是
  // 只有一個 stack。詳情頁（RunDetailPage）的程式跟原版一模一樣、helper
  // 和 API 也都對過沒差別，卻還是在這裡推上去就灰屏，唯一剩下的結構差異
  // 就是這層巢狀 stack——v1.3.7 歷史頁的前例也是 stack 位置不對造成
  // 詳情黑屏。拿掉之後 Actions 跟其他兩個模組一樣，直接用外層的 stack
  // 推 WorkflowListPage → RunListPage → RunDetailPage。模組切換只在
  // 首頁（toolbarTitleMenu 只掛在首頁）才能按，那時外層 stack 路徑是
  // 空的，所以不會有切模組後還留著舊的推頁問題。
  return (
    <RepoListPage accounts={accounts} onAccountsChanged={handleAccountsChanged} titleMenu={titleMenu} onExit={onExit} embedded={embedded} />
  )
}


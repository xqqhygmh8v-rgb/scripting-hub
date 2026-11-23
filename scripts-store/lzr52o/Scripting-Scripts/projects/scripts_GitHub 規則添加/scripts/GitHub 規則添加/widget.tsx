import {
  Widget,
  VStack,
  HStack,
  Text,
  Spacer,
  Image,
  type Color,
} from "scripting"
import { HeatmapGrid } from "./components/heatmap_grid"
import { getLevelColor } from "./utils/colors"
import { getWidgetConfig } from "./utils/widget_config"
import { fetchCommitActivity } from "./services/commit_api"
import { t } from "./components/i18n"
import { ContributionDay, ContributionLevel, ContributionWeek } from "./types"

type DynamicColor = { light: Color; dark: Color }

const palette = {
  text: { light: "#0f1720", dark: "#f0f6fc" } as DynamicColor,
  textSoft: { light: "#57606a", dark: "#8b949e" } as DynamicColor,
  accent: { light: "#1f883d", dark: "#3fb950" } as DynamicColor,
  error: { light: "#cf222e", dark: "#ff7b72" } as DynamicColor,
  panel: { light: "#ffffff", dark: "#0d1117" } as DynamicColor,
}

// =============== 時段切片 & level 重算 ===============

function toDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`)
}

function flattenSortedDays(weeks: ContributionWeek[]): ContributionDay[] {
  const all = weeks.flat()
  all.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return all
}

function computeLevel(count: number, max: number): ContributionLevel {
  if (count <= 0 || max <= 0) return 0
  const r = count / max
  if (r > 0.75) return 4
  if (r > 0.5) return 3
  if (r > 0.25) return 2
  return 1
}

/** 按自然周（週日起）把 [start, end] 區間內的天數重組為 weeks，並根據區間內 max 重算 level */
function buildWeeksInRange(
  allDays: ContributionDay[],
  start: Date,
  end: Date,
): ContributionWeek[] {
  const startStr = start.toISOString().slice(0, 10)
  const endStr = end.toISOString().slice(0, 10)
  const inRange = allDays.filter(d => d.date >= startStr && d.date <= endStr)
  const byDate = new Map(inRange.map(d => [d.date, d] as const))

  // 找到 start 所在自然周的週日
  const firstSunday = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  firstSunday.setUTCDate(firstSunday.getUTCDate() - firstSunday.getUTCDay())

  const maxCount = inRange.reduce((m, d) => Math.max(m, d.count), 0)

  const weeks: ContributionWeek[] = []
  const cursor = new Date(firstSunday)
  while (cursor <= end) {
    const week: ContributionDay[] = []
    for (let i = 0; i < 7; i++) {
      const dateStr = cursor.toISOString().slice(0, 10)
      if (dateStr >= startStr && dateStr <= endStr) {
        const found = byDate.get(dateStr)
        week.push({
          date: dateStr,
          count: found?.count ?? 0,
          level: computeLevel(found?.count ?? 0, maxCount),
        })
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    if (week.length > 0) weeks.push(week)
  }
  return weeks
}

function monthRange(now: Date): { start: Date; end: Date; label: string } {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth()
  const start = new Date(Date.UTC(year, month, 1))
  const end = new Date(Date.UTC(year, month + 1, 0))
  return { start, end, label: t(`${year} 年 ${month + 1} 月`, `${year} 年 ${month + 1} 月`, `${year}-${month + 1}`) }
}

/** 近半年：今天往前推 26 周 */
function halfYearRange(now: Date): { start: Date; end: Date; label: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 26 * 7 + 1)
  return { start, end, label: t('近半年', '近半年', 'Last 6 Months') }
}

function yearRange(now: Date): { start: Date; end: Date; label: string } {
  const year = now.getUTCFullYear()
  const start = new Date(Date.UTC(year, 0, 1))
  // end 截到今天，避免網格里生成大量未來空格
  const end = new Date(Date.UTC(year, now.getUTCMonth(), now.getUTCDate()))
  return { start, end, label: t(`${year} 年`, `${year} 年`, `${year}`) }
}

// =============== 統計 ===============

function totalCount(weeks: ContributionWeek[]) {
  return weeks.flat().reduce((sum, d) => sum + d.count, 0)
}

function activeDayCount(weeks: ContributionWeek[]) {
  return weeks.flat().filter(d => d.count > 0).length
}

function currentStreak(allSortedDays: ContributionDay[]) {
  let streak = 0
  for (let i = allSortedDays.length - 1; i >= 0; i--) {
    if (allSortedDays[i].count > 0) streak++
    else break
  }
  return streak
}

function lastActiveLabel(allSortedDays: ContributionDay[]) {
  for (let i = allSortedDays.length - 1; i >= 0; i--) {
    if (allSortedDays[i].count > 0) {
      const d = toDate(allSortedDays[i].date)
      const diff = Math.floor((Date.now() - d.getTime()) / 86400000)
      if (diff <= 0) return t('今天', '今天', 'Today')
      if (diff === 1) return t('昨天', '昨天', 'Yesterday')
      if (diff < 7) return t(`${diff} 天前`, `${diff} 天前`, `${diff} days ago`)
      if (diff < 30) return t(`${Math.floor(diff / 7)} 周前`, `${Math.floor(diff / 7)} 周前`, `${Math.floor(diff / 7)} weeks ago`)
      return t(`${Math.floor(diff / 30)} 月前`, `${Math.floor(diff / 30)} 月前`, `${Math.floor(diff / 30)} months ago`)
    }
  }
  return t('無記錄', '无记录', 'No Records')
}

function bestDay(weeks: ContributionWeek[]) {
  const days = weeks.flat()
  let best: ContributionDay | null = null
  for (const d of days) if (!best || d.count > best.count) best = d
  return best && best.count > 0 ? best : null
}

// =============== 通用組件 ===============

function Header({
  repoLabel,
  subtitle,
}: {
  repoLabel: string
  subtitle: string
}) {
  return (
    <HStack spacing={6} frame={{ maxWidth: Infinity }}>
      <Image systemName="chart.bar.doc.horizontal" font="caption" foregroundStyle={palette.accent} />
      <VStack alignment="leading" spacing={1}>
        <Text font="caption" fontWeight="bold" foregroundStyle={palette.text} lineLimit={1}>
          {repoLabel}
        </Text>
        <Text font="caption2" foregroundStyle={palette.textSoft} lineLimit={1}>
          {subtitle}
        </Text>
      </VStack>
      <Spacer />
    </HStack>
  )
}

/** 緊湊指標：左 label 右 value，一行 */
function InlineStat({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <HStack spacing={4} frame={{ maxWidth: Infinity }}>
      <Text font="caption2" foregroundStyle={palette.textSoft} lineLimit={1}>
        {label}
      </Text>
      <Spacer />
      <Text
        font="caption"
        fontWeight="bold"
        foregroundStyle={accent ? palette.accent : palette.text}
        lineLimit={1}
      >
        {value}
      </Text>
    </HStack>
  )
}

/** 卡片式堆疊指標：上 label 下 value，兩行 */
function StackStat({
  label,
  value,
  accent = false,
  valueFont = "footnote",
}: {
  label: string
  value: string
  accent?: boolean
  valueFont?: "caption" | "footnote" | "subheadline" | "body"
}) {
  return (
    <VStack alignment="leading" spacing={2} frame={{ maxWidth: Infinity }}>
      <Text font="caption2" foregroundStyle={palette.textSoft} lineLimit={1}>
        {label}
      </Text>
      <Text
        font={valueFont}
        fontWeight="bold"
        foregroundStyle={accent ? palette.accent : palette.text}
        lineLimit={1}
      >
        {value}
      </Text>
    </VStack>
  )
}

// =============== Small：當月 ===============

/** 截斷長字符串，保留頭尾，中間省略 */
function truncateMiddle(s: string, max: number): string {
  if (s.length <= max) return s
  const keep = Math.max(1, Math.floor((max - 1) / 2))
  return `${s.slice(0, keep)}…${s.slice(-keep)}`
}

/** 取路徑最後一段，避免顯示深路徑 */
function basename(p: string): string {
  const segs = p.split("/").filter(Boolean)
  return segs[segs.length - 1] ?? ""
}

function SmallView({
  repoName,
  pathLabel,
  allDays,
}: {
  repoName: string
  pathLabel: string
  allDays: ContributionDay[]
}) {
  const now = new Date()
  const { start, end, label } = monthRange(now)
  const weeks = buildWeeksInRange(allDays, start, end)
  const total = totalCount(weeks)
  const active = activeDayCount(weeks)
  const streak = currentStreak(allDays)

  // 小號內部高度約 130pt：header(~14) + heatmap(~60) + stats(~42) + spacing = ~120，留安全邊
  const repoDisplay = truncateMiddle(repoName, 14)

  return (
    <VStack alignment="leading" spacing={5} padding={10} frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <HStack spacing={4} frame={{ maxWidth: Infinity }}>
        <Image
          systemName="chart.bar.doc.horizontal"
          font="caption2"
          foregroundStyle={palette.accent}
        />
        <Text
          font="caption2"
          fontWeight="bold"
          foregroundStyle={palette.text}
          lineLimit={1}
          minimumScaleFactor={0.6}
        >
          {repoDisplay}
        </Text>
        <Spacer />
        <Text
          font="caption2"
          foregroundStyle={palette.textSoft}
          lineLimit={1}
          minimumScaleFactor={0.7}
        >
          {t(`${now.getUTCMonth() + 1}月`, `${now.getUTCMonth() + 1}月`, `${now.getUTCMonth() + 1}`)}
        </Text>
      </HStack>

      <HStack frame={{ maxWidth: Infinity }}>
        <Spacer />
        <HeatmapGrid
          weeks={weeks}
          getLevelColor={getLevelColor}
          cellSize={8}
          spacing={2}
          cornerRadius={1.8}
        />
        <Spacer />
      </HStack>

      <Spacer />

      <VStack alignment="leading" spacing={2} frame={{ maxWidth: Infinity }}>
        <InlineStat label={t('本月', '本月', 'This Month')} value={t(`${total} 次`, `${total} 次`, `${total}`)} accent />
        <InlineStat label={t('活躍', '活跃', 'Active')} value={t(`${active} 天`, `${active} 天`, `${active}`)} />
        <InlineStat label={t('連續', '连续', 'Streak')} value={t(`${streak} 天`, `${streak} 天`, `${streak}`)} />
      </VStack>
    </VStack>
  )
}

// =============== Medium：近半年 ===============

function MediumView({
  repoLabel,
  allDays,
}: {
  repoLabel: string
  allDays: ContributionDay[]
}) {
  const now = new Date()
  const { start, end, label } = halfYearRange(now)
  const weeks = buildWeeksInRange(allDays, start, end)
  const total = totalCount(weeks)
  const active = activeDayCount(weeks)
  const streak = currentStreak(allDays)
  const peak = bestDay(weeks)
  const lastActive = lastActiveLabel(allDays)

  // 中號內部寬度 ~305pt；~27 列 × cellSize=8 + spacing=2 = 268pt，鋪滿一條
  return (
    <VStack alignment="leading" spacing={8} padding={12}>
      <Header repoLabel={repoLabel} subtitle={label} />
      <HeatmapGrid
        weeks={weeks}
        getLevelColor={getLevelColor}
        cellSize={8}
        spacing={2}
        cornerRadius={1.8}
      />
      <Spacer />
      <HStack spacing={12} alignment="top" frame={{ maxWidth: Infinity }}>
        <StackStat label={t('近半年', '近半年', 'Last 6 Months')} value={`${total}`} accent valueFont="subheadline" />
        <StackStat label={t('活躍', '活跃', 'Active')} value={t(`${active} 天`, `${active} 天`, `${active}`)} />
        <StackStat label={t('連續', '连续', 'Streak')} value={t(`${streak} 天`, `${streak} 天`, `${streak}`)} />
        <StackStat label={t('單日最高', '单日最高', 'Daily Peak')} value={peak ? String(peak.count) : "0"} />
        <StackStat label={t('最近活躍', '最近活跃', 'Last Active')} value={lastActive} />
      </HStack>
    </VStack>
  )
}

// =============== Large：當年 ===============

function LargeView({
  repoLabel,
  pathLabel,
  allDays,
}: {
  repoLabel: string
  pathLabel: string
  allDays: ContributionDay[]
}) {
  const now = new Date()
  const { start, end, label } = yearRange(now)
  const weeks = buildWeeksInRange(allDays, start, end)
  const total = totalCount(weeks)
  const active = activeDayCount(weeks)
  const streak = currentStreak(allDays)
  const peak = bestDay(weeks)
  const lastActive = lastActiveLabel(allDays)

  // 大號內部寬度 ~305pt；年初到今天至多 53 列；cellSize=5 + spacing=1.5 → 5*53+1.5*52=343，略超，下調到 cellSize=4.8 → 4.8*53+1.5*52=332，仍超。用 4.5 + 1.2 = 300 安全
  const cellSize = weeks.length > 30 ? 4.5 : 8
  const spacing = weeks.length > 30 ? 1.2 : 2

  return (
    <VStack alignment="leading" spacing={12} padding={14} frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <Header repoLabel={repoLabel} subtitle={pathLabel || label} />

      <HStack spacing={16} frame={{ maxWidth: Infinity }}>
        <VStack alignment="leading" spacing={2} frame={{ maxWidth: Infinity }}>
          <Text font="caption2" foregroundStyle={palette.textSoft}>
            {t('今年提交', '今年提交', 'Commits This Year')}
          </Text>
          <Text font="title2" fontWeight="bold" foregroundStyle={palette.accent}>
            {total}
          </Text>
        </VStack>
        <VStack alignment="leading" spacing={2} frame={{ maxWidth: Infinity }}>
          <Text font="caption2" foregroundStyle={palette.textSoft}>
            {t('連續', '连续', 'Streak')}
          </Text>
          <Text font="title3" fontWeight="bold" foregroundStyle={palette.text}>
            {t(`${streak} 天`, `${streak} 天`, `${streak} days`)}
          </Text>
        </VStack>
        <VStack alignment="leading" spacing={2} frame={{ maxWidth: Infinity }}>
          <Text font="caption2" foregroundStyle={palette.textSoft}>
            {t('活躍', '活跃', 'Active')}
          </Text>
          <Text font="title3" fontWeight="bold" foregroundStyle={palette.text}>
            {active}
          </Text>
        </VStack>
        <VStack alignment="leading" spacing={2} frame={{ maxWidth: Infinity }}>
          <Text font="caption2" foregroundStyle={palette.textSoft}>
            {t('單日最高', '单日最高', 'Daily Peak')}
          </Text>
          <Text font="title3" fontWeight="bold" foregroundStyle={palette.text}>
            {peak ? String(peak.count) : "0"}
          </Text>
        </VStack>
      </HStack>

      <HeatmapGrid weeks={weeks} getLevelColor={getLevelColor} cellSize={cellSize} spacing={spacing} cornerRadius={1} />

      <Spacer />

      <VStack alignment="leading" spacing={6} frame={{ maxWidth: Infinity }}>
        <InlineStat label={t('最近活躍', '最近活跃', 'Last Active')} value={lastActive} accent />
        <InlineStat
          label={t('最活躍的一天', '最活跃的一天', 'Most Active Day')}
          value={peak ? t(`${peak.date.slice(5)} · ${peak.count} 次`, `${peak.date.slice(5)} · ${peak.count} 次`, `${peak.date.slice(5)} · ${peak.count}`) : t('暫無', '暂无', 'None')}
        />
        <InlineStat label={t('統計範圍', '统计范围', 'Range')} value={`${start.toISOString().slice(5, 10)} ~ ${end.toISOString().slice(5, 10)}`} />
      </VStack>
    </VStack>
  )
}

// =============== 錯誤 ===============

function ErrorView({ message }: { message: string }) {
  return (
    <VStack alignment="leading" spacing={6} padding={14}>
      <HStack spacing={6}>
        <Image systemName="exclamationmark.triangle.fill" font="caption" foregroundStyle={palette.error} />
        <Text font="caption" fontWeight="bold" foregroundStyle={palette.error}>
          {t('加載失敗', '加载失败', 'Load Failed')}
        </Text>
      </HStack>
      <Text font="caption2" foregroundStyle={palette.textSoft} lineLimit={6}>
        {message}
      </Text>
      <Spacer />
      <Text font="caption2" foregroundStyle={palette.textSoft}>
        {t('請打開腳本檢查 GitHub 配置', '请打开脚本检查 GitHub 配置', 'Please open the script and check the GitHub setup')}
      </Text>
    </VStack>
  )
}

// =============== 入口 ===============

async function run() {
  const config = getWidgetConfig()
  const hasRepo = config.owner && config.repo
  const repoLabel = hasRepo ? `${config.owner}/${config.repo}` : t('未配置倉庫', '未配置仓库', 'No Repository Configured')
  const repoName = hasRepo ? config.repo : t('未配置', '未配置', 'Not Configured')
  const pathLabel = config.path || ""
  const family = Widget.family

  if (!hasRepo) {
    Widget.present(<ErrorView message={t('請在 App 中完成 GitHub 配置後再添加小組件', '请在 App 中完成 GitHub 配置后再添加小组件', 'Please finish the GitHub setup in the App before adding the widget')} />)
    return
  }

  try {
    const weeks = await fetchCommitActivity(config)
    const allDays = flattenSortedDays(weeks)

    if (family === "systemSmall") {
      Widget.present(<SmallView repoName={repoName} pathLabel={pathLabel} allDays={allDays} />)
    } else if (family === "systemLarge") {
      Widget.present(<LargeView repoLabel={repoLabel} pathLabel={pathLabel} allDays={allDays} />)
    } else {
      Widget.present(<MediumView repoLabel={repoLabel} allDays={allDays} />)
    }
  } catch (error: any) {
    Widget.present(<ErrorView message={String(error?.message || error)} />)
  }
}

run()

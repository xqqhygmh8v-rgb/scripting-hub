import {
  Widget,
  VStack,
  HStack,
  ZStack,
  Text,
  Image,
  Spacer,
  Circle,
  Divider,
  ProgressView,
  Chart,
  LineChart
} from "scripting"
import { loadConfig, normalizeConfig, isConfigured } from "./config"
import { fetchCoreSnapshot, loadCachedSnapshot, type MonitorSnapshot, type ECSStatus } from "./monitor"
import type { AppConfig } from "./config"

const COLORS = {
  normal: "systemBlue",
  warning: "systemOrange",
  danger: "systemRed",
  stale: "secondaryLabel"
} as const

function riskColor(data: MonitorSnapshot, stale = false): string {
  if (stale) return COLORS.stale
  if (data.cutoffRemainingGB <= 0) return COLORS.danger
  if (data.cutoffRemainingGB <= 15) return COLORS.warning
  return COLORS.normal
}

function riskLabel(data: MonitorSnapshot, stale = false): string {
  if (stale) return "缓存数据"
  if (data.cutoffRemainingGB <= 0) return "已超出参考线"
  if (data.cutoffRemainingGB <= 15) return "临近参考线"
  return "预算充足"
}

function statusMeta(status: ECSStatus): { label: string; color: string } {
  switch (status) {
    case "Running": return { label: "运行中", color: "systemGreen" }
    case "Starting": return { label: "启动中", color: "systemOrange" }
    case "Stopping": return { label: "停止中", color: "systemOrange" }
    case "Stopped": return { label: "已停止", color: "secondaryLabel" }
    default: return { label: "未知", color: "secondaryLabel" }
  }
}

function remainingText(data: MonitorSnapshot): string {
  return `${data.cutoffRemainingGB < 0 ? "超" : "余"} ${Math.abs(data.cutoffRemainingGB).toFixed(1)}`
}

function UsageProgress({ data, stale = false }: { data: MonitorSnapshot; stale?: boolean }) {
  const tint = riskColor(data, stale)
  return (
    <VStack alignment="leading" spacing={4}>
      <ProgressView
        progressViewStyle="linear"
        value={Math.min(1, Math.max(0, data.totalGB / Math.max(1, data.thresholdGB)))}
        total={1}
        tint={tint}
        frame={{ maxWidth: Infinity, height: 6 }}
        clipShape={{ type: "capsule" }}
      />
      <HStack alignment="center">
        <Text font={9} monospacedDigit foregroundStyle="secondaryLabel">已用 {data.totalGB.toFixed(1)} / {data.thresholdGB} GB</Text>
        <Spacer />
        <Text font={9} monospacedDigit foregroundStyle="secondaryLabel">线 {data.cutoffGB} GB</Text>
      </HStack>
    </VStack>
  )
}

function DailyTrafficChart({ data, stale = false, height = 58 }: { data: MonitorSnapshot; stale?: boolean; height?: number }) {
  const segments: typeof data.dailyUsage[] = []
  let segment: typeof data.dailyUsage = []
  let previousDay: number | null = null
  for (const point of data.dailyUsage) {
    if (point.valueGB === null) {
      if (segment.length) segments.push(segment)
      segment = []
      previousDay = null
      continue
    }
    const [year, month, day] = point.date.split("-").map(Number)
    const dayNumber = Date.UTC(year, month - 1, day)
    if (segment.length && previousDay !== null && dayNumber - previousDay !== 86400000) {
      segments.push(segment)
      segment = []
    }
    segment.push(point)
    previousDay = dayNumber
  }
  if (segment.length) segments.push(segment)

  if (segments.reduce((sum, points) => sum + points.length, 0) < 2) {
    return (
      <HStack frame={{ maxWidth: Infinity, height }} alignment="center">
        <Spacer />
        <Text font="caption2" foregroundStyle="secondaryLabel">采样积累后显示每日趋势</Text>
        <Spacer />
      </HStack>
    )
  }

  return (
    <Chart frame={{ maxWidth: Infinity, height }}>
      {segments.map((points, index) => (
        <LineChart
          key={`${points[0].date}-${index}`}
          labelOnYAxis={false}
          marks={points.map(point => ({
            label: point.label,
            value: point.valueGB as number,
            foregroundStyle: point.isToday && !stale ? "systemBlue" : "systemGreen",
            symbol: "circle" as const,
            symbolSize: point.isToday && !stale ? 20 : 14,
            lineStyle: { lineWidth: 2.25, lineCap: "round" as const },
            annotation: {
              position: "top",
              alignment: "center",
              spacing: 3,
              overflowResolution: { x: "fit", y: "padScale" },
              content: <Text font={9} bold={point.isToday && !stale} foregroundStyle={point.isToday && !stale ? "systemBlue" : "secondaryLabel"}>{point.valueGB?.toFixed(1)}</Text>
            }
          }))}
        />
      ))}
    </Chart>
  )
}

function SmallWidget({ data, stale }: { data: MonitorSnapshot; stale: boolean }) {
  const status = statusMeta(data.ecs.status)
  return (
    <VStack alignment="leading" spacing={7} padding={{ horizontal: 13, vertical: 12 }} widgetBackground="systemBackground" frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <HStack alignment="center" spacing={5}>
        <Image systemName="cloud.fill" font={12} foregroundStyle={riskColor(data, stale)} />
        <Text font="caption2" bold foregroundStyle="label">CDT</Text>
        <Spacer />
        <Circle widgetAccentable fill={status.color} frame={{ width: 5, height: 5 }} />
        <Text font={9} bold foregroundStyle={status.color}>{status.label}</Text>
      </HStack>
      <Text font={10} foregroundStyle="secondaryLabel">{stale ? "距参考线 · 缓存" : data.cutoffRemainingGB < 0 ? "已超出参考线" : "距参考线剩余"}</Text>
      <HStack alignment="lastTextBaseline" spacing={4}>
        <Text font={36} bold monospacedDigit foregroundStyle={riskColor(data, stale)}>{Math.abs(data.cutoffRemainingGB).toFixed(1)}</Text>
        <Text font="caption1" foregroundStyle="label">GB</Text>
      </HStack>
      <UsageProgress data={data} stale={stale} />
      <HStack alignment="center">
        <Text font={9} foregroundStyle="secondaryLabel">今日估算</Text>
        <Spacer />
        <Text font={10} bold monospacedDigit foregroundStyle="label">{stale ? "—" : data.dailyUsage[data.dailyUsage.length - 1]?.valueGB?.toFixed(1) ?? "—"} GB</Text>
      </HStack>
    </VStack>
  )
}

function MediumWidget({ data, stale }: { data: MonitorSnapshot; stale: boolean }) {
  const status = statusMeta(data.ecs.status)
  return (
    <VStack alignment="leading" spacing={5} padding={{ horizontal: 15, vertical: 12 }} widgetBackground="systemBackground" frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <HStack alignment="center" spacing={5}>
        <Image systemName="cloud.fill" font={13} foregroundStyle={riskColor(data, stale)} />
        <Text font="caption1" bold foregroundStyle="label">阿里云 CDT</Text>
        <Spacer />
        <Circle widgetAccentable fill={status.color} frame={{ width: 5, height: 5 }} />
        <Text font={9} foregroundStyle={status.color}>{status.label}</Text>
        {stale && <Text font={9} foregroundStyle="secondaryLabel">· 缓存</Text>}
      </HStack>
      <HStack alignment="center">
        <VStack alignment="leading" spacing={2}>
          <Text font={9} foregroundStyle="secondaryLabel">{data.cutoffRemainingGB < 0 ? "超出参考线" : "距参考线剩余"}</Text>
          <HStack alignment="lastTextBaseline" spacing={3}>
            <Text font={29} bold monospacedDigit foregroundStyle={riskColor(data, stale)}>{Math.abs(data.cutoffRemainingGB).toFixed(1)}</Text>
            <Text font={9} foregroundStyle="secondaryLabel">GB</Text>
          </HStack>
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={2}>
          <Text font={9} foregroundStyle="secondaryLabel">日均预算 · 余 {data.daysRemaining} 天</Text>
          <Text font={17} bold monospacedDigit foregroundStyle="label">{data.dailyBudgetGB.toFixed(2)} GB/天</Text>
        </VStack>
      </HStack>
      <DailyTrafficChart data={data} stale={stale} height={64} />
      <Text font={9} foregroundStyle="secondaryLabel">每日估算 GB · {stale ? `缓存于 ${new Date(data.updatedAt).toLocaleString()}` : "逐点标注"}</Text>
    </VStack>
  )
}

function LargeWidget({ data, stale }: { data: MonitorSnapshot; stale: boolean }) {
  const status = statusMeta(data.ecs.status)
  return (
    <VStack alignment="leading" spacing={9} padding={{ horizontal: 17, vertical: 14 }} widgetBackground="systemBackground" frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <HStack alignment="center" spacing={5}>
        <Image systemName="cloud.fill" font={14} foregroundStyle={riskColor(data, stale)} />
        <Text font="subheadline" bold foregroundStyle="label">阿里云 CDT</Text>
        <Spacer />
        <Circle widgetAccentable fill={status.color} frame={{ width: 6, height: 6 }} />
        <Text font={10} bold foregroundStyle={status.color}>ECS {status.label}</Text>
      </HStack>
      <HStack alignment="center">
        <VStack alignment="leading" spacing={3}>
          <Text font="caption1" foregroundStyle="secondaryLabel">{data.cutoffRemainingGB < 0 ? "已超出 VPS 参考线" : "距 VPS 参考线剩余"}</Text>
          <HStack alignment="lastTextBaseline" spacing={5}>
            <Text font={42} bold monospacedDigit foregroundStyle={riskColor(data, stale)}>{Math.abs(data.cutoffRemainingGB).toFixed(1)}</Text>
            <Text font="title3" bold foregroundStyle="label">GB</Text>
          </HStack>
        </VStack>
        <Spacer />
        <Text font="caption1" bold foregroundStyle={riskColor(data, stale)}>{riskLabel(data, stale)}</Text>
      </HStack>
      <UsageProgress data={data} stale={stale} />
      <HStack alignment="center" padding={{ top: 3, bottom: 2 }}>
        <VStack alignment="leading" spacing={3}>
          <Text font={9} foregroundStyle="secondaryLabel">今日估算</Text>
          <Text font="headline" bold monospacedDigit>{stale ? "—" : data.dailyUsage[data.dailyUsage.length - 1]?.valueGB?.toFixed(1) ?? "—"} GB</Text>
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={3}>
          <Text font={9} foregroundStyle="secondaryLabel">安全日均</Text>
          <Text font="headline" bold monospacedDigit foregroundStyle={riskColor(data, stale)}>{data.dailyBudgetGB.toFixed(2)} GB/天</Text>
        </VStack>
      </HStack>
      <Divider />
      <HStack alignment="center">
        <Text font="caption2" bold foregroundStyle="secondaryLabel">每日用量 · 近 7 日</Text>
        <Spacer />
        <Text font={9} foregroundStyle="secondaryLabel">单位 GB</Text>
      </HStack>
      <DailyTrafficChart data={data} stale={stale} height={94} />
      <HStack alignment="center">
        <Text font={9} foregroundStyle="secondaryLabel">{stale ? `${new Date(data.updatedAt).toLocaleString()} 缓存` : `${new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} 更新`}</Text>
        <Spacer />
        <Text font={9} foregroundStyle="secondaryLabel">{data.daysRemaining} 天后重置</Text>
      </HStack>
    </VStack>
  )
}

function AccessoryRectangularWidget({ data, stale }: { data: MonitorSnapshot; stale: boolean }) {
  const status = statusMeta(data.ecs.status)
  return (
    <HStack alignment="center" spacing={9} widgetBackground="clear" frame={{ maxWidth: Infinity, maxHeight: Infinity, alignment: "leading" }}>
      <VStack alignment="leading" spacing={3} frame={{ maxWidth: Infinity }}>
        <HStack alignment="center" spacing={5}>
          <Text font={13} bold monospacedDigit>{remainingText(data)} GB</Text>
          <Spacer />
          <Circle widgetAccentable fill={stale ? "secondaryLabel" : status.color} frame={{ width: 5, height: 5 }} />
          <Text font={9} foregroundStyle={stale ? "secondaryLabel" : status.color}>{stale ? "缓存" : status.label}</Text>
        </HStack>
        <ProgressView progressViewStyle="linear" value={Math.min(1, Math.max(0, data.totalGB / Math.max(1, data.thresholdGB)))} total={1} tint={riskColor(data, stale)} frame={{ maxWidth: Infinity, height: 5 }} />
        <Text font={9} foregroundStyle="secondaryLabel">已用 {data.totalGB.toFixed(1)} GB · 余 {data.daysRemaining} 天</Text>
      </VStack>
    </HStack>
  )
}

function AccessoryInlineWidget({ data, stale }: { data: MonitorSnapshot; stale: boolean }) {
  const status = statusMeta(data.ecs.status)
  return <Text lineLimit={1} monospacedDigit>CDT {remainingText(data)} GB · {stale ? "缓存" : status.label}</Text>
}

export async function launchWidget() {
  const config = normalizeConfig(loadConfig())
  if (!isConfigured(config)) {
    Widget.present(
      <VStack alignment="leading" spacing={6} padding={14} widgetBackground="systemBackground" frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
        <HStack spacing={6} alignment="center"><Image systemName="gearshape.fill" font={14} foregroundStyle="systemOrange" /><Text font="subheadline" bold>尚未配置</Text></HStack>
        <Text font="caption2" foregroundStyle="secondaryLabel">请打开 CDT 监控并在底部“设置”中填写访问凭据。</Text>
      </VStack>
    )
    return
  }

  let stale = false
  let data: MonitorSnapshot
  try {
    data = await fetchCoreSnapshot(config)
  } catch (error) {
    const cached = loadCachedSnapshot(config, true)
    if (!cached) {
      console.error("小组件刷新失败，且没有可用缓存", error)
      Widget.present(
        <VStack alignment="leading" spacing={6} padding={14} widgetBackground="systemBackground" frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
          <HStack spacing={6} alignment="center"><Image systemName="exclamationmark.triangle.fill" font={14} foregroundStyle="systemOrange" /><Text font="subheadline" bold>暂时无法更新</Text></HStack>
          <Text font="caption2" foregroundStyle="secondaryLabel">打开 CDT 监控后可查看错误并重试。</Text>
        </VStack>
      )
      return
    }
    data = cached
    stale = true
  }

  const family = Widget.family
  if (family === "accessoryInline") Widget.present(<AccessoryInlineWidget data={data} stale={stale} />)
  else if (family === "accessoryRectangular") Widget.present(<AccessoryRectangularWidget data={data} stale={stale} />)
  else if (family === "systemLarge") Widget.present(<LargeWidget data={data} stale={stale} />)
  else if (family === "systemMedium") Widget.present(<MediumWidget data={data} stale={stale} />)
  else Widget.present(<SmallWidget data={data} stale={stale} />)
}

declare const __SINGLE_FILE_BUNDLE__: boolean | undefined
if (typeof __SINGLE_FILE_BUNDLE__ === "undefined" || !__SINGLE_FILE_BUNDLE__) {
  void launchWidget()
}

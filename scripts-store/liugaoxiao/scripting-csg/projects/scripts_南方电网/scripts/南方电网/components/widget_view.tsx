import { Gauge, HStack, Image, PathShape, Rectangle, RoundedRectangle, Spacer, Text, VStack, Widget, ZStack, gradient } from "scripting"
import type { DynamicShapeStyle } from "scripting"
import { SCRIPT_ACCENT } from "../constants"
import type { WidgetData } from "../types"
import { formatAmount, formatKwh, maskAccountNumber } from "../utils/format"
import { DEFAULT_RESIDENT_TARIFF, estimateResidentMonthCharge, formatYuanPriceFromCent, getCurrentSeasonTiers } from "../utils/tariff"
import {
  DEFAULT_WIDGET_METRIC_IDS,
  DEFAULT_WIDGET_STYLE,
  DEFAULT_ICE_APPEARANCE,
  DEFAULT_WIDGET_GRADIENT_ID,
  resolveClassicMetricIds,
  type IceAppearance,
  type WidgetConfiguration,
  type WidgetMetricId,
} from "../widget_config"
import { resolveWidgetGradient } from "../widget_gradients"

const BG = "#071A33"
const PANEL = "rgba(255,255,255,0.13)"
const PANEL_LIGHT = "rgba(255,255,255,0.18)"
const MUTED = "rgba(255,255,255,0.68)"
const SOFT = "rgba(255,255,255,0.84)"
const WARN = "#FFB020"
const GOOD = "#38D6A6"
const TEAL_BACKGROUND = gradient("linear", {
  colors: ["#16213A", "#0B7285", "#25A18E"],
  startPoint: "topLeading",
  endPoint: "bottomTrailing",
})
const OUTER_CARD_BG: DynamicShapeStyle = {
  light: "rgba(244,249,255,0.98)",
  dark: "rgba(4,12,28,0.96)",
}
const TIME_STYLE: DynamicShapeStyle = {
  light: "rgba(20,42,75,0.58)",
  dark: "rgba(235,246,255,0.70)",
}
type PowerTheme = {
  tint: DynamicShapeStyle
  icon: string
  bg: DynamicShapeStyle
}
const POWER_THEMES = {
  balance: {
    tint: { light: SCRIPT_ACCENT, dark: "#7cc0ff" },
    icon: "bolt.horizontal.circle.fill",
    bg: { light: "rgba(0,146,255,0.11)", dark: "rgba(8,31,58,0.96)" },
  },
  kwh: {
    tint: { light: "#24B85B", dark: "#63e08f" },
    icon: "chart.bar.fill",
    bg: { light: "rgba(52,199,89,0.11)", dark: "rgba(5,35,25,0.96)" },
  },
  yesterday: {
    tint: { light: "#F08A00", dark: "#ffbf69" },
    icon: "bolt.circle.fill",
    bg: { light: "rgba(255,149,0,0.13)", dark: "rgba(42,25,5,0.96)" },
  },
  ladder: {
    tint: { light: "#7B61FF", dark: "#c59bff" },
    icon: "speedometer",
    bg: { light: "rgba(138,110,255,0.13)", dark: "rgba(20,13,48,0.96)" },
  },
} satisfies Record<string, PowerTheme>

const DEFAULT_WIDGET_CONFIGURATION: WidgetConfiguration = {
  widgetStyle: DEFAULT_WIDGET_STYLE,
  widgetMetricIds: DEFAULT_WIDGET_METRIC_IDS,
  iceAppearance: DEFAULT_ICE_APPEARANCE,
  widgetGradientId: DEFAULT_WIDGET_GRADIENT_ID,
  customWidgetGradients: [],
}

export function WidgetView({
  data,
  configuration = DEFAULT_WIDGET_CONFIGURATION,
}: {
  data: WidgetData
  configuration?: WidgetConfiguration
}) {
  if (Widget.family === "systemMedium") {
    if (configuration.widgetStyle === "glass") {
      return <TealGlassMediumWidgetView data={data} metricIds={configuration.widgetMetricIds} size={Widget.displaySize} />
    }
    if (configuration.widgetStyle === "iceMedium") {
      return <TierDashboardMediumWidgetView data={data} configuration={configuration} size={Widget.displaySize} />
    }
    return <ClassicMediumWidgetView data={data} metricIds={configuration.widgetMetricIds} size={Widget.displaySize} />
  }

  if (Widget.family === "systemSmall" && configuration.widgetStyle === "ice") {
    return <IceGaugeSmallWidgetView
      data={data}
      metricIds={configuration.widgetMetricIds}
      appearance={configuration.iceAppearance}
      size={Widget.displaySize}
    />
  }

  if (Widget.family === "systemLarge") {
    return <MediumWidgetView data={data} />
  }

  if (Widget.family === "accessoryRectangular" || Widget.family === "accessoryInline") {
    return <AccessoryWidgetView data={data} />
  }

  return <SmallWidgetView data={data} />
}

export function MediumWidgetPreview({
  data,
  configuration,
}: {
  data: WidgetData
  configuration: WidgetConfiguration
}) {
  const size = { width: 338, height: 158 }
  if (configuration.widgetStyle === "glass") {
    return <TealGlassMediumWidgetView data={data} metricIds={configuration.widgetMetricIds} size={size} preview />
  }
  if (configuration.widgetStyle === "iceMedium") {
    return <TierDashboardMediumWidgetView data={data} configuration={configuration} size={size} preview />
  }
  return <ClassicMediumWidgetView data={data} metricIds={configuration.widgetMetricIds} size={size} preview />
}

export function SmallWidgetPreview({
  data,
  configuration,
}: {
  data: WidgetData
  configuration: WidgetConfiguration
}) {
  return <IceGaugeSmallWidgetView
    data={data}
    metricIds={configuration.widgetMetricIds}
    appearance={configuration.iceAppearance}
    size={{ width: 158, height: 158 }}
    preview
  />
}

export function WidgetErrorView({ message }: { message: string }) {
  return <ZStack
    frame={Widget.displaySize}
    widgetBackground={{
      color: BG,
      gradient: true,
    }}
  >
    <VStack alignment="leading" spacing={6} padding={12}>
      <HStack spacing={6}>
        <Image systemName="exclamationmark.triangle.fill" foregroundStyle="systemOrange" />
        <Text foregroundStyle="white" font="headline">南方电网</Text>
      </HStack>
      <Text foregroundStyle="rgba(255,255,255,0.85)" font="footnote" lineLimit={4}>
        {message}
      </Text>
    </VStack>
  </ZStack>
}

function SmallWidgetView({ data }: { data: WidgetData }) {
  const arrearsText = data.arrears > 0 ? `欠费 ${formatAmount(data.arrears)}` : "账户正常"
  const arrearsColor = data.arrears > 0 ? WARN : GOOD
  const monthProgress = getMonthProgress(data.monthTotalKwh)

  return <ZStack
    frame={Widget.displaySize}
    widgetBackground={{
      color: BG,
      gradient: true,
    }}
  >
    <VStack
      alignment="leading"
      spacing={8}
      padding={12}
      foregroundStyle="white"
      frame={Widget.displaySize}
    >
      <HStack spacing={7}>
        <Image systemName="bolt.circle.fill" foregroundStyle="#6EC7FF" font="caption" />
        <Text font="caption" fontWeight="semibold" foregroundStyle={SOFT}>南方电网</Text>
        <Spacer minLength={2} />
        <StatusPill text={arrearsText} color={arrearsColor} compact />
      </HStack>

      <VStack
        alignment="leading"
        spacing={5}
        padding={{ horizontal: 10, vertical: 9 }}
        frame={{ maxWidth: Number.MAX_SAFE_INTEGER, alignment: "leading" }}
        background={<RoundedRectangle fill="rgba(255,255,255,0.12)" cornerRadius={16} />}
      >
        <HStack spacing={5}>
          <Text font="caption2" foregroundStyle={MUTED}>可用余额</Text>
          <Spacer minLength={2} />
          <Text font="caption2" foregroundStyle="rgba(255,255,255,0.58)" lineLimit={1}>{formatDataUpdateTime(data)}</Text>
        </HStack>
        <Text font={27} fontWeight="bold" lineLimit={1} minScaleFactor={0.58}>
          {formatAmount(data.balance)}
        </Text>
      </VStack>

      <VStack alignment="leading" spacing={5}>
        <HStack spacing={4}>
          <Text font="caption2" foregroundStyle={MUTED}>本月用电</Text>
          <Spacer minLength={2} />
          <Text font="caption2" fontWeight="semibold" lineLimit={1} minScaleFactor={0.72}>
            {formatKwh(data.monthTotalKwh)}
          </Text>
        </HStack>
        <ProgressBar value={monthProgress} color={SCRIPT_ACCENT} />
      </VStack>

      <Text font="caption2" foregroundStyle="rgba(255,255,255,0.62)" lineLimit={1} minScaleFactor={0.7}>
        昨日 {formatKwh(data.yesterdayKwh)} · {maskAccountNumber(data.account.accountNumber)}
      </Text>
    </VStack>
  </ZStack>
}

function IceGaugeSmallWidgetView({
  data,
  metricIds,
  appearance,
  size,
  preview = false,
}: {
  data: WidgetData
  metricIds: readonly WidgetMetricId[]
  appearance: IceAppearance
  size: { width: number; height: number }
  preview?: boolean
}) {
  const isLight = appearance === "light"
  const background = gradient("linear", {
    colors: isLight
      ? ["#F2F5F6", "#DCE6E8", "#B5CDD2"]
      : ["#1F2D3A", "#496B7B", "#8FB9C2"],
    startPoint: "topLeading",
    endPoint: "bottomTrailing",
  })
  const foreground = isLight ? "#173144" : "#FFFFFF"
  const muted = isLight ? "rgba(23,49,68,0.64)" : "rgba(255,255,255,0.66)"
  const panel = isLight ? "rgba(255,255,255,0.46)" : "rgba(255,255,255,0.13)"
  const metric = createMetricDisplay(data, metricIds[0] ?? "balance")
  const progress = getTierProgress(data)
  const tier = Math.max(1, Math.min(3, data.ladder.ladder ?? 1))

  return <ZStack
    frame={size}
    widgetBackground={background}
    background={preview ? <RoundedRectangle fill={background} cornerRadius={28} /> : undefined}
    clipShape={preview ? { type: "rect", cornerRadius: 28, style: "continuous" } : undefined}
  >
    <VStack
      alignment="leading"
      spacing={4}
      padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }}
      frame={size}
      foregroundStyle={foreground}
    >
      <HStack spacing={5} frame={{ height: 20, maxWidth: "infinity" }}>
        <ZStack frame={{ width: 19, height: 19 }}>
          <RoundedRectangle fill={panel} cornerRadius={6} frame={{ width: 19, height: 19 }} />
          <Image systemName="bolt.fill" font={9} foregroundStyle={foreground} />
        </ZStack>
        <Text font={9} fontWeight="semibold">南方电网</Text>
        <Spacer minLength={2} />
        <HStack
          spacing={4}
          padding={{ horizontal: 6, vertical: 0 }}
          frame={{ height: 18 }}
          background={<RoundedRectangle fill={panel} cornerRadius={999} />}
        >
          <Image systemName="circle.fill" font={5} foregroundStyle={data.arrears > 0 ? WARN : "#62E0BE"} />
          <Text font={8} fontWeight="semibold">正常</Text>
        </HStack>
      </HStack>

      <ZStack frame={{ width: 138, height: 70 }}>
        <PathShape
          stroke={{ shapeStyle: isLight ? "rgba(23,49,68,0.16)" : "rgba(255,255,255,0.15)", strokeStyle: { lineWidth: 8, lineCap: "round" } }}
          frame={{ width: 138, height: 70 }}
          draw={(path, drawSize) => path.addArc({
            center: { x: drawSize.width / 2, y: drawSize.height - 3 },
            radius: 57.5,
            startAngle: Math.PI,
            endAngle: Math.PI * 2,
          })}
        />
        <PathShape
          trim={{ from: 0, to: progress }}
          stroke={{
            shapeStyle: gradient("linear", { colors: ["#82D9E3", "#F6C453", "#FF786F"], startPoint: "leading", endPoint: "trailing" }),
            strokeStyle: { lineWidth: 8, lineCap: "round" },
          }}
          frame={{ width: 138, height: 70 }}
          draw={(path, drawSize) => path.addArc({
            center: { x: drawSize.width / 2, y: drawSize.height - 3 },
            radius: 57.5,
            startAngle: Math.PI,
            endAngle: Math.PI * 2,
          })}
        />
        <Image systemName="circle.fill" font={5} foregroundStyle="#F6C453" offset={{ x: 38, y: -14 }} />
        <Image systemName="circle.fill" font={5} foregroundStyle="#FF786F" offset={{ x: 56, y: 17 }} />
        <VStack alignment="center" spacing={2} offset={{ x: 0, y: 12 }}>
          <Text font={7} foregroundStyle={muted}>本年阶梯</Text>
          <Text font={15} fontWeight="bold">{tierChineseLabel(tier)}</Text>
          <Text font={7} foregroundStyle={muted}>已用 {Math.round(progress * 100)}%</Text>
        </VStack>
      </ZStack>

      <ZStack
        alignment="bottomTrailing"
        frame={{ height: 40, maxWidth: "infinity" }}
        background={<RoundedRectangle fill={panel} cornerRadius={13} />}
      >
        <VStack
          alignment="center"
          spacing={2}
          padding={{ horizontal: 30, vertical: 5 }}
          frame={{ height: 40, maxWidth: "infinity", alignment: "center" }}
        >
          <HStack spacing={4} frame={{ maxWidth: "infinity", alignment: "center" }}>
            <Image systemName={metric.id === "balance" ? "wallet.bifold.fill" : metric.icon} font={8} foregroundStyle={muted} />
            <Text font={7} foregroundStyle={muted} lineLimit={1}>{metric.title}</Text>
          </HStack>
          <Text font={metric.value.includes("kWh") ? 11 : 14} fontWeight="bold" lineLimit={1} minScaleFactor={0.55}>{metric.value}</Text>
        </VStack>
        <HStack spacing={2} offset={{ x: -7, y: -6 }} foregroundStyle={muted}>
          <Image systemName="clock" font={7} />
          <Text font={7} foregroundStyle={muted} lineLimit={1}>{formatIceRefreshTime(data)}</Text>
        </HStack>
      </ZStack>
    </VStack>
  </ZStack>
}

type MetricDisplay = {
  id: WidgetMetricId
  title: string
  value: string
  detail: string
  icon: string
  color: string
  progress?: number
}

function TealGlassMediumWidgetView({
  data,
  metricIds,
  size,
  preview = false,
}: {
  data: WidgetData
  metricIds: readonly WidgetMetricId[]
  size: { width: number; height: number }
  preview?: boolean
}) {
  const glassMetricIds = metricIds.slice(0, 3)
  const metrics = DEFAULT_WIDGET_METRIC_IDS.slice(0, 3).map((fallback, index) => {
    const id = glassMetricIds[index] ?? fallback
    return createMetricDisplay(data, id)
  })
  const hasArrears = data.arrears > 0
  const statusText = hasArrears ? "欠费" : "正常"
  const accountStatus = hasArrears ? `欠费 ${formatWidgetAmount(data.arrears)}` : "账户正常"

  return <ZStack
    frame={size}
    widgetBackground={TEAL_BACKGROUND}
    background={preview ? <RoundedRectangle fill={TEAL_BACKGROUND} cornerRadius={24} /> : undefined}
    clipShape={preview ? { type: "rect", cornerRadius: 24, style: "continuous" } : undefined}
  >
    <VStack
      alignment="leading"
      spacing={7}
      padding={{ top: 12, leading: 14, bottom: 11, trailing: 14 }}
      frame={size}
      foregroundStyle="white"
    >
      <HStack spacing={7} frame={{ maxWidth: "infinity" }}>
        <ZStack frame={{ width: 24, height: 24 }}>
          <RoundedRectangle fill="rgba(255,255,255,0.16)" cornerRadius={7} frame={{ width: 24, height: 24 }} />
          <Image systemName="bolt.fill" font={12} foregroundStyle="white" />
        </ZStack>
        <Text font={12} fontWeight="semibold" lineLimit={1}>南方电网</Text>
        <Spacer minLength={2} />
        <HStack
          spacing={4}
          padding={{ horizontal: 9, vertical: 0 }}
          frame={{ height: 23 }}
          background={<RoundedRectangle fill="rgba(255,255,255,0.12)" cornerRadius={999} />}
        >
          <Image systemName="circle.fill" font={5} foregroundStyle={hasArrears ? WARN : "#65E6BD"} />
          <Text font={9} fontWeight="semibold" lineLimit={1}>{statusText}</Text>
        </HStack>
      </HStack>

      <HStack spacing={7} frame={{ height: 72, maxWidth: "infinity", alignment: "center" }}>
        {metrics.map((metric) => <GlassMetricCard metric={metric} />)}
      </HStack>

      <HStack spacing={4} frame={{ maxWidth: "infinity" }} foregroundStyle="rgba(255,255,255,0.72)">
        <Image systemName="clock" font={9} />
        <Text font={9} lineLimit={1}>{formatDataUpdateTime(data)}</Text>
        <Spacer minLength={2} />
        <Text font={9} lineLimit={1}>{accountStatus}</Text>
      </HStack>
    </VStack>
  </ZStack>
}

function GlassMetricCard({ metric }: { metric: MetricDisplay }) {
  return <VStack
    alignment="center"
    spacing={7}
    padding={{ horizontal: 9, vertical: 8 }}
    frame={{ minWidth: 0, maxWidth: "infinity", height: 72, alignment: "center" }}
    background={<RoundedRectangle fill="rgba(255,255,255,0.14)" cornerRadius={12} />}
  >
    <HStack spacing={4} frame={{ maxWidth: "infinity", alignment: "center" }} foregroundStyle="rgba(255,255,255,0.84)">
      {metric.id === "balance" ? (
        <Image systemName="wallet.bifold.fill" font={9} />
      ) : (
        <Image systemName={metric.icon} font={9} />
      )}
      <Text font={9} lineLimit={1} minScaleFactor={0.72}>{metric.title}</Text>
    </HStack>
    <Text
      font={metric.value.includes("kWh") ? 15 : 17}
      fontWeight="bold"
      lineLimit={1}
      minScaleFactor={0.54}
      frame={{ maxWidth: "infinity", alignment: "center" }}
    >
      {metric.value}
    </Text>
  </VStack>
}

function TierDashboardMediumWidgetView({
  data,
  configuration,
  size,
  preview = false,
}: {
  data: WidgetData
  configuration: WidgetConfiguration
  size: { width: number; height: number }
  preview?: boolean
}) {
  const selectedGradient = resolveWidgetGradient(configuration.widgetGradientId, configuration.customWidgetGradients)
  const background = gradient("linear", {
    colors: selectedGradient.colors as any,
    startPoint: "topLeading",
    endPoint: "bottomTrailing",
  })
  const darkText = selectedGradient.tone === "dark"
  const foreground: any = darkText ? "#173144" : "#FFFFFF"
  const muted: any = darkText ? "rgba(23,49,68,0.62)" : "rgba(255,255,255,0.66)"
  const panel: any = darkText ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.14)"
  const railPanel: any = darkText ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.09)"
  const metricIds = configuration.widgetMetricIds.slice(0, 3)
  const metrics = DEFAULT_WIDGET_METRIC_IDS.slice(0, 3).map((fallback, index) => (
    createMetricDisplay(data, metricIds[index] ?? fallback)
  ))
  const hasArrears = data.arrears > 0

  return <ZStack
    frame={size}
    widgetBackground={background}
    background={preview ? <RoundedRectangle fill={background} cornerRadius={22} /> : undefined}
    clipShape={preview ? { type: "rect", cornerRadius: 22, style: "continuous" } : undefined}
  >
    <VStack
      alignment="leading"
      spacing={6}
      padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }}
      frame={size}
      foregroundStyle={foreground}
    >
      <HStack spacing={6} frame={{ maxWidth: "infinity" }}>
        <ZStack frame={{ width: 20, height: 20 }}>
          <RoundedRectangle fill={panel} cornerRadius={6} frame={{ width: 20, height: 20 }} />
          <Image systemName="bolt.fill" font={10} foregroundStyle={foreground} />
        </ZStack>
        <Text font={10} fontWeight="semibold">南方电网</Text>
        <Spacer minLength={2} />
        <HStack spacing={3} padding={{ horizontal: 7, vertical: 3 }} background={<RoundedRectangle fill={panel} cornerRadius={999} />}>
          <Image systemName="circle.fill" font={4} foregroundStyle={hasArrears ? WARN : "#62E0BE"} />
          <Text font={8} fontWeight="semibold">{hasArrears ? "欠费" : "账户正常"}</Text>
        </HStack>
      </HStack>

      <HStack spacing={8} frame={{ height: 112, maxWidth: "infinity" }}>
        <TierRailPanel data={data} foreground={foreground} muted={muted} panel={railPanel} />
        <VStack spacing={6} frame={{ maxWidth: "infinity", height: 112 }}>
          <TierPrimaryMetric metric={metrics[0]} foreground={foreground} muted={muted} panel={panel} />
          <HStack spacing={6} frame={{ maxWidth: "infinity", height: 54 }}>
            <TierSecondaryMetric metric={metrics[1]} foreground={foreground} muted={muted} panel={panel} />
            <TierSecondaryMetric metric={metrics[2]} foreground={foreground} muted={muted} panel={panel} />
          </HStack>
        </VStack>
      </HStack>
    </VStack>
  </ZStack>
}

function TierRailPanel(props: { data: WidgetData; foreground: any; muted: any; panel: any }) {
  const tier = Math.max(1, Math.min(3, props.data.ladder.ladder ?? 1))
  const progress = getTierProgress(props.data)
  const remaining = props.data.ladder.remainingKwh

  return <ZStack
    alignment="bottom"
    frame={{ width: 126, height: 112 }}
    background={<RoundedRectangle fill={props.panel} cornerRadius={14} />}
  >
    <HStack
      spacing={5}
      padding={{ top: 9, leading: 13, bottom: 22, trailing: 4 }}
      frame={{ width: 126, height: 112 }}
    >
      <VStack alignment="center" spacing={1} frame={{ width: 26 }}>
        <TierNode value={3} active={tier === 3} foreground={props.foreground} />
        <Rectangle fill={props.muted} frame={{ width: 2, height: 11 }} />
        <TierNode value={2} active={tier === 2} foreground={props.foreground} />
        <Rectangle fill={props.muted} frame={{ width: 2, height: 11 }} />
        <TierNode value={1} active={tier === 1} foreground={props.foreground} />
      </VStack>
      <VStack alignment="leading" spacing={2} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font={8} foregroundStyle={props.muted}>年度阶梯</Text>
        <Text font={20} fontWeight="bold" lineLimit={1}>{tierChineseLabel(tier)}</Text>
        <Text font={9} fontWeight="semibold" foregroundStyle={props.muted}>已用 {Math.round(progress * 100)}%</Text>
        <Text font={8} foregroundStyle={props.muted} lineLimit={1} minScaleFactor={0.64}>
          {remaining == null ? "阶梯数据已同步" : `距下一档 ${remaining.toFixed(0)}kWh`}
        </Text>
      </VStack>
    </HStack>
    <HStack spacing={3} padding={{ bottom: 7 }} foregroundStyle={props.muted}>
      <Image systemName="clock" font={8} />
      <Text font={8} lineLimit={1}>{formatDataUpdateTime(props.data)}</Text>
    </HStack>
  </ZStack>
}

function TierNode({ value, active, foreground }: { value: number; active: boolean; foreground: any }) {
  return <ZStack frame={{ width: 20, height: 20 }}>
    <RoundedRectangle
      fill={active ? "#70D6DF" : "rgba(255,255,255,0.18)"}
      cornerRadius={10}
      frame={{ width: 20, height: 20 }}
    />
    <Text font={9} fontWeight="bold" foregroundStyle={active ? "#173144" : foreground}>{value}</Text>
  </ZStack>
}

function tierChineseLabel(tier: number) {
  return ["第一档", "第二档", "第三档"][Math.max(1, Math.min(3, tier)) - 1]
}

function TierPrimaryMetric(props: { metric: MetricDisplay; foreground: any; muted: any; panel: any }) {
  return <HStack
    spacing={8}
    padding={{ horizontal: 11, vertical: 8 }}
    frame={{ height: 52, maxWidth: "infinity" }}
    background={<RoundedRectangle fill={props.panel} cornerRadius={12} />}
  >
    <HStack spacing={5} foregroundStyle={props.muted}>
      <Image systemName={props.metric.id === "balance" ? "wallet.bifold.fill" : props.metric.icon} font={9} />
      <Text font={9} lineLimit={1}>{props.metric.title}</Text>
    </HStack>
    <Spacer minLength={4} />
    <Text font={19} fontWeight="bold" lineLimit={1} minScaleFactor={0.52}>{props.metric.value}</Text>
  </HStack>
}

function TierSecondaryMetric(props: { metric: MetricDisplay; foreground: any; muted: any; panel: any }) {
  return <VStack
    alignment="center"
    spacing={5}
    padding={{ horizontal: 8, vertical: 7 }}
    frame={{ minWidth: 0, maxWidth: "infinity", height: 54, alignment: "center" }}
    background={<RoundedRectangle fill={props.panel} cornerRadius={12} />}
  >
    <HStack spacing={4} frame={{ maxWidth: "infinity", alignment: "center" }} foregroundStyle={props.muted}>
      <Image systemName={props.metric.id === "balance" ? "wallet.bifold.fill" : props.metric.icon} font={8} />
      <Text font={8} lineLimit={1} minScaleFactor={0.68}>{props.metric.title}</Text>
    </HStack>
    <Text font={13} fontWeight="bold" foregroundStyle={props.foreground} lineLimit={1} minScaleFactor={0.54} frame={{ maxWidth: "infinity", alignment: "center" }}>
      {props.metric.value}
    </Text>
  </VStack>
}

function ClassicMediumWidgetView({
  data,
  metricIds,
  size,
  preview = false,
}: {
  data: WidgetData
  metricIds: readonly WidgetMetricId[]
  size: { width: number; height: number }
  preview?: boolean
}) {
  const [primaryId, secondId, thirdId, supplementalId] = resolveClassicMetricIds(metricIds)
  const primary = createMetricDisplay(data, primaryId)
  const secondary = [secondId, thirdId, supplementalId].map((id) => createMetricDisplay(data, id))
  const leftWidth = size.width < 340 ? 126 : 138

  return <ZStack
    frame={size}
    widgetBackground={{ color: BG, gradient: true }}
    background={preview ? <RoundedRectangle fill={BG} cornerRadius={24} /> : undefined}
    clipShape={preview ? { type: "rect", cornerRadius: 24, style: "continuous" } : undefined}
  >
    <HStack
      alignment="center"
      spacing={8}
      padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }}
      frame={size}
      foregroundStyle="white"
    >
      <ClassicPrimaryPanel data={data} metric={primary} width={leftWidth} />

      <VStack alignment="leading" spacing={7} frame={{ maxWidth: "infinity" }}>
        <HStack spacing={7} frame={{ maxWidth: "infinity" }}>
          <ClassicGridCard title={secondary[0].title} value={secondary[0].value} icon={secondary[0].icon} color={secondary[0].color} />
          <ClassicGridCard title={secondary[1].title} value={secondary[1].value} icon={secondary[1].icon} color={secondary[1].color} />
        </HStack>
        <HStack spacing={7} frame={{ maxWidth: "infinity" }}>
          <ClassicGridCard title={secondary[2].title} value={secondary[2].value} icon={secondary[2].icon} color={secondary[2].color} />
          <ClassicGridCard
            title="更新时间"
            value={formatDataUpdateTime(data).replace("更新 ", "")}
            icon="arrow.triangle.2.circlepath"
            color="#6EC7FF"
          />
        </HStack>
      </VStack>
    </HStack>
  </ZStack>
}

function ClassicGridCard(props: { title: string; value: string; icon: string; color: string }) {
  return <VStack
    alignment="leading"
    spacing={5}
    padding={{ horizontal: 8, vertical: 7 }}
    frame={{ minWidth: 0, maxWidth: "infinity", maxHeight: "infinity", alignment: "leading" }}
    background={<RoundedRectangle fill="rgba(255,255,255,0.13)" cornerRadius={12} />}
  >
    <HStack spacing={4}>
      <Image systemName={props.icon} font={8} foregroundStyle={props.color as any} />
      <Text font={8} foregroundStyle="rgba(255,255,255,0.68)" lineLimit={1} minScaleFactor={0.7}>{props.title}</Text>
    </HStack>
    <Text font={12} fontWeight="bold" lineLimit={1} minScaleFactor={0.58}>{props.value}</Text>
  </VStack>
}

function ClassicPrimaryPanel({ data, metric, width }: { data: WidgetData; metric: MetricDisplay; width: number }) {
  const hasArrears = data.arrears > 0
  const statusText = hasArrears ? `欠费 ${formatWidgetAmount(data.arrears)}` : "账户正常"
  const statusColor = hasArrears ? WARN : GOOD

  return <VStack
    alignment="leading"
    spacing={7}
    padding={{ horizontal: 11, vertical: 10 }}
    frame={{ width, minHeight: 134, alignment: "leading" }}
    background={<RoundedRectangle fill="rgba(0,146,255,0.24)" cornerRadius={18} />}
  >
    <HStack spacing={6}>
      <Image systemName={metric.icon} foregroundStyle="rgba(255,255,255,0.88)" font="caption" />
      <Text font="caption2" fontWeight="semibold" foregroundStyle="rgba(255,255,255,0.82)" lineLimit={1} minScaleFactor={0.72}>{metric.title}</Text>
    </HStack>
    <Text font={24} fontWeight="bold" lineLimit={1} minScaleFactor={0.5}>{metric.value}</Text>
    <Spacer minLength={0} />
    <StatusPill text={statusText} color={statusColor} compact />
    <Text font="caption2" foregroundStyle="rgba(255,255,255,0.62)" lineLimit={1} minScaleFactor={0.72}>{formatDataUpdateTime(data)}</Text>
  </VStack>
}

function createMetricDisplay(data: WidgetData, id: WidgetMetricId): MetricDisplay {
  switch (id) {
    case "balance":
      return {
        id,
        title: "电费余额",
        value: formatWidgetAmount(data.balance),
        detail: data.arrears > 0 ? `欠费 ${formatWidgetAmount(data.arrears)}` : "账户正常",
        icon: "yensign.circle.fill",
        color: "#6EC7FF",
      }
    case "monthUsage":
      return {
        id,
        title: "本月用电",
        value: formatKwh(data.monthTotalKwh),
        detail: data.latestDay ? `最新 ${formatMonthDay(data.latestDay.date)}` : "本月累计",
        icon: "bolt.fill",
        color: "#38D67A",
        progress: getMonthProgress(data.monthTotalKwh),
      }
    case "monthBill":
      return {
        id,
        title: "本月账单",
        value: formatWidgetAmount(data.monthTotalCharge),
        detail: "本月累计",
        icon: "gauge.with.dots.needle.67percent",
        color: "#A78BFA",
        progress: getChargeProgress(data.monthTotalCharge),
      }
    case "previousBill":
      return {
        id,
        title: "上月账单",
        value: formatWidgetAmount(data.previousMonthCharge),
        detail: "上月累计",
        icon: "doc.text.fill",
        color: "#7DD3FC",
      }
    case "yesterdayUsage":
      return {
        id,
        title: "昨日用电",
        value: formatKwh(data.yesterdayKwh),
        detail: data.latestDay ? `最新 ${formatMonthDay(data.latestDay.date)}` : "昨日数据",
        icon: "chart.bar.fill",
        color: "#FFB020",
        progress: getDayProgress(data.yesterdayKwh),
      }
  }
}

function formatWidgetAmount(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "--"
  }
  return `¥${value.toFixed(2)}`
}

function MediumWidgetView({ data }: { data: WidgetData }) {
  const monthProgress = getMonthProgress(data.monthTotalKwh)
  const yesterdayProgress = getDayProgress(data.yesterdayKwh)
  const estimatedMonthCharge = estimateResidentMonthCharge(data.monthTotalKwh)
  const chargeProgress = getChargeProgress(estimatedMonthCharge?.amount)
  const latestText = data.latestDay
    ? `${formatMonthDay(data.latestDay.date)} · ${formatKwh(data.latestDay.kwh)}`
    : `昨日 · ${formatKwh(data.yesterdayKwh)}`
  const width = Widget.displaySize.width
  const leftWidth = width < 340 ? 126 : 138

  return <ZStack
    frame={Widget.displaySize}
    widgetBackground={{
      color: BG,
      gradient: true,
    }}
  >
    <HStack
      alignment="center"
      spacing={8}
      padding={{ top: 10, leading: 10, bottom: 10, trailing: 10 }}
      frame={Widget.displaySize}
      foregroundStyle="white"
    >
      <BalancePanel data={data} width={leftWidth} />

      <VStack alignment="leading" spacing={7} frame={{ maxWidth: Number.MAX_SAFE_INTEGER }}>
        <HStack spacing={7} frame={{ maxWidth: Number.MAX_SAFE_INTEGER }}>
          <MetricCard
            title="本月电量"
            value={formatKwh(data.monthTotalKwh)}
            subtitle={latestText}
            icon="chart.bar.fill"
            color="#38D67A"
            progress={monthProgress}
            compact
          />
          <MetricCard
            title="昨日用电"
            value={formatKwh(data.yesterdayKwh)}
            subtitle={data.latestDay ? `最新 ${formatMonthDay(data.latestDay.date)}` : "昨日数据"}
            icon="bolt.circle.fill"
            color="#FFB020"
            progress={yesterdayProgress}
            compact
          />
        </HStack>
        <HStack spacing={7} frame={{ maxWidth: Number.MAX_SAFE_INTEGER }}>
          <MetricCard
            title="本月电费"
            value={formatAmount(estimatedMonthCharge?.amount)}
            subtitle={estimatedMonthCharge ? estimatedMonthCharge.currentTierName : "阶梯估算"}
            icon="speedometer"
            color="#A78BFA"
            progress={chargeProgress}
            compact
          />
          <MetricCard
            title="更新时间"
            value={formatDataUpdateTime(data).replace("更新 ", "")}
            subtitle={maskAccountNumber(data.account.accountNumber)}
            icon="arrow.triangle.2.circlepath"
            color="#6EC7FF"
            compact
          />
        </HStack>
      </VStack>
    </HStack>
  </ZStack>
}

function AccessoryWidgetView({ data }: { data: WidgetData }) {
  const hasArrears = data.arrears > 0

  return <VStack alignment="leading" spacing={2}>
    <Text font="caption2" foregroundStyle={SCRIPT_ACCENT}>南方电网 · {hasArrears ? "欠费" : "正常"}</Text>
    <Text font="caption" fontWeight="semibold">余额 {formatAmount(data.balance)}</Text>
    <Text font="caption2">本月 {formatKwh(data.monthTotalKwh)}</Text>
  </VStack>
}

function PowerFeeCard(props: {
  title: string
  valueText: string
  updateTime: string
  statusText: string
  statusColor: string
}) {
  const { title, valueText, updateTime, statusText, statusColor } = props
  const theme = POWER_THEMES.balance

  return <VStack
    alignment="center"
    padding={{ top: 9, leading: 8, bottom: 9, trailing: 8 }}
    frame={{ minWidth: 0, maxWidth: Infinity }}
    widgetBackground={{
      style: theme.bg,
      shape: { type: "rect", cornerRadius: 20, style: "continuous" },
    }}
  >
    <HStack alignment="center" spacing={5} frame={{ minWidth: 0, maxWidth: Infinity }}>
      <Image
        systemName={theme.icon}
        font={15}
        fontWeight="semibold"
        foregroundStyle={theme.tint}
      />
      <Text font={9} fontWeight="semibold" foregroundStyle={theme.tint} lineLimit={1} minScaleFactor={0.7}>
        {title}
      </Text>
      <Spacer minLength={0} />
    </HStack>

    <Spacer minLength={5} />
    <Text font={17} fontWeight="bold" foregroundStyle={theme.tint} lineLimit={1} minScaleFactor={0.56}>
      {valueText}
    </Text>
    <Spacer minLength={4} />
    <HStack alignment="center" spacing={3} padding={{ horizontal: 6, vertical: 3 }} background={<RoundedRectangle fill="rgba(255,255,255,0.38)" cornerRadius={999} />}>
      <Image systemName="arrow.triangle.2.circlepath" font={5} foregroundStyle={TIME_STYLE} />
      <Text
        font={9}
        foregroundStyle={TIME_STYLE}
        lineLimit={1}
        minScaleFactor={0.55}
      >
        {updateTime}
      </Text>
    </HStack>
    <Spacer minLength={5} />
    <HStack alignment="center" spacing={3}>
      <Image systemName="circle.fill" font={5} foregroundStyle={statusColor as any} />
      <Text font={9} foregroundStyle={TIME_STYLE} lineLimit={1} minScaleFactor={0.65}>{statusText}</Text>
    </HStack>
  </VStack>
}

function RingStatCard(props: {
  title: string
  valueText: string
  detailText: string
  theme: PowerTheme
  ratio?: number
}) {
  const { title, valueText, detailText, theme, ratio } = props
  const r = clamp01(ratio ?? 0)

  return <VStack
    alignment="center"
    padding={{ top: 9, leading: 8, bottom: 9, trailing: 8 }}
    frame={{ minWidth: 0, maxWidth: Infinity }}
    widgetBackground={{
      style: theme.bg,
      shape: { type: "rect", cornerRadius: 20, style: "continuous" },
    }}
  >
    <ZStack frame={{ width: 54, height: 54 }}>
      <Gauge
        value={r}
        min={0}
        max={1}
        label={<Text font={1}> </Text>}
        currentValueLabel={<Text font={1}> </Text>}
        gaugeStyle="accessoryCircularCapacity"
        tint={theme.tint}
      />
      <VStack alignment="center" spacing={0}>
        <Image
          systemName={theme.icon}
          font={12}
          fontWeight="semibold"
          foregroundStyle={theme.tint}
        />
        <Text font={11} fontWeight="bold" foregroundStyle={theme.tint}>
          {percentText(r)}%
        </Text>
      </VStack>
    </ZStack>

    <Spacer minLength={5} />
    <Text font={15} fontWeight="bold" foregroundStyle={theme.tint} lineLimit={1} minScaleFactor={0.54}>
      {valueText}
    </Text>
    <Spacer minLength={2} />
    <Text font={10} fontWeight="semibold" foregroundStyle={theme.tint} lineLimit={1} minScaleFactor={0.7}>
      {title}
    </Text>
    <Spacer minLength={2} />
    <Text font={9} foregroundStyle={TIME_STYLE} lineLimit={1} minScaleFactor={0.55}>
      {detailText}
    </Text>
  </VStack>
}

function BalancePanel({ data, width }: { data: WidgetData; width?: number }) {
  const hasArrears = data.arrears > 0
  const statusText = hasArrears ? `欠费 ${formatAmount(data.arrears)}` : "账户正常"
  const statusColor = hasArrears ? WARN : GOOD

  return <VStack
    alignment="leading"
    spacing={7}
    padding={{ horizontal: 11, vertical: 10 }}
    frame={{ width, minHeight: 134, alignment: "leading" }}
    background={<RoundedRectangle fill="rgba(0,146,255,0.24)" cornerRadius={18} />}
  >
    <HStack spacing={6}>
      <Image systemName="bolt.circle.fill" foregroundStyle="rgba(255,255,255,0.88)" font="caption" />
      <Text font="caption2" fontWeight="semibold" foregroundStyle="rgba(255,255,255,0.82)">可用余额</Text>
    </HStack>
    <Text font={24} fontWeight="bold" lineLimit={1} minScaleFactor={0.55}>
      {formatAmount(data.balance)}
    </Text>
    <Spacer minLength={0} />
    <StatusPill text={statusText} color={statusColor} compact />
    <Text font="caption2" foregroundStyle="rgba(255,255,255,0.62)" lineLimit={1} minScaleFactor={0.72}>
      {formatDataUpdateTime(data)}
    </Text>
  </VStack>
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  color,
  progress,
  compact = false,
}: {
  title: string
  value: string
  subtitle?: string
  icon?: string
  color?: string
  progress?: number
  compact?: boolean
}) {
  return <VStack
    alignment="leading"
    spacing={compact ? 4 : 5}
    padding={compact ? { horizontal: 9, vertical: 8 } : 10}
    frame={{ maxWidth: Number.MAX_SAFE_INTEGER, alignment: "leading" }}
    background={<RoundedRectangle fill={PANEL} cornerRadius={14} />}
  >
    <HStack spacing={5}>
      {icon ? <Image systemName={icon} foregroundStyle={(color ?? SCRIPT_ACCENT) as any} font="caption2" /> : null}
      <Text font="caption2" foregroundStyle={MUTED} lineLimit={1}>{title}</Text>
    </HStack>
    <Text font={compact ? 15 : "headline"} fontWeight="semibold" lineLimit={1} minScaleFactor={0.62}>
      {value}
    </Text>
    {progress == null ? null : <ProgressBar value={progress} color={color ?? SCRIPT_ACCENT} />}
    {subtitle ? <Text font="caption2" foregroundStyle="rgba(255,255,255,0.55)" lineLimit={1} minScaleFactor={0.68}>
      {subtitle}
    </Text> : null}
  </VStack>
}

function StatusPill({ text, color, compact = false }: { text: string; color: string; compact?: boolean }) {
  return <HStack
    spacing={4}
    padding={{ horizontal: compact ? 6 : 8, vertical: compact ? 3 : 4 }}
    background={<RoundedRectangle fill="rgba(255,255,255,0.12)" cornerRadius={999} />}
  >
    <Image systemName="circle.fill" foregroundStyle={color as any} font={compact ? 5 : 6} />
    <Text font="caption2" foregroundStyle={SOFT} lineLimit={1} minScaleFactor={0.7}>{text}</Text>
  </HStack>
}

function LatestDayChip({ data }: { data: WidgetData }) {
  const text = data.latestDay
    ? `最新日 ${data.latestDay.date} · ${formatKwh(data.latestDay.kwh)} · ${formatAmount(data.latestDay.charge)}`
    : `昨日用电 ${formatKwh(data.yesterdayKwh)}`

  return <HStack
    spacing={5}
    padding={{ horizontal: 8, vertical: 5 }}
    background={<RoundedRectangle fill={PANEL_LIGHT} cornerRadius={999} />}
  >
    <Image systemName="calendar" foregroundStyle={SCRIPT_ACCENT} font="caption2" />
    <Text font="caption2" foregroundStyle={SOFT} lineLimit={1} minScaleFactor={0.68}>{text}</Text>
  </HStack>
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  return <ZStack alignment="leading" frame={{ height: 5, maxWidth: "infinity" }}>
    <Rectangle
      foregroundStyle="rgba(255,255,255,0.16)"
      clipShape={{ type: "rect", cornerRadius: 2.5 }}
    />
    <Rectangle
      foregroundStyle={color as any}
      scaleEffect={{ x: Math.max(Math.min(value, 1), 0.02), y: 1, anchor: "leading" }}
      clipShape={{ type: "rect", cornerRadius: 2.5 }}
    />
  </ZStack>
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(value, 1))
}

function percentText(value: number) {
  return `${Math.round(clamp01(value) * 100)}`
}

function getMonthProgress(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return 0.08
  }

  return Math.max(0.08, Math.min(value / 300, 1))
}

function getDayProgress(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return 0.08
  }

  return Math.max(0.08, Math.min(value / 20, 1))
}

function getChargeProgress(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return 0.08
  }

  return Math.max(0.08, Math.min(value / 200, 1))
}

function getTierProgress(data: WidgetData) {
  const usage = data.monthTotalKwh ?? 0
  const tier = Math.max(1, Math.min(3, data.ladder.ladder ?? 1))
  if (tier === 1) {
    return Math.max(0.04, Math.min(usage / 260, 1))
  }
  if (tier === 2) {
    return Math.max(0.04, Math.min((usage - 260) / 340, 1))
  }
  return Math.max(0.04, Math.min((usage - 600) / 400, 1))
}

function formatIceRefreshTime(data: WidgetData) {
  if (!data.refreshedAt) {
    return "未同步"
  }

  const date = new Date(data.refreshedAt)
  if (Number.isNaN(date.getTime())) {
    const matched = data.refreshedAt.match(/(?:T|\s)(\d{1,2}):(\d{2})/)
    return matched ? `${matched[1].padStart(2, "0")}:${matched[2]}` : "未同步"
  }

  return `${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`
}

function formatDataUpdateTime(data: WidgetData) {
  if (data.refreshedAt) {
    return `更新 ${formatUpdateClock(data.refreshedAt)}`
  }

  if (data.latestDay?.date) {
    return `数据 ${formatMonthDay(data.latestDay.date)}`
  }

  return "未同步"
}

function formatUpdateClock(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return formatMonthDay(value)
  }

  const now = new Date()
  const timeText = `${`${date.getHours()}`.padStart(2, "0")}:${`${date.getMinutes()}`.padStart(2, "0")}`
  if (date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()) {
    return timeText
  }

  return `${date.getMonth() + 1}/${date.getDate()} ${timeText}`
}

function formatMonthDay(value: string) {
  const matched = value.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (matched) {
    return `${matched[2]}/${matched[3]}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return `${`${date.getMonth() + 1}`.padStart(2, "0")}/${`${date.getDate()}`.padStart(2, "0")}`
}

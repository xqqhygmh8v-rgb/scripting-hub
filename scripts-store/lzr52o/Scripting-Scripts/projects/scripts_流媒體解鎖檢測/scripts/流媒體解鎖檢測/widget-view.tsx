import { Button, HStack, Image, Spacer, Text, VStack, Widget } from "scripting"
import { RefreshUnlockIntent } from "./app_intents"
import { displayTitle, formatLocalizedTime, updatePrefix } from "./locale"
import { formatShortTime, serviceLine, stateColor, type ServiceResult, type ServiceState, type UnlockReport } from "./model"
import { type WidgetStyle } from "./settings"

const SUBTITLE = "#9E9E9E"
const PLAY = "#FF2D55"
const MAP = "#0A84FF"

function findService(report: UnlockReport, id: ServiceResult["id"]): ServiceResult {
  return report.services.find(item => item.id === id) ?? report.services[0]
}

function Gap(props: { height: number }) {
  return <VStack frame={{ height: props.height }} />
}

function statusSymbol(state: ServiceState): string | null {
  switch (state) {
    case "ok": return "checkmark.circle.fill"
    case "warn": return "exclamationmark.triangle.fill"
    case "soon": return "clock.fill"
    case "no": return "xmark.circle.fill"
    default: return null
  }
}

function StatusMark(props: { service: ServiceResult; font: number }) {
  const symbol = statusSymbol(props.service.state)
  if (!symbol) {
    return <Text font={props.font} fontWeight="medium" lineLimit={1}>N/A</Text>
  }
  const region = props.service.state === "no" ? "" : props.service.region
  return <HStack spacing={3} alignment="center">
    <Image systemName={symbol} font={props.font - 1} foregroundStyle={stateColor(props.service.state)} />
    {region ? <Text font={props.font} fontWeight="medium" lineLimit={1}>{region}</Text> : null}
  </HStack>
}

function nameWidth(name: string, font: number): number {
  return Math.round(Math.max(font * 3.8, name.length * font * 0.58 + 8))
}

function ServiceCell(props: { service: ServiceResult; font: number; textColor: WidgetStyle["textColor"]; labelWidth: number }) {
  return <HStack spacing={4} alignment="center" frame={{ maxWidth: "infinity", alignment: "center" }}>
    <Text
      font={props.font}
      fontWeight="medium"
      foregroundStyle={props.textColor}
      lineLimit={1}
      frame={{ width: props.labelWidth, alignment: "leading" }}
    >{props.service.shortName}</Text>
    <Text font={props.font} fontWeight="medium" foregroundStyle={props.textColor} frame={{ width: props.font, alignment: "center" }}>➟</Text>
    <StatusMark service={props.service} font={props.font} />
  </HStack>
}

function ServiceRows(props: { report: UnlockReport; font: number; gap: number; textColor: WidgetStyle["textColor"] }) {
  const youtube = findService(props.report, "youtube")
  const netflix = findService(props.report, "netflix")
  const chatgpt = findService(props.report, "chatgpt")
  const disney = findService(props.report, "disney")
  const leftLabelWidth = Math.max(nameWidth(youtube.shortName, props.font), nameWidth(chatgpt.shortName, props.font))
  const rightLabelWidth = Math.max(nameWidth(netflix.shortName, props.font), nameWidth(disney.shortName, props.font))
  return <HStack spacing={16} alignment="center" padding={{ horizontal: 12 }} frame={{ maxWidth: "infinity" }}>
    <VStack alignment="leading" spacing={props.gap} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <ServiceCell service={youtube} font={props.font} textColor={props.textColor} labelWidth={leftLabelWidth} />
      <ServiceCell service={chatgpt} font={props.font} textColor={props.textColor} labelWidth={leftLabelWidth} />
    </VStack>
    <VStack alignment="leading" spacing={props.gap} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <ServiceCell service={netflix} font={props.font} textColor={props.textColor} labelWidth={rightLabelWidth} />
      <ServiceCell service={disney} font={props.font} textColor={props.textColor} labelWidth={rightLabelWidth} />
    </VStack>
  </HStack>
}

function ServiceTile(props: { service: ServiceResult; textColor: WidgetStyle["textColor"] }) {
  const symbol = statusSymbol(props.service.state)
  const region = props.service.state === "na"
    ? "N/A"
    : props.service.state === "no"
      ? ""
      : props.service.region
  return <VStack alignment="center" spacing={2} frame={{ maxWidth: "infinity", alignment: "center" }}>
    <Text font={11} foregroundStyle={props.textColor} lineLimit={1}>{props.service.shortName}</Text>
    <HStack spacing={3} alignment="center">
      {symbol ? <Image systemName={symbol} font={14} foregroundStyle={stateColor(props.service.state)} /> : null}
      <Text font={16} fontWeight="bold" lineLimit={1} foregroundStyle={stateColor(props.service.state)}>
        {region || (symbol ? "" : "N/A")}
      </Text>
    </HStack>
  </VStack>
}

function smallTitleFont(title: string): number {
  if (title.length <= 4) return 15
  if (title.length <= 6) return 14
  return 13
}

function SmallWidget(props: { style: WidgetStyle; report: UnlockReport }) {
  const title = displayTitle(props.style.title)
  const youtube = findService(props.report, "youtube")
  const netflix = findService(props.report, "netflix")
  const chatgpt = findService(props.report, "chatgpt")
  const disney = findService(props.report, "disney")
  return <VStack
    alignment="center"
    spacing={0}
    padding={{ horizontal: 12, top: 18, bottom: 8 }}
    frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "center" }}
    widgetBackground={{ light: "#FFFFFF", dark: "#1C1C1E" }}
  >
    <HStack spacing={0} alignment="center" frame={{ maxWidth: "infinity", alignment: "center" }}>
      <Spacer />
      <HStack spacing={4} alignment="center" layoutPriority={1}>
        <Image systemName="play.tv.fill" font={13} foregroundStyle={PLAY} />
        <Text
          font={smallTitleFont(title)}
          fontWeight="bold"
          foregroundStyle={props.style.textColor}
          lineLimit={1}
          layoutPriority={1}
        >{title}</Text>
      </HStack>
      <Spacer />
    </HStack>
    <Gap height={8} />
    <VStack alignment="center" spacing={10} frame={{ maxWidth: "infinity" }}>
      <HStack spacing={8} alignment="center" frame={{ maxWidth: "infinity" }}>
        <ServiceTile service={youtube} textColor={props.style.textColor} />
        <ServiceTile service={netflix} textColor={props.style.textColor} />
      </HStack>
      <HStack spacing={8} alignment="center" frame={{ maxWidth: "infinity" }}>
        <ServiceTile service={chatgpt} textColor={props.style.textColor} />
        <ServiceTile service={disney} textColor={props.style.textColor} />
      </HStack>
    </VStack>
    <Spacer />
    {props.style.showTime ? <Button
      buttonStyle="plain"
      intent={RefreshUnlockIntent(true)}
      frame={{ maxWidth: "infinity", minHeight: 32 }}
    >
      <HStack spacing={4} alignment="center" frame={{ maxWidth: "infinity", minHeight: 32, alignment: "center" }}>
        <Spacer />
        <Image systemName="arrow.clockwise" font={11} foregroundStyle={SUBTITLE} />
        <Text font={12} foregroundStyle={SUBTITLE} lineLimit={1}>{formatShortTime(props.report.timestamp)}</Text>
        <Spacer />
      </HStack>
    </Button> : null}
  </VStack>
}

function maskedIP(ip: string, enabled: boolean): string {
  if (!enabled) return ip
  const parts = ip.trim().split(".")
  if (parts.length === 4 && parts.every(part => /^\d{1,3}$/.test(part))) {
    return `${parts[0]}.${parts[1]}.xxx.xxx`
  }
  return ip
}

function LocationRow(props: { report: UnlockReport; font: number; textColor: WidgetStyle["textColor"]; maskIP: boolean }) {
  return <HStack spacing={5} alignment="center" frame={{ maxWidth: "infinity" }}>
    <Image systemName="map" font={props.font - 2} foregroundStyle={MAP} />
    <Text font={props.font} foregroundStyle={props.textColor} lineLimit={1}>{maskedIP(props.report.ip, props.maskIP)}</Text>
    <Image systemName="mappin" font={props.font - 2} foregroundStyle="#FF453A" />
    <Text font={props.font} foregroundStyle={props.textColor} lineLimit={1}>{props.report.location}</Text>
  </HStack>
}

export function UnlockWidgetView(props: { style: WidgetStyle; report: UnlockReport }) {
  const family = String(Widget.family)
  const youtube = findService(props.report, "youtube")
  const netflix = findService(props.report, "netflix")
  const chatgpt = findService(props.report, "chatgpt")
  const disney = findService(props.report, "disney")
  const title = displayTitle(props.style.title)

  if (family === "accessoryInline") {
    return <HStack spacing={4}>
      <Image systemName="play.tv.fill" foregroundStyle={PLAY} />
      <Text lineLimit={1}>{serviceLine(disney)}</Text>
    </HStack>
  }

  if (family === "accessoryCircular") {
    const ready = props.report.services.filter(item => item.state === "ok" || item.state === "warn" || item.state === "soon").length
    return <VStack spacing={0}>
      <Image systemName="play.tv.fill" font={12} foregroundStyle={PLAY} />
      <Text font={16} fontWeight="bold">{ready}/4</Text>
    </VStack>
  }

  if (family === "accessoryRectangular") {
    return <VStack alignment="leading" spacing={2}>
      <Text font={12} fontWeight="bold" lineLimit={1}>{title}</Text>
      <Text font={11} lineLimit={1}>{serviceLine(youtube)}   {serviceLine(netflix)}</Text>
      <Text font={11} lineLimit={1}>{serviceLine(chatgpt)}   {serviceLine(disney)}</Text>
    </VStack>
  }

  if (family === "systemSmall") return <SmallWidget style={props.style} report={props.report} />

  const large = family === "systemLarge" || family === "systemExtraLarge" || family === "systemExtraLargePortrait"
  const compact = props.style.layout === "compact"
  const titleSize = compact ? 16 : large ? 20 : 18
  const body = compact ? 13 : large ? 16 : 15
  const meta = 13
  const titleIcon = titleSize - 2

  return <VStack
    alignment="leading"
    spacing={0}
    padding={{ horizontal: 12, vertical: 8 }}
    frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "center" }}
    widgetBackground={{ light: "#FFFFFF", dark: "#1C1C1E" }}
  >
    <HStack spacing={6} alignment="center" frame={{ maxWidth: "infinity" }}>
      <Spacer />
      <Image systemName="play.tv.fill" font={titleIcon} foregroundStyle={PLAY} />
      <Text font={titleSize} fontWeight="bold" foregroundStyle={props.style.textColor} lineLimit={1}>{title}</Text>
      <VStack frame={{ width: titleIcon }} />
      <Spacer />
    </HStack>

    {props.style.showLocation ? <VStack alignment="leading" spacing={0} frame={{ maxWidth: "infinity" }}>
      <Gap height={6} />
      <LocationRow report={props.report} font={body} textColor={props.style.textColor} maskIP={props.style.maskIP} />
    </VStack> : null}

    <Gap height={12} />
    <ServiceRows report={props.report} font={body} gap={10} textColor={props.style.textColor} />

    {props.style.showTime ? <VStack alignment="center" spacing={0} frame={{ maxWidth: "infinity" }}>
      <Gap height={12} />
      <Button buttonStyle="plain" intent={RefreshUnlockIntent(true)}>
        <HStack spacing={4} alignment="center" frame={{ maxWidth: "infinity", minHeight: 28, alignment: "center" }}>
          <Spacer />
          <Image systemName="arrow.clockwise" font={meta - 1} foregroundStyle={SUBTITLE} />
          <Text font={meta} foregroundStyle={SUBTITLE} lineLimit={1}>{updatePrefix()}{formatLocalizedTime(props.report.timestamp)}</Text>
          <Spacer />
        </HStack>
      </Button>
    </VStack> : null}
  </VStack>
}

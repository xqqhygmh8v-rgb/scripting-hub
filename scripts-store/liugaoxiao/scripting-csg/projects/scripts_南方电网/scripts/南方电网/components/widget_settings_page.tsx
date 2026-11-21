import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Picker,
  Rectangle,
  RoundedRectangle,
  Spacer,
  Section,
  Text,
  VStack,
  Widget,
  ZStack,
  gradient,
  useState,
} from "scripting"
import { MediumWidgetPreview, SmallWidgetPreview } from "./widget_view"
import { SCRIPT_ACCENT } from "../constants"
import { patchSettings, readSettings, readWidgetCache } from "../storage"
import {
  WIDGET_METRIC_IDS,
  WIDGET_METRIC_LABELS,
  isWidgetMetricId,
  normalizeWidgetConfiguration,
  updateWidgetMetricSlot,
  type IceAppearance,
  type WidgetConfiguration,
  type WidgetMetricId,
  type WidgetStyle,
} from "../widget_config"
import {
  DEFAULT_WIDGET_GRADIENT_ID,
  WIDGET_GRADIENTS,
  appendCustomWidgetGradient,
  importWidgetGradientsFromPhotos,
  resolveWidgetGradient,
  type WidgetGradientDefinition,
} from "../widget_gradients"

const Btn = Button as any
const STYLE_LABELS: Record<WidgetStyle, string> = {
  classic: "经典版",
  glass: "青绿玻璃版",
  ice: "冰川小号",
  iceMedium: "阶梯看板",
}

export function WidgetSettingsPage() {
  const dismiss = Navigation.useDismiss()
  const settings = readSettings()
  const initial = normalizeWidgetConfiguration(settings)
  const previewData = readWidgetCache()
  const [widgetStyle, setWidgetStyle] = useState<WidgetStyle>(initial.widgetStyle)
  const [widgetMetricIds, setWidgetMetricIds] = useState<WidgetMetricId[]>(initial.widgetMetricIds)
  const [iceAppearance, setIceAppearance] = useState<IceAppearance>(initial.iceAppearance)
  const [widgetGradientId, setWidgetGradientId] = useState(initial.widgetGradientId)
  const [customWidgetGradients, setCustomWidgetGradients] = useState<WidgetGradientDefinition[]>(initial.customWidgetGradients)
  const [isManagingGradients, setIsManagingGradients] = useState(false)
  const [isImportingGradient, setIsImportingGradient] = useState(false)
  const [gradientStatus, setGradientStatus] = useState("")
  const activeGradient = resolveWidgetGradient(widgetGradientId, customWidgetGradients)
  const availableGradients = [...WIDGET_GRADIENTS, ...customWidgetGradients]

  function configuration(style = widgetStyle): WidgetConfiguration {
    return {
      widgetStyle: style,
      widgetMetricIds,
      iceAppearance,
      widgetGradientId,
      customWidgetGradients,
    }
  }

  function changeMetric(index: number, value: string) {
    if (isWidgetMetricId(value)) {
      setWidgetMetricIds((current) => updateWidgetMetricSlot(current, index, value))
    }
  }

  function changeStyle(value: string) {
    setWidgetStyle(value as WidgetStyle)
    setIsManagingGradients(false)
  }

  async function handlePreview() {
    const label = STYLE_LABELS[widgetStyle]
    await Widget.preview({
      family: widgetStyle === "ice" ? "systemSmall" : "systemMedium",
      parameters: {
        options: { [label]: JSON.stringify(configuration()) },
        default: label,
      },
    })
  }

  async function handleGradientImport() {
    if (isImportingGradient) return
    setIsImportingGradient(true)
    setGradientStatus("正在识别图片配色…")
    try {
      const result = await importWidgetGradientsFromPhotos()
      let nextGradients = customWidgetGradients
      for (const imported of result.gradients) {
        nextGradients = appendCustomWidgetGradient(nextGradients, imported)
      }
      const lastImported = nextGradients[nextGradients.length - 1]
      setCustomWidgetGradients(nextGradients)
      setWidgetGradientId(lastImported.id)
      setGradientStatus(result.message)
      setIsManagingGradients(false)
    } catch (error) {
      setGradientStatus(String((error as Error)?.message ?? error))
    } finally {
      setIsImportingGradient(false)
    }
  }

  function clearCustomWidgetGradient(gradientId: string) {
    const nextGradients = customWidgetGradients.filter((item) => item.id !== gradientId)
    if (widgetGradientId === gradientId) {
      setWidgetGradientId(DEFAULT_WIDGET_GRADIENT_ID)
    }
    setCustomWidgetGradients(nextGradients)
    setGradientStatus("已删除导入配色")
    if (nextGradients.length === 0) setIsManagingGradients(false)
  }

  function handleApply() {
    patchSettings(configuration())
    Widget.reloadAll()
    dismiss(true)
  }

  const visibleMetricIds = widgetStyle === "classic"
    ? widgetMetricIds
    : widgetStyle === "ice"
      ? widgetMetricIds.slice(0, 1)
      : widgetMetricIds.slice(0, 3)

  return <NavigationStack>
    <List
      navigationTitle="小组件预览"
      navigationBarTitleDisplayMode="inline"
      listStyle="insetGroup"
      toolbar={{
        cancellationAction: <Button title="返回" action={() => dismiss()} />,
      }}
    >
      <Section header={<Text>小组件样式</Text>}>
        <Picker
          title="小组件样式"
          value={widgetStyle}
          onChanged={changeStyle}
          pickerStyle="segmented"
          tint={SCRIPT_ACCENT}
          frame={{ maxWidth: "infinity", height: 34 }}
          listRowInsets={{ top: 6, bottom: 6, leading: 8, trailing: 8 }}
        >
          <Text tag="classic" font={10}>经典版</Text>
          <Text tag="glass" font={10}>青绿玻璃版</Text>
          <Text tag="ice" font={10}>冰川小号</Text>
          <Text tag="iceMedium" font={10}>阶梯看板</Text>
        </Picker>
      </Section>

      <Section>
        <VStack
          alignment="center"
          frame={{ minHeight: 174, maxWidth: "infinity" }}
          listRowInsets={{ top: 8, bottom: 8, leading: 0, trailing: 0 }}
          listRowBackground={<Rectangle fill="clear" />}
          listRowSeparator="hidden"
        >
          {previewData ? (
            <Btn action={handlePreview} buttonStyle="plain">
              {widgetStyle === "ice" ? (
                <SmallWidgetPreview data={previewData} configuration={configuration()} />
              ) : (
                <MediumWidgetPreview data={previewData} configuration={configuration()} />
              )}
            </Btn>
          ) : <EmptyWidgetPreview small={widgetStyle === "ice"} />}
          {widgetStyle === "ice" ? (
            <Picker
              title="冰川小号外观"
              value={iceAppearance}
              onChanged={(value: string) => setIceAppearance(value as IceAppearance)}
              pickerStyle="segmented"
              tint={SCRIPT_ACCENT}
              frame={{ width: 142, height: 30 }}
            >
              <Text tag="dark" font={11}>深色</Text>
              <Text tag="light" font={11}>浅色</Text>
            </Picker>
          ) : null}
        </VStack>
      </Section>

      <Section header={<Text>显示内容</Text>}>
        {visibleMetricIds.map((metricId, index) => (
          <WidgetMetricPickerRow
            title={slotTitle(widgetStyle, index)}
            value={metricId}
            onChanged={(value) => changeMetric(index, value)}
          />
        ))}
      </Section>

      {widgetStyle === "iceMedium" ? (
        <Section
          header={<HStack frame={{ maxWidth: "infinity" }}>
            <Text>渐变配色</Text>
            <Spacer minLength={4} />
            <Btn
              action={() => setIsManagingGradients((current) => !current)}
              buttonStyle="plain"
              disabled={customWidgetGradients.length === 0}
            >
              <Text font={13} fontWeight="medium" foregroundStyle={customWidgetGradients.length > 0 ? SCRIPT_ACCENT : "#AEAEB2"}>
                {isManagingGradients ? "完成" : "管理"}
              </Text>
            </Btn>
          </HStack>}
          footer={gradientStatus ? <Text>{gradientStatus}</Text> : undefined}
        >
          {gradientRows(availableGradients).map((row) => (
            <HStack
              spacing={0}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
              listRowInsets={{ top: 0, bottom: 0, leading: 0, trailing: 0 }}
            >
              {row.map((item, columnIndex) => (
                <HStack spacing={0} frame={{ maxWidth: "infinity", minHeight: 44 }}>
                  {columnIndex > 0 ? <Rectangle fill="#E2E2E5" frame={{ width: 0.5, height: 34 }} /> : null}
                  <GradientOption
                    gradientDefinition={item}
                    selected={item.id === activeGradient.id}
                    managing={isManagingGradients}
                    onSelect={() => {
                      setWidgetGradientId(item.id)
                      setGradientStatus("")
                    }}
                    onDelete={() => clearCustomWidgetGradient(item.id)}
                  />
                </HStack>
              ))}
            </HStack>
          ))}
          <Btn
            action={handleGradientImport}
            buttonStyle="plain"
            disabled={isImportingGradient}
            listRowInsets={{ top: 0, bottom: 0, leading: 0, trailing: 0 }}
          >
            <HStack
              spacing={11}
              padding={{ horizontal: 12, vertical: 0 }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
              contentShape="rect"
            >
              <ZStack frame={{ width: 28, height: 28 }}>
                <RoundedRectangle fill="#5E5CE6" cornerRadius={7} frame={{ width: 28, height: 28 }} />
                <Image systemName="photo.on.rectangle" font={15} foregroundStyle="white" />
              </ZStack>
              <Text font={14} fontWeight="medium" foregroundStyle={isImportingGradient ? "#77777F" : "#111114"}>
                {isImportingGradient ? "正在识别配色" : "从图片导入配色"}
              </Text>
              <Spacer minLength={4} />
            </HStack>
          </Btn>
        </Section>
      ) : null}

      <Section>
        <WidgetApplyButton action={handleApply} />
      </Section>
    </List>
  </NavigationStack>
}

function WidgetApplyButton(props: { action: () => void }) {
  return <Btn
    action={props.action}
    buttonStyle="plain"
    frame={{ maxWidth: "infinity" }}
    contentShape="rect"
    listRowInsets={{ top: 8, bottom: 8, leading: 8, trailing: 8 }}
  >
    <HStack
      spacing={8}
      frame={{ minHeight: 50, maxWidth: "infinity" }}
      background={<RoundedRectangle fill={SCRIPT_ACCENT} cornerRadius={25} />}
      contentShape="rect"
    >
      <Image systemName="checkmark" font={20} fontWeight="semibold" foregroundStyle="white" />
      <Text font={17} fontWeight="semibold" foregroundStyle="white">应用小组件设置</Text>
    </HStack>
  </Btn>
}

function GradientOption(props: {
  gradientDefinition: WidgetGradientDefinition
  selected: boolean
  managing: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const item = props.gradientDefinition
  return <HStack spacing={0} frame={{ maxWidth: "infinity" }}>
    <Btn action={props.onSelect} buttonStyle="plain" frame={{ maxWidth: "infinity" }} contentShape="rect">
      <HStack
        spacing={8}
        padding={{ horizontal: 10, vertical: 5 }}
        frame={{ minHeight: 44, maxWidth: "infinity" }}
        background={<Rectangle fill={props.selected ? "rgba(10,132,255,0.08)" : "rgba(255,255,255,0.001)"} />}
        contentShape="rect"
      >
        <RoundedRectangle
          fill={gradient("linear", { colors: item.colors as any, startPoint: "topLeading", endPoint: "bottomTrailing" })}
          cornerRadius={7}
          frame={{ width: 38, height: 24 }}
        />
        <Text
          font={12}
          fontWeight="medium"
          foregroundStyle={props.selected ? SCRIPT_ACCENT : "#29292D"}
          lineLimit={1}
          minScaleFactor={0.72}
        >
          {item.label}
        </Text>
        <Spacer minLength={0} />
        {props.selected && !(item.custom && props.managing) ? (
          <Image systemName="checkmark" font={11} fontWeight="bold" foregroundStyle={SCRIPT_ACCENT} />
        ) : null}
      </HStack>
    </Btn>
    {item.custom && props.managing ? (
      <Btn action={props.onDelete} buttonStyle="plain" frame={{ width: 34, height: 44 }}>
        <ZStack frame={{ width: 26, height: 26 }}>
          <RoundedRectangle fill="#FF3B30" cornerRadius={13} frame={{ width: 26, height: 26 }} />
          <Image systemName="trash.fill" font={12} foregroundStyle="white" />
        </ZStack>
      </Btn>
    ) : null}
  </HStack>
}

function WidgetMetricPickerRow(props: {
  title: string
  value: WidgetMetricId
  onChanged: (value: string) => void
}) {
  return <Picker
    label={<Text font={15}>{props.title}</Text>}
    value={props.value}
    onChanged={props.onChanged}
    pickerStyle="menu"
    tint={SCRIPT_ACCENT}
    frame={{ minHeight: 44, maxWidth: "infinity" }}
    listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
  >
    {WIDGET_METRIC_IDS.map((id) => <Text tag={id}>{WIDGET_METRIC_LABELS[id]}</Text>)}
  </Picker>
}

function WidgetDivider() {
  return <Rectangle fill="#E2E2E5" frame={{ height: 0.5 }} padding={{ horizontal: 12 }} />
}

function EmptyWidgetPreview({ small }: { small: boolean }) {
  return <VStack
    alignment="center"
    spacing={6}
    frame={small ? { width: 158, height: 158 } : { width: 338, height: 158 }}
    background={<RoundedRectangle fill="#16213A" cornerRadius={small ? 28 : 22} />}
  >
    <Text font={15} fontWeight="semibold" foregroundStyle="white">暂无小组件数据</Text>
    <Text font={12} foregroundStyle="rgba(255,255,255,0.66)">登录并同步账户后显示</Text>
  </VStack>
}

function slotTitle(style: WidgetStyle, index: number) {
  if (style === "ice") return "底部数据"
  if (style === "iceMedium") return ["主数据", "副数据 1", "副数据 2"][index]
  return `数据位 ${index + 1}`
}

function gradientRows(items: WidgetGradientDefinition[]) {
  const rows: WidgetGradientDefinition[][] = []
  for (let index = 0; index < items.length; index += 2) {
    rows.push(items.slice(index, index + 2))
  }
  return rows
}

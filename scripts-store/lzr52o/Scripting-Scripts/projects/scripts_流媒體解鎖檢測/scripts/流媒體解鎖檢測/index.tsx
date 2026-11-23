import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Picker,
  Script,
  Section,
  Spacer,
  Text,
  TextField,
  Toggle,
  VStack,
  Widget,
  useState,
} from "scripting"
import { checkUnlock } from "./check"
import { colorName, formatLocalizedTime, serviceDetail, stateText, styleDisplayName, text } from "./locale"
import { stateColor, type UnlockReport } from "./model"
import {
  classicStyle,
  isFresh,
  loadCache,
  loadStyles,
  previewOptions,
  saveCache,
  saveStyles,
  TEXT_COLORS,
  type WidgetStyle,
} from "./settings"

type PreviewFamily = "systemSmall" | "systemMedium" | "systemLarge"

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return text().unknownError
}

async function previewStyles(styles: WidgetStyle[], family: PreviewFamily, preferredId?: string): Promise<void> {
  const ready = styles.length > 0 ? styles : [classicStyle()]
  const { options, names } = previewOptions(ready)
  const preferred = ready.find(item => item.id === preferredId) ?? ready[0]
  const preferredName = names.find(name => options[name] === JSON.stringify({ id: preferred.id })) ?? names[0]
  try {
    await Widget.preview({
      family,
      parameters: {
        options,
        default: preferredName,
      },
    })
  } catch (error) {
    await Dialog.alert({
      title: text().previewFailed,
      message: errorMessage(error),
      buttonLabel: text().close,
    })
  }
}

function StyleEditor(props: {
  style: WidgetStyle
  onChange: (style: WidgetStyle) => void
  onDelete?: () => void
}) {
  const style = props.style
  const copy = text()
  const [previewFamily, setPreviewFamily] = useState("choose")

  function update(patch: Partial<WidgetStyle>) {
    props.onChange({ ...style, ...patch })
  }

  return <List navigationTitle={styleDisplayName(style.name)} navigationBarTitleDisplayMode="inline">
    <Section
      header={<Text>{copy.name}</Text>}
      footer={<Text>{copy.styleHint}</Text>}
    >
      <TextField title={copy.styleName} value={style.name} onChanged={(value: string) => update({ name: value })} />
      <TextField title={copy.widgetTitle} value={style.title} onChanged={(value: string) => update({ title: value })} />
    </Section>
    <Section header={<Text>{copy.appearance}</Text>}>
      <Picker
        title={copy.layout}
        value={style.layout === "compact" ? "compact" : "classic"}
        pickerStyle="menu"
        onChanged={(value: string) => {
          if (value === "classic" || value === "compact") update({ layout: value })
        }}
      >
        <Text tag="classic">{copy.standard}</Text>
        <Text tag="compact">{copy.compact}</Text>
      </Picker>
      <Picker
        title={copy.textColor}
        value={style.textColor}
        pickerStyle="menu"
        onChanged={(value: string) => {
          const color = TEXT_COLORS.find(item => item.id === value)
          if (color) update({ textColor: color.id })
        }}
      >
        {TEXT_COLORS.map(item => <Text tag={item.id}>{colorName(item.id)}</Text>)}
      </Picker>
      <Toggle title={copy.showLocation} value={style.showLocation} onChanged={(value: boolean) => update({ showLocation: value })} />
      <Toggle title={copy.maskIP} value={style.maskIP} onChanged={(value: boolean) => update({ maskIP: value })} />
      <Toggle title={copy.showTime} value={style.showTime} onChanged={(value: boolean) => update({ showTime: value })} />
    </Section>
    <Section header={<Text>{copy.preview}</Text>}>
      <Picker
        title={copy.previewThis}
        value={previewFamily}
        pickerStyle="menu"
        onChanged={(value: string) => {
          if (value !== "systemSmall" && value !== "systemMedium" && value !== "systemLarge") return
          setPreviewFamily(value)
          void previewStyles(loadStyles(), value, style.id).finally(() => setPreviewFamily("choose"))
        }}
      >
        <Text tag="choose">{copy.chooseSize}</Text>
        <Text tag="systemSmall">{copy.small}</Text>
        <Text tag="systemMedium">{copy.medium}</Text>
        <Text tag="systemLarge">{copy.large}</Text>
      </Picker>
    </Section>
  </List>
}

function Page() {
  const dismiss = Navigation.useDismiss()
  const cached = loadCache()
  const [report, setReport] = useState<UnlockReport | null>(cached)
  const [checking, setChecking] = useState(false)
  const [styles, setStyles] = useState<WidgetStyle[]>(loadStyles())
  const [route, setRoute] = useState<string | null>(null)
  const [previewFamily, setPreviewFamily] = useState("choose")
  const style = styles[0] ?? classicStyle()
  const editing = route === style.id ? style : null
  const copy = text()

  function commitStyle(next: WidgetStyle) {
    const normalized = [next]
    saveStyles(normalized)
    setStyles(normalized)
    Widget.reloadAll()
  }

  async function refresh() {
    setChecking(true)
    try {
      const next = await checkUnlock()
      saveCache(next)
      setReport(next)
      Widget.reloadAll()
    } catch (error) {
      await Dialog.alert({
        title: copy.checkFailed,
        message: errorMessage(error),
        buttonLabel: copy.close,
      })
    } finally {
      setChecking(false)
    }
  }

  const fresh = report ? isFresh(report) : false

  return <NavigationStack>
    <List
      navigationTitle={copy.title}
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        cancellationAction: <Button title={copy.close} action={dismiss} />,
        primaryAction: <Button
          title={checking ? copy.checking : copy.recheck}
          action={() => {
            if (!checking) void refresh()
          }}
        />,
      }}
      navigationDestination={{
        isPresented: editing != null,
        onChanged: (open: boolean) => {
          if (!open) {
            setRoute(null)
            Widget.reloadAll()
          }
        },
        content: editing ? <StyleEditor
          style={editing}
          onChange={commitStyle}
        /> : <Text>{copy.style}</Text>,
      }}
    >
      <Section
        header={<Text>{copy.node}</Text>}
        footer={<Text>{report ? `${fresh ? copy.fresh : copy.stale} · ${formatLocalizedTime(report.timestamp)}` : copy.emptyHint}</Text>}
      >
        {report ? <VStack alignment="leading" spacing={4}>
          <Text font="headline">{report.ip}</Text>
          <Text font="subheadline" foregroundStyle="secondaryLabel">{report.location}</Text>
        </VStack> : <Text foregroundStyle="secondaryLabel">{copy.noResult}</Text>}
        <Button
          title={checking ? copy.checking : copy.recheck}
          action={() => {
            if (!checking) void refresh()
          }}
        />
      </Section>

      {report ? <Section header={<Text>{copy.services}</Text>}>
        {report.services.map(service => <HStack key={service.id} spacing={8}>
          <VStack alignment="leading" spacing={2}>
            <Text>{service.name}</Text>
            <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>{serviceDetail(service)}</Text>
          </VStack>
          <Spacer />
          <Text fontWeight="semibold" foregroundStyle={stateColor(service.state)}>
            {stateText(service.state)}{service.region ? ` ${service.region}` : ""}
          </Text>
        </HStack>)}
      </Section> : null}

      <Section
        header={<Text>{copy.widgetStyle}</Text>}
        footer={<VStack alignment="leading" spacing={2}>
          <Text font="footnote" foregroundStyle="secondaryLabel">{copy.listLine1}</Text>
          <Text font="footnote" foregroundStyle="secondaryLabel">{copy.listLine2}</Text>
        </VStack>}
      >
        <Button buttonStyle="plain" action={() => setRoute(style.id)}>
          <HStack>
            <VStack alignment="leading" spacing={2}>
              <Text>{styleDisplayName(style.name)}</Text>
              <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
                {(style.layout === "compact" ? copy.compact : copy.standard)} · {copy.textPrefix}{colorName(style.textColor)}
              </Text>
            </VStack>
            <Spacer />
            <Image systemName="chevron.right" font="caption" foregroundStyle="tertiaryLabel" />
          </HStack>
        </Button>
      </Section>

      <Section header={<Text>{copy.preview}</Text>}>
        <Picker
          title={copy.previewWidget}
          value={previewFamily}
          pickerStyle="menu"
          onChanged={(value: string) => {
            if (value !== "systemSmall" && value !== "systemMedium" && value !== "systemLarge") return
            setPreviewFamily(value)
            void previewStyles(styles, value).finally(() => setPreviewFamily("choose"))
          }}
        >
          <Text tag="choose">{copy.chooseSize}</Text>
          <Text tag="systemSmall">{copy.small}</Text>
          <Text tag="systemMedium">{copy.medium}</Text>
          <Text tag="systemLarge">{copy.large}</Text>
        </Picker>
      </Section>
    </List>
  </NavigationStack>
}

async function run() {
  await Navigation.present(<Page />)
  Script.exit()
}

run()

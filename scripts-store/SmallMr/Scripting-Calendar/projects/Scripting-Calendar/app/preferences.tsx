import {
  Button,
  HStack,
  List,
  Navigation,
  NavigationStack,
  Picker,
  ProgressView,
  Section,
  Slider,
  Spacer,
  Text,
  TextField,
  Toggle,
  VStack,
  Widget,
  useEffect,
  useState
} from 'scripting'
import {
  fetchHolidayYear,
  formatUpdatedAt,
  makeEmptyHolidayYear,
  readFetchFailure,
  readHolidayYear,
  writeFetchFailure,
  writeHolidayYear
} from '../core/holidays'
import type { HolidayFetchFailure, HolidayYearData } from '../core/holidays'
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  FONT_WEIGHT_MAX,
  FONT_WEIGHT_MIN,
  FONT_WEIGHT_STEP,
  readSettings,
  writeSettings
} from '../core/settings'
import type { CalendarSettings, WeekStart } from '../core/settings'

const VERSION = '1.0.0'

const AUTO_REFRESH_INTERVAL = 30 * 24 * 60 * 60 * 1000

const PRESETS = [
  { color: '#F8F8FA', label: '云白' },
  { color: '#FFFFFF', label: '纯白' },
  { color: '#FAF7F1', label: '米白' },
  { color: '#F1F6F8', label: '雾蓝' }
]

const CUSTOM_TAG = 'custom'

const WEIGHT_LABELS: Record<number, string> = {
  [-2]: '极细',
  [-1]: '较细',
  0: '标准',
  1: '较粗',
  2: '粗'
}

function shortMessage(message: string) {
  return message.length > 80 ? `${message.slice(0, 80)}…` : message
}

function isValidColor(value: string) {
  const color = value.trim()
  return (
    /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color) ||
    /^rgba?\(/i.test(color)
  )
}

export function SettingsScreen() {
  const dismiss = Navigation.useDismiss()
  const thisYear = new Date().getFullYear()
  const [settings, setSettings] = useState<CalendarSettings>(() =>
    readSettings()
  )
  const [colorDraft, setColorDraft] = useState(settings.background)
  const [holidayYear, setHolidayYear] = useState(thisYear)
  const [saved, setSaved] = useState<HolidayYearData | null>(() =>
    readHolidayYear(thisYear)
  )
  const [fetching, setFetching] = useState(false)
  const [failureState, setFailureState] = useState<{
    time: number
    failures: HolidayFetchFailure[]
  } | null>(() => readFetchFailure())
  const failures = failureState?.failures ?? []

  const applyFailures = (errors: HolidayFetchFailure[]) => {
    setFailureState(
      errors.length > 0 ? { time: Date.now(), failures: errors } : null
    )
    writeFetchFailure(errors)
  }

  useEffect(() => {
    writeSettings(settings)
    try {
      Widget.reloadAll()
    } catch (error) {
      console.error(error)
    }
  }, [settings])

  useEffect(() => {
    let active = true
    const refresh = async () => {
      let changed = false
      const errors: HolidayFetchFailure[] = []
      for (const year of [thisYear - 1, thisYear, thisYear + 1]) {
        const current = readHolidayYear(year)
        if (
          current &&
          Date.now() - current.updatedAt < AUTO_REFRESH_INTERVAL
        ) {
          continue
        }
        try {
          const fetched = await fetchHolidayYear(year)
          if (!active) return
          writeHolidayYear(fetched)
          changed = true
          if (year === holidayYear) setSaved(fetched)
        } catch (error) {
          console.error(error)
          errors.push({ year, message: String(error) })
        }
      }
      if (!active) return
      applyFailures(errors)
      if (!changed) return
      try {
        Widget.reloadAll()
      } catch (error) {
        console.error(error)
      }
    }
    refresh()
    return () => {
      active = false
    }
  }, [])

  const patch = (changes: Partial<CalendarSettings>) =>
    setSettings((previous) => ({ ...previous, ...changes }))

  const presetValue =
    PRESETS.find(
      (preset) =>
        preset.color.toLowerCase() === settings.background.toLowerCase()
    )?.color ?? CUSTOM_TAG

  const changeColor = (value: string) => {
    setColorDraft(value)
    if (isValidColor(value)) {
      patch({ background: value.trim() })
    }
  }

  const data = saved ?? makeEmptyHolidayYear(holidayYear)

  const handleYearChange = (value: string) => {
    const nextYear = Number(value)
    setHolidayYear(nextYear)
    setSaved(readHolidayYear(nextYear))
  }

  const handleFetch = async () => {
    setFetching(true)
    const done: string[] = []
    const errors: HolidayFetchFailure[] = []
    for (const year of [thisYear - 1, thisYear, thisYear + 1]) {
      try {
        const fetched = await fetchHolidayYear(year)
        writeHolidayYear(fetched)
        if (year === holidayYear) setSaved(fetched)
        done.push(
          `${year} 年：${fetched.rest.length} 个休息日、${fetched.work.length} 个补班日`
        )
      } catch (error) {
        console.error(error)
        errors.push({ year, message: String(error) })
      }
    }
    applyFailures(errors)
    try {
      Widget.reloadAll()
    } catch (error) {
      console.error(error)
    }
    setFetching(false)
    if (errors.length === 0) {
      await Dialog.alert({
        title: '节假日已更新',
        message: done.join('\n')
      })
    } else {
      await Dialog.alert({
        title: done.length > 0 ? '部分年份获取失败' : '获取失败',
        message: [
          ...done,
          ...errors.map(
            (item) => `${item.year} 年失败：${shortMessage(item.message)}`
          )
        ].join('\n')
      })
    }
  }

  const openWidgetPreview = async () => {
    try {
      await Widget.preview()
    } catch (error) {
      console.error(error)
    }
  }

  const sourceText = saved
    ? saved.source === 'online'
      ? `在线获取 · ${saved.provider ?? '节假日接口'}`
      : '本地保存的数据'
    : '尚未在线获取，暂不显示休、班标记'

  return (
    <NavigationStack>
      <List
        navigationTitle="日历"
        toolbar={{
          cancellationAction: <Button title="完成" action={dismiss} />
        }}
      >
        <Section
          header={<Text>{`外观 · v${VERSION}`}</Text>}
          footer={
            <Text>
              底色作用于整块小组件，不会给每个日期格单独加背景或边框。
            </Text>
          }
        >
          <Picker
            title="组件背景色"
            value={presetValue}
            onChanged={(value: string) => {
              if (value !== CUSTOM_TAG) changeColor(value)
            }}
          >
            {PRESETS.map((preset) => (
              <Text key={preset.color} tag={preset.color}>
                {preset.label}
              </Text>
            ))}
            <Text tag={CUSTOM_TAG}>自定义</Text>
          </Picker>

          <TextField
            title="自定义背景"
            prompt="#F8F8FA"
            value={colorDraft}
            onChanged={changeColor}
          />
        </Section>

        <Section
          header={<Text>字体</Text>}
          footer={
            <Text>
              调节整块日历的字号与笔画粗细，公历、农历、表头与底部信息同步变化；字号 100%、粗细「较细」为默认效果。
            </Text>
          }
        >
          <VStack alignment="leading" spacing={10}>
            <HStack spacing={8}>
              <Text font={15}>整体字号</Text>
              <Spacer />
              <Text font={15} foregroundStyle="#8E8E93">
                {`${Math.round(settings.fontScale * 100)}%`}
              </Text>
            </HStack>
            <Slider
              min={FONT_SCALE_MIN}
              max={FONT_SCALE_MAX}
              step={FONT_SCALE_STEP}
              value={settings.fontScale}
              onChanged={(value: number) => patch({ fontScale: value })}
            />
            <HStack spacing={8}>
              <Text font={15}>笔画粗细</Text>
              <Spacer />
              <Text font={15} foregroundStyle="#8E8E93">
                {WEIGHT_LABELS[settings.fontWeightStep] ?? '标准'}
              </Text>
            </HStack>
            <Slider
              min={FONT_WEIGHT_MIN}
              max={FONT_WEIGHT_MAX}
              step={FONT_WEIGHT_STEP}
              value={settings.fontWeightStep}
              onChanged={(value: number) =>
                patch({ fontWeightStep: value })
              }
            />
          </VStack>
        </Section>

        <Section
          header={<Text>日历</Text>}
          footer={
            <Text>
              切换每周起始后，表头和日期立即按新顺序排列。休息日右上角标「休」，补班日右上角标「班」。国际节日包含情人节、愚人节、母亲节、父亲节、万圣夜、万圣节、感恩节、平安夜、圣诞节与复活节，和节气一样显示在日期下方。
            </Text>
          }
        >
          <Picker
            title="每周起始"
            value={settings.weekStart}
            onChanged={(value: string) =>
              patch({ weekStart: value as WeekStart })
            }
          >
            <Text tag="sunday">周日</Text>
            <Text tag="monday">周一</Text>
          </Picker>

          <Toggle
            title="显示国际节日"
            value={settings.showIntlFestivals}
            onChanged={(value: boolean) =>
              patch({ showIntlFestivals: value })
            }
          />
        </Section>

        <Section
          header={<Text>节假日数据</Text>}
          footer={
            <VStack alignment="leading" spacing={4}>
              <Text>
                数据按年在线获取并保存在本机，失败时保留原配置。重新获取会覆盖该年已有的数据。
              </Text>
              <Text>
                {`${holidayYear} 年 · ${data.rest.length} 个休息日 · ${data.work.length} 个补班日`}
              </Text>
              <Text>
                {saved?.updatedAt
                  ? `${sourceText} · 更新于 ${formatUpdatedAt(saved.updatedAt)}`
                  : sourceText}
              </Text>
              {failures.length > 0 ? (
                <Text foregroundStyle="#C0392B">
                  {`自动获取失败${failureState?.time ? `（${formatUpdatedAt(failureState.time)}）` : ''}：${failures
                    .map((item) => `${item.year} 年 ${shortMessage(item.message)}`)
                    .join('；')}`}
                </Text>
              ) : null}
            </VStack>
          }
        >
          <Picker
            title="查看年份"
            value={String(holidayYear)}
            onChanged={handleYearChange}
          >
            <Text tag={String(thisYear - 1)}>{thisYear - 1} 年</Text>
            <Text tag={String(thisYear)}>{thisYear} 年</Text>
            <Text tag={String(thisYear + 1)}>{thisYear + 1} 年</Text>
          </Picker>

          <Button action={handleFetch} disabled={fetching}>
            <HStack>
              <Text>在线获取</Text>
              <Spacer />
              {fetching ? <ProgressView /> : null}
            </HStack>
          </Button>
        </Section>

        <Section
          header={<Text>预览</Text>}
          footer={
            <Text>
              首次使用请先在线获取本年与下一年的节假日，再到桌面添加大号组件。
            </Text>
          }
        >
          <Button title="预览小组件" action={openWidgetPreview} />
        </Section>

      </List>
    </NavigationStack>
  )
}

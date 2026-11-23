import {
  Button,
  ColorPicker,
  HStack,
  List,
  Navigation,
  NavigationStack,
  Picker,
  ProgressView,
  RoundedRectangle,
  Section,
  Spacer,
  Text,
  VStack,
  Widget,
  ZStack,
  useEffect,
  useState
} from 'scripting'
import {
  buildMonthGrid,
  getWeekLabels
} from '../core/calendar'
import type { CalendarCell } from '../core/calendar'
import {
  applyHolidayMarker,
  clearHolidayYear,
  fetchHolidayYear,
  formatUpdatedAt,
  makeWeekendHolidayYear,
  readHolidayYear,
  writeHolidayYear
} from '../core/holidays'
import type {
  HolidayMarker,
  HolidayYearData
} from '../core/holidays'
import {
  readSettings,
  writeSettings
} from '../core/settings'
import type {
  CalendarSettings,
  WeekStart
} from '../core/settings'

const BACKGROUND_PRESETS = [
  { color: '#F8F8FA', label: '云白' },
  { color: '#FFFFFF', label: '纯白' },
  { color: '#FAF7F1', label: '米白' },
  { color: '#F1F6F8', label: '雾蓝' }
]

const EDITOR_MODES: { value: HolidayMarker; label: string }[] = [
  { value: 'rest', label: '休息日（休）' },
  { value: 'work', label: '补班日（班）' },
  { value: 'none', label: '清除标记' }
]

function PresetSwatch({
  color,
  label,
  selected,
  onPressed
}: {
  color: string
  label: string
  selected: boolean
  onPressed: () => void
}) {
  return (
    <Button action={onPressed} buttonStyle="plain">
      <VStack alignment="center" spacing={5}>
        <ZStack frame={{ width: 32, height: 32 }}>
          <RoundedRectangle
            fill={selected ? '#25262B' : 'rgba(120,120,128,0.16)'}
            cornerRadius={16}
            frame={{ width: 32, height: 32 }}
          />
          <RoundedRectangle
            fill={color}
            cornerRadius={13}
            frame={{ width: 26, height: 26 }}
          />
        </ZStack>
        <Text
          font={10}
          foregroundStyle="secondaryLabel"
          lineLimit={1}
        >
          {label}
        </Text>
      </VStack>
    </Button>
  )
}

function MiniBadge({ type }: { type: 'rest' | 'work' }) {
  return (
    <ZStack frame={{ width: 15, height: 15 }}>
      <RoundedRectangle
        fill={type === 'rest' ? '#E65356' : '#455B6B'}
        cornerRadius={4}
        frame={{ width: 15, height: 15 }}
      />
      <Text font={9.5} fontWeight="bold" foregroundStyle="#FFFFFF">
        {type === 'rest' ? '休' : '班'}
      </Text>
    </ZStack>
  )
}

function EditorDayCell({
  cell,
  data,
  onPressed
}: {
  cell: CalendarCell
  data: HolidayYearData
  onPressed: (key: string) => void
}) {
  const marker: HolidayMarker = data.work.includes(cell.key)
    ? 'work'
    : data.rest.includes(cell.key)
      ? 'rest'
      : 'none'

  if (!cell.isCurrentMonth) {
    return (
      <VStack
        alignment="center"
        frame={{ maxWidth: 'infinity', height: 42 }}
      >
        <Text
          font={14}
          foregroundStyle="tertiaryLabel"
          lineLimit={1}
        >
          {String(cell.day)}
        </Text>
      </VStack>
    )
  }

  return (
    <Button
      action={() => onPressed(cell.key)}
      buttonStyle="plain"
      frame={{ maxWidth: 'infinity', height: 42 }}
    >
      <ZStack frame={{ maxWidth: 'infinity', height: 42 }}>
        <VStack alignment="center" spacing={1}>
          <Text
            font={15}
            fontWeight={cell.isToday ? 'semibold' : 'regular'}
            foregroundStyle={cell.isToday ? '#E65356' : 'label'}
            lineLimit={1}
          >
            {String(cell.day)}
          </Text>
          <Text
            font={8.5}
            foregroundStyle="tertiaryLabel"
            lineLimit={1}
          >
            {marker === 'rest' ? '休息' : marker === 'work' ? '补班' : ' '}
          </Text>
        </VStack>

        {marker !== 'none' ? (
          <ZStack
            alignment="topTrailing"
            frame={{ maxWidth: 'infinity', height: 42 }}
          >
            <ZStack
              frame={{ width: 14, height: 14 }}
              offset={{ x: -1, y: 1 }}
            >
              <RoundedRectangle
                fill={marker === 'rest' ? '#E65356' : '#455B6B'}
                cornerRadius={3.5}
                frame={{ width: 14, height: 14 }}
              />
              <Text
                font={8.5}
                fontWeight="bold"
                foregroundStyle="#FFFFFF"
              >
                {marker === 'rest' ? '休' : '班'}
              </Text>
            </ZStack>
          </ZStack>
        ) : null}
      </ZStack>
    </Button>
  )
}

function EditorGrid({
  year,
  month,
  weekStart,
  data,
  onPressed
}: {
  year: number
  month: number
  weekStart: WeekStart
  data: HolidayYearData
  onPressed: (key: string) => void
}) {
  const cells = buildMonthGrid(year, month, weekStart)
  const labels = getWeekLabels(weekStart)
  return (
    <VStack alignment="leading" spacing={0}>
      <HStack spacing={0}>
        {labels.map((label) => (
          <Text
            key={label}
            font={10.5}
            foregroundStyle="secondaryLabel"
            lineLimit={1}
            frame={{ maxWidth: 'infinity', alignment: 'center' }}
          >
            {label}
          </Text>
        ))}
      </HStack>
      {Array.from({ length: 6 }, (_, row) => (
        <HStack key={String(row)} spacing={0}>
          {cells.slice(row * 7, row * 7 + 7).map((cell) => (
            <EditorDayCell
              key={cell.key}
              cell={cell}
              data={data}
              onPressed={onPressed}
            />
          ))}
        </HStack>
      ))}
    </VStack>
  )
}

export function SettingsScreen() {
  const dismiss = Navigation.useDismiss()
  const thisYear = new Date().getFullYear()
  const [settings, setSettings] = useState<CalendarSettings>(() =>
    readSettings()
  )
  const [holidayYear, setHolidayYear] = useState(thisYear)
  const [savedHolidays, setSavedHolidays] =
    useState<HolidayYearData | null>(() => readHolidayYear(thisYear))
  const [editorMonth, setEditorMonth] = useState(
    () => new Date().getMonth() + 1
  )
  const [editorMode, setEditorMode] = useState<HolidayMarker>('rest')
  const [fetching, setFetching] = useState(false)

  useEffect(() => {
    writeSettings(settings)
    Widget.reloadAll()
  }, [settings])

  const patch = (changes: Partial<CalendarSettings>) =>
    setSettings((previous) => ({ ...previous, ...changes }))

  const holidayData =
    savedHolidays ?? makeWeekendHolidayYear(holidayYear)

  const handleYearChange = (value: string) => {
    const nextYear = Number(value)
    setHolidayYear(nextYear)
    setSavedHolidays(readHolidayYear(nextYear))
  }

  const handleFetch = async () => {
    setFetching(true)
    try {
      const fetched = await fetchHolidayYear(holidayYear)
      writeHolidayYear(fetched)
      setSavedHolidays(fetched)
      Widget.reloadAll()
      await Dialog.alert({
        title: '节假日已更新',
        message: `${holidayYear} 年：${fetched.rest.length} 个休息日、${fetched.work.length} 个补班日。来源：${fetched.provider ?? '在线数据'}`
      })
    } catch (error) {
      console.error(error)
      await Dialog.alert({
        title: '获取失败',
        message: String(error)
      })
    } finally {
      setFetching(false)
    }
  }

  const handleEditDay = (key: string) => {
    const next = applyHolidayMarker(holidayData, key, editorMode)
    writeHolidayYear(next)
    setSavedHolidays(next)
    Widget.reloadAll()
  }

  const handleClearYear = async () => {
    const confirmed = await Dialog.confirm({
      title: `清除 ${holidayYear} 年配置`,
      message: '清除后该年只按普通周末显示休息日，法定节假日与补班标记会消失。',
      cancelLabel: '取消',
      confirmLabel: '清除'
    })
    if (!confirmed) return
    clearHolidayYear(holidayYear)
    setSavedHolidays(null)
    Widget.reloadAll()
  }

  const previewWidget = async () => {
    try {
      await Widget.preview()
    } catch (error) {
      console.error(error)
    }
  }

  const sourceText = savedHolidays
    ? savedHolidays.source === 'online'
      ? `在线获取 · ${savedHolidays.provider ?? '节假日接口'}`
      : '已本地编辑'
    : '尚未在线获取，当前按普通周末显示'

  return (
    <NavigationStack>
      <List
        navigationTitle="日历"
        toolbar={{
          cancellationAction: <Button title="完成" action={dismiss} />
        }}
      >
        <Section
          header={<Text>外观</Text>}
          footer={
            <Text>
              底色只作用于整块小组件，不会给每个日期格单独加背景或边框。
            </Text>
          }
        >
          <VStack alignment="leading" spacing={10}>
            <HStack alignment="center">
              <Text>组件背景色</Text>
              <Spacer />
              <Text font={12} foregroundStyle="secondaryLabel">
                {settings.background}
              </Text>
            </HStack>
            <HStack spacing={16}>
              {BACKGROUND_PRESETS.map((preset) => (
                <PresetSwatch
                  key={preset.color}
                  color={preset.color}
                  label={preset.label}
                  selected={
                    settings.background.toLowerCase() ===
                    preset.color.toLowerCase()
                  }
                  onPressed={() => patch({ background: preset.color })}
                />
              ))}
            </HStack>
          </VStack>

          <ColorPicker
            title="自定义背景"
            value={settings.background}
            supportsOpacity={false}
            onChanged={(value: string) =>
              patch({ background: value })
            }
          />
        </Section>

        <Section
          header={<Text>日历</Text>}
          footer={
            <Text>
              切换每周起始后，表头和日期会立即按新顺序排列。点击组件顶部月份可回到本月。
            </Text>
          }
        >
          <Picker
            title="每周起始"
            pickerStyle="menu"
            value={settings.weekStart}
            onChanged={(value: string) =>
              patch({ weekStart: value as WeekStart })
            }
          >
            <Text tag="sunday">周日</Text>
            <Text tag="monday">周一</Text>
          </Picker>

          <HStack spacing={16}>
            <HStack spacing={5}>
              <MiniBadge type="rest" />
              <Text font={12} foregroundStyle="secondaryLabel">
                休息
              </Text>
            </HStack>
            <HStack spacing={5}>
              <MiniBadge type="work" />
              <Text font={12} foregroundStyle="secondaryLabel">
                补班
              </Text>
            </HStack>
          </HStack>
        </Section>

        <Section
          header={<Text>节假日数据</Text>}
          footer={
            <Text>
              数据按年在线获取并保存在本机。重新获取会覆盖该年的本地修改；接口失败时保留原配置。
            </Text>
          }
        >
          <Picker
            title="配置年份"
            pickerStyle="menu"
            value={String(holidayYear)}
            onChanged={handleYearChange}
          >
            <Text tag={String(thisYear)}>{thisYear} 年</Text>
            <Text tag={String(thisYear + 1)}>{thisYear + 1} 年</Text>
          </Picker>

          <Button action={handleFetch} disabled={fetching}>
            <HStack>
              <Text>{`在线获取 ${holidayYear} 年`}</Text>
              <Spacer />
              {fetching ? <ProgressView /> : null}
            </HStack>
          </Button>

          <VStack alignment="leading" spacing={5}>
            <HStack spacing={8}>
              <MiniBadge type="rest" />
              <Text>
                {`${holidayData.rest.length} 个休息日`}
              </Text>
              <MiniBadge type="work" />
              <Text>
                {`${holidayData.work.length} 个补班日`}
              </Text>
            </HStack>
            <Text font={12} foregroundStyle="secondaryLabel">
              {sourceText}
            </Text>
            {savedHolidays?.updatedAt ? (
              <Text font={12} foregroundStyle="tertiaryLabel">
                {`更新于 ${formatUpdatedAt(savedHolidays.updatedAt)}`}
              </Text>
            ) : null}
          </VStack>
        </Section>

        <Section
          header={<Text>逐日配置</Text>}
          footer={
            <Text>
              先选好下方动作，再点日期。休息日包含周末；同一天不会同时显示休息与补班。
            </Text>
          }
        >
          <Picker
            title="编辑月份"
            pickerStyle="menu"
            value={String(editorMonth)}
            onChanged={(value: string) =>
              setEditorMonth(Number(value))
            }
          >
            {Array.from({ length: 12 }, (_, index) => (
              <Text key={String(index + 1)} tag={String(index + 1)}>
                {`${index + 1} 月`}
              </Text>
            ))}
          </Picker>

          <Picker
            title="点按日期时"
            pickerStyle="menu"
            value={editorMode}
            onChanged={(value: string) =>
              setEditorMode(value as HolidayMarker)
            }
          >
            {EDITOR_MODES.map((mode) => (
              <Text key={mode.value} tag={mode.value}>
                {mode.label}
              </Text>
            ))}
          </Picker>

          <EditorGrid
            year={holidayYear}
            month={editorMonth}
            weekStart={settings.weekStart}
            data={holidayData}
            onPressed={handleEditDay}
          />

          <Button
            title={`清除 ${holidayYear} 年配置`}
            role="destructive"
            action={handleClearYear}
          />
        </Section>

        <Section
          header={<Text>预览</Text>}
          footer={
            <Text>
              首次使用请先在线获取本年与下一年的节假日，再到桌面添加大号组件。
            </Text>
          }
        >
          <Button title="预览小组件" action={previewWidget} />
        </Section>
      </List>
    </NavigationStack>
  )
}

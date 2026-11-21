import { HStack, Spacer, Text, VStack } from 'scripting'
import { calendarForMonth, tierDisplay } from '../core/usage'
import {
  BrandHeader,
  CalendarCellView,
  Gap,
  GridModule,
  LegendItem,
  ThemeShell,
  TierChip,
  TierLine,
  UsageValue,
  ValueChip,
  contentHeight,
  contentWidth
} from './atoms'
import {
  AMBER,
  BLUE,
  INK,
  RED,
  applyNumberFormat,
  formatUsage,
  pt,
  themePalette
} from './theme'
import type { WidgetViewProps } from './model'

const WEEKDAYS_MONDAY = ['一', '二', '三', '四', '五', '六', '日']
const WEEKDAYS_SUNDAY = ['日', '一', '二', '三', '四', '五', '六']

export function LargeWidgetView({
  summary,
  settings,
  syncedAt
}: WidgetViewProps) {
  applyNumberFormat(settings)
  const theme = settings.theme ?? 'island'
  const palette = themePalette(theme)
  const width = contentWidth(theme)
  const tier = tierDisplay(
    summary.tierUsage,
    settings.oneLevelPq,
    settings.twoLevelPq
  )
  const weekStart = settings.weekStart ?? 'monday'
  const weekdays =
    weekStart === 'sunday' ? WEEKDAYS_SUNDAY : WEEKDAYS_MONDAY
  const calendar = calendarForMonth(summary.days, new Date(), weekStart)
  const cellWidth = width / 7
  const gridHeight = pt(theme === 'island' ? 202 : 187)
  const rowHeight = gridHeight / calendar.weeks
  const chipHeight = pt(46)
  const chipGap = pt(6)
  const gridGap = 6
  const chipWidth = (width - chipGap * 2) / 3
  const stripWidth = (width - pt(18)) / 4

  return (
    <ThemeShell theme={theme}>
      <BrandHeader theme={theme} syncedAt={syncedAt} height={16} />
      <Gap height={theme === 'island' ? 1 : 4} />

      {theme === 'island' ? (
        <HStack
          alignment="bottom"
          spacing={pt(4)}
          frame={{ width, height: pt(24) }}
        >
          <HStack alignment="lastTextBaseline" spacing={pt(3)}>
            <Text
              font={pt(8)}
              fontWeight="semibold"
              foregroundStyle={palette.label}
              lineLimit={1}
            >
              昨日
            </Text>
            <UsageValue
              value={formatUsage(summary.yesterdayUsage)}
              size={17}
              unitSize={7.5}
              color={INK}
              unitColor={palette.label}
              weight="semibold"
            />
          </HStack>
          <Spacer minLength={0} />
          <HStack alignment="lastTextBaseline" spacing={pt(3)}>
            <Text
              font={pt(8)}
              fontWeight="semibold"
              foregroundStyle={palette.label}
              lineLimit={1}
            >
              本月
            </Text>
            <UsageValue
              value={formatUsage(summary.monthUsage, 'month')}
              size={17}
              unitSize={7.5}
              color={INK}
              unitColor={palette.label}
              weight="semibold"
            />
          </HStack>
        </HStack>
      ) : (
        <HStack spacing={pt(6)} frame={{ width, height: pt(56) }}>
          <GridModule
            theme={theme}
            width={stripWidth}
            height={pt(56)}
            label="昨日"
            value={summary.yesterdayUsage}
            valueSize={17}
            paddingX={6}
          />
          <GridModule
            theme={theme}
            width={stripWidth}
            height={pt(56)}
            label="本月"
            value={summary.monthUsage}
            valueSize={17}
            paddingX={6}
            month
          />
          <GridModule
            theme={theme}
            width={stripWidth}
            height={pt(56)}
            label="上月"
            value={summary.previousUsage}
            money={summary.previousCost}
            valueSize={17}
            moneySize={7.5}
            paddingX={6}
          />
          <GridModule
            theme={theme}
            width={stripWidth}
            height={pt(56)}
            label="本年"
            value={summary.yearUsage}
            money={summary.yearCost}
            valueSize={17}
            moneySize={7.5}
            paddingX={6}
          />
        </HStack>
      )}

      <Gap height={theme === 'island' ? 3 : 4} />
      <HStack
        alignment="center"
        spacing={pt(7)}
        frame={{ width, height: pt(14) }}
      >
        <Text
          font={pt(9)}
          fontWeight="semibold"
          foregroundStyle={palette.title}
          lineLimit={1}
        >
          本月每日用电
        </Text>
        <Spacer minLength={0} />
        <LegendItem theme={theme} color={RED} text="最高" />
        <LegendItem theme={theme} color={BLUE} text="最低" />
        <LegendItem theme={theme} color={AMBER} text="最新" />
      </HStack>
      <Gap height={theme === 'island' ? 2 : 3} />

      <HStack
        spacing={0}
        frame={{ width, height: pt(12) }}
      >
        {weekdays.map((name) => (
          <Text
            key={name}
            font={pt(theme === 'island' ? 8 : 7.5)}
            fontWeight="medium"
            foregroundStyle={palette.faint}
            lineLimit={1}
            frame={{ width: cellWidth, alignment: 'center' }}
          >
            {name}
          </Text>
        ))}
      </HStack>

      <VStack alignment="leading" spacing={0} frame={{ width }}>
        {Array.from({ length: calendar.weeks }, (_, row) => (
          <HStack key={row} spacing={0} frame={{ width, height: rowHeight }}>
            {calendar.cells.slice(row * 7, row * 7 + 7).map((cell) => (
              <CalendarCellView
                cell={cell}
                width={cellWidth}
                height={rowHeight}
                dateSize={theme === 'island' ? 7.5 : 8}
                valueSize={12}
              />
            ))}
          </HStack>
        ))}
      </VStack>

      <Gap height={gridGap} />

      {theme === 'island' ? (
        <HStack spacing={chipGap} frame={{ width, height: chipHeight }}>
          <ValueChip
            theme={theme}
            width={chipWidth}
            height={chipHeight}
            label="上月"
            value={summary.previousUsage}
            money={summary.previousCost}
          />
          <ValueChip
            theme={theme}
            width={chipWidth}
            height={chipHeight}
            label="本年"
            value={summary.yearUsage}
            money={summary.yearCost}
          />
          <TierChip
            theme={theme}
            tier={tier}
            width={chipWidth}
            height={chipHeight}
          />
        </HStack>
      ) : (
        <TierLine theme={theme} tier={tier} height={24} />
      )}
    </ThemeShell>
  )
}

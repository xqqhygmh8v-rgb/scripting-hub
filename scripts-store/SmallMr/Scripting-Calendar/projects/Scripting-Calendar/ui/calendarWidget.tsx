import {
  Button,
  Circle,
  HStack,
  Image,
  RoundedRectangle,
  Text,
  VStack,
  Widget,
  ZStack
} from 'scripting'
import { MoveMonthIntent, ResetMonthIntent } from '../app_intents'
import {
  buildMonthGrid,
  getFooterParts,
  getLunarDayLabel,
  getWeekLabels,
  pad2
} from '../core/calendar'
import type { CalendarCell } from '../core/calendar'
import type { HolidayYearData } from '../core/holidays'
import type { CalendarSettings } from '../core/settings'
import type { MonthCursor } from '../core/monthState'
import { paletteFor, shiftWeight } from './theme'

type CalendarWidgetProps = {
  settings: CalendarSettings
  cursor: MonthCursor | null
  holidays: HolidayYearData
}

function Badge({
  label,
  background,
  size
}: {
  label: '休' | '班'
  background: string
  size: number
}) {
  return (
    <ZStack
      frame={{ width: size, height: size }}
    >
      <RoundedRectangle
        fill={background}
        cornerRadius={size * 0.3}
        frame={{ width: size, height: size }}
      />
      <Text
        font={size * 0.72}
        fontWeight="bold"
        foregroundStyle="#FFFFFF"
        lineLimit={1}
      >
        {label}
      </Text>
    </ZStack>
  )
}

function DayCell({
  cell,
  width,
  height,
  scale,
  fontScale,
  weightStep,
  marker,
  palette
}: {
  cell: CalendarCell
  width: number
  height: number
  scale: number
  fontScale: number
  weightStep: number
  marker: 'rest' | 'work' | null
  palette: ReturnType<typeof paletteFor>
}) {
  const fs = (value: number) => value * scale * fontScale
  const w = (base: string) => shiftWeight(base, weightStep)
  const lunarLabel = getLunarDayLabel(cell.lunar)
  const eventLabel = cell.isCurrentMonth ? cell.eventLabel : ''
  const subline = eventLabel || lunarLabel
  const isOutside = !cell.isCurrentMonth
  const numberColor = isOutside
    ? palette.outside
    : cell.isWeekend
      ? palette.weekend
      : palette.ink
  const sublineColor = isOutside
    ? palette.outside
    : eventLabel
      ? palette.event
      : palette.faint
  const hasDot = !!eventLabel && !cell.isToday
  const coreWidth = 42 * scale
  const coreHeight = 44 * scale
  const badgeSize = 11.5 * scale

  return (
    <ZStack frame={{ width, height }}>
      {cell.isToday ? (
        <ZStack frame={{ width: coreWidth, height: coreHeight }}>
          <RoundedRectangle
            fill={palette.red}
            cornerRadius={coreHeight / 2}
            frame={{ width: coreWidth, height: coreHeight }}
          />
          <VStack alignment="center" spacing={0}>
            <Text
              font={fs(16.5)}
              fontWeight={w('medium')}
              foregroundStyle={palette.white}
              lineLimit={1}
            >
              {String(cell.day)}
            </Text>
            <Text
              font={fs(9.5)}
              fontWeight={w('medium')}
              foregroundStyle="rgba(255,255,255,0.78)"
              lineLimit={1}
            >
              {lunarLabel}
            </Text>
          </VStack>
        </ZStack>
      ) : (
        <VStack alignment="center" spacing={0}>
          <Text
            font={fs(16.5)}
            fontWeight={isOutside ? w('regular') : w('medium')}
            foregroundStyle={numberColor}
            lineLimit={1}
          >
            {String(cell.day)}
          </Text>
          <Text
            font={fs(9.5)}
            fontWeight={eventLabel ? w('medium') : w('regular')}
            foregroundStyle={sublineColor}
            lineLimit={1}
          >
            {subline}
          </Text>
          {hasDot ? (
            <Circle
              fill={palette.eventDot}
              frame={{ width: 3 * scale, height: 3 * scale }}
              offset={{ x: 0, y: 1 * scale }}
            />
          ) : null}
        </VStack>
      )}

      {marker && !isOutside ? (
        <ZStack
          frame={{ width: badgeSize, height: badgeSize }}
          position={{
            x: width - badgeSize / 2 - 1 * scale,
            y: badgeSize / 2 + 1 * scale
          }}
        >
          <Badge
            label={marker === 'rest' ? '休' : '班'}
            background={marker === 'rest' ? palette.red : palette.work}
            size={badgeSize}
          />
        </ZStack>
      ) : null}
    </ZStack>
  )
}

export function CalendarWidget({
  settings,
  cursor,
  holidays
}: CalendarWidgetProps) {
  const now = new Date()
  const year = cursor?.year ?? now.getFullYear()
  const month = cursor?.month ?? now.getMonth() + 1
  const palette = paletteFor(settings.background)
  const display = Widget.displaySize ?? { width: 338, height: 354 }
  const width = display.width || 338
  const height = display.height || 354
  const scale = Math.max(0.45, Math.min(width / 390, height / 409))
  const fontScale = settings.fontScale ?? 1
  const weightStep = settings.fontWeightStep ?? 0
  const fs = (value: number) => value * scale * fontScale
  const w = (base: string) => shiftWeight(base, weightStep)
  const paddingX = 18 * scale
  const paddingTop = 15 * scale
  const paddingBottom = 11 * scale
  const innerWidth = width - paddingX * 2
  const innerHeight = height - paddingTop - paddingBottom
  const headHeight = 40 * scale
  const arrowWidth = 34 * scale
  const titleWidth = innerWidth - arrowWidth * 2
  const weekdayHeight = 25 * scale
  const footerHeight = 34 * scale
  const dayAreaHeight = Math.max(
    0,
    innerHeight -
      headHeight -
      weekdayHeight -
      scale -
      footerHeight
  )
  const rowHeight = dayAreaHeight / 6
  const cellWidth = innerWidth / 7
  const weekLabels = getWeekLabels(settings.weekStart)
  const cells = buildMonthGrid(
    year,
    month,
    settings.weekStart,
    settings.showIntlFestivals
  )
  const restSet = new Set(holidays.rest)
  const workSet = new Set(holidays.work)
  const footer = getFooterParts(now)

  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={{
        top: paddingTop,
        bottom: paddingBottom,
        leading: paddingX,
        trailing: paddingX
      }}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
      widgetBackground={settings.background}
    >
      <HStack
        spacing={0}
        frame={{ width: innerWidth, height: headHeight }}
      >
        <HStack
          frame={{
            width: arrowWidth,
            height: headHeight,
            alignment: 'leading'
          }}
        >
          <Button
            intent={MoveMonthIntent({ delta: -1 })}
            buttonStyle="plain"
            frame={{ width: 30 * scale, height: 30 * scale }}
          >
            <Image
              systemName="chevron.left"
              resizable
              scaleToFit
              renderingMode="template"
              foregroundStyle={palette.header}
              frame={{ width: 17 * scale, height: 17 * scale }}
            />
          </Button>
        </HStack>

        <HStack
          frame={{
            width: titleWidth,
            height: headHeight,
            alignment: 'center'
          }}
        >
          <Button
            intent={ResetMonthIntent(undefined)}
            buttonStyle="plain"
          >
            <HStack alignment="center" spacing={6 * scale}>
              <Text
                font={fs(22.5)}
                fontWeight="regular"
                foregroundStyle={palette.header}
                lineLimit={1}
              >
                {String(year)}
              </Text>
              <Text
                font={fs(22.5)}
                fontWeight="regular"
                foregroundStyle={palette.muted}
                lineLimit={1}
              >
                /
              </Text>
              <Text
                font={fs(22.5)}
                fontWeight="regular"
                foregroundStyle={palette.header}
                lineLimit={1}
              >
                {pad2(month)}
              </Text>
            </HStack>
          </Button>
        </HStack>

        <HStack
          frame={{
            width: arrowWidth,
            height: headHeight,
            alignment: 'trailing'
          }}
        >
          <Button
            intent={MoveMonthIntent({ delta: 1 })}
            buttonStyle="plain"
            frame={{ width: 30 * scale, height: 30 * scale }}
          >
            <Image
              systemName="chevron.right"
              resizable
              scaleToFit
              renderingMode="template"
              foregroundStyle={palette.header}
              frame={{ width: 17 * scale, height: 17 * scale }}
            />
          </Button>
        </HStack>
      </HStack>

      <HStack spacing={0} frame={{ width: innerWidth, height: weekdayHeight }}>
        {weekLabels.map((label) => (
          <Text
            key={label}
            font={fs(13.5)}
            fontWeight={w('medium')}
            foregroundStyle={palette.muted}
            lineLimit={1}
            frame={{ width: cellWidth, alignment: 'center' }}
          >
            {label}
          </Text>
        ))}
      </HStack>

      <VStack
        alignment="leading"
        spacing={0}
        frame={{ width: innerWidth, height: dayAreaHeight }}
      >
        {Array.from({ length: 6 }, (_, row) => (
          <HStack
            key={String(row)}
            spacing={0}
            frame={{ width: innerWidth, height: rowHeight }}
          >
            {cells.slice(row * 7, row * 7 + 7).map((cell) => {
              const marker = cell.isCurrentMonth
                ? workSet.has(cell.key)
                  ? 'work'
                  : restSet.has(cell.key)
                    ? 'rest'
                    : null
                : null
              return (
                <DayCell
                  key={cell.key}
                  cell={cell}
                  width={cellWidth}
                  height={rowHeight}
                  scale={scale}
                  fontScale={fontScale}
                  weightStep={weightStep}
                  marker={marker}
                  palette={palette}
                />
              )
            })}
          </HStack>
        ))}
      </VStack>

      <HStack
        spacing={0}
        frame={{
          width: innerWidth,
          height: footerHeight,
          alignment: 'leading'
        }}
      >
        <RoundedRectangle
          fill={palette.red}
          cornerRadius={2 * scale}
          frame={{ width: 4 * scale, height: 23 * scale }}
        />
        <HStack
          alignment="center"
          spacing={4 * scale}
          padding={{ leading: 8 * scale }}
        >
          <Text
            font={fs(13)}
            fontWeight={w('semibold')}
            foregroundStyle={palette.ink}
            lineLimit={1}
          >
            {footer.dateLabel}
          </Text>
          <Text
            font={fs(12.5)}
            fontWeight={w('regular')}
            foregroundStyle={palette.muted}
            lineLimit={1}
          >
            {`· ${footer.detailLabel}`}
          </Text>
        </HStack>
      </HStack>
    </VStack>
  )
}

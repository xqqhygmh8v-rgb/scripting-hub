import { Circle, HStack, Image, Rectangle, RoundedRectangle, Spacer, Text, VStack, ZStack } from 'scripting'
import type { CalendarMonthCell } from '../core/usage'
import type { WidgetTheme } from '../core/settings'
import {
  CALENDAR_AMBER,
  CALENDAR_BLUE,
  CALENDAR_DATE,
  CALENDAR_RED,
  GRID_MARK_URL,
  INK,
  clockText,
  formatMoney,
  formatUsage,
  pt,
  themePalette
} from './theme'

const CLEAR = 'rgba(0,0,0,0)'

/** 主题外壳：两套都用白底，浮岛靠浅绿模块区分，格栅靠中性灰模块区分。 */
export function ThemeShell({
  theme,
  small = false,
  children
}: {
  theme: WidgetTheme
  small?: boolean
  children?: unknown
}) {
  const palette = themePalette(theme)
  return (
    <VStack
      alignment="leading"
      spacing={0}
      padding={pt(small ? 12 : 14)}
      frame={{ maxWidth: 'infinity', maxHeight: 'infinity' }}
      widgetBackground={palette.surface}
    >
      {children}
    </VStack>
  )
}

/** 组件内容区的实际宽度（已扣掉外层画布和内卡的全部内边距）。 */
export function contentWidth(theme: WidgetTheme, small = false) {
  const inset = small ? 12 : 14
  return pt((small ? 158 : 338) - inset * 2)
}

export function contentHeight(
  theme: WidgetTheme,
  baseHeight: number,
  small = false
) {
  const inset = small ? 12 : 14
  return pt(baseHeight - inset * 2)
}

export function Gap({ height }: { height: number }) {
  return <Rectangle fill={CLEAR} frame={{ width: 1, height: pt(height) }} />
}

/** 左上角只放真实国网标志；月份和更新时间统一放在右上角。 */
export function BrandHeader({
  theme,
  syncedAt,
  small = false,
  height
}: {
  theme: WidgetTheme
  syncedAt: number
  small?: boolean
  height?: number
}) {
  const palette = themePalette(theme)
  return (
    <HStack
      alignment="center"
      spacing={pt(5)}
      frame={{ maxWidth: 'infinity', height: pt(height ?? (small ? 15 : 18)) }}
    >
      <Image
        imageUrl={GRID_MARK_URL}
        resizable
        scaleToFit
        widgetAccentedRenderingMode="fullColor"
        frame={{ width: pt(small ? 15 : 18), height: pt(small ? 15 : 18) }}
      />
      <Spacer minLength={0} />
      <Text
        font={pt(small ? 8 : 9)}
        fontWeight="medium"
        foregroundStyle={palette.faint}
        lineLimit={1}
      >
        {`${clockText(syncedAt)} 更新`}
      </Text>
    </HStack>
  )
}

export function UsageValue({
  value,
  size,
  unitSize,
  color,
  unitColor,
  weight = 'bold'
}: {
  value: string
  size: number
  unitSize: number
  color: unknown
  unitColor: unknown
  weight?: 'medium' | 'semibold' | 'bold'
}) {
  return (
    <HStack alignment="lastTextBaseline" spacing={pt(1.5)}>
      <Text
        font={pt(size)}
        fontWeight={weight}
        foregroundStyle={color}
        lineLimit={1}
      >
        {value}
      </Text>
      <Text
        font={pt(unitSize)}
        fontWeight="medium"
        foregroundStyle={unitColor}
        lineLimit={1}
      >
        度
      </Text>
    </HStack>
  )
}

export function MoneyAmount({
  value,
  size,
  color,
  weight = 'medium'
}: {
  value: string | number
  size: number
  color: unknown
  weight?: 'medium' | 'semibold' | 'bold'
}) {
  return (
    <HStack alignment="lastTextBaseline" spacing={pt(0.5)}>
      <Text
        font={pt(size * 0.74)}
        fontWeight={weight}
        foregroundStyle={color}
        lineLimit={1}
      >
        ¥
      </Text>
      <Text
        font={pt(size)}
        fontWeight={weight}
        foregroundStyle={color}
        lineLimit={1}
      >
        {formatMoney(value)}
      </Text>
    </HStack>
  )
}

/** 浮岛系的浅色小卡：标签和金额同一行，数字在下一行。 */
export function ValueChip({
  theme,
  width,
  height,
  label,
  value,
  money,
  labelSize = 8,
  valueSize = 14,
  unitSize = 7,
  moneySize = 8,
  paddingX = 8,
  dense = false,
  month = false
}: {
  theme: WidgetTheme
  width: number
  height: number
  label: string
  value: number
  money?: string
  labelSize?: number
  valueSize?: number
  unitSize?: number
  moneySize?: number
  paddingX?: number
  dense?: boolean
  month?: boolean
}) {
  const palette = themePalette(theme)
  return (
    <ZStack frame={{ width, height }}>
      <RoundedRectangle
        cornerRadius={pt(11)}
        fill={palette.module}
        frame={{ width, height }}
      />
      <VStack
        alignment="leading"
        spacing={0}
        padding={{
          top: pt(dense ? 4 : 5),
          bottom: pt(dense ? 4 : 5),
          leading: pt(paddingX),
          trailing: pt(paddingX)
        }}
        frame={{ width, height }}
      >
        <HStack
          alignment="lastTextBaseline"
          spacing={pt(4)}
          frame={{ maxWidth: 'infinity' }}
        >
          <Text
            font={pt(labelSize)}
            fontWeight="semibold"
            foregroundStyle={palette.label}
            lineLimit={1}
          >
            {label}
          </Text>
          <Spacer minLength={0} />
          {money ? (
            <MoneyAmount value={money} size={moneySize} color={palette.label} />
          ) : null}
        </HStack>
        <Gap height={dense ? 2 : 3} />
        <UsageValue
          value={formatUsage(value, month ? 'month' : 'plain')}
          size={valueSize}
          unitSize={unitSize}
          color={INK}
          unitColor={palette.label}
        />
      </VStack>
    </ZStack>
  )
}

/** 格栅系的模块：标签、数字、金额自上而下。 */
export function GridModule({
  theme,
  width,
  height,
  label,
  value,
  money,
  labelSize = 8,
  valueSize = 18,
  unitSize = 7.5,
  moneySize = 8,
  paddingX = 6,
  month = false
}: {
  theme: WidgetTheme
  width: number
  height: number
  label: string
  value: number
  money?: string
  labelSize?: number
  valueSize?: number
  unitSize?: number
  moneySize?: number
  paddingX?: number
  month?: boolean
}) {
  const palette = themePalette(theme)
  return (
    <ZStack frame={{ width, height }}>
      <RoundedRectangle
        cornerRadius={pt(11)}
        fill={palette.module}
        frame={{ width, height }}
      />
      <VStack
        alignment="leading"
        spacing={0}
        padding={{
          top: pt(6),
          bottom: pt(6),
          leading: pt(paddingX),
          trailing: pt(paddingX)
        }}
        frame={{ width, height }}
      >
        <Text
          font={pt(labelSize)}
          fontWeight="semibold"
          foregroundStyle={palette.label}
          lineLimit={1}
        >
          {label}
        </Text>
        <Gap height={3} />
        <UsageValue
          value={formatUsage(value, month ? 'month' : 'plain')}
          size={valueSize}
          unitSize={unitSize}
          color={INK}
          unitColor={palette.label}
        />
        {money ? (
          <VStack alignment="leading" spacing={0}>
            <Gap height={2} />
            <MoneyAmount value={money} size={moneySize} color={palette.label} />
          </VStack>
        ) : null}
      </VStack>
    </ZStack>
  )
}

export function TierSegments({
  theme,
  tier,
  width,
  height,
  gap = 2
}: {
  theme: WidgetTheme
  tier: number
  width: number
  height: number
  gap?: number
}) {
  const palette = themePalette(theme)
  const active = [
    theme === 'island' ? '#159B7E' : '#2B7D66',
    '#D5A33F',
    '#BD7A55'
  ]
  return (
    <HStack spacing={pt(gap)}>
      {[1, 2, 3].map((index) => (
        <RoundedRectangle
          key={index}
          cornerRadius={pt(height / 2)}
          fill={index <= tier ? active[index - 1] : palette.tierTrack}
          frame={{ width: pt(width), height: pt(height) }}
        />
      ))}
    </HStack>
  )
}

export function RemainingText({
  label,
  amount,
  labelSize,
  numberSize,
  unitSize,
  color,
  numberColor
}: {
  label: string
  amount: number
  labelSize: number
  numberSize: number
  unitSize: number
  color: unknown
  numberColor: unknown
}) {
  return (
    <HStack alignment="lastTextBaseline" spacing={pt(2)}>
      <Text
        font={pt(labelSize)}
        fontWeight="medium"
        foregroundStyle={color}
        lineLimit={1}
      >
        {label}
      </Text>
      <Text
        font={pt(numberSize)}
        fontWeight="bold"
        foregroundStyle={numberColor}
        lineLimit={1}
      >
        {formatUsage(amount)}
      </Text>
      <Text
        font={pt(unitSize)}
        fontWeight="medium"
        foregroundStyle={color}
        lineLimit={1}
      >
        度
      </Text>
    </HStack>
  )
}

/** 浮岛大/中号底部的阶梯小卡。 */
export function TierChip({
  theme,
  tier,
  width,
  height
}: {
  theme: WidgetTheme
  tier: ReturnType<typeof import('../core/usage').tierDisplay>
  width: number
  height: number
}) {
  const palette = themePalette(theme)
  return (
    <ZStack frame={{ width, height }}>
      <RoundedRectangle
        cornerRadius={pt(11)}
        fill={palette.module}
        frame={{ width, height }}
      />
      <VStack
        alignment="leading"
        spacing={0}
        padding={{ top: pt(5), bottom: pt(5), leading: pt(8), trailing: pt(8) }}
        frame={{ width, height }}
      >
        <Text
          font={pt(8)}
          fontWeight="semibold"
          foregroundStyle={palette.label}
          lineLimit={1}
        >
          {`阶梯 ${tier.tier}/3`}
        </Text>
        <Gap height={3} />
        <TierSegments theme={theme} tier={tier.tier} width={14} height={4} />
        <Gap height={3} />
        <RemainingText
          label={tier.tier === 3 ? '本年' : '本阶梯剩余'}
          amount={tier.amount}
          labelSize={7.5}
          numberSize={10}
          unitSize={7}
          color={palette.label}
          numberColor={INK}
        />
      </VStack>
    </ZStack>
  )
}

/** 格栅底部的细线阶梯行。 */
export function TierLine({
  theme,
  tier,
  height,
  small = false,
  showTierNo = true,
  shortLabel = false
}: {
  theme: WidgetTheme
  tier: ReturnType<typeof import('../core/usage').tierDisplay>
  height: number
  small?: boolean
  showTierNo?: boolean
  shortLabel?: boolean
}) {
  const palette = themePalette(theme)
  const contentHeight = height - 1
  return (
    <VStack alignment="leading" spacing={0} frame={{ maxWidth: 'infinity', height: pt(height) }}>
      <Rectangle
        fill={palette.line}
        frame={{ maxWidth: 'infinity', height: pt(1) }}
      />
      <HStack
        alignment="center"
        spacing={pt(5)}
        frame={{ maxWidth: 'infinity', height: pt(contentHeight) }}
      >
        <Text
          font={pt(small ? 8 : 9)}
          fontWeight="semibold"
          foregroundStyle={palette.title}
          lineLimit={1}
        >
          阶梯
        </Text>
        <TierSegments
          theme={theme}
          tier={tier.tier}
          width={small ? 10 : 11}
          height={small ? 4 : 5}
        />
        {showTierNo ? (
          <Text
            font={pt(8.5)}
            fontWeight="semibold"
            foregroundStyle={palette.label}
            lineLimit={1}
          >
            {`${tier.tier}/3`}
          </Text>
        ) : null}
        <Spacer minLength={0} />
        <RemainingText
          label={shortLabel ? (tier.tier === 3 ? '本年' : '剩余') : tier.label}
          amount={tier.amount}
          labelSize={small ? 8.5 : 9.5}
          numberSize={small ? 10 : 11}
          unitSize={small ? 7.5 : 8}
          color={palette.title}
          numberColor={INK}
        />
      </HStack>
    </VStack>
  )
}

/** 小号“阶梯”模式的主模块。 */
export function TierHero({
  theme,
  tier,
  width,
  height
}: {
  theme: WidgetTheme
  tier: ReturnType<typeof import('../core/usage').tierDisplay>
  width: number
  height: number
}) {
  const palette = themePalette(theme)
  return (
    <ZStack frame={{ width, height }}>
      <RoundedRectangle
        cornerRadius={pt(theme === 'island' ? 12 : 11)}
        fill={palette.module}
        frame={{ width, height }}
      />
      <VStack
        alignment="leading"
        spacing={0}
        padding={{ top: pt(7), bottom: pt(7), leading: pt(9), trailing: pt(9) }}
        frame={{ width, height }}
      >
        <HStack spacing={0} frame={{ maxWidth: 'infinity' }}>
          <Text
            font={pt(8)}
            fontWeight="semibold"
            foregroundStyle={palette.label}
            lineLimit={1}
          >
            阶梯
          </Text>
          <Spacer minLength={0} />
          <Text
            font={pt(13)}
            fontWeight="bold"
            foregroundStyle={INK}
            lineLimit={1}
          >
            {`${tier.tier}/3`}
          </Text>
        </HStack>
        <Gap height={3} />
        <TierSegments theme={theme} tier={tier.tier} width={19} height={5} />
        <Gap height={5} />
        <Text
          font={pt(7.5)}
          fontWeight="medium"
          foregroundStyle={palette.label}
          lineLimit={1}
        >
          {tier.label}
        </Text>
        <Gap height={1} />
        <UsageValue
          value={formatUsage(tier.amount)}
          size={22}
          unitSize={8}
          color={INK}
          unitColor={palette.label}
        />
      </VStack>
    </ZStack>
  )
}

export function LegendItem({
  color,
  text,
  theme
}: {
  color: string
  text: string
  theme: WidgetTheme
}) {
  const palette = themePalette(theme)
  return (
    <HStack spacing={pt(2)}>
      <Circle fill={color} frame={{ width: pt(4), height: pt(4) }} />
      <Text
        font={pt(7.5)}
        fontWeight="medium"
        foregroundStyle={palette.faint}
        lineLimit={1}
      >
        {text}
      </Text>
    </HStack>
  )
}

export function CalendarCellView({
  cell,
  width,
  height,
  dateSize = 7.5,
  valueSize = 12
}: {
  cell: CalendarMonthCell
  width: number
  height: number
  dateSize?: number
  valueSize?: number
}) {
  if (cell.day === 0) {
    return <VStack spacing={0} frame={{ width, height }} />
  }
  const dateColor = cell.isLatest ? CALENDAR_AMBER : CALENDAR_DATE
  const valueColor = cell.isLatest
    ? CALENDAR_AMBER
    : cell.isMax
      ? CALENDAR_RED
      : cell.isMin
        ? CALENDAR_BLUE
        : INK
  return (
    <VStack alignment="center" spacing={pt(0.5)} frame={{ width, height }}>
      <Text
        font={pt(dateSize)}
        fontWeight="medium"
        foregroundStyle={dateColor}
        lineLimit={1}
        frame={{ width, alignment: 'center' }}
      >
        {String(cell.day)}
      </Text>
      <Text
        font={pt(valueSize)}
        fontWeight="semibold"
        foregroundStyle={valueColor}
        lineLimit={1}
        frame={{ width, alignment: 'center' }}
      >
        {cell.value == null || cell.isFuture
          ? ''
          : formatUsage(cell.value, 'calendar')}
      </Text>
    </VStack>
  )
}


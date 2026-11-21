import { HStack, Rectangle, RoundedRectangle, Spacer, Text, VStack, ZStack } from 'scripting'
import { tierDisplay } from '../core/usage'
import type { CompactStyle, WidgetTheme } from '../core/settings'
import {
  BrandHeader,
  Gap,
  ThemeShell,
  TierHero,
  TierLine,
  UsageValue,
  ValueChip,
  contentWidth
} from './atoms'
import {
  INK,
  applyNumberFormat,
  formatUsage,
  pt,
  themePalette
} from './theme'
import type { WidgetViewProps } from './model'

function MonthHero({
  theme,
  width,
  height,
  label,
  value,
  month = false
}: {
  theme: WidgetTheme
  width: number
  height: number
  label: string
  value: number
  month?: boolean
}) {
  const palette = themePalette(theme)
  return (
    <ZStack frame={{ width, height }}>
      <RoundedRectangle
        cornerRadius={pt(theme === 'island' ? 11 : 11)}
        fill={palette.module}
        frame={{ width, height }}
      />
      <VStack
        alignment="leading"
        spacing={0}
        padding={{
          top: pt(6),
          bottom: pt(6),
          leading: pt(9),
          trailing: pt(9)
        }}
        frame={{ width, height }}
      >
        <Text
          font={pt(8)}
          fontWeight="semibold"
          foregroundStyle={palette.label}
          lineLimit={1}
        >
          {label}
        </Text>
        <Gap height={2} />
        <UsageValue
          value={formatUsage(value, month ? 'month' : 'plain')}
          size={27}
          unitSize={8}
          color={INK}
          unitColor={palette.label}
        />
      </VStack>
    </ZStack>
  )
}

function LineRow({
  theme,
  label,
  value,
  height,
  month = false
}: {
  theme: WidgetTheme
  label: string
  value: number
  height: number
  month?: boolean
}) {
  const palette = themePalette(theme)
  return (
    <VStack
      alignment="leading"
      spacing={0}
      frame={{ maxWidth: 'infinity', height: pt(height) }}
    >
      <Rectangle
        fill={palette.line}
        frame={{ maxWidth: 'infinity', height: pt(1) }}
      />
      <HStack
        alignment="center"
        spacing={0}
        frame={{ maxWidth: 'infinity', height: pt(height - 1) }}
      >
        <Text
          font={pt(8)}
          fontWeight="semibold"
          foregroundStyle={palette.label}
          lineLimit={1}
        >
          {label}
        </Text>
        <Spacer minLength={0} />
        <UsageValue
          value={formatUsage(value, month ? 'month' : 'plain')}
          size={13}
          unitSize={7.5}
          color={INK}
          unitColor={palette.label}
          weight="semibold"
        />
      </HStack>
    </VStack>
  )
}

export function CompactWidgetView(props: WidgetViewProps) {
  const { summary, settings, syncedAt } = props
  applyNumberFormat(settings)
  const theme = settings.theme ?? 'island'
  const width = contentWidth(theme, true)
  const tier = tierDisplay(
    summary.tierUsage,
    settings.oneLevelPq,
    settings.twoLevelPq
  )
  const mode: CompactStyle = settings.smallWidgetMode || 'month'

  return (
    <ThemeShell theme={theme} small>
      <BrandHeader theme={theme} syncedAt={syncedAt} small />

      {mode === 'bill' ? (
        <VStack alignment="leading" spacing={0} frame={{ width }}>
          <Gap height={4} />
          <ValueChip
            theme={theme}
            width={width}
            height={pt(40)}
            label="上月"
            value={summary.previousUsage}
            money={summary.previousCost}
            labelSize={7.5}
            valueSize={15}
            unitSize={7.5}
            moneySize={8}
            paddingX={9}
            dense
          />
          <Gap height={4} />
          <ValueChip
            theme={theme}
            width={width}
            height={pt(40)}
            label="本年"
            value={summary.yearUsage}
            money={summary.yearCost}
            labelSize={7.5}
            valueSize={15}
            unitSize={7.5}
            moneySize={8}
            paddingX={9}
            dense
          />
          <Spacer minLength={0} />
          <TierLine
            theme={theme}
            tier={tier}
            height={20}
            small
            showTierNo={false}
            shortLabel
          />
        </VStack>
      ) : mode === 'tier' ? (
        <VStack alignment="leading" spacing={0} frame={{ width }}>
          <Gap height={4} />
          <TierHero
            theme={theme}
            tier={tier}
            width={width}
            height={pt(86)}
          />
          <Spacer minLength={0} />
          <LineRow
            theme={theme}
            label="本月"
            value={summary.monthUsage}
            height={20}
            month
          />
        </VStack>
      ) : (
        <VStack alignment="leading" spacing={0} frame={{ width }}>
          <Gap height={4} />
          <MonthHero
            theme={theme}
            width={width}
            height={pt(62)}
            label="本月"
            value={summary.monthUsage}
            month
          />
          <Gap height={4} />
          <LineRow
            theme={theme}
            label="昨日"
            value={summary.yesterdayUsage}
            height={20}
          />
          <Spacer minLength={0} />
          <TierLine
            theme={theme}
            tier={tier}
            height={20}
            small
            showTierNo={false}
            shortLabel
          />
        </VStack>
      )}
    </ThemeShell>
  )
}

import { HStack, Spacer, Text, VStack } from 'scripting'
import { tierDisplay } from '../core/usage'
import {
  BrandHeader,
  Gap,
  GridModule,
  ThemeShell,
  TierChip,
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

export function WideWidgetView({
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
  const chipGap = pt(6)
  const chipWidth = (width - chipGap * 2) / 3
  const stripWidth = (width - pt(18)) / 4

  return (
    <ThemeShell theme={theme}>
      <BrandHeader theme={theme} syncedAt={syncedAt} />
      <Gap height={theme === 'island' ? 4 : 5} />

      {theme === 'island' ? (
        <HStack
          alignment="bottom"
          spacing={0}
          frame={{ width, height: pt(58) }}
        >
          <VStack alignment="leading" spacing={0}>
            <Text
              font={pt(8.5)}
              fontWeight="semibold"
              foregroundStyle={palette.label}
              lineLimit={1}
            >
              本月
            </Text>
            <UsageValue
              value={formatUsage(summary.monthUsage, 'month')}
              size={38}
              unitSize={10}
              color={INK}
              unitColor={palette.label}
            />
          </VStack>
          <Spacer minLength={0} />
          <VStack alignment="trailing" spacing={0}>
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
              size={18}
              unitSize={8}
              color={INK}
              unitColor={palette.label}
              weight="semibold"
            />
          </VStack>
        </HStack>
      ) : (
        <HStack spacing={pt(6)} frame={{ width, height: pt(70) }}>
          <GridModule
            theme={theme}
            width={stripWidth}
            height={pt(70)}
            label="本月"
            value={summary.monthUsage}
            paddingX={6}
            month
          />
          <GridModule
            theme={theme}
            width={stripWidth}
            height={pt(70)}
            label="昨日"
            value={summary.yesterdayUsage}
            paddingX={6}
          />
          <GridModule
            theme={theme}
            width={stripWidth}
            height={pt(70)}
            label="上月"
            value={summary.previousUsage}
            money={summary.previousCost}
            moneySize={7.5}
            paddingX={6}
          />
          <GridModule
            theme={theme}
            width={stripWidth}
            height={pt(70)}
            label="本年"
            value={summary.yearUsage}
            money={summary.yearCost}
            moneySize={7.5}
            paddingX={6}
          />
        </HStack>
      )}

      <Spacer minLength={0} />

      {theme === 'island' ? (
        <HStack spacing={chipGap} frame={{ width, height: pt(45) }}>
          <ValueChip
            theme={theme}
            width={chipWidth}
            height={pt(45)}
            label="上月"
            value={summary.previousUsage}
            money={summary.previousCost}
            paddingX={7}
          />
          <ValueChip
            theme={theme}
            width={chipWidth}
            height={pt(45)}
            label="本年"
            value={summary.yearUsage}
            money={summary.yearCost}
            paddingX={7}
          />
          <TierChip
            theme={theme}
            tier={tier}
            width={chipWidth}
            height={pt(45)}
          />
        </HStack>
      ) : (
        <TierLine theme={theme} tier={tier} height={24} />
      )}
    </ThemeShell>
  )
}

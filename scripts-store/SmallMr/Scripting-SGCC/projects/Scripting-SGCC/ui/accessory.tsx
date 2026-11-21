import { Gauge, HStack, Image, Spacer, Text, VStack, Widget } from 'scripting'
import { TIER_CAPTIONS, tierPosition } from '../core/usage'
import { INK, MUTED } from './theme'
import type { WidgetViewProps } from './model'

export function LockScreenWidgetView({ summary, settings }: WidgetViewProps) {
  const position = tierPosition(
    summary.tierUsage,
    settings.oneLevelPq,
    settings.twoLevelPq
  )
  const overall = (position.tier * position.percent) / 3
  const tierText = `第${TIER_CAPTIONS[position.tier]}梯度 ${Math.round(
    position.percent * 100
  )}%`
  const balanceLabel = summary.hasArrears ? '待缴' : '余额'

  switch (Widget.family) {
    case 'accessoryCircular':
      return (
        <Gauge
          value={overall}
          label={<Image systemName="bolt.fill" />}
          currentValueLabel={
            <Text minScaleFactor={0.5} lineLimit={1}>
              {summary.balance}
            </Text>
          }
          gaugeStyle="accessoryCircularCapacity"
        />
      )
    case 'accessoryInline':
      return (
        <Text>{`⚡︎ ${balanceLabel} ${summary.balance} · ${tierText}`}</Text>
      )
    default:
      return (
        <VStack alignment="leading" spacing={2}>
          <HStack spacing={4}>
            <Image systemName="bolt.fill" font="caption" />
            <Text font="caption" fontWeight="semibold">
              网上国网
            </Text>
          </HStack>
          <Text
            font="title3"
            fontWeight="bold"
            fontDesign="rounded"
            lineLimit={1}
            minScaleFactor={0.5}
          >
            {`${balanceLabel} ${summary.balance}`}
          </Text>
          {settings.showStepProgress ? (
            <Gauge
              value={overall}
              label={<Text font="caption2">{tierText}</Text>}
              gaugeStyle="accessoryLinearCapacity"
            />
          ) : (
            <Text font="caption2">
              {`年度 ${summary.yearUsage} 度 · ${summary.yearCost} 元`}
            </Text>
          )}
        </VStack>
      )
  }
}

export function FailureView({ message }: { message: string }) {
  if (Widget.family.startsWith('accessory')) {
    return (
      <VStack alignment="leading" spacing={2}>
        <Text font="caption" fontWeight="semibold">
          网上国网
        </Text>
        <Text font="caption2" minScaleFactor={0.6}>
          {message}
        </Text>
      </VStack>
    )
  }
  return (
    <VStack
      alignment="leading"
      spacing={6}
      padding={12}
      frame={{
        maxWidth: 'infinity',
        maxHeight: 'infinity',
        alignment: 'topLeading'
      }}
      widgetBackground={{ light: '#FFFFFF', dark: '#171A18' }}
    >
      <Text font={14} fontWeight="bold" foregroundStyle={INK}>
        网上国网
      </Text>
      <Text font={12} minScaleFactor={0.6} foregroundStyle={MUTED}>
        {message}
      </Text>
      <Spacer />
    </VStack>
  )
}

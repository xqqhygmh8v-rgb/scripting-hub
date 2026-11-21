import type { WidgetSettings } from '../core/settings'
import type { UsageSummary } from '../core/usage'

export type WidgetViewProps = {
  summary: UsageSummary
  settings: WidgetSettings
  syncedAt: number
  warning?: string
}

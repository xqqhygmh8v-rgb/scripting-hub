import { Widget } from 'scripting'
import { CompactWidgetView } from './compact'
import { LargeWidgetView } from './large'
import { WideWidgetView } from './medium'
import { LockScreenWidgetView } from './accessory'
import type { WidgetViewProps } from './model'

export function WidgetCanvas(props: WidgetViewProps) {
  switch (Widget.family) {
    case 'systemSmall':
      return <CompactWidgetView {...props} />
    case 'systemLarge':
      return <LargeWidgetView {...props} />
    case 'accessoryCircular':
    case 'accessoryRectangular':
    case 'accessoryInline':
      return <LockScreenWidgetView {...props} />
    default:
      return <WideWidgetView {...props} />
  }
}

export { FailureView } from './accessory'

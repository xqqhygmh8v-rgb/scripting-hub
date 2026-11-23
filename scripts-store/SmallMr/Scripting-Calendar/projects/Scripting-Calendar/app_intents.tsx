import {
  AppIntentManager,
  AppIntentProtocol,
  Widget
} from 'scripting'
import {
  resetMonthCursor,
  shiftMonthCursor
} from './core/monthState'

export const MoveMonthIntent = AppIntentManager.register<{ delta: number }>({
  name: 'CalendarMoveMonth',
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ delta }) => {
    shiftMonthCursor(delta)
    Widget.reloadAll()
  }
})

export const ResetMonthIntent = AppIntentManager.register<undefined>({
  name: 'CalendarResetMonth',
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    resetMonthCursor()
    Widget.reloadAll()
  }
})

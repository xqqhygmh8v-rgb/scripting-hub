import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { requestRefresh } from "./settings"

export const RefreshUnlockIntent = AppIntentManager.register({
  name: "RefreshUnlock",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_refresh: boolean) => {
    requestRefresh()
    Widget.reloadAll()
  },
})

import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"

export const RefreshWeatherIntent = AppIntentManager.register({
  name: "RefreshWeatherIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (_params: undefined) => {
    Widget.reloadAll()
  },
})

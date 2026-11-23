import { AppIntentManager, AppIntentProtocol, Widget, Script } from "scripting";

export const ReloadAppIntent = AppIntentManager.register({
  name: Script.name,
  protocol: AppIntentProtocol.AppIntent,
  perform: async (params: undefined) => {
    Widget.reloadUserWidgets();
  },
});

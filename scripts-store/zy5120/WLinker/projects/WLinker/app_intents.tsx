// WLinker - AppIntents（小组件点击刷新）
import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { fetchVehicleSnapshotWithRelogin } from "./wuling-client"
import { saveConnectedSnapshot, setRuntimeMode } from "./storage"

export const RefreshIntent = AppIntentManager.register({
  name: "RefreshWLinker",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    try {
      const snapshot = await fetchVehicleSnapshotWithRelogin()
      saveConnectedSnapshot(snapshot)
      setRuntimeMode("connected")
    } catch (error) {
      console.warn("intent refresh failed:", error instanceof Error ? error.message : String(error))
    }
    Widget.reloadAll()
  },
})

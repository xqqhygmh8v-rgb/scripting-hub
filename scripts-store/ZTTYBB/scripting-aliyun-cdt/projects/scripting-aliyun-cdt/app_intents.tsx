/** 交互式小组件刷新只执行读取，不会关停或重启 ECS。 */
import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { AliyunService } from "./aliyun"
import { loadConfig } from "./config"

export const RefreshTrafficIntent = AppIntentManager.register({
  name: "RefreshTrafficIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    try {
      const config = loadConfig()
      if (!config.accessKeyId || !config.accessKeySecret || !config.ecsInstanceId) return
      const service = new AliyunService(config)
      await Promise.all([service.getCDTTraffic(), service.getECSStatus()])
    } catch (error) {
      console.error("RefreshTrafficIntent 失败:", error)
    } finally {
      if (typeof Widget !== "undefined" && Widget.reloadAllTimelines) {
        Widget.reloadAllTimelines()
      }
    }
  }
})

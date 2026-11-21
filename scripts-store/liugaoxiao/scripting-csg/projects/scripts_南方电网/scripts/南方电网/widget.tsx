import { Widget } from "scripting"
import { DEFAULT_WIDGET_RELOAD_MINUTES } from "./constants"
import { WidgetErrorView, WidgetView } from "./components/widget_view"
import { fetchWidgetData, shouldSkipRemoteFetch } from "./services/power"
import { readSettings, readWidgetCache } from "./storage"
import { resolveWidgetConfiguration } from "./widget_config"

async function run() {
  const settings = readSettings()
  const cached = readWidgetCache()
  const configuration = resolveWidgetConfiguration(Widget.parameter, settings)
  let data = cached
  let reloadMinutes = 15
  let errorMessage = ""

  try {
    console.log("[CSG] widget:start", JSON.stringify({
      hasPaymentNumber: Boolean(settings.paymentNumber),
      hasSelectedAccount: Boolean(settings.selectedAccount),
      linkedAccounts: settings.linkedAccounts.length,
      hasCustomerNumber: Boolean(settings.customerNumber),
      widgetStyle: configuration.widgetStyle,
      widgetMetricIds: configuration.widgetMetricIds,
    }))
    const skipDecision = shouldSkipRemoteFetch(settings)
    console.log("[CSG] widget:skipDecision", JSON.stringify(skipDecision))
    if (!skipDecision.skip || !cached) {
      data = await fetchWidgetData(settings)
      reloadMinutes = DEFAULT_WIDGET_RELOAD_MINUTES
    } else {
      console.log("[CSG] widget:useCached", cached.refreshedAt)
    }
  } catch (error: any) {
    errorMessage = String(error?.message ?? error)
    console.log("[CSG] widget:error", errorMessage)
    if (cached) {
      console.log("[CSG] widget:errorUseCached", cached.refreshedAt)
      data = cached
    }
  }

  if (!data) {
    Widget.present(<WidgetErrorView message={errorMessage || "暂无可用的小组件数据。"} />)
    return
  }

  console.log("[CSG] widget:present", data.refreshedAt)
  Widget.present(<WidgetView data={data} configuration={configuration} />, {
    policy: "after",
    date: new Date(Date.now() + reloadMinutes * 60 * 1000),
  })
}

run()

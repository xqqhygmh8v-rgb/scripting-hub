import { Script, Widget } from "scripting"
import { checkUnlock } from "./check"
import { emptyReport } from "./model"
import { clearRefreshRequest, isFresh, loadCache, loadStyles, refreshRequested, resolveStyle, saveCache } from "./settings"
import { UnlockWidgetView } from "./widget-view"

async function loadReport() {
  const cached = loadCache()
  const asked = refreshRequested()
  // 點擊更新時間時必定重新檢測；其他情況才沿用 10 分鐘快取。
  if (!asked && cached && isFresh(cached)) {
    return cached
  }
  try {
    const report = await checkUnlock()
    saveCache(report)
    clearRefreshRequest()
    return report
  } catch {
    if (cached) return { ...cached, stale: true }
    return emptyReport()
  }
}

async function present() {
  const styles = loadStyles()
  const style = resolveStyle(Widget.parameter || "", styles)
  const report = await loadReport()
  Widget.present(<UnlockWidgetView style={style} report={report} />, {
    policy: "after",
    date: new Date(Date.now() + 30 * 60 * 1000),
  })
  Script.exit()
}

present()

import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"
import { getAccountForWidgetTarget, ghRequest, recordWidgetTrigger } from "./github"

export const RunWorkflowIntent = AppIntentManager.register<string>({
  name: "RunWorkflowIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async (payload: string) => {
    try {
      const { owner, repo, workflowId, branch } = JSON.parse(payload)
      if (!owner || !repo || !workflowId) return
      // v1.5.0：用這個工作流程所屬帳號的 Token 執行，不再只用第一個帳號的 Token，
      // 所以選了非第一個帳號的倉庫也能從小工具執行；找不到所屬帳號時才退回第一個帳號。
      const account = getAccountForWidgetTarget(`${owner}/${repo}/${workflowId}`)
      if (!account) return
      // v1.5.4：小工具觸發不再寫追蹤、不再發完成通知（使用者要求），
      // 所以這裡只執行、不記 beforeIds；想看執行結果就打開主程式看執行紀錄。
      // 主程式裡面按執行還是會追蹤、完成時還是會通知，不受這裡影響。
      // 1.1（2026-11-08）曾經恢復小工具觸發寫 run_watch、完成時通知，
      // 但後台跑還是收不到通知，Kristen 決定放棄、移除，版本回到 1.0.0。
      await ghRequest(
        `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
        account.token,
        { method: 'POST', body: JSON.stringify({ ref: branch || 'main', inputs: {} }) }
      )
      recordWidgetTrigger(owner, repo, workflowId)
    } catch (_) {
    }
    Widget.reloadAll()
  },
})

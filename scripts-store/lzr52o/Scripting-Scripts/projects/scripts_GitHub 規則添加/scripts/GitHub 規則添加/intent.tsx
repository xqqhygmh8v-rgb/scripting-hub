// Intent 入口 —— 讓「追加規則」能在後台完成，不必打開 App。
//
// 兩種用法：
//   · 分享菜單：在 Safari 等 App 裡選中文字 / 分享網頁 → Scripting → 本腳本；
//   · 快捷指令：**Run Script** 動作（後台執行、無 UI），可配合個人自動化定時觸發。
//     若選用 Run Script in App 則會前台打開，本檔案同樣能跑，只是多了一次 App 啓動。
//
// 該環境（Script.env === "intent"）沒有界面，因此這裡絕不調用 Dialog.* / Navigation.present ——
// 彈窗在無 UI 環境會永遠掛住，自動化就此卡死。結果走兩條回報通道：
//   1. Script.exit(Intent.text(...)) 把結果交回快捷指令，便於後續動作串接；
//   2. 本地通知，供分享菜單場景（用戶看不到快捷指令的返回值）。

import { Intent, Notification, Script } from "scripting"
import { appendRulesInBackground } from "./services/rule_append"
import { t } from "./components/i18n"

/** 彙總所有可能的輸入通道，拼成待解析文本。 */
function collectInputText(): string {
  const chunks: string[] = []

  const shortcut = Intent.shortcutParameter
  if (shortcut) {
    if (shortcut.type === "text" || shortcut.type === "fileURL") {
      chunks.push(String(shortcut.value))
    } else if (shortcut.type === "json") {
      // 快捷指令傳 JSON 時按數組 / 對象值展開，取其中的字符串
      const values = Array.isArray(shortcut.value) ? shortcut.value : Object.values(shortcut.value ?? {})
      for (const value of values) {
        if (typeof value === "string") chunks.push(value)
      }
    }
  }

  if (Intent.textsParameter) chunks.push(...Intent.textsParameter)
  if (Intent.urlsParameter) chunks.push(...Intent.urlsParameter)

  return chunks.join("\n")
}

async function run() {
  const text = collectInputText()

  if (!text.trim()) {
    const message = t('沒有收到文本或鏈接', '没有收到文本或链接', 'No text or link received')
    await Notification.schedule({ title: t('追加規則失敗', '追加规则失败', 'Failed to Append Rules'), body: message, threadIdentifier: "github-rule-append" })
      .catch(() => undefined)
    Script.exit(Intent.text(message))
    return
  }

  const result = await appendRulesInBackground(text)

  try {
    await Notification.schedule({
      title: result.ok ? t('規則已追加', '规则已追加', 'Rules Appended') : t('追加規則失敗', '追加规则失败', 'Failed to Append Rules'),
      body: result.message,
      // 成功靜默：分享 / 定時追加是高頻操作，不該每次都響；失敗才提醒。
      silent: result.ok,
      interruptionLevel: result.ok ? "passive" : "active",
      threadIdentifier: "github-rule-append",
    })
  } catch (error) {
    // 通知權限未授予不應影響提交本身的成敗
    console.warn(t('追加結果通知發送失敗', '追加结果通知发送失败', 'Failed to send append result notification'), error)
  }

  Script.exit(Intent.text(result.message))
}

run()

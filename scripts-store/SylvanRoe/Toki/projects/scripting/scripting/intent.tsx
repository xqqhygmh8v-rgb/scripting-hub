import { Script } from "scripting"
import { importPayload, saveState } from "./store"

// Share Sheet / Shortcuts entry: receives Toki JSON exported by the web app,
// writes it to the App Group store, then refreshes the widget snapshot.
const input = Script.queryParameters?.text || Script.queryParameters?.input || ""

if (typeof input === "string" && input.trim()) {
  try {
    const next = importPayload(input)
    saveState(next)
    Script.exit(`已导入 ${next.identities.length} 个身份、${next.accounts.length} 个网站、${next.tokens.length} 条密钥`)
  } catch (e) {
    Script.exit(`导入失败：${String(e)}`)
  }
} else {
  Script.exit("没有收到 Toki 备份 JSON")
}

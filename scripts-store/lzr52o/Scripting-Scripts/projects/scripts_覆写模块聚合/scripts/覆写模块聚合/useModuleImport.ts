import { useEffect, useRef, useState } from "scripting"
import type { CatalogueItem } from "./core"
import type { Feedback } from "./ui"
import { IMPORT_GUIDES, clientName, clientOf } from "./clients"
import { openModule } from "./network"

export function useModuleImport(item: CatalogueItem) {
  const [opening, setOpening] = useState(false)
  const [feedback, setFeedback] = useState<(Feedback & { method: "native" | "universal" }) | null>(null)
  const active = useRef(false)
  const alive = useRef(true)
  const client = clientOf(item)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  async function install(method: "native" | "universal" = "native") {
    if (active.current) return
    active.current = true
    setOpening(true)
    setFeedback(null)
    try {
      const opened = await openModule(item, method)
      if (alive.current) setFeedback({ method, error: !opened, text: opened
        ? method === "universal" ? `已打开官方导入入口，请在 ${clientName(client)} 中确认。`
          : `已发送导入链接，请在 ${clientName(client)} 中确认。`
        : `无法打开 ${clientName(client)}。请确认已安装该软件；${IMPORT_GUIDES[client].manual}` })
    } catch (issue) {
      if (alive.current) setFeedback({ method, error: true, text: issue instanceof Error ? issue.message : "无法打开导入页，请重试或复制网址。" })
    } finally {
      active.current = false
      if (alive.current) setOpening(false)
    }
  }
  return { opening, feedback, install }
}

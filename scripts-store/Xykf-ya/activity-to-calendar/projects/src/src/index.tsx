import {
  Button, Form, Navigation, NavigationStack, Section, SecureField, Text,
  TextField, useState,
} from "scripting"
import { dateText, EventDraft, recognize, SingleClickFlow, UserError } from "./core"
import { forgetKey, loadKey, nativeAPI, rememberKey, safeError } from "./runtime"
import { DEEPSEEK_API_KEY } from "./api-key"

const flow = new SingleClickFlow()
const configKey = DEEPSEEK_API_KEY.trim()
let sessionKey = configKey
let keyLoadError = ""
if (!configKey) {
  try { sessionKey = loadKey() } catch (error) { keyLoadError = safeError(error, "") }
}

function displayTime(event: EventDraft): string {
  const fmt = (date: Date) => `${dateText(date)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
  if (!event.allDay) return `${fmt(event.start)} — ${fmt(event.end)}`
  const lastDay = new Date(event.end)
  lastDay.setDate(lastDay.getDate() - 1)
  return dateText(lastDay) === dateText(event.start)
    ? `${dateText(event.start)} · 全天`
    : `${dateText(event.start)} 至 ${dateText(lastDay)} · 全天`
}

async function saveToCalendar(draft: EventDraft): Promise<void> {
  const calendar = await nativeAPI("Calendar").defaultForEvents()
  if (!calendar || !calendar.allowsContentModifications) {
    throw new UserError("找不到可写入的默认日历。请在 iPhone 的日历设置中选择默认日历，并允许 Scripting 访问日历。")
  }
  const Event = nativeAPI("CalendarEvent")
  const event = new Event()
  event.calendar = calendar
  event.title = draft.title
  event.location = draft.location
  event.isAllDay = draft.allDay
  event.startDate = draft.start
  event.endDate = draft.end
  event.notes = "由「活动转日历」从活动通知自动识别添加。"
  await event.save()
}

function App() {
  const [key, setKey] = useState(sessionKey)
  const [manualText, setManualText] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(keyLoadError || (sessionKey
    ? "复制活动通知，点一下上面的按钮就添加。"
    : "第一次使用：在上面填入 DeepSeek API Key，点「保存 Key」。"))
  const [result, setResult] = useState<EventDraft | null>(null)
  const [keySaved, setKeySaved] = useState(!!sessionKey)
  const [preview, setPreview] = useState("")
  const [showSettings, setShowSettings] = useState(!sessionKey)

  // 保存 Key 是一个独立动作，不再挂在"粘贴并识别"上。
  function saveKey() {
    const value = key.trim()
    if (!value) { setStatus("请先填入 DeepSeek API Key。"); return }
    try {
      rememberKey(value)
      sessionKey = value
      setKeySaved(true)
      setShowSettings(false)
      setStatus("Key 已保存到本机，以后不用再填。复制活动通知，点「粘贴并识别」即可。")
    } catch (error) {
      setStatus(safeError(error, value))
    }
  }

  function clearKey() {
    try {
      forgetKey()
      sessionKey = ""
      setKey("")
      setKeySaved(false)
      setShowSettings(true)
      setStatus("已清除本机保存的 Key。")
    } catch (error) {
      setStatus(safeError(error, sessionKey))
    }
  }

  async function run() {
    if (busy) return
    if (!sessionKey.trim()) {
      setShowSettings(true)
      setStatus("还没有可用的 Key，请先在上面填入并点「保存 Key」。")
      return
    }
    setBusy(true)
    setResult(null)
    setStatus("正在读取活动信息…")
    let stage = "读取剪贴板"
    try {
      const event = await flow.run(
        async () => {
          let text = manualText
          try { if (!text.trim()) text = (await nativeAPI("Pasteboard").getString()) || "" }
          catch { throw new UserError("无法读取剪贴板，请在 iPhone 设置中允许 Scripting 从其他 App 粘贴，或在下面输入原文。") }
          if (!text.trim()) throw new UserError("剪贴板没有文字。请先复制活动通知，再点击按钮。")
          if (text.trim() === sessionKey.trim() || /^sk-[\w-]+$/.test(text.trim())) {
            throw new UserError("剪贴板里是 API Key。请先复制一条活动通知，再点击。")
          }
          setPreview(text.slice(0, 400))
          return text
        },
        async text => {
          stage = "请求 DeepSeek"
          setStatus(`已读取 ${text.length} 字，正在识别活动…`)
          return recognize(text, sessionKey, (url, init) => nativeAPI("fetch")(url, init))
        },
        async draft => { stage = "写入系统日历"; setStatus("识别成功，正在添加到系统日历…"); await saveToCalendar(draft) },
      )
      setResult(event)
      setManualText("")
      setStatus("已添加到系统日历")
    } catch (error) {
      setStatus(`${stage}：${safeError(error, sessionKey)}`)
    } finally { setBusy(false) }
  }

  return <NavigationStack>
    <Form navigationTitle="活动转日历" navigationBarTitleDisplayMode="inline">
      {!keySaved || showSettings ? <Section
        header={<Text>DeepSeek API Key</Text>}
        footer={<Text>{keySaved
          ? "已保存在本机，不会上传。要换 Key 直接改上面的内容再点保存。"
          : "只填这一次。填好点「保存 Key」，之后就不用再管了。"}</Text>}>
        <SecureField title="API Key" value={key} onChanged={setKey}
          prompt="sk-…" disabled={busy} autocorrectionDisabled textInputAutocapitalization="never" />
        <Button title={keySaved ? "保存这个 Key" : "保存 Key"} disabled={busy || !key.trim()} action={saveKey} />
        {keySaved ? <Button title="清除已保存的 Key" disabled={busy} action={clearKey} /> : null}
        {keySaved ? <Button title="收起设置" disabled={busy} action={() => setShowSettings(false)} /> : null}
      </Section> : null}

      <Section footer={<Text>{keySaved
        ? "点击后会把文字发到 DeepSeek 识别，并直接写入系统日历。"
        : "填好并保存 Key 后，这个按钮才可用。"}</Text>}>
        <Button action={run} disabled={busy || !keySaved} buttonStyle="borderedProminent" controlSize="large">
          <Text frame={{ maxWidth: "infinity", alignment: "center" }}>{busy ? "正在处理…" : "粘贴并识别"}</Text>
        </Button>
        <Text>{status}</Text>
      </Section>

      {!configKey && keySaved && !showSettings
        ? <Button title="API 设置" disabled={busy} action={() => setShowSettings(true)} />
        : null}

      {preview ? <Section header={<Text>已读取的文字</Text>}><Text>{preview}</Text></Section> : null}
      {result ? <Section header={<Text>添加成功</Text>}>
        <Text font="headline">{result.title}</Text>
        <Text>{displayTime(result)}</Text>
        <Text>{result.location || "未提供地点"}</Text>
        {result.defaultDuration ? <Text>原文没有结束时间，已按一小时添加。</Text> : null}
        <Text foregroundStyle="secondary">需要修改或删除时，请到 iPhone 系统日历操作。</Text>
      </Section> : null}
      <Section header={<Text>可选：输入或修改活动原文</Text>}>
        <TextField title="活动原文" value={manualText} onChanged={setManualText}
          axis="vertical" lineLimit={{ min: 3, max: 8 }} prompt="也可以把文字粘贴到这里"
          disabled={busy} />
      </Section>
    </Form>
  </NavigationStack>
}

async function main() {
  try { await Navigation.present({ element: <App /> }) }
  finally { nativeAPI("Script").exit() }
}
void main()

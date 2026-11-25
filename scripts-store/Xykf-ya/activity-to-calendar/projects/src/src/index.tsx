import {
  Button, DatePicker, Form, Navigation, NavigationStack, Section, SecureField, Text, Toggle,
  TextField, useState,
} from "scripting"
import { EventDraft, recognize, SingleClickFlow, UserError } from "./core"
import { forgetKey, loadKey, nativeAPI, rememberKey, safeError } from "./runtime"
import { DEEPSEEK_API_KEY } from "./api-key"
import { EventEditor, lastDay } from "./editor"

const flow = new SingleClickFlow()
let activeEditor: EventEditor | null = null
const configKey = DEEPSEEK_API_KEY.trim()
let sessionKey = configKey
let keyLoadError = ""
if (!configKey) {
  try { sessionKey = loadKey() } catch (error) { keyLoadError = safeError(error, "") }
}

async function saveToCalendar(draft: EventDraft): Promise<any> {
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
  return event
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
  const [editor, setEditor] = useState<EventEditor | null>(null)
  const [editRevision, setEditRevision] = useState(0)
  let createdEvent: any = null

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
    if (busy || activeEditor?.dirty) return
    if (!sessionKey.trim()) {
      setShowSettings(true)
      setStatus("还没有可用的 Key，请先在上面填入并点「保存 Key」。")
      return
    }
    setBusy(true)
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
        async draft => { stage = "写入系统日历"; setStatus("识别成功，正在添加到系统日历…"); createdEvent = await saveToCalendar(draft) },
      )
      setResult(event)
      let revision = editRevision
      activeEditor = new EventEditor(event, createdEvent, () => setEditRevision(++revision),
        value => flow.rememberEdited(value), error => safeError(error, sessionKey))
      setEditor(activeEditor)
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
        <Button action={run} disabled={busy || !keySaved || !!editor?.dirty} buttonStyle="borderedProminent" controlSize="large">
          <Text frame={{ maxWidth: "infinity", alignment: "center" }}>{busy ? "正在处理…" : "粘贴并识别"}</Text>
        </Button>
        <Text>{status}</Text>
      </Section>

      {!configKey && keySaved && !showSettings
        ? <Button title="API 设置" disabled={busy} action={() => setShowSettings(true)} />
        : null}

      {preview ? <Section header={<Text>已读取的文字</Text>}><Text>{preview}</Text></Section> : null}
      {result && editor ? <Section header={<Text>添加成功</Text>}
        footer={<Text>修改后自动同步，请等“已同步”再关闭。调整开始时间会同时平移结束时间。</Text>}>
        <TextField title="活动名称" value={editor.value.title} onChanged={value => editor.change({ title: value })}
          prompt="活动名称" disabled={busy} />
        <TextField title="地点" value={editor.value.location} onChanged={value => editor.change({ location: value })}
          prompt="补充地点" disabled={busy} />
        <Toggle title="全天" value={editor.value.allDay} onChanged={value => editor.setAllDay(value)} disabled={busy} />
        <DatePicker title={editor.value.allDay ? "开始日期" : "开始时间"} value={editor.value.start.getTime()}
          onChanged={value => editor.setStart(value)} displayedComponents={editor.value.allDay ? ["date"] : ["date", "hourAndMinute"]}
          datePickerStyle="compact" disabled={busy} />
        <DatePicker title={editor.value.allDay ? "结束日期（含当天）" : "结束时间"} value={lastDay(editor.value).getTime()}
          onChanged={value => editor.setEnd(value)} displayedComponents={editor.value.allDay ? ["date"] : ["date", "hourAndMinute"]}
          datePickerStyle="compact" disabled={busy} />
        <Text foregroundStyle="secondary">{editor.message}</Text>
        {editor.message.startsWith("同步失败") ? <Button title="重试同步" action={() => editor.flush()} /> : null}
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
  finally { try { await activeEditor?.flush() } finally { nativeAPI("Script").exit() } }
}
void main()

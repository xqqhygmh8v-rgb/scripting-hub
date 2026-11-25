import { dateText, EventDraft, localDate } from "./core"

export type EditableEvent = {
  title: string; location: string | null; isAllDay: boolean
  startDate: Date; endDate: Date; save(): Promise<void>
}
const copy = (value: EventDraft): EventDraft => ({ ...value, start: new Date(value.start), end: new Date(value.end) })
export function lastDay(value: EventDraft): Date {
  const end = new Date(value.end)
  if (value.allDay) end.setDate(end.getDate() - 1)
  return end
}

// Retain the event that was successfully created. Every save updates that same object.
export class EventEditor {
  value: EventDraft
  message = "修改后自动同步到日历"
  dirty = false
  private revision = 0
  private savedRevision = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private flight: Promise<void> | null = null
  constructor(initial: EventDraft, private event: EditableEvent,
    private changed: () => void, private saved: (value: EventDraft) => void,
    private errorText: (error: unknown) => string) { this.value = copy(initial) }

  change(patch: Partial<EventDraft>) {
    this.value = copy({ ...this.value, ...patch })
    this.revision++
    this.dirty = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.message = this.validation() || "等待同步…"
    this.changed()
    if (!this.validation()) this.timer = setTimeout(() => { void this.flush() }, 500)
  }
  private validation(): string {
    if (!this.value.title.trim()) return "请填写活动名称，尚未同步"
    if (!Number.isFinite(this.value.start.getTime()) || !Number.isFinite(this.value.end.getTime()) || this.value.end <= this.value.start)
      return "结束时间须晚于开始时间，尚未同步"
    return ""
  }
  setStart(timestamp: number) {
    const start = this.value.allDay ? localDate(dateText(new Date(timestamp))) : new Date(timestamp)
    let end: Date
    if (this.value.allDay) {
      const days = Math.max(1, Math.round((Date.UTC(this.value.end.getFullYear(), this.value.end.getMonth(), this.value.end.getDate()) -
        Date.UTC(this.value.start.getFullYear(), this.value.start.getMonth(), this.value.start.getDate())) / 86400000))
      end = new Date(start); end.setDate(end.getDate() + days)
    } else end = new Date(start.getTime() + Math.max(60000, this.value.end.getTime() - this.value.start.getTime()))
    this.change({ start, end })
  }
  setEnd(timestamp: number) {
    const end = this.value.allDay ? localDate(dateText(new Date(timestamp))) : new Date(timestamp)
    if (this.value.allDay) end.setDate(end.getDate() + 1)
    this.change({ end, defaultDuration: false })
  }
  setAllDay(allDay: boolean) {
    const start = localDate(dateText(this.value.start))
    let end = localDate(dateText(lastDay(this.value)))
    if (allDay) {
      // A timed event ending exactly at midnight does not occupy that next day.
      if (!this.value.allDay && this.value.end.getHours() === 0 && this.value.end.getMinutes() === 0 && end > start)
        end.setDate(end.getDate() - 1)
      end.setDate(end.getDate() + 1)
    } else { start.setHours(9); end.setHours(10) }
    this.change({ allDay, start, end, defaultDuration: false })
  }
  async flush(): Promise<void> {
    if (this.timer !== undefined) { clearTimeout(this.timer); this.timer = undefined }
    if (this.flight) { await this.flight; return }
    if (!this.dirty) return
    const task = this.drain()
    this.flight = task
    try { await task } finally { this.flight = null }
  }
  private async drain() {
    while (this.savedRevision < this.revision) {
      const validation = this.validation()
      if (validation) { this.message = validation; this.changed(); return }
      const version = this.revision
      const draft = copy(this.value)
      this.message = "正在同步…"; this.changed()
      try {
        this.event.title = draft.title.trim()
        this.event.location = draft.location
        this.event.isAllDay = draft.allDay
        this.event.startDate = draft.start
        this.event.endDate = draft.end
        await this.event.save()
        this.savedRevision = version
        this.saved(draft)
      } catch (error) {
        this.message = `同步失败：${this.errorText(error)}。请重试同步。`
        this.changed(); return
      }
    }
    this.dirty = false
    this.message = "已同步到系统日历"
    this.changed()
  }
}

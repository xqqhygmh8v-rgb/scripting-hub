/**
 * 刪除流程的麵包屑記錄（2026-11-19）。
 *
 * 為什麼需要這個：使用者在「按下確認」後整個 Scripting 會消失回主畫面，
 * 但 CrashReporter 目錄讀不到（Operation not permitted），拿不到 .ips，
 * 沒有堆疊就只能在程式裡放標記，下一次閃退後看重開時最後寫到哪一步。
 *
 * 每一筆都直接寫進 Storage（不是記憶體），所以進程被砍掉也留得住。
 * 寫入失敗一律吞掉：這段程式绝对不能因為記錄本身而出錯。
 */
const TRACE_KEY = "github_toolkit_delete_trace";
const MAX_STEPS = 40;

export interface DeleteTraceStep {
  time: string;
  step: string;
  detail?: string;
}

function readRaw(): DeleteTraceStep[] {
  try {
    const raw: string | null | undefined = Storage.get(TRACE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 記一步。step 用固定短句，之後看的時候一眼就知道走到哪。 */
export function traceDelete(step: string, detail?: any): void {
  try {
    const steps = readRaw();
    steps.push({
      time: new Date().toISOString(),
      step,
      detail: detail === undefined ? undefined : String(detail).slice(0, 200),
    });
    while (steps.length > MAX_STEPS) steps.shift();
    Storage.set(TRACE_KEY, JSON.stringify(steps));
  } catch {}
}

export function getDeleteTrace(): DeleteTraceStep[] {
  return readRaw();
}

export function clearDeleteTrace(): void {
  try {
    Storage.remove(TRACE_KEY);
  } catch {}
}

/** 給診斷畫面用的一行摘要。 */
export function formatDeleteTrace(steps: DeleteTraceStep[]): string {
  if (steps.length === 0) return "(沒有記錄)";
  return steps
    .map((s) => {
      // 只留時分秒，日期對單次測試沒用又佔寬度。
      const clock = s.time.length >= 19 ? s.time.slice(11, 19) : s.time;
      return s.detail ? `${clock} ${s.step} — ${s.detail}` : `${clock} ${s.step}`;
    })
    .join("\n");
}

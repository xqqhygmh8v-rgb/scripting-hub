// 運行詳情摘要（v2.0.0 新增）：逐字移植參考腳本 Github_Action-2 的
// services/runDetailContent.ts，差別只有文案改走 Toolkit 的 t()
//（繁中／簡中／英文），以及型別改成本檔自帶的結構型別（不從
// action/index.tsx import，避免循環 import）。
import { t } from "../components/i18n";

export interface RunDetailJobStep {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
  started_at: string;
  completed_at: string | null;
}

export interface RunDetailJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string;
  completed_at: string | null;
  steps?: RunDetailJobStep[];
}

export interface RunDetailRun {
  status: string;
  conclusion: string | null;
  run_started_at?: string;
  completed_at?: string;
  head_commit?: { message?: string };
  display_title?: string;
}

export type RunDetailContent = {
  completedJobs: number;
  steps: number;
  success: number;
  failed: number;
  skipped: number;
  focus: { title: string; lines: string[]; tone: "failure" | "running" | "neutral" };
  commit: string;
  end?: string;
  durationStart?: string;
  inferredEnd: boolean;
};

function validTime(value: string | null | undefined): number | undefined {
  const time: number = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : undefined;
}

function failed(state: { status: string; conclusion: string | null }): boolean {
  return (
    state.status === "completed" &&
    (state.conclusion === "failure" ||
      state.conclusion === "timed_out" ||
      state.conclusion === "startup_failure" ||
      state.conclusion === "action_required")
  );
}

export function describeRunDetail(run: RunDetailRun, jobs: RunDetailJob[]): RunDetailContent {
  const steps: RunDetailJobStep[] = jobs.flatMap((job: RunDetailJob): RunDetailJobStep[] => job.steps ?? []);
  const failedJobs: RunDetailJob[] = jobs.filter(failed);
  const active: RunDetailJob[] = jobs.filter((job: RunDetailJob): boolean => job.status === "in_progress");
  const lines: string[] = failedJobs.flatMap((job: RunDetailJob): string[] => {
    const failures: RunDetailJobStep[] = (job.steps ?? []).filter(failed);
    return failures.length ? failures.map((step: RunDetailJobStep): string => `${job.name} · ${step.name}`) : [job.name];
  });
  const title: string = failedJobs.length
    ? t("需要關注", "需要关注", "Needs attention")
    : active.length
      ? t(`正在執行 · ${active.length} 個任務`, `正在执行 · ${active.length} 个任务`, `Running · ${active.length} jobs`)
      : run.status === "completed"
        ? t("執行結果", "执行结果", "Result")
        : t("等待執行", "等待执行", "Waiting to run");
  if (!lines.length && active.length) {
    for (const job of active) {
      const current: RunDetailJobStep | undefined = job.steps?.find((step: RunDetailJobStep): boolean => step.status === "in_progress");
      lines.push(current ? `${job.name} · ${current.name}` : job.name);
    }
  }
  if (!lines.length)
    lines.push(
      run.status === "completed"
        ? run.conclusion === "success"
          ? t("本次運行已成功完成", "本次运行已成功完成", "This run completed successfully")
          : run.conclusion === "failure"
            ? t("運行失敗，暫無失敗步驟明細", "运行失败，暂无失败步骤明细", "Run failed, no failed step details available")
            : run.conclusion === "timed_out"
              ? t("運行已逾時，暫無逾時步驟明細", "运行已超时，暂无超时步骤明细", "Run timed out, no timed-out step details available")
              : run.conclusion === "cancelled"
                ? t("本次運行已取消", "本次运行已取消", "This run was cancelled")
                : t("任務與步驟詳情見下方", "任务与步骤详情见下方", "See job and step details below")
        : t("等待 GitHub 分配或啟動任務", "等待 GitHub 分配或启动任务", "Waiting for GitHub to assign or start a job")
    );
  const allEnded: boolean = jobs.length > 0 && jobs.every((job: RunDetailJob): boolean => job.status === "completed");
  const ends: number[] = jobs
    .map((job: RunDetailJob): number | undefined => validTime(job.completed_at))
    .filter((value: number | undefined): value is number => value !== undefined);
  const inferredEnd: boolean =
    run.status === "completed" && validTime(run.completed_at) === undefined && allEnded && ends.length === jobs.length;
  const end: string | undefined =
    validTime(run.completed_at) !== undefined ? run.completed_at : inferredEnd ? new Date(Math.max(...ends)).toISOString() : undefined;
  const starts: number[] = jobs
    .map((job: RunDetailJob): number | undefined => validTime(job.started_at))
    .filter((value: number | undefined): value is number => value !== undefined);
  const durationStart: string | undefined = inferredEnd
    ? starts.length === jobs.length
      ? new Date(Math.min(...starts)).toISOString()
      : undefined
    : run.run_started_at;
  const message: string = run.head_commit?.message?.trim() ?? "";
  const display: string = run.display_title?.trim() ?? "";
  const first: string = message.split("\n")[0].trim();
  const commit: string = first === display ? message.slice(message.indexOf("\n") + 1).trim() : message;
  return {
    completedJobs: jobs.filter((job: RunDetailJob): boolean => job.status === "completed").length,
    steps: steps.length,
    success: steps.filter((step: RunDetailJobStep): boolean => step.status === "completed" && step.conclusion === "success").length,
    failed: steps.filter(failed).length,
    skipped: steps.filter((step: RunDetailJobStep): boolean => step.status === "completed" && step.conclusion === "skipped").length,
    focus: { title, lines, tone: failedJobs.length ? "failure" : active.length ? "running" : "neutral" },
    commit: first === display && !message.includes("\n") ? "" : commit,
    end,
    durationStart,
    inferredEnd,
  };
}

export function runDetailStepDigits(jobs: RunDetailJob[]): number {
  let digits: number = 2;
  for (const job of jobs) {
    for (const step of job.steps ?? []) {
      digits = Math.max(digits, String(step.number).length);
    }
  }
  return digits;
}

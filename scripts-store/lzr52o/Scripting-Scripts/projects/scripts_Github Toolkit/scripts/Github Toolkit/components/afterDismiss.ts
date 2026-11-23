/**
 * 退場緩衝：畫面關掉之後，先等一下再做下一件事。
 *
 * Navigation.useDismiss() 只是「發出關閉請求」就回來，沒有關閉完成的回呼；
 * Navigation.present 的 Promise 文件寫的是 dismissed 後 fulfill，但這個專案
 * 以前的實機經驗是「回來時轉場還沒完全結束，馬上再跳下一個畫面會有一小段
 * 時間按不動」（repo/page/browser.tsx 的 Fork 流程就是因此加了 500ms）。
 *
 * 所以這裡不是「偵測動畫結束」，只是一個保守的固定等待，讓呼叫端在關頁
 * 之後不要立刻去改會被這頁渲染的資料、也不要立刻再開下一個畫面。
 * 逾時長度沿用 Fork 流程實測可用的 500ms。
 */
const EXIT_SETTLE_MS = 500;

export function afterDismiss(ms: number = EXIT_SETTLE_MS): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

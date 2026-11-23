// 運行中經過時間（v2.0.0 新增）：逐字移植參考腳本 Github_Action-2 的
// hooks/useRunElapsed.ts。啟用時每 10 秒更新一次 now，讓進行中的
// 運行詳情「已運行約 …」跟著走；未啟用時只回傳掛載時的時間。
import { useState, useEffect } from "scripting";

export function useRunElapsed(active: boolean): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!active) return;
    let cancelled: boolean = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick: () => void = (): void => {
      if (cancelled) return;
      setNow(Date.now());
      timer = setTimeout(tick, 10000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [active]);
  return now;
}

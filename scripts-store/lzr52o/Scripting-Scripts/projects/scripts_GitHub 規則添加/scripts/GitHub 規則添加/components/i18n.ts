// Shared i18n for the whole script (App / Intent / Widget).
// Usage: t("繁體", "简体", "English") — same helper as the GitHub Toolkit
// (its Repository module's original), copied here in v2.0.0.
// 多語言：依裝置語言切換，不用再分繁中版、簡中版兩個檔案。
// 多語言：依裝置語言切換，不用再分繁中版、簡中版兩個檔案。
// v1.48.1：v1.48 只讀 Device.preferredLanguage，結果在裝置上不管繁體簡體都回英文，
// 代表那個值在這台裝置上不是預期的 zh 代碼（可能是 undefined、物件，或顯示名稱），
// 所以現在改成多來源依序嘗試，任何一個來源能判斷就用它，全部讀不到才回英文。
// 嘗試順序：
//  1. Device.preferredLanguage（作者教的做法，先試）
//  2. Device.preferredLanguages（複數版，第一個就是最優先語言）
//  3. Device.language / Device.locale / Device.currentLocale
//  4. navigator.language / navigator.languages（JS 標準，裝置語言通常也會反映在這裡）
//  5. Intl.DateTimeFormat().resolvedOptions().locale（JS 標準，通常等於系統地區）
// 判斷規則（先轉小寫、_ 轉 -）：
//  - 含 hant、traditional、繁體，或 tw / hk / mo / 台灣 / 香港 / 澳門 → 繁體
//  - 含 hans、simplified、简体，或 cn / sg / 大陆 / 新加坡 → 簡體
//  - 其他 zh 開頭（只有 zh、zh-Hans 等）→ 簡體
//  - 其他語言一律 → 英文（共用版的預設語言）
// 值如果是物件（例如 Locale 物件），先試 identifier / language 等欄位，
// 再用 JSON 字串去找 hant / hans / tw 等關鍵字，不要直接 String(物件) 變成 [object Object] 就放棄。
export type Lang = "zh-Hant" | "zh-Hans" | "en";

function matchLang(rawStr: string): Lang | null {
  const s = String(rawStr || "").toLowerCase().replace(/_/g, "-").trim();
  if (!s || s === "[object object]") return null;
  if (
    s.includes("hant") ||
    s.includes("traditional") ||
    s.includes("繁體") ||
    s.includes("繁体") ||
    s.includes("-tw") ||
    s.includes("-hk") ||
    s.includes("-mo") ||
    s.includes("taiwan") ||
    s.includes("hong kong") ||
    s.includes("macau") ||
    s.includes("台灣") ||
    s.includes("台湾") ||
    s.includes("香港") ||
    s.includes("澳門") ||
    s.includes("澳门")
  ) {
    return "zh-Hant";
  }
  if (
    s.includes("hans") ||
    s.includes("simplified") ||
    s.includes("简体") ||
    s.includes("簡体") ||
    s.includes("-cn") ||
    s.includes("-sg") ||
    s.includes("china") ||
    s.includes("singapore") ||
    s.includes("大陆") ||
    s.includes("大陸") ||
    s.includes("新加坡")
  ) {
    return "zh-Hans";
  }
  if (s.startsWith("zh") || s.includes("chinese") || s.includes("中文")) {
    return "zh-Hans";
  }
  if (s.includes("-") || s.length >= 2) {
    // 有明確語言代碼但不是中文，就確定是英文分支，不用再試下一個來源。
    return "en";
  }
  return null;
}

function langFromValue(v: any): Lang | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "function") {
    try {
      return langFromValue(v());
    } catch {
      return null;
    }
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      const r = langFromValue(item);
      if (r) return r;
    }
    return null;
  }
  if (typeof v === "object") {
    for (const key of ["identifier", "localeIdentifier", "language", "locale", "name", "displayName"]) {
      const r = langFromValue(v[key]);
      if (r) return r;
    }
    // 語言代碼 + 腳本分開存的物件，例如 { languageCode: "zh", script: "Hant" }
    if (v.languageCode) {
      const combined = [v.languageCode, v.script, v.region].filter(Boolean).join("-");
      const r = matchLang(combined);
      if (r) return r;
    }
    try {
      return matchLang(JSON.stringify(v));
    } catch {
      return null;
    }
  }
  if (typeof v === "string") {
    // 只有明確非中文代碼時才直接回英文；空字串或看不懂的字串就回 null，讓呼叫端試下一個來源。
    const m = matchLang(v);
    if (m) return m;
    return null;
  }
  return null;
}

export function getLang(): Lang {
  try {
    const g: any = typeof globalThis !== "undefined" ? (globalThis as any) : {};
    const device: any = g.Device;
    const candidates: any[] = [];
    if (device) {
      candidates.push(device.preferredLanguage);
      candidates.push(device.preferredLanguages);
      candidates.push(device.language);
      candidates.push(device.locale);
      candidates.push(device.currentLocale);
    }
    if (g.navigator) {
      candidates.push(g.navigator.language);
      candidates.push(g.navigator.languages);
    }
    try {
      if (g.Intl && g.Intl.DateTimeFormat) {
        candidates.push(g.Intl.DateTimeFormat().resolvedOptions().locale);
      }
    } catch {
      // Intl 讀不到就跳過，不影響前面的來源。
    }
    for (const c of candidates) {
      const r = langFromValue(c);
      if (r) return r;
    }
  } catch {
    // 全部失敗就回英文，不要讓整個腳本因為語言判斷就壞掉。
  }
  return "en";
}

export const LANG: Lang = getLang();

// t() 用法：t(繁體, 簡體, 英文)，例如 t("倉庫", "仓库", "Repository")。
// 有變數的字串要整句傳三種版本，不要只包變數外面的中文，
// 例如 t(`預設分支：${branch}`, `默认分支：${branch}`, `Default branch: ${branch}`)。
// 已經是英文的字串（Github Repository、Raw、README、Token、422 等）不用包 t()。
export function t(hant: string, hans: string, en: string): string {
  if (LANG === "zh-Hant") return hant;
  if (LANG === "zh-Hans") return hans;
  return en;
}

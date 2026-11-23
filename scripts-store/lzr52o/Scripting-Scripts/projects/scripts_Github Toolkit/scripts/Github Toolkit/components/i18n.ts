// 全站共用語言工具：優先 preferredLanguage，兼容目前宿主的 systemLanguageTag。
export type Lang = "zh-Hant" | "zh-Hans" | "en";
export function resolveLanguage(value: unknown): Lang {
  const code = String(value ?? "").trim().toLowerCase().replace(/_/g, "-");
  if (/hant|traditional|繁體|繁体/.test(code)) return "zh-Hant";
  if (/hans|simplified|简体/.test(code)) return "zh-Hans";
  if (/^zh(?:-|$)/.test(code)) {
    return /(?:^|-)(tw|hk|mo)(?:-|$)/.test(code) ? "zh-Hant" : "zh-Hans";
  }
  if (/^en(?:-|$)|english/.test(code)) return "en";
  return "zh-Hant";
}
export function languageForDevice(device: any): Lang {
  const read = (key: string): unknown => { try { const value = device[key]; return typeof value === "function" ? value.call(device) : value; } catch { return undefined; } };
  const preferred = read("preferredLanguage");
  const preferredList = read("preferredLanguages");
  const sources = [preferred, Array.isArray(preferredList) ? preferredList[0] : undefined, read("systemLanguageTag"), read("systemLocale"), read("systemLanguageCode")];
  for (const source of sources) {
    if (typeof source === "string" && source.trim()) return resolveLanguage(source);
  }
  return "zh-Hant";
}
export function getLang(): Lang {
  try { return languageForDevice(Device); } catch { return "zh-Hant"; }
}
export const LANG: Lang = getLang();
export function t(hant: string, hans: string, en: string): string {
  const language = getLang();
  return language === "zh-Hant" ? hant : language === "zh-Hans" ? hans : en;
}

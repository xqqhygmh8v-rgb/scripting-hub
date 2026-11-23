export function toFlag(c: string) {
  return c.length === 2
    ? String.fromCodePoint(127397 + (c.charCodeAt(0) & 223), 127397 + (c.charCodeAt(1) & 223))
    : "🌍";
}

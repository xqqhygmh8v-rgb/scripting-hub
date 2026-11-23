export type DiffLine = { kind: "context" | "add" | "delete" | "hunk"; text: string; oldLine?: number; newLine?: number };
export type DiffFile = { filename: string; status: string; additions: number; deletions: number; lines: DiffLine[] };
// Keep newline terminators while comparing so final-newline changes remain visible.
const linesOf = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) || [];
export function compareText(filename: string, before: string | undefined, after: string | undefined): DiffFile {
  const a = linesOf(before ?? ""), b = linesOf(after ?? "");
  let prefix = 0, suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const x = a.slice(prefix, a.length - suffix), y = b.slice(prefix, b.length - suffix);
  let frontier = new Map<number, number>([[1, 0]]);
  const trace: Map<number, number>[] = [];
  let distance = 0, done = false, work = 0;
  for (let d = 0; d <= x.length + y.length && !done; d++) {
    trace.push(new Map(frontier));
    for (let k = -d; k <= d; k += 2) {
      if (++work > 2000000) throw new Error("Diff is too large to calculate on this device");
      let i = k === -d || (k !== d && (frontier.get(k - 1) ?? -1) < (frontier.get(k + 1) ?? -1)) ? (frontier.get(k + 1) ?? 0) : (frontier.get(k - 1) ?? 0) + 1;
      let j = i - k;
      while (i < x.length && j < y.length && x[i] === y[j]) { i++; j++; }
      frontier.set(k, i);
      if (i >= x.length && j >= y.length) { distance = d; done = true; break; }
    }
  }
  const edits: { kind: "context" | "add" | "delete"; raw: string }[] = [];
  let i = x.length, j = y.length;
  for (let d = distance; d >= 0; d--) {
    const v = trace[d], k = i - j;
    const prevK = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1)) ? k + 1 : k - 1;
    const prevI = v.get(prevK) ?? 0, prevJ = prevI - prevK;
    while (i > prevI && j > prevJ) { edits.push({ kind: "context", raw: x[--i] }); j--; }
    if (d > 0) {
      if (i === prevI) edits.push({ kind: "add", raw: y[--j] });
      else edits.push({ kind: "delete", raw: x[--i] });
    }
  }
  edits.reverse();
  const all = [...a.slice(0, prefix).map(raw => ({ kind: "context" as const, raw })), ...edits,
    ...a.slice(a.length - suffix).map(raw => ({ kind: "context" as const, raw }))];
  return assemble(filename, before, after, all);
}

// 2.1.11：Myers 算不動時的備援（檔案太大、或整份被改寫，D² 直接爆表）。
// 只裁掉前後相同的行，中間一律當成「刪掉舊的、補上新的」，成本是線性的。
// 之前沒有這條路，compareText 一丟錯 buildChanges 就只記一個 truncated、
// changes 留空，活動記錄的「變更紀錄」整區直接消失，看起來就像沒記到異動。
// 寧可粗一點，也要看得到改了哪一段。
export function compareTextCoarse(filename: string, before: string | undefined, after: string | undefined): DiffFile {
  const a = linesOf(before ?? ""), b = linesOf(after ?? "");
  let prefix = 0, suffix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  while (suffix < a.length - prefix && suffix < b.length - prefix && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  const all: { kind: "context" | "add" | "delete"; raw: string }[] = [];
  for (let i = 0; i < prefix; i++) all.push({ kind: "context", raw: a[i] });
  for (let i = prefix; i < a.length - suffix; i++) all.push({ kind: "delete", raw: a[i] });
  for (let i = prefix; i < b.length - suffix; i++) all.push({ kind: "add", raw: b[i] });
  for (let i = a.length - suffix; i < a.length; i++) all.push({ kind: "context", raw: a[i] });
  return assemble(filename, before, after, all);
}

// compareText 與 compareTextCoarse 共用的收尾：行號、三行前後文、hunk 標頭。
function assemble(
  filename: string,
  before: string | undefined,
  after: string | undefined,
  all: { kind: "context" | "add" | "delete"; raw: string }[],
): DiffFile {
  let oldLine = 1, newLine = 1;
  const numbered: DiffLine[] = all.map(line => ({ kind: line.kind,
    text: line.raw.endsWith("\n") ? line.raw.slice(0, -1).replace(/\r$/, "") : line.raw + " ⟵ No newline at end of file",
    oldLine: line.kind === "add" ? undefined : oldLine++, newLine: line.kind === "delete" ? undefined : newLine++ }));
  // Show three context lines around changes, grouping overlapping ranges.
  const visible = new Set<number>();
  numbered.forEach((line, index) => { if (line.kind !== "context") for (let n = Math.max(0, index - 3); n <= Math.min(numbered.length - 1, index + 3); n++) visible.add(n); });
  const lines: DiffLine[] = [];
  let last = -2;
  for (const index of visible) {
    if (index !== last + 1) lines.push({ kind: "hunk", text: `@@ −${numbered[index].oldLine ?? ""} +${numbered[index].newLine ?? ""} @@` });
    lines.push(numbered[index]); last = index;
  }
  return { filename, status: before === undefined ? "added" : after === undefined ? "removed" : "modified",
    additions: all.filter(l => l.kind === "add").length, deletions: all.filter(l => l.kind === "delete").length, lines };
}

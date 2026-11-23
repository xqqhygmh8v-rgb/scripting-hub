import { fetch } from "scripting";
import { compareText, DiffFile } from "../../components/diff";

export type Revision = {
  version: string;
  committed_at: string;
  user?: { login?: string };
  change_status?: { additions?: number; deletions?: number; total?: number };
  changedFiles?: string[];
  previousVersion?: string;
};
type GistFile = { filename?: string; content?: string; raw_url?: string; truncated?: boolean };
type Snapshot = { files: Record<string, GistFile> };
export type RevisionDiff = { revision: string; previous?: string; files: DiffFile[] };
export type HistoryProgress = { completed: number; total: number; found?: number };

export class HistoryLoadError extends Error {
  partial: Revision[];
  progress: HistoryProgress;
  constructor(message: string, partial: Revision[], progress: HistoryProgress) {
    super(message);
    this.name = "HistoryLoadError";
    this.partial = partial;
    this.progress = progress;
  }
}

let activeRequests = 0;
const requestQueue: Array<() => void> = [];
async function request(url: string, token: string, raw = false): Promise<any> {
  await new Promise<void>(resolve => {
    if (activeRequests < 6) { activeRequests++; resolve(); }
    else requestQueue.push(resolve);
  });
  try {
  const response = await fetch(url, {
    headers: {
      Accept: raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    // 2.1.11：以前沒有逾時，一掛住就一直轉圈，進度也永遠停在同一個數字。
    timeout: 15,
    signal: timeoutSignal(15000),
  } as any);
  if (!response.ok) throw new Error(`GitHub API ${response.status} ${response.statusText}`);
  return raw ? await response.text() : await response.json();
  } finally {
    const next = requestQueue.shift();
    if (next) next();
    else activeRequests--;
  }
}

function timeoutSignal(ms: number): any {
  const A = (globalThis as any).AbortSignal;
  return A && typeof A.timeout === "function" ? A.timeout(ms) : undefined;
}
const endpoint = (id: string) => `https://api.github.com/gists/${encodeURIComponent(id)}`;
// Memory-only, account-scoped LRU. Bound retained content as well as entry count.
const cache = new Map<string, { value: unknown; bytes: number; expires: number }>();
const pending = new Map<string, Promise<unknown>>();
let cacheBytes = 0;
async function memo<T>(key: string, load: () => Promise<T>, ttl = 10 * 60 * 1000): Promise<T> {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key); cacheBytes -= hit.bytes;
    if (hit.expires > Date.now()) {
      cache.set(key, hit); cacheBytes += hit.bytes;
      return hit.value as T;
    }
  }
  const running = pending.get(key);
  if (running) return running as Promise<T>;
  const task = load().then(value => {
    const bytes = JSON.stringify(value).length * 2;
    if (bytes <= 8 * 1024 * 1024) {
      cache.set(key, { value, bytes, expires: Date.now() + ttl }); cacheBytes += bytes;
      while (cache.size > 160 || cacheBytes > 8 * 1024 * 1024) {
        const first = cache.keys().next().value!;
        cacheBytes -= cache.get(first)!.bytes; cache.delete(first);
      }
    }
    return value;
  }).finally(() => { pending.delete(key); });
  pending.set(key, task);
  return task;
}
const keyFor = (kind: string, id: string, token: string, version: string, filename?: string) => JSON.stringify([kind, id, token, version, filename ?? null]);

export async function getRevisions(id: string, token: string): Promise<Revision[]> {
  return memo(keyFor("commits", id, token, ""), async () => {
  const revisions: Revision[] = [];
  for (let page = 1; ; page++) {
    const batch = await request(`${endpoint(id)}/commits?per_page=100&page=${page}`, token);
    if (!Array.isArray(batch) || batch.some(item => typeof item?.version !== "string")) throw new Error("Invalid Gist history response");
    revisions.push(...batch);
    if (batch.length < 100) break;
  }
  return revisions;
  }, 30 * 1000);
}

async function snapshot(id: string, version: string, token: string, filename?: string): Promise<Record<string, string>> {
  return memo(keyFor("snapshot", id, token, version, filename), async () => {
  const data = await request(`${endpoint(id)}/${encodeURIComponent(version)}`, token) as Snapshot;
  if (!data?.files || typeof data.files !== "object" || Array.isArray(data.files)) throw new Error("Invalid Gist revision response");
  const files: Record<string, string> = Object.create(null);
  for (const [name, file] of Object.entries(data.files)) {
    if (filename !== undefined && name !== filename) continue;
    if (!file || typeof file !== "object") throw new Error(`Invalid revision file: ${name}`);
    if (!file.truncated && typeof file.content === "string") files[name] = file.content;
    else if (file.raw_url) {
      const url = new URL(file.raw_url);
      const segments = url.pathname.split("/").filter(Boolean);
      if (url.protocol !== "https:" || url.hostname !== "gist.githubusercontent.com" || url.username || url.password || (url.port && url.port !== "443") || segments[1]?.toLowerCase() !== id.toLowerCase() || segments[2] !== "raw" || !/^[a-f0-9]{40}$/i.test(segments[3] || "") || segments.length < 5) throw new Error("Invalid revision raw URL");
      files[name] = await request(file.raw_url, token, true);
    } else throw new Error(`Missing content: ${name}`);
  }
  return files;
  });
}

async function changedFiles(id: string, current: Revision, previous: string | undefined, token: string, filename?: string): Promise<string[]> {
  const [before, after] = await Promise.all([
    previous ? snapshot(id, previous, token, filename) : Promise.resolve<Record<string, string>>(Object.create(null)),
    snapshot(id, current.version, token, filename),
  ]);
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort().filter(name => before[name] !== after[name]);
}

export async function getRevisionHistory(id: string, token: string, filename: string | undefined, onProgress?: (progress: HistoryProgress, revisions: Revision[]) => void, isActive: () => boolean = () => true): Promise<Revision[]> {
  const all = await getRevisions(id, token);
  // 整份 Gist 的歷史：變更量為 0 的提交（+0 −0）不列入，提交清單就先行過濾，
  // 不會先出現再消失。單一文件的歷史則全部保留。
  const commits = filename === undefined ? all.filter(revision => (revision.change_status?.total ?? 1) > 0) : all;
  const found = new Map<number, Revision>();
  const total = commits.length;
  let completed = 0;
  // 依提交順序輸出，即使個別版本較慢完成也不會亂序。
  const collected = () => Array.from(found.keys()).sort((a, b) => a - b).map(index => found.get(index)!);
  // 版本清單一開始就全部列出，不必等逐一分析變更內容。
  commits.forEach((revision, index) => found.set(index, { ...revision, previousVersion: commits[index + 1]?.version }));
  onProgress?.({ completed, total }, collected());
  for (let start = 0; start < commits.length && isActive(); start += 3) {
    const batch = commits.slice(start, start + 3);
    let failure: unknown;
    await Promise.all(batch.map(async (revision, offset) => {
      const index = start + offset;
      const previousVersion = commits[index + 1]?.version;
      try {
        const value = await memo(keyFor("analysis", id, token, JSON.stringify([revision.version, previousVersion]), filename), async () => {
          const files = await changedFiles(id, revision, previousVersion, token, filename);
          return { ...revision, changedFiles: files, previousVersion };
        });
        if (!isActive()) return;
        completed++;
        found.set(index, value);
        // 每一個版本分析完成就立即回報，不等同批其他版本。
        onProgress?.({ completed, total }, collected());
      } catch (error) {
        if (!failure) failure = error;
      }
    }));
    if (!isActive()) return collected();
    if (failure) throw new HistoryLoadError(failure instanceof Error ? failure.message : String(failure), collected(), { completed, total });
  }
  return collected();
}

export async function getRevisionDiff(id: string, version: string, previous: string | undefined, token: string, filename?: string): Promise<RevisionDiff> {
  const [before, after] = await Promise.all([
    previous ? snapshot(id, previous, token, filename) : Promise.resolve<Record<string, string>>(Object.create(null)),
    snapshot(id, version, token, filename),
  ]);
  const names = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  return { revision: version, previous, files: names.filter(name => before[name] !== after[name]).map(name => compareText(name, before[name], after[name])) };
}

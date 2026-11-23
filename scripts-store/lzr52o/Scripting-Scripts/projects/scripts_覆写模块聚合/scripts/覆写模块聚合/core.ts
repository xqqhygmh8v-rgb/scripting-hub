// Pure data and parsing logic. No Scripting UI dependency.
import type { Client } from "./clients"
import { CLIENTS, clientName, clientOf, isClient, moduleKey, unwrapResource } from "./clients"
export type Source = {
  id: string
  name: string
  url: string
  enabled: boolean
  branch?: string
  client?: Client
}
export type ModuleItem = {
  url: string
  name: string
  description: string
  rule?: { id: string; types: string[]; lines?: number }
  client?: Client
}
export type CacheEntry = {
  signature: string
  updatedAt: number
  items: ModuleItem[]
  error?: string
  retryAt?: number
  retryKind?: "primary" | "secondary"
  treeSha?: string
}
export type Cache = Record<string, CacheEntry>
export type CatalogueItem = ModuleItem & { sourceIds: string[]; sourceNames: string[] }
export type Repo = { owner: string; repo: string; branch: string; path: string }
export type GitHubAccount = { checkedAt: number; login: string; limit?: number; remaining?: number; resetAt?: number }
export type GitHubAuthActions = {
  hasToken: () => boolean; verify: (input?: string) => Promise<GitHubAccount>
  save: (input: string) => boolean; remove: () => void; isCurrent: (input: string) => boolean
  issue: (error: unknown) => "network" | "authentication" | "other"
}
export type GetText = (url: string, limit?: number) => Promise<string>

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === "string" && !!v.trim())

export function validModuleItem(value: unknown): value is ModuleItem {
  if (!record(value) || typeof value.url !== "string" || typeof value.name !== "string" || !value.name.trim() ||
      typeof value.description !== "string" || (value.client !== undefined && !isClient(value.client))) return false
  if (value.rule !== undefined && (!record(value.rule) || typeof value.rule.id !== "string" || !value.rule.id.trim() ||
      !strings(value.rule.types) || (value.rule.lines !== undefined && !timestamp(value.rule.lines)))) return false
  try { httpsURL(value.url); return true } catch { return false }
}

export function validFavorite(value: unknown): value is CatalogueItem {
  if (!validModuleItem(value)) return false
  const item = value as CatalogueItem
  return strings(item.sourceIds) && strings(item.sourceNames) && item.sourceIds.length === item.sourceNames.length
}

function cacheHeader(value: unknown): value is CacheEntry {
  if (!record(value) || typeof value.signature !== "string" || !timestamp(value.updatedAt) || value.updatedAt > Date.now() + 60_000 ||
      !Array.isArray(value.items) || (value.error !== undefined && typeof value.error !== "string") ||
      (value.retryAt !== undefined && !timestamp(value.retryAt)) ||
      (value.retryKind !== undefined && value.retryKind !== "primary" && value.retryKind !== "secondary") ||
      (value.treeSha !== undefined && typeof value.treeSha !== "string")) return false
  try { httpsURL(value.signature.split("|")[0]); return value.signature.includes("|") } catch { return false }
}

const validCacheMemo = new WeakMap<object, boolean>()

export function validCacheEntry(value: unknown): value is CacheEntry {
  if (!record(value)) return false
  const cached = validCacheMemo.get(value)
  if (cached !== undefined) return cached
  const valid = cacheHeader(value) && value.items.every(validModuleItem)
  // Cache entries are replaced as immutable snapshots throughout the store, so
  // a validated entry remains valid for every later catalogue pass.
  if (valid) validCacheMemo.set(value, true)
  return valid
}

export function validateCache(value: unknown, sources?: Source[]): { cache: Cache; recovered: boolean } {
  if (!record(value)) return { cache: {}, recovered: value != null }
  const cache: Cache = Object.create(null); let recovered = false
  const configured = sources ? new Map(sources.map(source => [source.id, signature(source)])) : null
  for (const [id, entry] of Object.entries(value)) {
    if (!cacheHeader(entry) || (configured && configured.get(id) !== entry.signature)) { recovered = true; continue }
    const items = entry.items.filter(validModuleItem)
    if (items.length !== entry.items.length) recovered = true
    cache[id] = { ...entry, items }
  }
  return { cache, recovered }
}

export class GitHubCooldown extends Error {
  constructor(readonly retryAt: number, readonly kind: "primary" | "secondary" = "primary") { super("GitHub 请求限流") }
}

export const DEFAULT_SOURCES: Source[] = [
  { id: "maasea", name: "Maasea", url: "https://github.com/Maasea/sgmodule", branch: "master", enabled: true },
  { id: "blackmatrix-rewrite", name: "blackmatrix7 · 重写", url: "https://github.com/blackmatrix7/ios_rule_script/tree/master/rewrite/Surge", enabled: true },
  { id: "blackmatrix-external", name: "blackmatrix7 · 外部模块", url: "https://github.com/blackmatrix7/ios_rule_script/tree/master/external/Surge", enabled: true },
  { id: "blackmatrix-loon", name: "blackmatrix7 · Loon", url: "https://github.com/blackmatrix7/ios_rule_script/tree/master/rewrite/Loon", client: "loon", enabled: true },
  { id: "kelee-loon", name: "可莉 · Loon 插件中心", url: "https://hub.kelee.one/list.json", client: "loon", enabled: true },
  { id: "relife-egern", name: "ReLIFE-1 · Egern", url: "https://github.com/ReLIFE-1/egern-modules", branch: "main", client: "egern", enabled: true },
  { id: "egern-hub", name: "Egern Hub", url: "https://egern.pages.dev/", client: "egern", enabled: true },
  { id: "blackmatrix-stash", name: "blackmatrix7 · Stash", url: "https://github.com/blackmatrix7/ios_rule_script/tree/master/rewrite/Stash", client: "stash", enabled: true },
  { id: "blackmatrix-shadowrocket", name: "blackmatrix7 · Shadowrocket", url: "https://github.com/blackmatrix7/ios_rule_script/tree/master/rewrite/Shadowrocket", client: "shadowrocket", enabled: true },
]

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" })

// Bounded caches: URL parsing is the hot path while typing and re-aggregating.
function memoString<T>(compute: (input: string) => T, limit = 4096): (input: string) => T {
  const cache = new Map<string, T>()
  return input => {
    if (cache.has(input)) {
      const hit = cache.get(input)!
      cache.delete(input)
      cache.set(input, hit)
      return hit
    }
    const value = compute(input)
    if (cache.size >= limit) {
      const oldest = cache.keys().next()
      if (!oldest.done) cache.delete(oldest.value)
    }
    cache.set(input, value)
    return value
  }
}

export function signature(source: Source): string {
  const original = `${source.url.trim()}|${source.branch?.trim() ?? ""}`
  return clientOf(source) === "surge" ? original : `${original}|${clientOf(source)}`
}

export function httpsURL(input: string, base?: string): URL {
  const text = input.trim()
  if (!text) throw new Error("请填写来源网址，例如 https://github.com/Maasea/sgmodule。")
  let url: URL
  try { url = new URL(text, base) }
  catch { throw new Error("网址格式不正确，请填写完整的 HTTPS 地址。") }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error("请输入 HTTPS 地址，且不要在地址中包含用户名或密码。")
  }
  url.hash = ""
  return url
}

function computeRawURL(input: string, base?: string): string {
  const url = httpsURL(input, base)
  const parts = url.pathname.split("/").filter(Boolean)
  if (url.hostname === "github.com" && parts.length >= 5 && parts[2] === "blob") {
    return `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.slice(3).join("/")}`
  }
  // A GitHub download URL and its raw URL denote the same module.
  if (url.hostname === "github.com" && parts.length >= 5 && parts[2] === "raw") {
    const tail = parts.slice(3)
    if (tail[0] === "refs" && tail[1] === "heads") tail.splice(0, 2)
    return `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${tail.join("/")}`
  }
  if (url.hostname === "raw.githubusercontent.com") {
    if (parts[2] === "refs" && parts[3] === "heads") {
      url.pathname = `/${[...parts.slice(0, 2), ...parts.slice(4)].join("/")}`
    }
  }
  // Rule Hub publishes the same Stash file as raw, CDN and Pages links.
  if (!url.search) {
    const mirror = url.hostname === "cdn.jsdelivr.net"
      ? /^\/gh\/your98k\/Rule-Hub@main\/(Stash\/.+\.stoverride)$/.exec(url.pathname)
      : url.hostname === "your98k.github.io" ? /^\/Rule-Hub\/files\/(Stash\/.+\.stoverride)$/.exec(url.pathname) : null
    if (mirror) return `https://raw.githubusercontent.com/your98k/Rule-Hub/main/${mirror[1]}`
  }
  return url.toString()
}

const memoRawURL = memoString((input: string) => computeRawURL(input))

export function rawURL(input: string, base?: string): string {
  return base === undefined ? memoRawURL(input.trim()) : computeRawURL(input, base)
}

export function normalizeFavorite(key: string): string {
  const separator = key.indexOf("|")
  const client = separator < 0 ? "surge" : key.slice(0, separator)
  try { return `${client}|${rawURL(key.slice(separator + 1))}` } catch { return key }
}

const memoIsModule = memoString((key: string) => {
  const separator = key.indexOf("|")
  const client = key.slice(0, separator) as Client
  try {
    const extension = httpsURL(key.slice(separator + 1)).pathname.split(".").pop()?.toLowerCase()
    return CLIENTS.find(item => item.id === client)!.extensions.includes(extension ?? "")
  } catch { return false }
})

export function isModule(input: string, client: Client = "surge"): boolean {
  return memoIsModule(`${client}|${input}`)
}

const memoFilename = memoString((input: string) => {
  const tail = httpsURL(input).pathname.split("/").pop() ?? "模块"
  try { return decodeURIComponent(tail).replace(/\.(?:sgmodule|plugin|lpx|yaml|yml|stoverride|module|srmodule)$/i, "") } catch { return tail }
})

export function filename(input: string): string {
  return memoFilename(input)
}

export function repoFromSource(source: Source): Repo | null {
  const url = httpsURL(source.url)
  if (url.hostname !== "github.com") return null
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent)
  if (parts.length < 2) throw new Error("GitHub 地址需要包含作者和仓库名。")
  if (parts.length === 2) {
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, ""), branch: source.branch?.trim() ?? "", path: "" }
  }
  if (parts[2] !== "tree") return null
  if (parts.length < 4) throw new Error("GitHub 目录地址缺少分支名。")
  // A branch with '/' must be supplied explicitly in the source editor.
  const branch = source.branch?.trim() || parts[3]
  const remainder = parts.slice(3).join("/")
  if (remainder !== branch && !remainder.startsWith(`${branch}/`)) {
    throw new Error("分支与目录网址不一致，请填写完整分支名。")
  }
  return { owner: parts[0], repo: parts[1], branch, path: remainder.slice(branch.length).replace(/^\//, "") }
}

function formalName(item: ModuleItem): boolean { return !!item.name.trim() && item.name.trim() !== filename(item.url).trim() }

export function mergeModuleFields<T extends ModuleItem>(old: T, next: T): T {
  // Formal titles beat filenames. Conflicting formal titles keep the first in source/input order.
  const name = formalName(old) ? old.name : formalName(next) ? next.name : old.name || next.name
  const merged = { ...old, ...next, name, description: next.description.trim() ? next.description : old.description }
  const before = old as T & Partial<CatalogueItem>, after = next as T & Partial<CatalogueItem>
  if (before.sourceIds || after.sourceIds) {
    const sources = new Map<string, string>()
    for (const item of [before, after]) item.sourceIds?.forEach((id, i) => {
      if (!sources.has(id)) sources.set(id, item.sourceNames?.[i] ?? id)
    })
    Object.assign(merged, { sourceIds: [...sources.keys()], sourceNames: [...sources.values()] })
  }
  return merged
}

export function unique(items: ModuleItem[]): ModuleItem[] {
  const map = new Map<string, ModuleItem>()
  for (const item of items) {
    try {
      const url = rawURL(item.url)
      if (item.rule ? !validRuleManifest(url, clientOf(item)) : !isModule(url, clientOf(item))) continue
      const key = moduleKey({ ...item, url })
      const old = map.get(key)
      const normalized = { ...item, url }
      map.set(key, old ? mergeModuleFields(old, normalized) : normalized)
    } catch { /* Ignore individual malformed links. */ }
  }
  return [...map.values()].sort((a, b) => collator.compare(a.name, b.name))
}

function htmlText(text: string): string {
  return text.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim()
}

export function parseIndex(text: string, base: string, client: Client = "surge"): ModuleItem[] {
  const found: ModuleItem[] = []
  const add = (link: string, name = "", description = "") => {
    try {
      const url = rawURL(unwrapResource(htmlText(link), client, base))
      if (isModule(url, client)) found.push({ url, name: htmlText(name) || filename(url), description, ...(client === "surge" ? {} : { client }) })
    } catch { /* One bad link must not invalidate the source. */ }
  }
  const trimmed = text.trim()
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let data: unknown
    try {
      data = JSON.parse(trimmed)
    } catch { /* It may be Markdown rather than JSON. */ }
    if (data !== undefined) {
      const collections = /^(?:modules|plugins|overrides|items|lists?|data|entries|files|resources)$/i
      const walk = (value: unknown, depth: number, allowStrings: boolean) => {
        if (depth > 15) return
        if (typeof value === "string") { if (allowStrings) add(value) }
        else if (Array.isArray(value)) value.forEach(v => walk(v, depth + 1, allowStrings))
        else if (value && typeof value === "object") {
          const item = value as Record<string, unknown>
          for (const link of [item.url, item.link, item.download_url]) {
            if (typeof link === "string") add(link, String(item.name ?? item.title ?? ""), String(item.description ?? item.desc ?? ""))
          }
          for (const [key, nested] of Object.entries(item)) {
            if (nested && typeof nested === "object") walk(nested, depth + 1, collections.test(key))
          }
        }
      }
      walk(data, 0, true)
      return unique(found)
    }
  }
  for (const match of text.matchAll(/\[([^\]\n]+)\]\(\s*(<?[^\s)]+>?)\s*(?:"[^"]*")?\)/g)) {
    add(match[2].replace(/^<|>$/g, ""), match[1])
  }
  for (const match of text.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) add(match[1], match[2])
  for (const match of text.matchAll(/(?:https:\/\/|(?:surge|loon|egern|stash|clash|shadowrocket):\/{1,3})[^\s<>"'`\]\)]+/gi)) add(match[0])
  return unique(found)
}

function yamlField(text: string, key: string): string {
  const lines = text.replace(/\r/g, "").split("\n")
  const index = lines.findIndex(line => new RegExp(`^${key}\\s*:`).test(line))
  if (index < 0) return ""
  const value = lines[index].replace(new RegExp(`^${key}\\s*:\\s*`), "").trim()
  if (/^[>|][+-]?(?:\s+#.*)?$/.test(value)) {
    const block: string[] = []
    for (let i = index + 1; i < lines.length; i++) {
      if (lines[i].trim() && !/^\s/.test(lines[i])) break
      block.push(lines[i])
    }
    const indents = block.filter(line => line.trim()).map(line => line.match(/^\s*/)![0].length)
    const indent = indents.length ? Math.min(...indents) : 0
    const stripped = block.map(line => line.slice(indent))
    return stripped.join(value.startsWith(">") ? " " : "\n").trim()
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try { return JSON.parse(value) } catch { return value.slice(1, -1) }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'")
  return value.replace(/\s+#.*$/, "").trim()
}

export function parseModule(text: string, client: Client = "surge"): { name: string; description: string; author: string; version: string; mitm: boolean; preview: string } {
  if (/^\s*(?:<!doctype\s+html|<html)/i.test(text)) throw new Error("这个地址返回了网页，请使用模块原始网址。")
  const ini = /^\s*\[(?:General|Rule|Script|Rewrite|Argument|IP Rewrite|URL Rewrite|Header Rewrite|Body Rewrite|Map Local|MITM|Panel|Host)\]/im.test(text)
  if (!ini && (client === "egern" || client === "stash")) {
    // Read display metadata only. The receiving app performs full YAML/config validation.
    if (!/^(?:dns|rules|url_rewrites|header_rewrites|body_rewrites|map_locals|scriptings|mitm|http_captures|widgets|bypass_tunnel_proxy|real_ip_domains|http|script-providers|proxy-groups|cron|proxies|rule-providers)\s*:/m.test(text)) {
      throw new Error(`未识别到 ${clientName(client)} 模块或覆写字段，请检查网址。`)
    }
    return {
      name: yamlField(text, "name"), description: yamlField(text, "description") || yamlField(text, "desc"),
      author: yamlField(text, "author"), version: yamlField(text, "version"),
      mitm: /^\s*mitm\s*:/m.test(text), preview: text.slice(0, 12000),
    }
  }
  if (!ini || client === "stash") throw new Error(`这个地址没有返回可识别的 ${clientName(client)} 模块内容。`)
  const field = (key: string) => text.match(new RegExp(`^[ \\t]*#!${key}[ \\t]*=[ \\t]*(.*)$`, "im"))?.[1].trim() ?? ""
  return {
    name: field("name"), description: field("desc"), author: field("author"), version: field("version"),
    mitm: /^\s*\[MITM\]/im.test(text), preview: text.slice(0, 12000),
  }
}

export function updateModuleMetadata(cache: Cache, input: string, metadata: { name: string; description: string }, client: Client = "surge"): Cache {
  const url = rawURL(input)
  const next: Cache = { ...cache }
  for (const [id, entry] of Object.entries(cache)) {
    if (!entry.items.some(item => item.url === url && clientOf(item) === client)) continue
    next[id] = { ...entry, items: entry.items.map(item => item.url === url && clientOf(item) === client ? {
      ...item, name: metadata.name || item.name, description: metadata.description || item.description,
    } : item) }
  }
  return next
}

type Tree = { truncated?: boolean; tree?: { path: string; type: string; sha?: string }[] }
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/")

export function treeItems(tree: Tree, repo: Repo, client: Client = "surge"): ModuleItem[] {
  if (tree.truncated) throw new Error("GitHub 返回了不完整的目录，请将来源改为更小的模块目录。")
  if (!Array.isArray(tree.tree)) throw new Error("GitHub 返回的目录格式无效。")
  return unique(tree.tree.filter(item => item.type === "blob").map(item => {
    const path = [repo.path, item.path].filter(Boolean).join("/")
    const url = `https://raw.githubusercontent.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/${encodeURIComponent(repo.branch)}/${encodePath(path)}`
    return { url, name: filename(url), description: "", ...(client === "surge" ? {} : { client }) }
  }))
}

function egernHubCatalogURL(html: string, base: string): string {
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const code = script[1]
    const match = /\b(?:const|let|var)\s+SNAPSHOT\s*=\s*\{/.exec(code)
    if (!match) continue
    const start = match.index + match[0].length - 1
    let depth = 0, quoted = false, escaped = false
    // Read only the JSON object; never execute the site's JavaScript.
    for (let i = start; i < code.length; i++) {
      const ch = code[i]
      if (quoted) {
        if (escaped) escaped = false
        else if (ch === "\\") escaped = true
        else if (ch === '"') quoted = false
      } else if (ch === '"') quoted = true
      else if (ch === "{") depth++
      else if (ch === "}" && --depth === 0) {
        let snapshot: { catalog_url?: unknown }
        try { snapshot = JSON.parse(code.slice(start, i + 1)) }
        catch { throw new Error("Egern Hub 首页目录格式已变化，请稍后更新适配。") }
        if (typeof snapshot.catalog_url !== "string") break
        const url = httpsURL(snapshot.catalog_url, base)
        if (url.origin !== httpsURL(base).origin || !/\.json$/i.test(url.pathname)) {
          throw new Error("Egern Hub 目录地址无效，请检查来源。")
        }
        return url.toString()
      }
    }
  }
  throw new Error("Egern Hub 首页没有找到完整目录地址，请稍后更新适配。")
}

function parseEgernHubCatalog(text: string, base: string): ModuleItem[] {
  let records: unknown
  try { records = JSON.parse(text) }
  catch { throw new Error("Egern Hub 完整目录读取失败，请稍后刷新。") }
  if (!Array.isArray(records)) throw new Error("Egern Hub 完整目录格式已变化，请稍后更新适配。")
  const root = new URL("/", base)
  const items: ModuleItem[] = []
  for (const record of records) {
    if (!record || typeof record !== "object" || record.kind !== "modules" || typeof record.file !== "string") continue
    try {
      // 'file' is the site's Egern YAML; 'upstream' may target another client's original.
      const url = httpsURL(record.file, root.toString())
      if (url.origin !== root.origin || !isModule(url.toString(), "egern")) continue
      items.push({
        url: url.toString(), client: "egern",
        name: typeof record.name === "string" && record.name.trim() ? record.name : filename(url.toString()),
        description: typeof record.description === "string" ? record.description : "",
      })
    } catch { /* One invalid resource must not discard the rest of the catalog. */ }
  }
  return unique(items)
}

function parseZhiaonModules(text: string, base: string, client: Client): ModuleItem[] {
  let records: unknown
  try { records = JSON.parse(text) }
  catch { throw new Error("Zhiaon 模块目录读取失败，请稍后刷新。") }
  if (!Array.isArray(records)) throw new Error("Zhiaon 模块目录格式无效。")
  const items: ModuleItem[] = []
  for (const record of records) {
    if (!record || typeof record !== "object") continue
    const item = record as Record<string, unknown>
    if (typeof item.rawUrl !== "string") continue
    try {
      const url = httpsURL(item.rawUrl, base).toString()
      if (!isModule(url, client)) continue
      items.push({ url, name: typeof item.name === "string" && item.name.trim() ? item.name : filename(url),
        description: typeof item.description === "string" ? item.description : "", ...(client === "surge" ? {} : { client }) })
    } catch { /* Ignore malformed directory entries without dropping valid modules. */ }
  }
  return unique(items)
}

const MAGIC = "https://magicrule.pages.dev"
const magicOrigins = new Set([MAGIC, "https://rule-26r.pages.dev", "https://rule2-ze9.pages.dev"])

function validRuleManifest(url: string, client: Client): boolean {
  const address = httpsURL(url)
  const parts = address.pathname.split("/")
  return magicOrigins.has(address.origin) && parts.length === 6 && parts[1] === "data" && parts[2] === "rules" &&
    parts[3] === clientName(client) && !!parts[4] && parts[5] === "manifest.json"
}

export function magicRulePage(item: ModuleItem): string {
  if (!item.rule) throw new Error("缺少规则编号。")
  return `${MAGIC}/#/c/${clientName(clientOf(item))}/r/${encodeURIComponent(item.rule.id)}`
}

function parseRuleIndex(text: string, client: Client): ModuleItem[] {
  const data = JSON.parse(text)
  if (data?.client !== clientName(client) || !Array.isArray(data.rules)) throw new Error("MagicRule 客户端目录格式有误。")
  const items: ModuleItem[] = []
  for (const row of data.rules) {
    if (!row || typeof row.id !== "string" || !row.id || typeof row.name !== "string" || !row.name || typeof row.manifest !== "string") continue
    try {
      const url = httpsURL(row.manifest, MAGIC).toString()
      if (!validRuleManifest(url, client)) continue
      items.push({ client, url, name: row.name,
        description: [row.chinese_name, row.description].filter(v => typeof v === "string" && v.trim() && v !== row.name).join(" · "),
        rule: { id: row.id, types: Array.isArray(row.types) ? row.types.filter((v: unknown) => typeof v === "string") : [],
          lines: Number.isSafeInteger(row.total_line_count) && row.total_line_count >= 0 ? row.total_line_count : undefined } })
    } catch { /* Skip malformed individual records. */ }
  }
  if (!items.length) throw new Error("MagicRule 目录中没有可用规则，请稍后刷新。")
  return unique(items)
}

export type RuleFile = { url: string; label: string; recommended: boolean }
export async function ruleFiles(item: ModuleItem, get: GetText): Promise<RuleFile[]> {
  const client = clientOf(item)
  if (!item.rule || !validRuleManifest(item.url, client)) throw new Error("规则清单地址无效。")
  const data = JSON.parse(await get(item.url, 1_000_000))
  if (data?.client !== clientName(client) || !Array.isArray(data.artifacts)) throw new Error("规则清单格式已变化，请刷新来源。")
  const files = new Map<string, RuleFile>()
  for (const artifact of data.artifacts) {
    if (!artifact || artifact.empty === true || typeof artifact.url !== "string") continue
    try {
      const url = httpsURL(artifact.url, item.url)
      if (!magicOrigins.has(url.origin) || !url.pathname.startsWith("/data/")) continue
      files.set(url.href, { url: url.href, label: typeof artifact.label === "string" && artifact.label || fileLabel(url), recommended: artifact.recommended === true })
    } catch { /* Skip invalid file addresses. */ }
  }
  return [...files.values()].sort((a, b) => Number(b.recommended) - Number(a.recommended))
}

function fileLabel(url: URL): string { return url.pathname.split("/").pop() || "规则文件" }

export async function fetchSource(source: Source, get: GetText, previous?: CacheEntry,
  onTree?: (sha: string) => void): Promise<ModuleItem[]> {
  const client = clientOf(source)
  const normal = rawURL(unwrapResource(source.url, client))
  if (isModule(normal, client)) {
    const meta = client === "loon" && /\.lpx$/i.test(httpsURL(normal).pathname) ? { name: "", description: "加密插件，由 Loon 读取。" } : parseModule(await get(normal, 1_000_000), client)
    return [{ url: normal, name: meta.name || filename(normal), description: meta.description, ...(client === "surge" ? {} : { client }) }]
  }
  const repo = repoFromSource(source)
  if (repo) {
    const api = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`
    if (!repo.branch) {
      const info = JSON.parse(await get(api)) as { default_branch?: string }
      if (!info.default_branch) throw new Error("无法读取仓库的默认分支。")
      repo.branch = info.default_branch
    }
    let treeRef = repo.branch
    if (repo.path) {
      const segments = repo.path.split("/")
      const folder = segments.pop()!
      const parent = segments.join("/")
      const listing = JSON.parse(await get(`${api}/contents/${encodePath(parent)}?ref=${encodeURIComponent(repo.branch)}`)) as { name: string; type: string; sha: string }[]
      if (!Array.isArray(listing)) throw new Error("无法读取模块目录。")
      const entry = listing.find(item => item.name === folder && item.type === "dir")
      if (!entry) throw new Error("找不到这个模块目录，请检查路径和分支。")
      treeRef = entry.sha
      if (treeRef) {
        onTree?.(treeRef)
        if (previous?.treeSha === treeRef) return previous.items
      }
    }
    return treeItems(JSON.parse(await get(`${api}/git/trees/${encodeURIComponent(treeRef)}?recursive=1`, 12_000_000)), repo, client)
  }
  if (httpsURL(source.url).hostname === "github.com" && !/\/blob\//.test(source.url)) {
    throw new Error("请使用 GitHub 仓库、tree 目录或 blob 文件地址。")
  }
  const address = httpsURL(normal)
  if (address.origin === MAGIC && address.pathname === "/") {
    return parseRuleIndex(await get(`${MAGIC}/data/index/${clientName(client)}.json`, 4_000_000), client)
  }
  if (address.origin === "https://son.zhiaon.top" && (address.pathname === "/" || address.pathname === "/data/modules.json")) {
    const index = new URL("/data/modules.json", address.origin).toString()
    const entries = parseZhiaonModules(await get(index, 4_000_000), index, client)
    if (!entries.length) throw new Error(`Zhiaon 目录没有可用的 ${clientName(client)} 模块，请检查来源的软件类型。`)
    return entries
  }
  const text = await get(normal, 4_000_000)
  const hub = client === "egern" && httpsURL(normal).hostname === "egern.pages.dev"
  const items = hub ? parseEgernHubCatalog(
    text.trim().startsWith("[") ? text : await get(egernHubCatalogURL(text, normal), 4_000_000), normal,
  ) : parseIndex(text, normal, client)
  if (!items.length) throw new Error(`这个清单没有找到 ${clientName(client)} 模块链接，请检查来源的软件类型和网址。`)
  return items
}

export function sourcesToRefresh(previous: Source[], next: Source[], cache: Cache, staleBefore: number): Source[] {
  const byId = new Map(previous.map(source => [source.id, source]))
  return next.filter(source => {
    if (!source.enabled) return false
    const before = byId.get(source.id)
    if (!before || signature(before) !== signature(source)) return true
    const entry = cache[source.id]
    return !before.enabled && (!entry || entry.signature !== signature(source) || !!entry.error || entry.updatedAt < staleBefore)
  })
}

export async function refreshSources(sources: Source[], old: Cache, get: GetText,
  onProgress?: (done: number, total: number, source: Source, entry: CacheEntry) => void,
  onAuthIssue?: () => void, probeAuth?: () => Promise<boolean>): Promise<Cache> {
  const cache: Cache = { ...old }
  seedGitHubCooldown(old)
  // Ordinary sources have their own workers and never wait for /user or a Token dialog.
  const active = sources.filter(source => source.enabled).sort((a, b) => Number(needsGitHubAPI(a)) - Number(needsGitHubAPI(b)))
  const shared = new Map<string, Promise<string>>()
  const fetchText: GetText = (url, limit) => {
    if (new URL(url).origin !== "https://api.github.com") return get(url, limit)
    const existing = shared.get(url)
    if (existing) return existing
    const pending = get(url, limit)
    shared.set(url, pending)
    return pending
  }
  let authentication: Promise<void> | undefined
  const authenticate = () => authentication ??= (async () => {
    if (probeAuth && await probeAuth()) onAuthIssue?.()
  })()
  let done = 0
  // Three workers at most; failures keep only a cache for the same URL/branch.
  let cursor = 0
  const worker = async () => {
    while (cursor < active.length) {
      const source = active[cursor++]
      const key = signature(source)
      try {
        if (needsGitHubAPI(source)) await authenticate()
        const previous = old[source.id]?.signature === key ? old[source.id] : undefined
        let treeSha: string | undefined
        const fetched = await fetchSource(source, fetchText, previous, sha => { treeSha = sha })
        const lookup = new Map(unique(previous?.items ?? []).map(item => [item.url, item]))
        // Directory scans cannot supply metadata; retain previously read titles/descriptions.
        const items = fetched.map(item => {
          const prior = lookup.get(item.url)
          return prior ? { ...item, name: item.name === filename(item.url) ? prior.name : item.name,
            description: item.description || prior.description } : item
        })
        cache[source.id] = { signature: key, items, updatedAt: Date.now(), ...(treeSha ? { treeSha } : {}) }
      } catch (error) {
        const previous = old[source.id]?.signature === key ? old[source.id] : undefined
        cache[source.id] = { signature: key, items: previous?.items ?? [], updatedAt: previous?.updatedAt ?? 0,
          ...(previous?.treeSha ? { treeSha: previous.treeSha } : {}),
          error: error instanceof Error ? error.message : "请求失败，请稍后重试。",
          ...(error instanceof GitHubCooldown ? { retryAt: error.retryAt, retryKind: error.kind } : {}) }
      }
      onProgress?.(++done, active.length, source, cache[source.id])
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, active.length) }, worker))
  return cache
}

export function githubRetryAt(cache: Cache): number {
  return Math.max(0, ...Object.values(cache).filter(validCacheEntry).map(entry => entry.retryAt ?? 0))
}

// A different credential has its own primary allowance; secondary limits still apply.
export function clearGitHubPrimaryCooldown(cache: Cache): Cache {
  if (githubCooldown?.kind === "primary") githubCooldown = null
  return Object.fromEntries(Object.entries(cache).map(([id, entry]) => {
    if (!entry.retryAt || entry.retryKind === "secondary") return [id, entry]
    const { retryAt, retryKind, ...rest } = entry
    if (rest.error === "GitHub 请求限流") delete rest.error
    return [id, rest]
  }))
}

export function sourceCoolingDown(source: Source, cache: Cache, retryAt = githubRetryAt(cache), now = Date.now()): boolean {
  if (retryAt <= now) return false
  try { return repoFromSource(source) !== null } catch { return false }
}

export function recentGitHubIndex(source: Source, cache: Cache, now = Date.now()): boolean {
  const entry = cache[source.id]
  if (!entry || entry.error || entry.signature !== signature(source) || !entry.updatedAt ||
      now < entry.updatedAt || now - entry.updatedAt >= 10 * 60_000) return false
  try { return repoFromSource(source) !== null } catch { return false }
}

// A refresh replaces only one CacheEntry at a time. Keep the expensive per-source
// normalization attached to the entry so unchanged sources are not de-duplicated
// and sorted again on every progress callback.
const catalogueSourceItems = new WeakMap<CacheEntry, Map<Client, ModuleItem[]>>()

function normalizedCatalogueItems(entry: CacheEntry, client: Client): ModuleItem[] {
  let byClient = catalogueSourceItems.get(entry)
  if (!byClient) {
    byClient = new Map<Client, ModuleItem[]>()
    catalogueSourceItems.set(entry, byClient)
  }
  const cached = byClient.get(client)
  if (cached) return cached
  const normalized = unique(entry.items.map(item => ({ ...item, client })))
  byClient.set(client, normalized)
  return normalized
}

export function catalogue(sources: Source[], cache: Cache): CatalogueItem[] {
  const map = new Map<string, CatalogueItem>()
  for (const source of sources.filter(source => source.enabled)) {
    const entry = cache[source.id]
    if (!validCacheEntry(entry) || entry.signature !== signature(source)) continue
    for (const typed of normalizedCatalogueItems(entry, clientOf(source))) {
      const key = moduleKey(typed)
      const existing = map.get(key)
      const incoming = { ...typed, sourceIds: [source.id], sourceNames: [source.name] }
      map.set(key, existing ? mergeModuleFields(existing, incoming) : incoming)
    }
  }
  return [...map.values()].sort((a, b) => collator.compare(a.name, b.name))
}

export function restoreLegacyFavorites(keys: string[], items: CatalogueItem[]): CatalogueItem[] {
  const known = new Map(items.map(item => [moduleKey(item), item]))
  const restored = new Map<string, CatalogueItem>()
  for (const original of keys) {
    const key = normalizeFavorite(original)
    const separator = key.indexOf("|")
    const client = key.slice(0, separator)
    if (separator < 0 || !isClient(client)) continue
    try {
      const url = key.slice(separator + 1)
      restored.set(key, known.get(key) ?? { url, client, name: filename(url), description: "", sourceIds: [], sourceNames: [] })
    } catch { /* Skip invalid legacy URLs. */ }
  }
  return [...restored.values()]
}

export function favoriteCatalogue(snapshots: CatalogueItem[], items: CatalogueItem[]): CatalogueItem[] {
  const current = new Map(items.map(item => [moduleKey(item), item]))
  return snapshots.map(item => {
    const found = current.get(moduleKey(item))
    if (!found) return item
    return { ...mergeModuleFields(item, found), name: found.name }
  })
    .sort((a, b) => collator.compare(a.name, b.name))
}

// Catalogue items are rebuilt when one source refreshes, so a WeakMap keyed by
// object identity loses the search cache for every unchanged source. Use a bounded
// value cache keyed by the searchable fields instead; metadata changes naturally
// create a new key and do not leave stale text behind.
const searchText = new Map<string, string>()
function haystack(item: CatalogueItem): string {
  const key = [moduleKey(item), item.name, item.description, item.rule?.types.join(" ") ?? "", item.sourceNames.join(" ")].join("\u0000")
  const cached = searchText.get(key)
  if (cached !== undefined) return cached
  const text = `${clientName(clientOf(item))} ${item.name} ${item.description} ${item.rule?.types.join(" ") ?? ""} ${item.url} ${item.sourceNames.join(" ")}`.toLowerCase()
  if (searchText.size >= 8192) {
    const oldest = searchText.keys().next()
    if (!oldest.done) searchText.delete(oldest.value)
  }
  searchText.set(key, text)
  return text
}

export function filterItems(items: CatalogueItem[], query: string, sourceId: string, marks: Set<string>, onlyFavorites: boolean, client: Client | "" = ""): CatalogueItem[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(item => (!client || clientOf(item) === client) && (!sourceId || item.sourceIds.includes(sourceId)) &&
    (!onlyFavorites || marks.has(moduleKey(item))) &&
    terms.every(term => haystack(item).includes(term)))
}

// Authentication, quota checks and repository requests share one queue and one cooldown.
let githubQueue: Promise<unknown> = Promise.resolve()
let githubCooldown: GitHubCooldown | null = null
export function seedGitHubCooldown(cache: Cache): void {
  for (const entry of Object.values(cache)) {
    if (validCacheEntry(entry) && entry.retryAt && (!githubCooldown || entry.retryAt > githubCooldown.retryAt)) {
      githubCooldown = new GitHubCooldown(entry.retryAt, entry.retryKind)
    }
  }
}
export function scheduleGitHubRequest<T>(request: () => Promise<T>): Promise<T> {
  const pending = githubQueue.then(async () => {
    if (githubCooldown && githubCooldown.retryAt > Date.now()) throw githubCooldown
    try { return await request() }
    catch (error) { if (error instanceof GitHubCooldown) githubCooldown = error; throw error }
  })
  githubQueue = pending.catch(() => {})
  return pending
}
export function needsGitHubAPI(source: Source): boolean {
  try { return repoFromSource(source) !== null || httpsURL(source.url).origin === "https://api.github.com" } catch { return false }
}
export function favoriteSourceOptions(snapshots: CatalogueItem[], sources: Source[], client: Client | "" = ""): { id: string; name: string; client?: Client }[] {
  const current = new Map(sources.map(source => [source.id, source]))
  const options = new Map<string, { id: string; name: string; client?: Client }>()
  for (const source of sources) {
    if (source.enabled && (!client || clientOf(source) === client)) options.set(source.id, { id: source.id, name: source.name, client: clientOf(source) })
  }
  for (const item of snapshots) {
    if (client && clientOf(item) !== client) continue
    item.sourceIds.forEach((id, i) => {
      const source = current.get(id)
      options.set(id, { id, name: source ? `${source.name}${source.enabled ? "" : "（已停用）"}` : `${item.sourceNames[i] ?? id}（已移除）`, client: clientOf(item) })
    })
  }
  return [...options.values()]
}

export function cachedEntry(source: Source, cache: Cache): Cache[string] | undefined {
  const entry = cache[source.id]
  return entry?.signature === signature(source) ? entry : undefined
}

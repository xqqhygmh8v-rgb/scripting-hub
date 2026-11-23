export type Client = "surge" | "loon" | "egern" | "stash" | "shadowrocket"

export const CLIENTS: { id: Client; name: string; extensions: string[] }[] = [
  { id: "surge", name: "Surge", extensions: ["sgmodule"] },
  { id: "loon", name: "Loon", extensions: ["plugin", "lpx"] },
  { id: "egern", name: "Egern", extensions: ["yaml", "yml", "sgmodule"] },
  { id: "stash", name: "Stash", extensions: ["stoverride", "yaml", "yml"] },
  { id: "shadowrocket", name: "Shadowrocket", extensions: ["sgmodule", "module", "srmodule"] },
]

export const IMPORT_GUIDES: Record<Client, { kind: string; manual: string; note: string; documentation?: string }> = {
  surge: { kind: "模块", manual: "在 Surge 的模块管理中粘贴网址添加。", note: "需要先完成 Surge 激活，再在导入页确认模块。",
    documentation: "https://manual.nssurge.com/tools/url-scheme.html" },
  loon: { kind: "插件", manual: "在 Loon 的插件管理中粘贴网址添加。", note: "普通插件与加密插件均交给 Loon 处理。",
    documentation: "https://loon0x00.github.io/docs/Scheme/" },
  egern: { kind: "模块", manual: "在 Egern 的模块页面新建模块并粘贴网址。", note: "在 Egern 的新建模块页检查网址和名称后保存。",
    documentation: "https://egernapp.com/docs/url-scheme" },
  stash: { kind: "覆写", manual: "在 Stash 的覆写管理中粘贴网址添加。", note: "按远程覆写导入，在 Stash 中确认并选择启用。",
    documentation: "https://stash.wiki/faq/url-schema" },
  shadowrocket: { kind: "模块", manual: "在 Shadowrocket 的模块管理中粘贴网址添加。", note: "使用模块发布者现有的安装链接；在 Shadowrocket 中确认。" },
}

function resourceURL(input: string): URL {
  const url = new URL(input.trim())
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("模块网址必须是无登录信息的 HTTPS 地址。")
  return url
}

export function isClient(value: unknown): value is Client {
  return CLIENTS.some(client => client.id === value)
}

export function clientOf(value: { client?: unknown }): Client { return isClient(value?.client) ? value.client : "surge" }
export function clientName(client: Client): string { return CLIENTS.find(item => item.id === client)!.name }
export function moduleKey(item: { url: string; client?: Client; rule?: { id: string } }): string {
  return `${clientOf(item)}|${item.rule ? `magicrule:${item.rule.id}` : item.url}`
}

// Only recognized module-import actions may wrap a resource URL. No arbitrary scheme execution.
export function unwrapResource(input: string, client: Client, base?: string, depth = 0): string {
  if (depth > 3) throw new Error("导入链接嵌套过多，请填写模块原始网址。")
  const url = new URL(input.trim(), base)
  if (url.username || url.password) throw new Error("模块网址不能包含登录信息。")
  // Only documented module/plugin actions are unwrapped; never execute a web redirect.
  if (url.protocol === "https:" && url.hostname === "www.nsloon.com" && url.pathname === "/openloon/import") {
    if (client !== "loon") throw new Error("导入链接与所选软件不匹配。")
    const resource = url.searchParams.get("plugin")
    if (!resource) throw new Error("导入链接缺少插件网址。")
    return unwrapResource(resource, client, undefined, depth + 1)
  }
  if (url.protocol === "https:" && url.hostname === "link.stash.ws" && url.pathname.startsWith("/install-override/")) {
    if (client !== "stash") throw new Error("导入链接与所选软件不匹配。")
    if (url.search || url.hash) throw new Error("请使用覆写原始 HTTPS 网址，避免官方链接的参数产生歧义。")
    return resourceURL(`https://${url.pathname.slice("/install-override/".length)}`).toString()
  }
  const action = `${url.hostname}${url.pathname}`.replace(/^\/+|\/+$/g, "")
  const routes: Record<Client, { scheme: string; action: string; parameter: string }> = {
    surge: { scheme: "surge:", action: "install-module", parameter: "url" },
    loon: { scheme: "loon:", action: "import", parameter: "plugin" },
    egern: { scheme: "egern:", action: "modules/new", parameter: "url" },
    stash: { scheme: "stash:", action: "install-override", parameter: "url" },
    shadowrocket: { scheme: "shadowrocket:", action: "install", parameter: "module" },
  }
  const route = routes[client]
  if ((url.protocol === route.scheme || client === "stash" && url.protocol === "clash:") && action === route.action) {
    const resource = url.searchParams.get(route.parameter)
    if (!resource) throw new Error("导入链接缺少模块网址。")
    return unwrapResource(resource, client, undefined, depth + 1)
  }
  if (url.protocol !== "https:") throw new Error("导入链接与所选软件不匹配，或不是 HTTPS 模块网址。")
  // Publisher redirect pages can contain a recognized import URL in their URL query.
  const wrapped = url.searchParams.get("url")
  if (wrapped && (CLIENTS.some(item => wrapped.startsWith(`${item.id}:`)) || wrapped.startsWith("clash:"))) {
    return unwrapResource(wrapped, client, undefined, depth + 1)
  }
  return url.toString()
}

export function buildImportURL(client: Client, resource: string, name = ""): string {
  const url = resourceURL(resource)
  const encoded = encodeURIComponent(url.toString())
  switch (client) {
    case "surge": return `surge:///install-module?url=${encoded}`
    case "loon": return `loon://import?plugin=${encoded}`
    case "egern": return `egern:/modules/new?url=${encoded}${name ? `&name=${encodeURIComponent(name)}` : ""}`
    case "stash": return `stash://install-override?url=${encoded}`
    case "shadowrocket": return `shadowrocket://install?module=${encoded}`
  }
}

// Optional, user-triggered alternatives documented by Loon and Stash.
export function buildUniversalImportURL(client: Client, resource: string): string | null {
  const url = resourceURL(resource)
  if (client === "loon") return `https://www.nsloon.com/openloon/import?plugin=${encodeURIComponent(url.toString())}`
  // Stash embeds a remote URL in its path. Keep signed/query URLs on the native route.
  if (client === "stash" && !url.search && !url.hash) return `https://link.stash.ws/install-override/${url.toString().slice("https://".length)}`
  return null
}

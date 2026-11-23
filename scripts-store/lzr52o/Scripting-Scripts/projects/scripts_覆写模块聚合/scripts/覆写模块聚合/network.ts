import { fetch } from "scripting"
import { GitHubCooldown, httpsURL, scheduleGitHubRequest } from "./core"
import type { ModuleItem, GitHubAccount, GitHubAuthActions } from "./core"
import { buildImportURL, buildUniversalImportURL, clientOf } from "./clients"

const GITHUB_API = "https://api.github.com"
const TOKEN_KEY = "surge.github.token.v1"


let verifiedTokenCache: { token: string; account: GitHubAccount; expiresAt: number } | null = null

export class GitHubAuthenticationError extends Error {}
export class GitHubNetworkError extends Error {}

export const GITHUB_TOKEN_NOTICE = "GitHub Token 未配置、无效或已过期，请前往「关于 → GitHub Token」重新配置。"

export function hasGitHubToken(): boolean {
  try { return Keychain.contains(TOKEN_KEY) } catch { return false }
}

function readGitHubToken(): string {
  try { return Keychain.get(TOKEN_KEY) ?? "" }
  catch { throw new Error("无法读取 GitHub Token，请检查设备钥匙串后重试。") }
}

function normalizeToken(input: string): string {
  const token = input.trim()
  if (!token || !/^[A-Za-z0-9_]+$/.test(token)) throw new Error("请填写有效的 GitHub Personal Access Token，不要包含空格或 Bearer 前缀。")
  return token
}

// The caller verifies a replacement before writing. Never copy credentials into Storage or script files.
export function storeGitHubToken(input: string): boolean {
  const token = normalizeToken(input)
  const changed = readGitHubToken() !== token
  try {
    if (!Keychain.set(TOKEN_KEY, token, { accessibility: "first_unlock_this_device", synchronizable: false })) throw new Error()
  } catch { throw new Error("Token 未能保存到设备钥匙串，请重试。") }
  return changed
}

export function removeGitHubToken(): void {
  try { if (!Keychain.remove(TOKEN_KEY)) throw new Error(); verifiedTokenCache = null }
  catch { throw new Error("Token 未能从设备钥匙串移除，请重试。") }
}

async function githubRequest(url: string, token: string) {
  return scheduleGitHubRequest(async () => {
    const headers: Record<string, string> = { Accept: "application/vnd.github+json" }
    if (token) headers.Authorization = `Bearer ${token}`
    let response: Awaited<ReturnType<typeof fetch>>
    try {
      response = await fetch(url, {
        timeout: 20, headers,
        handleRedirect: async request => {
          try { if (httpsURL(request.url).origin !== GITHUB_API) return null } catch { return null }
          return { ...request, headers: { ...request.headers, ...headers } }
        },
      })
    } catch { throw new GitHubNetworkError("GitHub 连接失败，请检查网络后重试。") }
    try { await checkResponse(response, true, !!token) }
    catch (error) {
      if (error instanceof GitHubAuthenticationError && verifiedTokenCache?.token === token) verifiedTokenCache = null
      throw error
    }
    return response
  })
}

// Only definite credential failures need attention; connectivity and quota are not token validity.
export async function needsGitHubTokenConfiguration(): Promise<boolean> {
  let stored: string
  try { stored = readGitHubToken() } catch { return false }
  if (!stored.trim()) return true
  try { normalizeToken(stored) } catch { return true }
  try { await verifyGitHubToken(stored, true); return false }
  catch (error) {
    if (error instanceof GitHubCooldown) throw error
    return error instanceof GitHubAuthenticationError
  }
}

export async function verifyGitHubToken(input?: string, cached = false): Promise<GitHubAccount> {
  const token = normalizeToken(input === undefined ? readGitHubToken() : input)
  if (cached && verifiedTokenCache && verifiedTokenCache.token === token && verifiedTokenCache.expiresAt > Date.now()) return verifiedTokenCache.account
  const response = await githubRequest(`${GITHUB_API}/user`, token)
  await checkResponse(response, true, true)
  let account: { login?: unknown }
  try { account = JSON.parse(await response.text()) }
  catch { throw new Error("无法读取 GitHub 账号信息，请稍后重试。") }
  if (!account || typeof account.login !== "string" || !account.login) throw new Error("GitHub 未返回有效的账号信息。")
  const number = (name: string): number | undefined => {
    const raw = response.headers.get(name)
    const value = raw === null ? NaN : Number(raw)
    return Number.isSafeInteger(value) && value >= 0 ? value : undefined
  }
  const reset = number("x-ratelimit-reset")
  const result = { checkedAt: Date.now(), login: account.login, limit: number("x-ratelimit-limit"), remaining: number("x-ratelimit-remaining"),
    resetAt: reset === undefined ? undefined : reset * 1000 }
  verifiedTokenCache = { token, account: result, expiresAt: Date.now() + 60_000 }
  return result
}

export async function openModule(item: ModuleItem, method: "native" | "universal" = "native"): Promise<boolean> {
  if (item.rule) return false
  const resource = httpsURL(item.url).toString()
  const url = method === "universal" ? buildUniversalImportURL(clientOf(item), resource)
    : buildImportURL(clientOf(item), resource, item.name)
  if (!url) return false
  try { return await Safari.openURL(url) } catch { return false }
}

// Scripting's native fetch uses seconds for timeout and does not send cookies automatically.
export async function getText(input: string, limit = 4_000_000): Promise<string> {
  const url = httpsURL(input).toString()
  const github = new URL(url).origin === GITHUB_API
  const token = github ? readGitHubToken() : ""
  const response = github ? await githubRequest(url, token) : await fetch(url, { timeout: 20, headers: {} })
  await checkResponse(response, github, !!token)
  const declared = Number(response.headers.get("content-length") ?? 0)
  if (declared > limit) throw new Error("来源内容太大，请换成更小的模块目录或清单。")
  const text = await response.text()
  if (text.length > limit) throw new Error("来源内容太大，请换成更小的模块目录或清单。")
  return text
}

async function checkResponse(response: Awaited<ReturnType<typeof fetch>>, github: boolean, authenticated: boolean): Promise<void> {
  if (!response.ok) {
    if (github && response.status === 401) throw new GitHubAuthenticationError(GITHUB_TOKEN_NOTICE)
    if (github && (response.status === 403 || response.status === 429)) {
      const retry = response.headers.get("retry-after")
      const exhausted = response.headers.get("x-ratelimit-remaining") === "0"
      const declaresLimit = retry != null || exhausted || response.status === 429
      const body = declaresLimit ? "" : await response.text().catch(() => "")
      if (declaresLimit || /(?:rate limit|abuse detection)/i.test(body)) {
        const now = Date.now()
        const seconds = retry && /^\d+$/.test(retry) ? now + Number(retry) * 1000 : Date.parse(retry ?? "")
        const reset = exhausted ? Number(response.headers.get("x-ratelimit-reset")) * 1000 : 0
        const next = Math.max(Number.isFinite(seconds) ? seconds : 0, Number.isFinite(reset) ? reset : 0)
        throw new GitHubCooldown(next > now ? next + 1000 : now + 60_000, exhausted ? "primary" : "secondary")
      }
    }
    if (response.status === 429) throw new Error("来源暂时限流，请稍后再试。")
    if (github && authenticated && response.status === 403) throw new Error("GitHub 拒绝访问，请检查 Token 权限或组织 SSO 授权。")
    if (response.status === 403) throw new Error("访问被拒绝（403）")
    throw new Error(`请求失败（HTTP ${response.status}）`)
  }
}

export const githubAuthActions: GitHubAuthActions = {
  hasToken: hasGitHubToken, verify: verifyGitHubToken, save: storeGitHubToken, remove: removeGitHubToken,
  isCurrent: input => { try { return input.trim() === readGitHubToken() } catch { return false } },
  issue: error => error instanceof GitHubNetworkError ? "network" : error instanceof GitHubAuthenticationError ? "authentication" : "other",
}

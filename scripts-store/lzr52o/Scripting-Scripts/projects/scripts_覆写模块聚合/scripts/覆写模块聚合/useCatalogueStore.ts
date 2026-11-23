import { useCallback, useEffect, useMemo, useRef, useState } from "scripting"
import type { Cache, CatalogueItem, Source } from "./core"
import {
  cachedEntry, catalogue, clearGitHubPrimaryCooldown, favoriteCatalogue, githubRetryAt,
  parseModule, rawURL, recentGitHubIndex, refreshSources, signature,
  sourceCoolingDown, sourcesToRefresh, updateModuleMetadata,
} from "./core"
import type { Client } from "./clients"
import { moduleKey } from "./clients"
import {
  getText, githubAuthActions, hasGitHubToken, needsGitHubTokenConfiguration, GITHUB_TOKEN_NOTICE,
} from "./network"
import { KEYS, readInitialData } from "./storage-validation"
import type { Feedback } from "./ui"

const AUTO_REFRESH_MS = 6 * 60 * 60 * 1000

function cacheNotice(sources: Source[], cache: Cache, now: number, stamp: (time: number) => string): Feedback | null {
  const until = githubRetryAt(cache)
  let failed = 0, paused = 0, kept = false
  for (const source of sources) {
    if (!source.enabled) continue
    const entry = cachedEntry(source, cache)
    if (sourceCoolingDown(source, cache, until, now)) paused++
    else if (entry?.error) failed++
    else continue
    if (entry?.items.length) kept = true
  }
  if (!paused && !failed) return null
  return { error: failed > 0, warning: paused > 0, text: [failed ? `${failed} 个来源刷新失败` : "",
    paused ? `${paused} 个 GitHub 来源暂停刷新，${stamp(until)} 后可重试` : "",
    kept ? "受影响的来源继续显示旧缓存" : ""].filter(Boolean).join("；") + "。" }
}

export function useCatalogueStore(
  onFailure: (error: unknown) => Promise<void>, stamp: (time: number) => string) {
  const [initial] = useState(readInitialData)
  const [sources, setSources] = useState<Source[]>(initial.sources)
  const [cache, setCache] = useState<Cache>(initial.cache)
  const [favorites, setFavorites] = useState(initial.favorites)
  const [githubConfigured, setGitHubConfigured] = useState(hasGitHubToken)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [message, setMessage] = useState<Feedback | null>(null)
  const until = githubRetryAt(cache)
  const [clock, setClock] = useState(Date.now)
  useEffect(() => {
    const delay = until - Date.now()
    if (delay <= 0) return
    const timer = setTimeout(() => setClock(Date.now()), Math.min(delay + 100, 2_147_483_647))
    return () => clearTimeout(timer)
  }, [until, clock])
  const storedNotice = useMemo(() => cacheNotice(sources, cache, Date.now(), stamp), [sources, cache, clock])
  const status = message && storedNotice ? { ...message, error: message.error || storedNotice.error,
    warning: message.warning || storedNotice.warning, text: `${message.text} ${storedNotice.text}` } : storedNotice ?? message
  const feedback = initial.recovery ? { ...status, warning: true,
    text: `已恢复有效数据，异常缓存或收藏条目已丢弃。${status?.text ?? ""}` } : status
  const busyRef = useRef(false)
  const alive = useRef(true)
  const sourcesRef = useRef(sources)
  const cacheRef = useRef(cache)
  const favoritesRef = useRef(favorites)
  const pendingRefresh = useRef(new Set<string>())
  const metadataDuringRefresh = useRef<{
    url: string
    metadata: ReturnType<typeof parseModule>
    client: Client
  }[]>([])
  const all = useMemo(() => catalogue(sources, cache), [sources, cache])
  const favoriteKeys = useMemo(() => new Set(favorites.map(moduleKey)), [favorites])
  const favoriteItems = useMemo(() => favoriteCatalogue(favorites, all), [favorites, all])

  async function refresh(current = sourcesRef.current, verb = "刷新") {
    if (busyRef.current) return
    if (!current.some(source => source.enabled)) {
      setMessage({ text: "请先添加或启用一个来源。", error: true })
      return
    }
    const retryAt = githubRetryAt(cacheRef.current)
    const available = current.filter(source => source.enabled && !sourceCoolingDown(source, cacheRef.current, retryAt) && !recentGitHubIndex(source, cacheRef.current))
    if (!available.length) {
      setMessage({ text: "本次未发送请求；近期已同步的 GitHub 来源使用缓存。" })
      return
    }
    busyRef.current = true
    setBusy(true)
    setMessage(null)
    metadataDuringRefresh.current = []
    setProgress({ done: 0, total: available.length })
    try {
      let authIssue = false
      await refreshSources(available, cacheRef.current, getText, (done, total, source, entry) => {
        if (!alive.current) return
        setProgress({ done, total })
        const configured = sourcesRef.current.find(item => item.id === source.id)
        if (!configured || signature(configured) !== entry.signature) return
        // A detail opened mid-refresh can contain newer metadata than the scan's initial cache.
        let patch: Cache = { [source.id]: entry }
        for (const update of metadataDuringRefresh.current) {
          patch = updateModuleMetadata(patch, update.url, update.metadata, update.client)
        }
        cacheRef.current = { ...cacheRef.current, ...patch }
        setCache(cacheRef.current)
        if (favoritesRef.current.some(item => !item.sourceIds.length)) {
          const found = new Map(catalogue([{ ...configured, enabled: true }], patch).map(item => [moduleKey(item), item]))
          const next = favoritesRef.current.map(item => item.sourceIds.length ? item : found.get(moduleKey(item)) ?? item)
          if (next.some((item, index) => item !== favoritesRef.current[index]) && Storage.set(KEYS.favorites, next)) {
            favoritesRef.current = next
            setFavorites(next)
          }
        }
      }, () => { authIssue = true }, needsGitHubTokenConfiguration)
      if (!alive.current) return
      const next = cacheRef.current
      const saved = Storage.set(KEYS.cache, next)
      setMessage(saved
        ? { warning: authIssue, text: `${verb}完成。${authIssue ? GITHUB_TOKEN_NOTICE : ""}` }
        : { error: true, text: "缓存保存失败。" })
      console.log("SURGE_CATALOGUE_READY")
    } catch (issue) {
      if (alive.current) setMessage({
        error: true, text: issue instanceof Error ? issue.message : "刷新失败，请重试。",
      })
    }
    finally {
      busyRef.current = false
      if (alive.current) {
        const queued = sourcesRef.current.filter(source => source.enabled && pendingRefresh.current.has(source.id) &&
          !isFresh(source, cacheRef.current))
        pendingRefresh.current.clear()
        setBusy(false)
        if (queued.length) void refresh(queued)
      }
    }
  }

  function isFresh(source: Source, currentCache: Cache): boolean {
    const entry = cachedEntry(source, currentCache)
    return !!entry && !entry.error && Date.now() - entry.updatedAt <= AUTO_REFRESH_MS
  }

  useEffect(() => {
    alive.current = true
    const cacheSaved = !initial.saveCache || Storage.set(KEYS.cache, cacheRef.current)
    const favoritesSaved = !initial.saveFavorites || Storage.set(KEYS.favorites, favoritesRef.current)
    if (!cacheSaved || !favoritesSaved) void onFailure(new Error("有效数据已恢复，但清理结果保存失败，下次启动将重试。"))
    const stale = sources.filter(source => source.enabled && !sourceCoolingDown(source, cache) && !isFresh(source, cache))
    if (stale.length) void refresh(stale)
    else console.log("SURGE_CATALOGUE_READY")
    return () => { alive.current = false }
  }, [])

  const mark = useCallback((item: CatalogueItem, marked: boolean): boolean => {
    const key = moduleKey(item)
    const next = favoritesRef.current.filter(saved => moduleKey(saved) !== key)
    if (marked) next.push(item)
    if (!Storage.set(KEYS.favorites, next)) { void onFailure(new Error("收藏保存失败，请重试。")); return false }
    favoritesRef.current = next
    setFavorites(next)
    return true
  }, [])

  function saveMetadata(url: string, metadata: ReturnType<typeof parseModule>, client: Client): boolean {
    if (busyRef.current) metadataDuringRefresh.current.push({ url, metadata, client })
    const next = updateModuleMetadata(cacheRef.current, url, metadata, client)
    cacheRef.current = next
    setCache(next)
    const saved = Storage.set(KEYS.cache, next)
    const key = moduleKey({ url: rawURL(url), client })
    const snapshots = favoritesRef.current
    if (!snapshots.some(item => moduleKey(item) === key)) return saved
    const updated = snapshots.map(item => moduleKey(item) === key
      ? { ...item, name: metadata.name || item.name,
          description: metadata.description || item.description }
      : item)
    if (!Storage.set(KEYS.favorites, updated)) return false
    favoritesRef.current = updated
    setFavorites(updated)
    return saved
  }

  function toggleSource(id: string, enabled: boolean) {
    const previous = sourcesRef.current
    const next = previous.map(source => source.id === id ? { ...source, enabled } : source)
    if (!Storage.set(KEYS.sources, next)) { void onFailure(new Error("来源设置保存失败，请重试。")); return }
    sourcesRef.current = next
    setSources(next)
    const changed = sourcesToRefresh(previous, next, cacheRef.current, Date.now() - AUTO_REFRESH_MS)
    if (!changed.length) return
    if (busyRef.current) changed.forEach(source => pendingRefresh.current.add(source.id))
    else void refresh(changed)
  }

  async function commitSources(next: Source[], previous = sourcesRef.current) {
    if (!alive.current) return
    if (!Storage.set(KEYS.sources, next)) throw new Error("来源保存失败，请重试。")
    const pruned: Cache = {}
    next.forEach(source => { if (cacheRef.current[source.id]?.signature === signature(source)) pruned[source.id] = cacheRef.current[source.id] })
    const changed = sourcesToRefresh(previous, next, pruned, Date.now() - AUTO_REFRESH_MS)
    cacheRef.current = pruned
    setCache(pruned)
    sourcesRef.current = next
    setSources(next)
    // Persist pruning too, so reopening cannot resurrect removed source caches.
    const cacheSaved = Storage.set(KEYS.cache, pruned)
    if (changed.length) await refresh(changed)
    if (!cacheSaved) setMessage({ warning: true, text: "来源已更新，但无效缓存清理保存失败；下次启动会再次尝试清理。" })
  }

  function authenticationChanged() {
    if (!alive.current) return
    setGitHubConfigured(hasGitHubToken())
    const next = clearGitHubPrimaryCooldown(cacheRef.current)
    cacheRef.current = next
    setCache(next)
    const saved = Storage.set(KEYS.cache, next)
    setMessage(saved ? { text: "GitHub 认证已更新，可刷新来源。" } : { error: true, text: "GitHub 认证已更新，但限流状态保存失败，请重新打开脚本。" })
  }

  const isFavorite = useCallback((item: CatalogueItem) => favoritesRef.current.some(saved => moduleKey(saved) === moduleKey(item)), [])
  const getSources = () => sourcesRef.current
  const canConfigureGitHub = () => !busyRef.current
  return {
    sources, cache, all, favoriteItems, favoriteKeys,
    githubConfigured, busy, progress, message, feedback,
    refresh, mark, saveMetadata, toggleSource, commitSources,
    authenticationChanged, isFavorite, getSources, canConfigureGitHub,
    loadText: getText, githubAuth: githubAuthActions,
  }
}

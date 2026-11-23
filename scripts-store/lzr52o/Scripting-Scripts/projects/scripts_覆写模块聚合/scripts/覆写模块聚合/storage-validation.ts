import type { Cache, CatalogueItem, Source } from "./core"
import { DEFAULT_SOURCES, catalogue, httpsURL, rawURL, restoreLegacyFavorites, seedGitHubCooldown, validFavorite, validateCache } from "./core"
import { isClient } from "./clients"

export const KEYS = { sources: "surge.sources.v1", cache: "surge.cache.v1", favorites: "surge.favorites.v2", legacyFavorites: "surge.favorites.v1" }

let storageRecovered = false

let favoritesNeedSave = false

function readSources(): Source[] {
  const saved = Storage.get<unknown>(KEYS.sources)
  if (saved == null) return DEFAULT_SOURCES.map(source => ({ ...source }))
  if (!Array.isArray(saved)) { storageRecovered = true; return DEFAULT_SOURCES.map(source => ({ ...source })) }
  const ids = new Set<string>()
  return saved.filter((source): source is Source => {
    const valid = source && typeof source === "object" && typeof source.id === "string" && !!source.id.trim() && !ids.has(source.id) &&
      typeof source.url === "string" && typeof source.name === "string" && !!source.name.trim() && typeof source.enabled === "boolean" &&
      (source.branch === undefined || typeof source.branch === "string") && (source.client === undefined || isClient(source.client))
    try { if (valid) httpsURL(source.url); else throw new Error(); ids.add(source.id); return true }
    catch { storageRecovered = true; return false }
  })
}

function readFavorites(sources: Source[], cache: Cache): CatalogueItem[] {
  const snapshots = Storage.get<unknown>(KEYS.favorites)
  if (Array.isArray(snapshots)) {
    const valid = snapshots.filter(validFavorite).map(item => ({ ...item, url: rawURL(item.url) }))
    favoritesNeedSave = valid.length !== snapshots.length
    storageRecovered ||= favoritesNeedSave
    return valid
  }
  if (snapshots != null) storageRecovered = true
  const saved = Storage.get<unknown>(KEYS.legacyFavorites)
  if (!Array.isArray(saved)) { favoritesNeedSave = snapshots != null; return [] }
  const keys = saved.filter((value): value is string => typeof value === "string")
  const cached = catalogue(sources.map(source => ({ ...source, enabled: true })), cache)
  const restored = restoreLegacyFavorites(keys, cached)
  favoritesNeedSave = true
  storageRecovered ||= keys.length !== saved.length || restored.length !== keys.length
  return restored
}

export function readInitialData() {
  storageRecovered = false; favoritesNeedSave = false
  const sources = readSources()
  const result = validateCache(Storage.get<unknown>(KEYS.cache), sources)
  storageRecovered ||= result.recovered
  seedGitHubCooldown(result.cache)
  const favorites = readFavorites(sources, result.cache)
  return { sources, cache: result.cache, favorites, recovery: storageRecovered,
    saveCache: result.recovered, saveFavorites: favoritesNeedSave }
}

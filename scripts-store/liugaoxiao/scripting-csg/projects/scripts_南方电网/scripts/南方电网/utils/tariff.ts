import { fetch } from "scripting"

export type TariffTier = {
  name: string
  range: string
  energyPrice: number
  fund: number
  reservoirFund: number
  finalPrice: number
}

export type TimeOfUseTariff = {
  name: string
  period: string
  energyPrice: number
  fund: number
  reservoirFund: number
  finalPrice: number
}

export type ResidentTariffTable = {
  title: string
  areaNames: string[]
  unit: string
  effectiveFrom: string
  normalTiers: TariffTier[]
  summerTiers: TariffTier[]
  multiPopulationNormalTiers: TariffTier[]
  multiPopulationSummerTiers: TariffTier[]
  touTariffs: TimeOfUseTariff[]
  combinedPrice: number
  notes: string[]
}

export type LocatedTariffResult = {
  locationText: string
  matchedArea: string | null
  table: ResidentTariffTable | null
  searchQuery?: string
  searchUrl?: string
  webResults?: WebTariffSearchResult[]
}

export type WebTariffSearchResult = {
  title: string
  url: string
  snippet: string
}

const FUND = 0.196875
const RESERVOIR_FUND = 0.67

export const DEFAULT_RESIDENT_TARIFF: ResidentTariffTable = {
  title: "居民生活用电阶梯电价（一户一表）",
  areaNames: [],
  unit: "分/千瓦时（含税）",
  effectiveFrom: "2021-12-01",
  normalTiers: [
    { name: "第一档", range: "每户每月 0–200 千瓦时", energyPrice: 59.02, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 59.886875 },
    { name: "第二档", range: "每户每月 201–400 千瓦时", energyPrice: 64.02, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 64.886875 },
    { name: "第三档", range: "每户每月 401 千瓦时及以上", energyPrice: 89.02, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 89.886875 },
  ],
  summerTiers: [
    { name: "第一档", range: "每户每月 0–260 千瓦时", energyPrice: 59.02, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 59.886875 },
    { name: "第二档", range: "每户每月 261–600 千瓦时", energyPrice: 64.02, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 64.886875 },
    { name: "第三档", range: "每户每月 601 千瓦时及以上", energyPrice: 89.02, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 89.886875 },
  ],
  multiPopulationNormalTiers: [
    { name: "第一档", range: "每户每月 0–300 千瓦时", energyPrice: 59.02, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 59.886875 },
    { name: "第二档", range: "每户每月 301–500 千瓦时", energyPrice: 64.02, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 64.886875 },
    { name: "第三档", range: "每户每月 501 千瓦时及以上", energyPrice: 89.02, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 89.886875 },
  ],
  multiPopulationSummerTiers: [
    { name: "第一档", range: "每户每月 0–360 千瓦时", energyPrice: 59.02, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 59.886875 },
    { name: "第二档", range: "每户每月 361–700 千瓦时", energyPrice: 64.02, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 64.886875 },
    { name: "第三档", range: "每户每月 701 千瓦时及以上", energyPrice: 89.02, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 89.886875 },
  ],
  touTariffs: [
    { name: "峰", period: "10:00–12:00、14:00–19:00", energyPrice: 100.33, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 101.196875 },
    { name: "平", period: "08:00–10:00、12:00–14:00、19:00–24:00", energyPrice: 59.02, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 59.886875 },
    { name: "谷", period: "00:00–08:00", energyPrice: 22.43, fund: FUND, reservoirFund: RESERVOIR_FUND, finalPrice: 23.296875 },
  ],
  combinedPrice: 63.586875,
  notes: [
    "阶梯分档按自然月累计；夏季标准适用 5–10 月，非夏季标准适用 1–4 月、11–12 月。",
    "同一地址共同居住人口满 5 人及以上且已办理政策优惠的，按多人户阶梯基数执行。",
    "峰谷电价需用户自愿申请，同一自然年内保持不变。",
  ],
}

const RESIDENT_TARIFF_TABLES: ResidentTariffTable[] = [DEFAULT_RESIDENT_TARIFF]

export function findResidentTariffByAddressText(addressText: string): LocatedTariffResult {
  const normalized = addressText.replace(/\s+/g, "")
  for (const table of RESIDENT_TARIFF_TABLES) {
    const matchedArea = table.areaNames.find((name) => normalized.includes(name))
    if (matchedArea) {
      return {
        locationText: addressText,
        matchedArea,
        table,
      }
    }
  }

  return {
    locationText: addressText,
    matchedArea: null,
    table: null,
  }
}

export async function queryResidentTariffByCurrentLocation(): Promise<LocatedTariffResult> {
  await Location.setAccuracy("hundredMeters")
  const location = await Location.requestCurrent({ forceRequest: true })
  if (!location) {
    throw new Error("无法获取当前位置，请检查定位权限。")
  }

  const placemarks = await Location.reverseGeocode({
    latitude: location.latitude,
    longitude: location.longitude,
    locale: "zh-CN",
  })

  const first = placemarks?.[0]
  const areaParts = [
    first?.administrativeArea,
    first?.locality,
    first?.subAdministrativeArea,
    first?.subLocality,
  ].filter(Boolean) as string[]
  const areaText = areaParts.join(" ")
  const addressText = [
    areaText,
    first?.thoroughfare,
    first?.name,
  ].filter(Boolean).join(" ") || `${location.latitude}, ${location.longitude}`
  const cityOrDistrict = areaParts.slice(-2).join(" ") || areaText || addressText
  const searchQuery = `${cityOrDistrict} 居民阶梯电价 南方电网`
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(searchQuery)}`
  const webResults = await searchTariffOnWeb([
    searchQuery,
    `${areaText || cityOrDistrict} 居民生活用电阶梯电价价目表`,
    `${first?.administrativeArea ?? "广东省"} 居民生活用电阶梯电价 南方电网`,
    `${first?.administrativeArea ?? "广东省"} 居民阶梯电价 第一档 第二档 第三档`,
    `南方电网 用电收费标准 居民 阶梯 电价 ${cityOrDistrict}`,
    `site:95598.csg.cn ${cityOrDistrict} 居民电价`,
  ])

  return {
    ...findResidentTariffByAddressText(addressText),
    searchQuery,
    searchUrl,
    webResults,
  }
}

export function isSummerMonth(date = new Date()) {
  const month = date.getMonth() + 1
  return month >= 5 && month <= 10
}

export function getCurrentSeasonTiers(table: ResidentTariffTable, date = new Date()) {
  return isSummerMonth(date) ? table.summerTiers : table.normalTiers
}

export function formatCentPrice(value: number) {
  return `${value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} 分/千瓦时`
}

export function formatYuanPriceFromCent(value: number) {
  return `${centToYuan(value).toFixed(4)}元/kWh`
}

export function estimateResidentMonthCharge(kwh: number | null | undefined, date = new Date()) {
  if (kwh == null || Number.isNaN(kwh)) {
    return null
  }

  const tiers = getCurrentSeasonTiers(DEFAULT_RESIDENT_TARIFF, date)
  const limits = isSummerMonth(date) ? [260, 600, Infinity] : [200, 400, Infinity]
  let remaining = kwh
  let previousLimit = 0
  let amount = 0
  let currentTier = tiers[0]

  for (let i = 0; i < tiers.length; i += 1) {
    const tier = tiers[i]
    const limit = limits[i]
    const tierKwh = Math.max(0, Math.min(remaining, limit - previousLimit))
    if (tierKwh > 0) {
      amount += tierKwh * centToYuan(tier.finalPrice)
      currentTier = tier
      remaining -= tierKwh
    }
    previousLimit = limit
    if (remaining <= 0) {
      break
    }
  }

  return {
    amount,
    averageTariffYuan: kwh > 0 ? amount / kwh : centToYuan(tiers[0].finalPrice),
    currentTierName: currentTier.name,
  }
}

async function searchTariffOnWeb(queries: string[]): Promise<WebTariffSearchResult[]> {
  const allResults: WebTariffSearchResult[] = []
  for (const query of queries) {
    const bingResults = await searchBing(query)
    allResults.push(...bingResults)
    if (allResults.length >= 5) {
      break
    }

    const baiduResults = await searchBaidu(query)
    allResults.push(...baiduResults)
    if (allResults.length >= 5) {
      break
    }

    const duckResults = await searchDuckDuckGo(query)
    allResults.push(...duckResults)
    if (allResults.length >= 5) {
      break
    }
  }

  const deduped = dedupeSearchResults(allResults)
  const pageFacts = await extractFactsFromResultPages(deduped)
  return dedupeSearchResults([...pageFacts, ...deduped]).slice(0, 5)
}

async function searchBing(query: string): Promise<WebTariffSearchResult[]> {
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&mkt=zh-CN&setlang=zh-Hans&ensearch=0`
    const response = await fetch(url, {
      timeout: 12,
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    })
    if (!response.ok) {
      return []
    }

    const html = await response.text()
    return [
      ...extractTariffFactsFromHtml(html, url, "Bing 页面提取"),
      ...parseBingResults(html),
    ]
  } catch {
    return []
  }
}

async function searchBaidu(query: string): Promise<WebTariffSearchResult[]> {
  try {
    const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}`
    const response = await fetch(url, {
      timeout: 12,
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    })
    if (!response.ok) {
      return []
    }

    const html = await response.text()
    return [
      ...extractTariffFactsFromHtml(html, url, "百度页面提取"),
      ...parseBaiduResults(html),
    ]
  } catch {
    return []
  }
}
async function searchDuckDuckGo(query: string): Promise<WebTariffSearchResult[]> {
  try {
    const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const response = await fetch(url, {
      timeout: 12,
      headers: {
        "User-Agent": "Mozilla/5.0 AppleWebKit/605.1.15 Mobile Safari/604.1",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    })
    if (!response.ok) {
      return []
    }

    const html = await response.text()
    return parseDuckDuckGoResults(html)
  } catch {
    return []
  }
}

function parseBingResults(html: string): WebTariffSearchResult[] {
  const results: WebTariffSearchResult[] = []
  const blocks = html.match(/<li[^>]+class=["'][^"']*b_algo[^"']*["'][\s\S]*?<\/li>/g) ?? []
  for (const block of blocks) {
    const parsed = parseResultBlock(block)
    if (parsed) {
      results.push(parsed)
    }
  }

  if (results.length === 0) {
    const h2Blocks = html.match(/<h2[\s\S]*?<\/h2>/g) ?? []
    for (const block of h2Blocks) {
      const parsed = parseResultBlock(block)
      if (parsed) {
        results.push(parsed)
      }
    }
  }

  return results
}

function parseBaiduResults(html: string): WebTariffSearchResult[] {
  const results: WebTariffSearchResult[] = []
  const blocks = html.match(/<div[^>]+class=["'][^"']*(?:result|c-container)[^"']*["'][\s\S]*?<\/div>/g) ?? []
  for (const block of blocks) {
    const linkMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/)
      ?? block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/)
    if (!linkMatch) {
      continue
    }

    const text = decodeHtml(stripTags(block)).trim()
    const title = decodeHtml(stripTags(linkMatch[2])).trim()
    const url = decodeHtml(linkMatch[1]).trim()
    const snippet = text.replace(title, "").replace(/百度快照|查看详情/g, "").trim().slice(0, 180)
    if (title && url && !title.includes("百度一下")) {
      results.push({ title, url, snippet })
    }
  }
  return results
}
function parseDuckDuckGoResults(html: string): WebTariffSearchResult[] {
  const results: WebTariffSearchResult[] = []
  const blocks = html.match(/<div[^>]+class=["'][^"']*result[^"']*["'][\s\S]*?<\/div>\s*<\/div>/g) ?? []
  for (const block of blocks) {
    const linkMatch = block.match(/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/)
    if (!linkMatch) {
      continue
    }
    const snippetMatch = block.match(/<a[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/a>/)
      ?? block.match(/<div[^>]+class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/div>/)
    const title = decodeHtml(stripTags(linkMatch[2])).trim()
    const url = normalizeDuckUrl(decodeHtml(linkMatch[1]).trim())
    const snippet = decodeHtml(stripTags(snippetMatch?.[1] ?? "")).trim()
    if (title && url) {
      results.push({ title, url, snippet })
    }
  }
  return results
}

function parseResultBlock(block: string): WebTariffSearchResult | null {
  const linkMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/)
  if (!linkMatch) {
    return null
  }

  const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/)
    ?? block.match(/<div[^>]+class=["'][^"']*b_caption[^"']*["'][\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/)
  const title = decodeHtml(stripTags(linkMatch[2])).trim()
  const url = decodeHtml(linkMatch[1]).trim()
  const snippet = decodeHtml(stripTags(snippetMatch?.[1] ?? "")).trim()
  if (!title || !url || url.startsWith("#") || url.includes("javascript:")) {
    return null
  }

  return { title, url, snippet }
}

async function extractFactsFromResultPages(results: WebTariffSearchResult[]): Promise<WebTariffSearchResult[]> {
  const facts: WebTariffSearchResult[] = []
  const candidates = results
    .filter((item) => /^https?:\/\//.test(item.url))
    .filter((item) => !/bing\.com|baidu\.com\/s|duckduckgo\.com/.test(item.url))
    .slice(0, 4)

  for (const item of candidates) {
    try {
      const response = await fetch(item.url, {
        timeout: 10,
        headers: {
          "User-Agent": "Mozilla/5.0 AppleWebKit/605.1.15 Mobile Safari/604.1",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
      })
      if (!response.ok) {
        continue
      }
      const html = await response.text()
      const extracted = extractTariffFactsFromHtml(html, item.url, `网页提取：${item.title}`)
      facts.push(...extracted)
      if (facts.length >= 3) {
        break
      }
    } catch {
      // Ignore pages that block bots or fail to load.
    }
  }

  return facts
}

function extractTariffFactsFromHtml(html: string, url: string, title: string): WebTariffSearchResult[] {
  const text = decodeHtml(stripTags(html)).replace(/\s+/g, " ")
  const keywordIndex = findFirstKeywordIndex(text, ["第一档", "第二档", "第三档", "峰", "谷", "阶梯电价", "居民生活用电"])
  if (keywordIndex < 0) {
    return []
  }

  const start = Math.max(0, keywordIndex - 80)
  const snippetSource = text.slice(start, keywordIndex + 520)
  const facts = extractTariffFacts(snippetSource)
  if (facts.length === 0) {
    return []
  }

  return [{
    title,
    url,
    snippet: facts.join("；"),
  }]
}

function extractTariffFacts(text: string) {
  const facts: string[] = []
  const patterns = [
    /第一档[^。；，,、]*?(\d+(?:\.\d+)?)\s*(?:元\/度|元\/千瓦时|元|分\/千瓦时|分)/,
    /第二档[^。；，,、]*?(\d+(?:\.\d+)?)\s*(?:元\/度|元\/千瓦时|元|分\/千瓦时|分)/,
    /第三档[^。；，,、]*?(\d+(?:\.\d+)?)\s*(?:元\/度|元\/千瓦时|元|分\/千瓦时|分)/,
    /高峰[^。；，,、]*?(\d+(?:\.\d+)?)\s*(?:元\/度|元\/千瓦时|元|分\/千瓦时|分)/,
    /平段[^。；，,、]*?(\d+(?:\.\d+)?)\s*(?:元\/度|元\/千瓦时|元|分\/千瓦时|分)/,
    /低谷[^。；，,、]*?(\d+(?:\.\d+)?)\s*(?:元\/度|元\/千瓦时|元|分\/千瓦时|分)/,
    /合表[^。；，,、]*?(\d+(?:\.\d+)?)\s*(?:元\/度|元\/千瓦时|元|分\/千瓦时|分)/,
  ]

  for (const pattern of patterns) {
    const matched = text.match(pattern)
    if (matched?.[0]) {
      facts.push(matched[0].replace(/\s+/g, " ").trim())
    }
  }

  if (facts.length === 0) {
    const fallback = text.match(/(?:\d+(?:\.\d+)?\s*(?:元\/度|元\/千瓦时|元|分\/千瓦时|分).{0,24}){2,}/)
    if (fallback?.[0]) {
      facts.push(fallback[0].replace(/\s+/g, " ").trim())
    }
  }

  return Array.from(new Set(facts)).slice(0, 8)
}

function findFirstKeywordIndex(text: string, keywords: string[]) {
  let index = -1
  for (const keyword of keywords) {
    const found = text.indexOf(keyword)
    if (found >= 0 && (index < 0 || found < index)) {
      index = found
    }
  }
  return index
}

function dedupeSearchResults(results: WebTariffSearchResult[]) {
  const seen = new Set<string>()
  const deduped: WebTariffSearchResult[] = []
  for (const item of results) {
    const key = item.url.replace(/^https?:\/\/(www\.)?/, "").split(/[?#]/)[0]
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(item)
  }
  return deduped
}

function normalizeDuckUrl(url: string) {
  const matched = url.match(/[?&]uddg=([^&]+)/)
  return matched ? decodeURIComponent(matched[1]) : url
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function centToYuan(value: number) {
  return value / 100
}

export type TariffExtractionResult = {
  text: string
  facts: string[]
  priceCount: number
  ignoredLineCount: number
}

export type TariffOCRCandidate = {
  content: string
  confidence: number
  boundingBox: {
    x: number
    y: number
    width: number
    height: number
  }
}

export type TariffExtractionOptions = {
  candidates?: TariffOCRCandidate[]
  accountAddress?: string
}

type PriceUnit = "yuan" | "cent"

type SpatialRow = {
  blocks: TariffOCRCandidate[]
  centerY: number
  height: number
  text: string
}

const CATEGORY_PATTERN = /(第\s*[一二三123]\s*档|[一二三123]\s*档|尖峰|高峰|峰段|平段|低谷|谷段|深谷|合表(?:电价)?)/
const GENERAL_TARIFF_PATTERN = /(居民(?:生活)?电价|农业(?:生产)?电价|一般工商业电价)/
const REGION_PATTERN = /[\u4e00-\u9fa5]{2,20}(?:自治县|市|区|县)/
const NOISE_PATTERN = /(扫码|扫一扫|公众号|客服|电话|服务热线|仅供参考|第\s*\d+\s*页|共\s*\d+\s*页|缴费户号|客户名称|应缴金额|电费账单|本月账单|电费余额|欠费|合计金额|发票|二维码|https?:|www\.|有限责任公司|发布日期|执行日期|温馨提示|版权)/i
const EXPLICIT_PRICE_PATTERN = /([0-9]+(?:\.[0-9]{1,8})?)\s*(元|分)\s*\/\s*(度|千瓦时|kwh)/ig
const TIME_RANGE_PATTERN = /([0-2]?\d)\s*[:：]\s*([0-5]\d)\s*[-—~至]\s*([0-2]?\d)\s*[:：]\s*([0-5]\d)/
const USAGE_RANGE_PATTERN = /(\d+)\s*[-—~至]\s*(\d+)\s*(?:度|千瓦时)/
const USAGE_ABOVE_PATTERN = /(\d+)\s*(?:度|千瓦时)\s*(?:以上|及以上)/

export function extractTariffInformation(
  rawText: string,
  options: TariffExtractionOptions = {},
): TariffExtractionResult {
  const candidates = options.candidates?.filter((item) => item.content.trim() && item.confidence >= 0.15) ?? []
  if (candidates.length > 0) {
    const spatialResult = extractSpatialTariffs(candidates, options.accountAddress)
    if (spatialResult.facts.length > 0) {
      return spatialResult
    }
  }

  return extractTextTariffs(rawText)
}

function extractSpatialTariffs(candidates: TariffOCRCandidate[], accountAddress?: string): TariffExtractionResult {
  const rows = reconstructSpatialRows(candidates)
  const documentText = rows.map((row) => row.text).join("\n")
  const documentUnit = detectDocumentUnit(documentText)
  if (!documentUnit) {
    return emptyResult(rows.length)
  }

  const deliveredHeader = candidates.find((item) => /到户电价/.test(normalizeTariffLine(item.content)))
  const deliveredX = deliveredHeader ? horizontalCenter(deliveredHeader) : null
  const regionBlocks = candidates.filter((item) => isRegionRow(normalizeTariffLine(item.content)))
  const targetRegionBlocks = accountAddress
    ? regionBlocks.filter((item) => addressMatchesRegion(accountAddress, item.content))
    : []
  const spatialTargetRegionBlocks = targetRegionBlocks.filter((item) => item.boundingBox.height >= 0.03)
  const hasTargetRegion = targetRegionBlocks.length > 0 || (Boolean(accountAddress) && rows.some(
    (row) => isRegionRow(row.text) && addressMatchesRegion(accountAddress!, row.text),
  ))
  const variantBlocks = candidates.filter((item) => {
    const normalized = normalizeTariffLine(item.content)
    return item.boundingBox.height >= 0.03
      && Boolean(extractVariant(normalized))
      && !extractCategory(normalized)
  })

  const facts: string[] = []
  const factKeys = new Set<string>()
  const usedRows = new Set<number>()
  let activeRegion = !hasTargetRegion
  let currentRegion = ""
  let currentVariant = ""

  rows.forEach((row, index) => {
    if (isRegionRow(row.text)) {
      currentRegion = cleanRegionLabel(row.text)
      currentVariant = ""
      activeRegion = hasTargetRegion ? addressMatchesRegion(accountAddress!, row.text) : true
      return
    }

    const variant = extractVariant(row.text)
    if (variant && !extractCategory(row.text)) {
      currentVariant = variant
      return
    }

    const isInsideTargetRegion = spatialTargetRegionBlocks.length > 0
      ? spatialTargetRegionBlocks.some((block) => rowIsInsideBlock(row, block))
      : activeRegion
    if (!isInsideTargetRegion) {
      return
    }

    const category = extractCategory(row.text)
    if (!category) {
      return
    }

    const price = selectSpatialPrice(row, documentUnit, deliveredX)
    if (price == null) {
      return
    }

    const spatialVariant = variantBlocks.length > 0
      ? variantForRow(row, variantBlocks)
      : ""
    const prefix = hasTargetRegion
      ? spatialVariant || (variantBlocks.length === 0 ? currentVariant : "")
      : [currentRegion, currentVariant].filter(Boolean).join(" ")
    const fact = buildFact(row.text, price, prefix)
    addFact(facts, factKeys, fact)
    usedRows.add(index)
  })

  return resultFromFacts(facts, Math.max(0, rows.length - usedRows.size))
}

function reconstructSpatialRows(candidates: TariffOCRCandidate[]) {
  const sorted = [...candidates].sort((left, right) => {
    const vertical = verticalCenter(right) - verticalCenter(left)
    return Math.abs(vertical) > 0.001 ? vertical : left.boundingBox.x - right.boundingBox.x
  })
  const rows: SpatialRow[] = []

  for (const block of sorted) {
    const centerY = verticalCenter(block)
    const row = rows.find((item) => {
      const tolerance = Math.max(item.height, groupingHeight(block.boundingBox.height), 0.008) * 0.7
      return Math.abs(item.centerY - centerY) <= tolerance
    })

    if (row) {
      row.blocks.push(block)
      const count = row.blocks.length
      row.centerY = ((row.centerY * (count - 1)) + centerY) / count
      row.height = Math.max(row.height, groupingHeight(block.boundingBox.height))
    } else {
      rows.push({ blocks: [block], centerY, height: groupingHeight(block.boundingBox.height), text: "" })
    }
  }

  return rows
    .sort((left, right) => right.centerY - left.centerY)
    .map((row) => {
      row.blocks.sort((left, right) => left.boundingBox.x - right.boundingBox.x)
      row.text = normalizeTariffLine(row.blocks.map((item) => item.content).join(" "))
      return row
    })
}

function extractTextTariffs(rawText: string): TariffExtractionResult {
  const lines = rawText
    .split(/\r?\n/)
    .map(normalizeTariffLine)
    .filter(Boolean)
  const documentUnit = detectDocumentUnit(lines.join("\n"))
  const facts: string[] = []
  const factKeys = new Set<string>()
  const usedIndexes = new Set<number>()

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (NOISE_PATTERN.test(line) || !isTariffAnchor(line)) {
      continue
    }

    const parts = [line]
    const partIndexes = [index]
    let fact = factFromText(parts.join(" "), documentUnit)

    for (let offset = 1; !fact && offset <= 3 && index + offset < lines.length; offset += 1) {
      const next = lines[index + offset]
      if (NOISE_PATTERN.test(next)) {
        continue
      }
      if (CATEGORY_PATTERN.test(next) && !hasUsablePrice(parts.join(" "), documentUnit)) {
        break
      }
      parts.push(next)
      partIndexes.push(index + offset)
      fact = factFromText(parts.join(" "), documentUnit)
    }

    if (!fact) {
      continue
    }

    addFact(facts, factKeys, fact)
    partIndexes.forEach((partIndex) => usedIndexes.add(partIndex))
  }

  return resultFromFacts(facts, Math.max(0, lines.length - usedIndexes.size))
}

function factFromText(value: string, documentUnit: PriceUnit | null) {
  const normalized = normalizeTariffLine(value)
  if (NOISE_PATTERN.test(normalized) || !extractCategory(normalized)) {
    return null
  }

  const explicitPrices = explicitPricesIn(normalized)
  const price = explicitPrices.length > 0
    ? explicitPrices[explicitPrices.length - 1]
    : documentUnit
      ? lastImplicitPrice(normalized, documentUnit)
      : null
  if (price == null) {
    return null
  }

  return buildFact(normalized, price)
}

function selectSpatialPrice(row: SpatialRow, unit: PriceUnit, deliveredX: number | null) {
  const numericBlocks = row.blocks
    .map((block) => ({ block, value: standaloneNumber(block.content, unit) }))
    .filter((item): item is { block: TariffOCRCandidate; value: number } => item.value != null)

  if (numericBlocks.length === 0) {
    return lastImplicitPrice(row.text, unit)
  }
  if (deliveredX == null) {
    return numericBlocks[numericBlocks.length - 1].value
  }

  const closest = [...numericBlocks].sort(
    (left, right) => Math.abs(horizontalCenter(left.block) - deliveredX) - Math.abs(horizontalCenter(right.block) - deliveredX),
  )[0]
  return Math.abs(horizontalCenter(closest.block) - deliveredX) <= 0.16
    ? closest.value
    : numericBlocks[numericBlocks.length - 1].value
}

function buildFact(source: string, price: number, prefix = "") {
  const category = extractCategory(source)
  if (!category) {
    return null
  }
  const usageRange = extractUsageRange(source)
  const timeRange = extractTimeRange(source)
  return [prefix, category, usageRange, timeRange, `${formatPrice(price)} 元/度`]
    .filter(Boolean)
    .join(" ")
}

function extractCategory(value: string) {
  const normalized = normalizeTariffLine(value)
  const tier = normalized.match(/第?\s*([一二三123])\s*档/)
  if (tier) {
    return `第${normalizeTier(tier[1])}档`
  }
  if (/尖峰/.test(normalized)) return "尖峰"
  if (/高峰|峰段/.test(normalized) || /^峰(?:\s|$)/.test(normalized)) return "高峰"
  if (/平段/.test(normalized) || /^平(?:\s|$)/.test(normalized)) return "平段"
  if (/深谷/.test(normalized)) return "深谷"
  if (/低谷|谷段/.test(normalized) || /^谷(?:\s|$)/.test(normalized)) return "低谷"
  if (/合表/.test(normalized)) return "合表"
  const general = normalized.match(GENERAL_TARIFF_PATTERN)
  return general?.[1] ?? null
}

function extractUsageRange(value: string) {
  const range = value.match(USAGE_RANGE_PATTERN)
  if (range) {
    return `${range[1]}-${range[2]} 千瓦时`
  }
  const above = value.match(USAGE_ABOVE_PATTERN)
  return above ? `${above[1]} 千瓦时以上` : ""
}

function extractTimeRange(value: string) {
  const range = value.match(TIME_RANGE_PATTERN)
  if (!range) {
    return ""
  }
  return `${range[1].padStart(2, "0")}:${range[2]}-${range[3].padStart(2, "0")}:${range[4]}`
}

function explicitPricesIn(value: string) {
  const prices: number[] = []
  EXPLICIT_PRICE_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = EXPLICIT_PRICE_PATTERN.exec(value)) != null) {
    const normalized = normalizePrice(Number(match[1]), match[2] === "元" ? "yuan" : "cent")
    if (normalized != null) {
      prices.push(normalized)
    }
  }
  return prices
}

function lastImplicitPrice(value: string, unit: PriceUnit) {
  const withoutRanges = value
    .replace(TIME_RANGE_PATTERN, " ")
    .replace(USAGE_RANGE_PATTERN, " ")
    .replace(USAGE_ABOVE_PATTERN, " ")
    .replace(/第?\s*[一二三123]\s*档/g, " ")
  const numbers = [...withoutRanges.matchAll(/\b([0-9]+(?:\.[0-9]{1,8})?)\b/g)]
    .map((match) => normalizePrice(Number(match[1]), unit))
    .filter((price): price is number => price != null)
  return numbers.length > 0 ? numbers[numbers.length - 1] : null
}

function standaloneNumber(value: string, unit: PriceUnit) {
  const normalized = normalizeTariffLine(value)
  const match = normalized.match(/^([0-9]+(?:\.[0-9]{1,8})?)$/)
  return match ? normalizePrice(Number(match[1]), unit) : null
}

function normalizePrice(value: number, unit: PriceUnit) {
  if (!Number.isFinite(value)) {
    return null
  }
  const yuan = unit === "cent" ? value / 100 : value
  return yuan >= 0.01 && yuan <= 10 ? yuan : null
}

function detectDocumentUnit(value: string): PriceUnit | null {
  const normalized = normalizeTariffLine(value)
  if (/分\s*\/\s*(?:度|千瓦时|kwh)/i.test(normalized)) return "cent"
  if (/元\s*\/\s*(?:度|千瓦时|kwh)/i.test(normalized)) return "yuan"
  return null
}

function isTariffAnchor(value: string) {
  return Boolean(extractCategory(value))
}

function hasUsablePrice(value: string, unit: PriceUnit | null) {
  return explicitPricesIn(value).length > 0 || (unit != null && lastImplicitPrice(value, unit) != null)
}

function isRegionRow(value: string) {
  return REGION_PATTERN.test(value)
    && !CATEGORY_PATTERN.test(value)
    && !/[0-9]+(?:\.[0-9]+)?/.test(value)
    && !/(电价|价目表|收费标准)/.test(value)
}

function addressMatchesRegion(address: string, regionText: string) {
  const addressKey = normalizePlace(address)
  return regionText
    .split(/[、,，/\s]+/)
    .map(normalizePlace)
    .filter((item) => item.length >= 2)
    .some((item) => addressKey.includes(item))
}

function normalizePlace(value: string) {
  return value
    .replace(/壮族|瑶族|苗族|侗族|回族|土家族|自治/g, "")
    .replace(/[省市区县]/g, "")
    .replace(/[^\u4e00-\u9fa5]/g, "")
}

function cleanRegionLabel(value: string) {
  return normalizeTariffLine(value).replace(/\s+/g, "")
}

function extractVariant(value: string) {
  if (/专变/.test(value)) return "专变"
  if (/公变/.test(value)) return "公变"
  return ""
}

function normalizeTariffLine(value: string) {
  return value
    .trim()
    .replace(/[／⁄]/g, "/")
    .replace(/[：﹕]/g, " ")
    .replace(/[—~至]/g, "-")
    .replace(/([0-9])[，,]([0-9]{2,8})(?=\s*(?:元|分|$))/g, "$1.$2")
    .replace(/(?:O|o|〇)(?=\s*\.)/g, "0")
    .replace(/第\s*([一二三123])\s*档/g, "第$1档")
    .replace(/([0-9]+(?:\.[0-9]{1,8})?)\s*(元|分)\s*\/\s*(度|千瓦时|kwh)/ig, "$1 $2/$3")
    .replace(/\s+/g, " ")
    .trim()
}

function normalizeTier(value: string) {
  return ({ "1": "一", "2": "二", "3": "三" } as Record<string, string>)[value] ?? value
}

function formatPrice(value: number) {
  return value.toFixed(8).replace(/0+$/, "").replace(/\.$/, "")
}

function addFact(facts: string[], keys: Set<string>, fact: string | null) {
  if (!fact) {
    return
  }
  const key = compactKey(fact)
  if (!keys.has(key)) {
    keys.add(key)
    facts.push(fact)
  }
}

function resultFromFacts(facts: string[], ignoredLineCount: number): TariffExtractionResult {
  return {
    text: facts.join("\n"),
    facts,
    priceCount: facts.length,
    ignoredLineCount,
  }
}

function emptyResult(ignoredLineCount: number): TariffExtractionResult {
  return resultFromFacts([], ignoredLineCount)
}

function horizontalCenter(candidate: TariffOCRCandidate) {
  return candidate.boundingBox.x + (candidate.boundingBox.width / 2)
}

function verticalCenter(candidate: TariffOCRCandidate) {
  return candidate.boundingBox.y + (candidate.boundingBox.height / 2)
}

function groupingHeight(height: number) {
  return Math.min(height, 0.02)
}

function rowIsInsideBlock(row: SpatialRow, block: TariffOCRCandidate) {
  const lowerBound = block.boundingBox.y - 0.006
  const upperBound = block.boundingBox.y + block.boundingBox.height + 0.006
  return row.centerY >= lowerBound && row.centerY <= upperBound
}

function variantForRow(row: SpatialRow, blocks: TariffOCRCandidate[]) {
  const matches = blocks.filter((block) => rowIsInsideBlock(row, block))
  if (matches.length === 0) {
    return ""
  }
  matches.sort((left, right) => left.boundingBox.height - right.boundingBox.height)
  return extractVariant(matches[0].content)
}

function compactKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, "")
}

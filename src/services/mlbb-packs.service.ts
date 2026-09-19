import type { RovPack, RovPackCategory, RovPacksResponse } from '../types/rov'

export const MLBB_SHOPAPI_URL = 'https://shopapi.codashop.com/productPage'
export const MLBB_PRODUCT_PATH = '/th/mobile-legends'
export const MLBB_LOCALE = 'th-th'
export const MLBB_GVT_ID = 19
export const MLBB_SOURCE = `${MLBB_SHOPAPI_URL}?productPath=${MLBB_PRODUCT_PATH}`

export class MlbbUpstreamUnavailableError extends Error {
  constructor(message = 'Mobile Legends Codashop upstream unavailable') {
    super(message)
    this.name = 'MlbbUpstreamUnavailableError'
  }
}

export class MlbbInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Mobile Legends Codashop response') {
    super(message)
    this.name = 'MlbbInvalidUpstreamResponseError'
  }
}

type MlbbSkuPrices = {
  price?: number
  priceBeforeTax?: number
  strikethroughPrice?: number
  strikethroughPriceBeforeTax?: number
}

type MlbbSku = {
  Id?: string
  SkuName?: string
  SkuSubtitle?: string
  Status?: string
  SortOrderId?: number
  SkuCategoryId?: number
  SkuCategoryUuid?: string
  pricing?: {
    currency?: string
    skuPrices?: MlbbSkuPrices
  }
}

type MlbbSkuCategory = {
  Id?: number
  Name?: string
  Title?: string
  SortOrder?: number
  SkuCategoryUuid?: string
}

type MlbbProductPage = {
  productInfo?: {
    id?: number
    gvtId?: number
    name?: string
    shortName?: string
    thumbnailUrl?: string
  }
  skus?: MlbbSku[]
  skuCategories?: MlbbSkuCategory[]
  errorCode?: number
  errorMessage?: string
}

function parseDiamondAmounts(name: string, subtitle: string): {
  base: number
  bonus: number
  total: number
} {
  const totalMatch = name.match(/([\d,]+)\s*Diamonds/i)
  const total = totalMatch ? Number(totalMatch[1].replace(/,/g, '')) : 0
  const parts = subtitle.match(/\(([\d,]+)\s*\+\s*([\d,]+)/)
  if (parts) {
    const base = Number(parts[1].replace(/,/g, ''))
    const bonus = Number(parts[2].replace(/,/g, ''))
    if (Number.isFinite(base) && Number.isFinite(bonus)) {
      return { base, bonus, total: total || base + bonus }
    }
  }
  return { base: total, bonus: 0, total }
}

function fullListPrice(sku: MlbbSku): number | null {
  const strike = sku.pricing?.skuPrices?.strikethroughPriceBeforeTax
  if (typeof strike === 'number' && Number.isFinite(strike) && strike > 0) {
    return strike
  }
  return null
}

function isActiveSku(sku: MlbbSku): boolean {
  return (sku.Status || '').toUpperCase() === 'ACTIVE'
}

function mapPack(sku: MlbbSku, id: number): RovPack | null {
  const price = fullListPrice(sku)
  if (price === null) return null
  const name = sku.SkuName?.trim() || sku.Id || `Pack ${id}`
  const subtitle = sku.SkuSubtitle?.trim() || ''
  const amounts = parseDiamondAmounts(name, subtitle)
  return {
    id,
    name,
    baseItemAmount: amounts.base,
    bonusItemAmount: amounts.bonus,
    totalItemAmount: amounts.total,
    price,
    currency: sku.pricing?.currency || 'THB'
  }
}

function toResponse(data: MlbbProductPage): RovPacksResponse {
  const categoriesMeta = [...(data.skuCategories || [])].sort(
    (a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0)
  )
  const activeSkus = (data.skus || [])
    .filter(isActiveSku)
    .sort(
      (a, b) =>
        (a.SkuCategoryId ?? 0) - (b.SkuCategoryId ?? 0) ||
        (a.SortOrderId ?? 0) - (b.SortOrderId ?? 0)
    )

  let nextId = 1
  const categories: RovPackCategory[] = []

  if (categoriesMeta.length > 0) {
    for (const category of categoriesMeta) {
      const uuid = category.SkuCategoryUuid
      const packs = activeSkus
        .filter((sku) => sku.SkuCategoryUuid === uuid)
        .map((sku) => mapPack(sku, nextId++))
        .filter((pack): pack is RovPack => pack !== null)

      if (packs.length === 0) continue

      categories.push({
        id: (category.Id ?? categories.length) + 1,
        name: category.Title || category.Name || `Category ${category.Id}`,
        status: 0,
        message:
          'Live Codashop TH list prices (strikethroughPriceBeforeTax, no discount)',
        packCount: packs.length,
        packs
      })
    }
  }

  // Fallback: any active SKUs not covered by categories (or no categories)
  const categorizedUuids = new Set(
    categoriesMeta.map((c) => c.SkuCategoryUuid).filter(Boolean)
  )
  const leftovers = activeSkus.filter(
    (sku) => !sku.SkuCategoryUuid || !categorizedUuids.has(sku.SkuCategoryUuid)
  )
  if (leftovers.length > 0 || categories.length === 0) {
    const packs = (categories.length === 0 ? activeSkus : leftovers)
      .map((sku) => mapPack(sku, nextId++))
      .filter((pack): pack is RovPack => pack !== null)
    if (packs.length > 0) {
      categories.push({
        id: categories.length + 1,
        name: 'Codashop TH',
        status: 0,
        message:
          'Live Codashop TH list prices (strikethroughPriceBeforeTax, no discount)',
        packCount: packs.length,
        packs
      })
    }
  }

  const packCount = categories.reduce((sum, c) => sum + c.packCount, 0)
  if (packCount === 0) {
    throw new MlbbInvalidUpstreamResponseError('No active MLBB packs found')
  }

  const info = data.productInfo
  return {
    game: {
      id: info?.gvtId ?? MLBB_GVT_ID,
      slug: 'mobile-legends',
      name: info?.shortName || info?.name || 'Mobile Legends: Bang Bang',
      itemName: 'Diamonds',
      itemIcon: info?.thumbnailUrl || ''
    },
    categories,
    summary: {
      categoryCount: categories.length,
      packCount
    },
    fetchedAt: new Date().toISOString(),
    source: MLBB_SOURCE
  }
}

export async function fetchMlbbCodashopPacks(options?: {
  signal?: AbortSignal
}): Promise<RovPacksResponse> {
  let response: Response
  try {
    response = await fetch(MLBB_SHOPAPI_URL, {
      method: 'POST',
      signal: options?.signal ?? AbortSignal.timeout(20_000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: 'https://www.codashop.com',
        Referer: 'https://www.codashop.com/th-th/mobile-legends',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
        'X-SESSION-COUNTRY2NAME': 'TH',
        'X-WHITELABEL-ID': '0'
      },
      body: JSON.stringify({
        productPath: MLBB_PRODUCT_PATH,
        locale: MLBB_LOCALE,
        whitelabelId: 0
      })
    })
  } catch {
    throw new MlbbUpstreamUnavailableError()
  }

  if (!response.ok) {
    throw new MlbbUpstreamUnavailableError()
  }

  let data: MlbbProductPage
  try {
    data = (await response.json()) as MlbbProductPage
  } catch {
    throw new MlbbInvalidUpstreamResponseError('Response is not JSON')
  }

  if (data.errorCode) {
    throw new MlbbInvalidUpstreamResponseError(
      data.errorMessage || `Shop API error ${data.errorCode}`
    )
  }

  if (!Array.isArray(data.skus) || data.skus.length === 0) {
    throw new MlbbInvalidUpstreamResponseError('Missing skus array')
  }

  return toResponse(data)
}

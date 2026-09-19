import type { RovPack, RovPackCategory, RovPacksResponse } from '../types/rov'

export const HEARTOPIA_XD_APP_ID = 2085001
export const HEARTOPIA_XD_GAME_ID = 2085001
export const HEARTOPIA_XD_SLUG = 'heartopia'

export const HEARTOPIA_XD_API_BASE =
  'https://xdsdk-intnl-6.xd.com/product/v1/query/game/products'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export function buildHeartopiaXdUrl(region: 'TH' | 'DF'): string {
  const url = new URL(HEARTOPIA_XD_API_BASE)
  url.searchParams.set('appId', String(HEARTOPIA_XD_APP_ID))
  url.searchParams.set('region', region)
  url.searchParams.set('serverId', 'global-release')
  url.searchParams.set('lang', 'th_TH')
  url.searchParams.set('source', 'webpay')
  url.searchParams.set('pt', 'Linux')
  return url.toString()
}

export const HEARTOPIA_XD_TH_URL = buildHeartopiaXdUrl('TH')
export const HEARTOPIA_XD_USD_URL = buildHeartopiaXdUrl('DF')

export class HeartopiaXdUpstreamUnavailableError extends Error {
  constructor(message = 'Heartopia XD upstream unavailable') {
    super(message)
    this.name = 'HeartopiaXdUpstreamUnavailableError'
  }
}

export class HeartopiaXdInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Heartopia XD response') {
    super(message)
    this.name = 'HeartopiaXdInvalidUpstreamResponseError'
  }
}

type XdSku = {
  productSkuCode?: string
  productSkuName?: string
  currency?: string
  region?: string
  costPrice?: number
  salePrice?: number
  weight?: number
}

type XdProductGroup = {
  productId?: string
  productName?: string
  products?: XdSku[]
}

type XdApiResponse = {
  code?: number
  data?: XdProductGroup[]
}

type FlatSku = {
  productId: string
  productName: string
  productSkuCode: string
  productSkuName: string
  costPrice: number
  salePrice: number | null
  weight: number
}

/** Stable positive int from productSkuCode (RovPack.id is number). */
export function skuCodeToId(sku: string): number {
  let h = 2166136261
  for (let i = 0; i < sku.length; i++) {
    h ^= sku.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const id = h >>> 0
  return id === 0 ? 1 : id
}

/**
 * Parse diamond amounts from names like `20 Heart Diamond` or `300+20 Heart Diamond`.
 * Membership / gift boxes without a leading amount return zeros.
 */
export function parseDiamondAmounts(name: string): {
  baseItemAmount: number
  bonusItemAmount: number
  totalItemAmount: number
} {
  const bonusMatch = name.match(/^(\d+)\+(\d+)\b/)
  if (bonusMatch) {
    const base = Number(bonusMatch[1])
    const bonus = Number(bonusMatch[2])
    return {
      baseItemAmount: base,
      bonusItemAmount: bonus,
      totalItemAmount: base + bonus
    }
  }
  const plain = name.match(/^(\d+)\b/)
  if (plain && /Heart\s*Diamond/i.test(name)) {
    const base = Number(plain[1])
    return {
      baseItemAmount: base,
      bonusItemAmount: 0,
      totalItemAmount: base
    }
  }
  return { baseItemAmount: 0, bonusItemAmount: 0, totalItemAmount: 0 }
}

function flattenGroups(data: XdProductGroup[]): FlatSku[] {
  const out: FlatSku[] = []
  for (const group of data) {
    const productName = (group.productName ?? '').trim() || 'Unknown'
    const productId = String(group.productId ?? productName)
    const products = Array.isArray(group.products) ? group.products : []
    for (const sku of products) {
      const productSkuCode = (sku.productSkuCode ?? '').trim()
      const productSkuName = (sku.productSkuName ?? '').trim()
      const costPrice = Number(sku.costPrice)
      if (!productSkuCode || !Number.isFinite(costPrice)) continue
      const saleRaw = sku.salePrice
      const salePrice =
        saleRaw === undefined || saleRaw === null
          ? null
          : Number.isFinite(Number(saleRaw))
            ? Number(saleRaw)
            : null
      out.push({
        productId,
        productName,
        productSkuCode,
        productSkuName: productSkuName || productSkuCode,
        costPrice,
        salePrice,
        weight: Number.isFinite(Number(sku.weight)) ? Number(sku.weight) : 0
      })
    }
  }
  return out
}

function parseXdBody(body: unknown, label: string): FlatSku[] {
  if (!body || typeof body !== 'object') {
    throw new HeartopiaXdInvalidUpstreamResponseError(
      label + ' response is not an object'
    )
  }
  const parsed = body as XdApiResponse
  if (parsed.code !== 200) {
    throw new HeartopiaXdInvalidUpstreamResponseError(
      label + ' returned code ' + String(parsed.code)
    )
  }
  if (!Array.isArray(parsed.data)) {
    throw new HeartopiaXdInvalidUpstreamResponseError(
      label + ' missing data array'
    )
  }
  const flat = flattenGroups(parsed.data)
  if (flat.length === 0) {
    throw new HeartopiaXdInvalidUpstreamResponseError(
      label + ' has no product SKUs'
    )
  }
  return flat
}

async function fetchXdRegion(
  url: string,
  signal?: AbortSignal
): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  let response: Response
  try {
    response = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(20_000),
      headers: {
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
        'User-Agent': BROWSER_UA,
        Referer: 'https://www.xd.com/',
        Origin: 'https://www.xd.com'
      }
    })
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : 'network error'
    }
  }

  if (!response.ok) {
    return { ok: false, reason: 'HTTP ' + response.status }
  }

  try {
    const body = await response.json()
    return { ok: true, body }
  } catch {
    return { ok: false, reason: 'not JSON' }
  }
}

function mergeAndBuild(
  thSkus: FlatSku[],
  usdByCode: Map<string, FlatSku> | null,
  sources: { thb: string; usd: string | null }
): RovPacksResponse {
  const notes: string[] = [
    'FULL prices always use costPrice from XD (never salePrice, never FX).',
    'THB from region=TH; USD from region=DF; merge key = productSkuCode.'
  ]

  // Preserve upstream group order from TH response
  const groupOrder: string[] = []
  const groupMeta = new Map<
    string,
    { productId: string; productName: string; packs: FlatSku[] }
  >()

  for (const sku of thSkus) {
    if (!groupMeta.has(sku.productId)) {
      groupOrder.push(sku.productId)
      groupMeta.set(sku.productId, {
        productId: sku.productId,
        productName: sku.productName,
        packs: []
      })
    }
    groupMeta.get(sku.productId)!.packs.push(sku)
  }

  const categories: RovPackCategory[] = []
  let packCount = 0

  groupOrder.forEach((productId, index) => {
    const group = groupMeta.get(productId)!
    const packs: RovPack[] = group.packs
      .slice()
      .sort((a, b) => b.weight - a.weight || a.costPrice - b.costPrice)
      .map((th) => {
        const amounts = parseDiamondAmounts(th.productSkuName)
        const issues: string[] = []

        if (th.salePrice !== null && th.salePrice !== th.costPrice) {
          issues.push(
            'salePrice=' +
              th.salePrice +
              ' ignored; full THB=costPrice=' +
              th.costPrice
          )
        }

        let priceUsd: number | null = null
        let priceUsdSource: string | null = null

        if (usdByCode === null) {
          issues.push('USD region fetch failed; price_usd left null (no FX)')
        } else {
          const usd = usdByCode.get(th.productSkuCode)
          if (!usd) {
            issues.push(
              'No USD SKU for productSkuCode=' +
                th.productSkuCode +
                ' (no FX)'
            )
          } else {
            priceUsd = usd.costPrice
            priceUsdSource = 'xd'
            if (usd.salePrice !== null && usd.salePrice !== usd.costPrice) {
              issues.push(
                'salePrice=' +
                  usd.salePrice +
                  ' ignored; full USD=costPrice=' +
                  usd.costPrice
              )
            }
          }
        }

        return {
          id: skuCodeToId(th.productSkuCode),
          name: th.productSkuName,
          baseItemAmount: amounts.baseItemAmount,
          bonusItemAmount: amounts.bonusItemAmount,
          totalItemAmount: amounts.totalItemAmount,
          price: th.costPrice,
          currency: 'THB',
          price_thb: th.costPrice,
          price_usd: priceUsd,
          prices: { THB: th.costPrice, USD: priceUsd },
          price_thb_source: 'xd',
          price_usd_source: priceUsdSource,
          ...(issues.length > 0 ? { issues } : {})
        } satisfies RovPack
      })

    packCount += packs.length
    categories.push({
      id: index + 1,
      name: group.productName,
      status: 0,
      message: '',
      packCount: packs.length,
      packs
    })
  })

  return {
    game: {
      id: HEARTOPIA_XD_GAME_ID,
      slug: HEARTOPIA_XD_SLUG,
      name: 'Heartopia',
      itemName: 'Heart Diamond',
      itemIcon: ''
    },
    categories,
    summary: {
      categoryCount: categories.length,
      packCount
    },
    fetchedAt: new Date().toISOString(),
    source: sources.thb,
    sources,
    notes
  }
}

/**
 * Live Heartopia packs from XD guest product API (no login).
 * Fetches TH + USD (region=DF) in parallel, merges by productSkuCode.
 * ALWAYS uses costPrice as FULL; never invents FX.
 */
export async function fetchHeartopiaXdPacks(options?: {
  signal?: AbortSignal
  /** Inject parsed JSON bodies for unit tests (skips live fetch). */
  thJson?: unknown
  usdJson?: unknown | null
}): Promise<RovPacksResponse> {
  const thUrl = HEARTOPIA_XD_TH_URL
  const usdUrl = HEARTOPIA_XD_USD_URL

  let thBody: unknown
  let usdBody: unknown | null
  let usdFetchFailed = false

  if (options && 'thJson' in (options ?? {})) {
    thBody = options!.thJson
    if ('usdJson' in options!) {
      if (options!.usdJson === null) {
        usdBody = null
        usdFetchFailed = true
      } else {
        usdBody = options!.usdJson
      }
    } else {
      usdBody = null
      usdFetchFailed = true
    }
  } else {
    const [thResult, usdResult] = await Promise.all([
      fetchXdRegion(thUrl, options?.signal),
      fetchXdRegion(usdUrl, options?.signal)
    ])

    if (!thResult.ok) {
      throw new HeartopiaXdUpstreamUnavailableError(
        'TH region: ' + thResult.reason
      )
    }
    thBody = thResult.body

    if (!usdResult.ok) {
      usdFetchFailed = true
      usdBody = null
    } else {
      usdBody = usdResult.body
    }
  }

  const thSkus = parseXdBody(thBody, 'TH')

  let usdByCode: Map<string, FlatSku> | null = null
  if (!usdFetchFailed && usdBody !== null && usdBody !== undefined) {
    try {
      const usdSkus = parseXdBody(usdBody, 'USD')
      usdByCode = new Map(usdSkus.map((s) => [s.productSkuCode, s]))
    } catch {
      // Treat invalid USD as fetch failure for sources.usd=null; still serve THB.
      usdFetchFailed = true
      usdByCode = null
    }
  }

  return mergeAndBuild(thSkus, usdByCode, {
    thb: thUrl,
    usd: usdFetchFailed ? null : usdUrl
  })
}

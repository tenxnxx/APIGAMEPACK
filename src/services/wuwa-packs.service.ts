import type { RovPack, RovPackCategory, RovPacksResponse } from '../types/rov'

export const WUWA_APP_ID = 1460000975
export const WUWA_SLUG = 'wuthering-waves'
export const WUWA_SHELVES_API =
  'https://www.midasbuy.com/frontend/api/midasbuy/v1/shelves/query'
export const WUWA_MIDASBUY_TH_SOURCE =
  'https://www.midasbuy.com/midasbuy/th/shop/wuwa'
export const WUWA_MIDASBUY_US_SOURCE =
  'https://www.midasbuy.com/midasbuy/us/shop/wuwa'

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'

export class WuwaUpstreamUnavailableError extends Error {
  constructor(message = 'Wuthering Waves Midasbuy upstream unavailable') {
    super(message)
    this.name = 'WuwaUpstreamUnavailableError'
  }
}

export class WuwaInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Wuthering Waves Midasbuy response') {
    super(message)
    this.name = 'WuwaInvalidUpstreamResponseError'
  }
}

type MidasPrice = {
  amount?: string | number
  display_amount?: string | number
  currency?: string
  payment_channel_id?: string
  discount_rate?: string
}

type MidasProduct = {
  product_id?: string
  name?: string
  product_type?: string
  game_coins_num?: number
  prices?: MidasPrice[]
}

export type WuwaFlatPack = {
  productId: string
  name: string
  baseItemAmount: number
  bonusItemAmount: number
  totalItemAmount: number
  price: number
  currency: string
}

function toNumber(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return NaN
  return Number(String(value).replace(/,/g, ''))
}

/**
 * Full/list price: prefer display_amount when present (>0), else amount.
 * WuWa shelves currently set display_amount=0 so amount is the list price.
 */
export function fullPrice(price: MidasPrice): number {
  const display = toNumber(price.display_amount)
  const amount = toNumber(price.amount)
  if (Number.isFinite(display) && display > 0) return display
  if (Number.isFinite(amount) && amount > 0) return amount
  return NaN
}

function pickPrice(product: MidasProduct): MidasPrice | null {
  const prices = product.prices || []
  if (!prices.length) return null

  let best: MidasPrice | null = null
  let bestFull = -1
  for (const row of prices) {
    const value = fullPrice(row)
    if (Number.isFinite(value) && value > bestFull) {
      best = row
      bestFull = value
    }
  }
  return best
}

/** Parse base Lunites from names like "60 Lunites" / "300 Lunites". */
export function parseLuniteBase(name: string): number {
  const match = name.trim().match(/^(\d+)\s*Lunites?\b/i)
  if (!match) return NaN
  return Number(match[1])
}

/** Stable positive int id from product_id (RovPack.id is number). */
export function productIdToNumericId(productId: string): number {
  const payMatch = productId.match(/\.pay(\d+)$/i)
  if (payMatch) {
    const n = Number(payMatch[1])
    if (Number.isFinite(n) && n > 0) return n
  }
  let h = 2166136261
  for (let i = 0; i < productId.length; i++) {
    h ^= productId.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const id = h >>> 0
  return id === 0 ? 1 : id
}

export function flattenGameCoins(body: unknown, label: string): WuwaFlatPack[] {
  if (!body || typeof body !== 'object') {
    throw new WuwaInvalidUpstreamResponseError(label + ' response is not an object')
  }
  const products = (body as { shelf?: { products?: MidasProduct[] } }).shelf
    ?.products
  if (!Array.isArray(products) || products.length === 0) {
    throw new WuwaInvalidUpstreamResponseError(label + ' empty shelf products')
  }

  const out: WuwaFlatPack[] = []
  for (const product of products) {
    if (product.product_type && product.product_type !== 'GameCoins') continue
    const productId = (product.product_id || '').trim()
    if (!productId) continue
    const priceRow = pickPrice(product)
    if (!priceRow) continue
    const price = fullPrice(priceRow)
    if (!Number.isFinite(price) || price <= 0) continue

    const name = (product.name || '').trim() || productId
    const total = Number(product.game_coins_num)
    const baseFromName = parseLuniteBase(name)
    const base = Number.isFinite(baseFromName)
      ? baseFromName
      : Number.isFinite(total) && total > 0
        ? total
        : 0
    const totalItem = Number.isFinite(total) && total > 0 ? total : base
    const bonus = Math.max(0, totalItem - base)
    const currency = (priceRow.currency || '').toUpperCase() || 'THB'

    out.push({
      productId,
      name,
      baseItemAmount: base,
      bonusItemAmount: bonus,
      totalItemAmount: totalItem,
      price,
      currency
    })
  }

  if (out.length === 0) {
    throw new WuwaInvalidUpstreamResponseError(
      label + ' has no GameCoins Lunites packs'
    )
  }
  return out
}

async function warmShopPage(url: string, signal?: AbortSignal): Promise<void> {
  try {
    await fetch(url, {
      signal: signal ?? AbortSignal.timeout(15_000),
      headers: {
        Accept: 'text/html',
        'User-Agent': BROWSER_UA
      }
    })
  } catch {
    // shelves may still work without a warm page hit
  }
}

async function fetchShelfRegion(
  region: 'TH' | 'US',
  language: string,
  referer: string,
  signal?: AbortSignal
): Promise<{ ok: true; body: unknown } | { ok: false; reason: string }> {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: 'https://www.midasbuy.com',
    Referer: referer,
    'User-Agent': BROWSER_UA
  }

  let response: Response
  try {
    response = await fetch(WUWA_SHELVES_API, {
      method: 'POST',
      signal: signal ?? AbortSignal.timeout(25_000),
      headers,
      body: JSON.stringify({
        app_id: String(WUWA_APP_ID),
        client_ver: 'android',
        is_vip_product: true,
        language,
        product_types: ['GameCoins'],
        region,
        server_id: '1',
        shop_code: 'midasbuy'
      })
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
  thPacks: WuwaFlatPack[],
  usdByProductId: Map<string, WuwaFlatPack> | null,
  sources: { thb: string; usd: string | null },
  notes: string[]
): RovPacksResponse {
  const ordered = thPacks
    .slice()
    .sort(
      (a, b) =>
        a.baseItemAmount - b.baseItemAmount ||
        a.price - b.price ||
        a.productId.localeCompare(b.productId)
    )

  const packs: RovPack[] = ordered.map((th) => {
    const issues: string[] = []
    let priceUsd: number | null = null
    let priceUsdSource: string | null = null

    if (usdByProductId === null) {
      issues.push('USD region fetch failed; price_usd left null (no FX)')
    } else {
      const usd = usdByProductId.get(th.productId)
      if (!usd) {
        issues.push(
          'No USD product for product_id=' + th.productId + ' (no FX)'
        )
      } else {
        priceUsd = usd.price
        priceUsdSource = 'midasbuy'
      }
    }

    return {
      id: productIdToNumericId(th.productId),
      name: th.name,
      baseItemAmount: th.baseItemAmount,
      bonusItemAmount: th.bonusItemAmount,
      totalItemAmount: th.totalItemAmount,
      price: th.price,
      currency: 'THB',
      price_thb: th.price,
      price_usd: priceUsd,
      prices: { THB: th.price, USD: priceUsd },
      price_thb_source: 'midasbuy',
      price_usd_source: priceUsdSource,
      ...(issues.length > 0 ? { issues } : {})
    } satisfies RovPack
  })

  const category: RovPackCategory = {
    id: 1,
    name: 'Midasbuy Lunites (full price)',
    status: 0,
    message:
      'Live GameCoins shelf from Midasbuy — price uses original/list (display_amount when >0, else amount)',
    packCount: packs.length,
    packs
  }

  return {
    game: {
      id: WUWA_APP_ID,
      slug: WUWA_SLUG,
      name: 'Wuthering Waves',
      itemName: 'Lunites',
      itemIcon: ''
    },
    categories: [category],
    summary: {
      categoryCount: 1,
      packCount: packs.length
    },
    fetchedAt: new Date().toISOString(),
    source: sources.thb,
    sources,
    notes
  }
}

/**
 * Live Wuthering Waves Lunites packs from Midasbuy shelves (no login).
 * Fetches TH + US in parallel, merges by product_id.
 * FULL price = display_amount when >0 else amount; never invents FX or catalogs.
 */
export async function fetchWutheringWavesMidasbuyPacks(options?: {
  signal?: AbortSignal
  /** Inject parsed JSON bodies for unit tests (skips live fetch). */
  thJson?: unknown
  usdJson?: unknown | null
}): Promise<RovPacksResponse> {
  const notes: string[] = [
    'FULL prices use display_amount when >0, else amount (WuWa list amount).',
    'THB from region=TH; USD from region=US; merge key = product_id.'
  ]

  let thBody: unknown
  let usdBody: unknown | null
  let usdFetchFailed = false

  if (options && 'thJson' in options) {
    thBody = options.thJson
    if ('usdJson' in options) {
      if (options.usdJson === null) {
        usdBody = null
        usdFetchFailed = true
      } else {
        usdBody = options.usdJson
      }
    } else {
      usdBody = null
      usdFetchFailed = true
    }
  } else {
    await Promise.all([
      warmShopPage(WUWA_MIDASBUY_TH_SOURCE, options?.signal),
      warmShopPage(WUWA_MIDASBUY_US_SOURCE, options?.signal)
    ])

    const [thResult, usdResult] = await Promise.all([
      fetchShelfRegion('TH', 'th', WUWA_MIDASBUY_TH_SOURCE, options?.signal),
      fetchShelfRegion('US', 'en', WUWA_MIDASBUY_US_SOURCE, options?.signal)
    ])

    if (!thResult.ok) {
      throw new WuwaUpstreamUnavailableError('TH region: ' + thResult.reason)
    }
    thBody = thResult.body

    if (!usdResult.ok) {
      usdFetchFailed = true
      usdBody = null
      notes.push('USD region fetch failed: ' + usdResult.reason)
    } else {
      usdBody = usdResult.body
    }
  }

  const thPacks = flattenGameCoins(thBody, 'TH')

  let usdByProductId: Map<string, WuwaFlatPack> | null = null
  if (!usdFetchFailed && usdBody !== null && usdBody !== undefined) {
    try {
      const usdPacks = flattenGameCoins(usdBody, 'USD')
      usdByProductId = new Map(usdPacks.map((p) => [p.productId, p]))
    } catch (error) {
      usdFetchFailed = true
      usdByProductId = null
      notes.push(
        'USD parse failed: ' +
          (error instanceof Error ? error.message : 'unknown')
      )
    }
  }

  if (usdByProductId === null) {
    notes.push('USD unavailable; price_usd null (no FX, no static fallback)')
  }

  return mergeAndBuild(thPacks, usdByProductId, {
    thb: WUWA_MIDASBUY_TH_SOURCE,
    usd: usdFetchFailed ? null : WUWA_MIDASBUY_US_SOURCE
  }, notes)
}

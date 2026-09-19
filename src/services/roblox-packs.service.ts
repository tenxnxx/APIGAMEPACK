import type { RovPack, RovPackCategory, RovPacksResponse } from '../types/rov'

export const ROBLOX_GAME_ID = 1
export const ROBLOX_SLUG = 'roblox'
export const ROBLOX_PRODUCTS_URL =
  'https://premiumfeatures.roblox.com/v1/products'
/** Jina Reader transport — used only when direct geo lacks USD (Thai egress). */
export const ROBLOX_PRODUCTS_USD_TRANSPORT_URL =
  'https://r.jina.ai/https://premiumfeatures.roblox.com/v1/products'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class RobloxUpstreamUnavailableError extends Error {
  constructor(message = 'Roblox premiumfeatures upstream unavailable') {
    super(message)
    this.name = 'RobloxUpstreamUnavailableError'
  }
}

export class RobloxInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Roblox premiumfeatures response') {
    super(message)
    this.name = 'RobloxInvalidUpstreamResponseError'
  }
}

type RobloxPriceCurrency = {
  currencyCode?: string
}

type RobloxPrice = {
  amount?: number
  usdAmount?: number
  currency?: RobloxPriceCurrency
}

type RobloxProduct = {
  productId?: number | string
  mobileProductId?: string
  robuxAmount?: number
  premiumFeatureTypeName?: string
  isSubscriptionOnly?: boolean
  defaultDisplayName?: string
  robuxProductName?: string
  price?: RobloxPrice
}

type RobloxProductsResponse = {
  products?: RobloxProduct[]
}

export type RobloxFlatPack = {
  productId: number
  mobileProductId: string
  robuxAmount: number
  name: string
  amount: number
  currencyCode: string
}

/** Extract a JSON object from plain JSON or Jina Reader markdown wrapper. */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed)
  }
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end <= start) {
    throw new Error('No JSON object found in body')
  }
  return JSON.parse(trimmed.slice(start, end + 1))
}

export function isRobuxProduct(product: RobloxProduct): boolean {
  if (product.isSubscriptionOnly === true) return false
  const typeName = (product.premiumFeatureTypeName ?? '').trim()
  if (typeName && typeName.toLowerCase() !== 'robux') return false
  const robux = Number(product.robuxAmount)
  return Number.isFinite(robux) && robux > 0
}

export function flattenRobuxProducts(body: unknown): RobloxFlatPack[] {
  if (!body || typeof body !== 'object') {
    throw new RobloxInvalidUpstreamResponseError('Response is not an object')
  }
  const parsed = body as RobloxProductsResponse
  if (!Array.isArray(parsed.products)) {
    throw new RobloxInvalidUpstreamResponseError('Missing products array')
  }

  const out: RobloxFlatPack[] = []
  for (const product of parsed.products) {
    if (!isRobuxProduct(product)) continue
    const productId = Number(product.productId)
    const robuxAmount = Number(product.robuxAmount)
    const amount = Number(product.price?.amount)
    const currencyCode = (
      product.price?.currency?.currencyCode ?? ''
    ).toUpperCase()
    if (!Number.isFinite(productId) || productId <= 0) continue
    if (!Number.isFinite(amount) || amount <= 0) continue
    if (currencyCode !== 'THB' && currencyCode !== 'USD') continue

    const mobileProductId = (product.mobileProductId ?? '').trim()
    const name =
      (product.defaultDisplayName ?? '').trim() ||
      (product.robuxProductName ?? '').trim() ||
      `${robuxAmount} Robux`

    out.push({
      productId,
      mobileProductId: mobileProductId || String(productId),
      robuxAmount,
      name,
      amount,
      currencyCode
    })
  }

  if (out.length === 0) {
    throw new RobloxInvalidUpstreamResponseError('No Robux products found')
  }
  return out
}

function partitionByCurrency(packs: RobloxFlatPack[]): {
  thb: Map<number, RobloxFlatPack>
  usd: Map<number, RobloxFlatPack>
} {
  const thb = new Map<number, RobloxFlatPack>()
  const usd = new Map<number, RobloxFlatPack>()
  for (const pack of packs) {
    if (pack.currencyCode === 'THB') thb.set(pack.productId, pack)
    else if (pack.currencyCode === 'USD') usd.set(pack.productId, pack)
  }
  return { thb, usd }
}

async function fetchProductsBody(
  url: string,
  signal?: AbortSignal
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const isJinaTransport = url.includes('r.jina.ai/')
  // Jina Cloudflare challenges Chrome-like UAs with 403; prefer bare Accept +
  // X-Return-Format=text which returns clean Roblox JSON.
  const headers: Record<string, string> = isJinaTransport
    ? {
        Accept: '*/*',
        'X-Return-Format': 'text'
      }
    : {
        Accept: 'application/json, text/plain, */*',
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'en-US,en;q=0.9,th;q=0.8'
      }

  let response: Response
  try {
    response = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(25_000),
      headers
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
    const text = await response.text()
    return { ok: true, text }
  } catch {
    return { ok: false, reason: 'body read failed' }
  }
}

function mergeAndBuild(
  thbById: Map<number, RobloxFlatPack>,
  usdById: Map<number, RobloxFlatPack>,
  notes: string[]
): RovPacksResponse {
  const ordered = [...thbById.keys()].sort((a, b) => {
    const ra = thbById.get(a)!.robuxAmount
    const rb = thbById.get(b)!.robuxAmount
    return ra - rb || a - b
  })

  const packs: RovPack[] = ordered.map((productId) => {
    const th = thbById.get(productId)!
    const us = usdById.get(productId)
    const issues: string[] = []
    const priceUsd = us ? us.amount : null

    if (priceUsd === null) {
      issues.push('USD unavailable from upstream (no FX)')
    }

    return {
      id: productId,
      name: th.name,
      baseItemAmount: th.robuxAmount,
      bonusItemAmount: 0,
      totalItemAmount: th.robuxAmount,
      price: th.amount,
      currency: 'THB',
      price_thb: th.amount,
      price_usd: priceUsd,
      prices: { THB: th.amount, USD: priceUsd },
      price_thb_source: 'premiumfeatures',
      price_usd_source: us ? 'premiumfeatures' : null,
      ...(issues.length > 0 ? { issues } : {})
    } satisfies RovPack
  })

  const category: RovPackCategory = {
    id: 1,
    name: 'Robux Packages',
    status: 0,
    message:
      'Live Roblox premiumfeatures list prices (price.amount, full non-discount)',
    packCount: packs.length,
    packs
  }

  return {
    game: {
      id: ROBLOX_GAME_ID,
      slug: ROBLOX_SLUG,
      name: 'Roblox',
      itemName: 'Robux',
      itemIcon: ''
    },
    categories: [category],
    summary: {
      categoryCount: 1,
      packCount: packs.length
    },
    fetchedAt: new Date().toISOString(),
    source: ROBLOX_PRODUCTS_URL,
    sources: {
      thb: ROBLOX_PRODUCTS_URL,
      usd: usdById.size > 0 ? ROBLOX_PRODUCTS_URL : null
    },
    notes
  }
}

/**
 * Live Roblox Robux packs from premiumfeatures.roblox.com (no login).
 * Currency is geo-IP based. When direct response lacks USD, a second live
 * fetch via Jina Reader transport obtains the USD catalog from Roblox origin.
 * NEVER invents prices or uses a static catalog. THB is required (502 if missing).
 */
export async function fetchRobloxPacks(options?: {
  signal?: AbortSignal
  /** Inject parsed JSON for unit tests (skips live fetch). */
  directJson?: unknown
  usdJson?: unknown | null
}): Promise<RovPacksResponse> {
  const notes: string[] = [
    'FULL prices use price.amount from premiumfeatures (list price).',
    'Merge key = productId; filter premiumFeatureTypeName=Robux.'
  ]

  let thbById = new Map<number, RobloxFlatPack>()
  let usdById = new Map<number, RobloxFlatPack>()

  if (options && 'directJson' in options) {
    const directPacks = flattenRobuxProducts(options.directJson)
    const part = partitionByCurrency(directPacks)
    thbById = part.thb
    usdById = part.usd

    if (usdById.size === 0 && 'usdJson' in options) {
      if (options.usdJson === null) {
        notes.push('USD inject null; price_usd left null (no FX)')
      } else if (options.usdJson !== undefined) {
        const usdPacks = flattenRobuxProducts(options.usdJson)
        for (const p of usdPacks) {
          if (p.currencyCode === 'USD') usdById.set(p.productId, p)
        }
      }
    }
  } else {
    const direct = await fetchProductsBody(
      ROBLOX_PRODUCTS_URL,
      options?.signal
    )
    if (!direct.ok) {
      throw new RobloxUpstreamUnavailableError(
        'Direct products fetch failed: ' + direct.reason
      )
    }

    let directBody: unknown
    try {
      directBody = extractJsonObject(direct.text)
    } catch {
      throw new RobloxInvalidUpstreamResponseError(
        'Direct products body is not JSON'
      )
    }

    const directPacks = flattenRobuxProducts(directBody)
    const part = partitionByCurrency(directPacks)
    thbById = part.thb
    usdById = part.usd

    if (usdById.size === 0) {
      notes.push(
        'Direct geo lacked USD; attempting live USD via Jina Reader transport of Roblox origin'
      )
      const viaJina = await fetchProductsBody(
        ROBLOX_PRODUCTS_USD_TRANSPORT_URL,
        options?.signal
      )
      if (viaJina.ok) {
        try {
          const usdBody = extractJsonObject(viaJina.text)
          const usdPacks = flattenRobuxProducts(usdBody)
          for (const p of usdPacks) {
            if (p.currencyCode === 'USD') usdById.set(p.productId, p)
          }
          if (usdById.size === 0) {
            notes.push('Jina transport returned no USD Robux products')
          }
        } catch (error) {
          notes.push(
            'Jina USD parse failed: ' +
              (error instanceof Error ? error.message : 'unknown')
          )
        }
      } else {
        notes.push('Jina USD fetch failed: ' + viaJina.reason)
      }
    }
  }

  if (thbById.size === 0) {
    throw new RobloxUpstreamUnavailableError(
      'THB Robux products unavailable from upstream'
    )
  }

  if (usdById.size === 0) {
    notes.push('USD unavailable; price_usd null (no FX, no static fallback)')
  }

  return mergeAndBuild(thbById, usdById, notes)
}

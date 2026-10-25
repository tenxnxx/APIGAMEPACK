import type { RovPack, RovPacksResponse } from '../types/rov'
import { isFiniteNumber, isRecord } from '../lib/guards'

/**
 * Blood Strike (NetEase) — official NetEase GamesClub top-up center.
 * Live product catalog from the same JSON API the official page uses:
 *   https://pay.neteasegames.com/BloodStrike/topup
 * USD = product.price (currency USD); THB = extra.local_price.TH.default.
 * Never hardcodes prices; upstream failure -> throw (route maps to 502).
 */
export const BLOODSTRIKE_APP_ID = 1637059453
export const BLOODSTRIKE_SLUG = 'blood-strike'
export const BLOODSTRIKE_TOPUP_URL =
  'https://pay.neteasegames.com/BloodStrike/topup'
export const BLOODSTRIKE_PRODUCTS_API_URL =
  'https://pay.neteasegames.com/gameclub/products/bloodstrike?gc_client_version=1.13.55'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class BloodStrikeUpstreamUnavailableError extends Error {
  constructor(message = 'Blood Strike NetEase GamesClub upstream unavailable') {
    super(message)
    this.name = 'BloodStrikeUpstreamUnavailableError'
  }
}

export class BloodStrikeInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Blood Strike NetEase GamesClub response') {
    super(message)
    this.name = 'BloodStrikeInvalidUpstreamResponseError'
  }
}

type ParsedProduct = {
  goodsid: string
  name: string
  amount: number
  isPass: boolean
  priceUsd: number
  priceThb: number
}

function englishName(product: Record<string, unknown>): string | null {
  const ml = product.multi_language
  if (!isRecord(ml) || !isRecord(ml.default)) return null
  for (const lang of ['en-US', 'default']) {
    const entry = ml.default[lang]
    if (isRecord(entry) && typeof entry.goodsinfo === 'string' && entry.goodsinfo.trim()) {
      return entry.goodsinfo.trim()
    }
  }
  return null
}

function thbLocalPrice(extra: Record<string, unknown>): number | null {
  if (typeof extra.local_price !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(extra.local_price)
  } catch {
    return null
  }
  if (!isRecord(parsed) || !isRecord(parsed.TH) || !isRecord(parsed.TH.default)) return null
  const def = parsed.TH.default
  if (def.currency !== 'THB' || !isFiniteNumber(def.price)) return null
  return def.price
}

/**
 * Keep only permanent catalog items (what the official page lists):
 * permanent_display_flag === 1, status 1, USD base price, TH local price.
 * Time-limited events/deals and VN-only Funcard items are excluded.
 */
export function parseBloodStrikeProducts(payload: unknown): ParsedProduct[] {
  if (!isRecord(payload) || payload.code !== '0000' || !Array.isArray(payload.data)) {
    throw new BloodStrikeInvalidUpstreamResponseError('Unexpected products payload')
  }
  const seen = new Set<string>()
  const out: ParsedProduct[] = []
  for (const product of payload.data) {
    if (!isRecord(product) || !isRecord(product.extra)) continue
    if (product.permanent_display_flag !== 1 || product.status !== 1) continue
    if (product.currency !== 'USD' || typeof product.goodsid !== 'string') continue
    if (seen.has(product.goodsid)) continue
    const priceUsd = Number(product.price)
    const priceThb = thbLocalPrice(product.extra)
    const name = englishName(product) ?? String(product.goodsinfo ?? '')
    if (!Number.isFinite(priceUsd) || priceThb === null || !name) continue
    seen.add(product.goodsid)
    const goldMatch = product.goodsid.match(/gold(\d+)/i)
    out.push({
      goodsid: product.goodsid,
      name,
      amount: goldMatch ? Number(goldMatch[1]) : 0,
      isPass: /pass/i.test(product.goodsid),
      priceUsd,
      priceThb
    })
  }
  return out
}

function toPack(p: ParsedProduct, index: number): RovPack {
  return {
    id: p.amount > 0 ? p.amount : 900000 + index,
    name: p.name,
    baseItemAmount: p.amount,
    bonusItemAmount: 0,
    totalItemAmount: p.amount,
    price: p.priceThb,
    currency: 'THB',
    price_thb: p.priceThb,
    price_usd: p.priceUsd,
    prices: { THB: p.priceThb, USD: p.priceUsd },
    price_thb_source: 'netease-gameclub',
    price_usd_source: 'netease-gameclub'
  }
}

function toResponse(products: ParsedProduct[]): RovPacksResponse {
  const byUsd = (a: ParsedProduct, b: ParsedProduct) => a.priceUsd - b.priceUsd
  const gold = products.filter((p) => !p.isPass).sort(byUsd).map(toPack)
  const passes = products.filter((p) => p.isPass).sort(byUsd).map((p, i) => toPack(p, i))
  const categories = [
    {
      id: 1,
      name: 'Gold',
      status: 0,
      message: 'Live from NetEase GamesClub official top-up (no fallback)',
      packCount: gold.length,
      packs: gold
    },
    {
      id: 2,
      name: 'Strike Pass',
      status: 0,
      message: 'Live from NetEase GamesClub official top-up (no fallback)',
      packCount: passes.length,
      packs: passes
    }
  ].filter((c) => c.packCount > 0)

  return {
    game: {
      id: BLOODSTRIKE_APP_ID,
      slug: BLOODSTRIKE_SLUG,
      name: 'Blood Strike',
      itemName: 'Gold',
      itemIcon: ''
    },
    categories,
    summary: {
      categoryCount: categories.length,
      packCount: gold.length + passes.length
    },
    fetchedAt: new Date().toISOString(),
    source: BLOODSTRIKE_TOPUP_URL,
    sources: {
      thb: BLOODSTRIKE_PRODUCTS_API_URL,
      usd: BLOODSTRIKE_PRODUCTS_API_URL
    },
    notes: [
      'Official NetEase GamesClub product API (same data as the official top-up page).',
      'USD = product base price; THB = local_price.TH.default (full list price, Thailand region).',
      'Only permanent catalog items; time-limited events/bonus promos excluded. bonusItemAmount not included.',
      'Live-fetch only; empty/unparseable upstream -> error (no static catalog).'
    ]
  }
}

export async function fetchBloodStrikePacks(options?: {
  signal?: AbortSignal
}): Promise<RovPacksResponse> {
  let response: Response
  try {
    response = await fetch(BLOODSTRIKE_PRODUCTS_API_URL, {
      signal: options?.signal ?? AbortSignal.timeout(25_000),
      headers: {
        Accept: 'application/json',
        Referer: BLOODSTRIKE_TOPUP_URL,
        'User-Agent': BROWSER_UA
      }
    })
  } catch (error) {
    throw new BloodStrikeUpstreamUnavailableError(
      error instanceof Error ? error.message : 'network error'
    )
  }
  if (!response.ok) {
    throw new BloodStrikeUpstreamUnavailableError('HTTP ' + response.status)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new BloodStrikeInvalidUpstreamResponseError('Non-JSON response')
  }

  const products = parseBloodStrikeProducts(payload)
  if (products.length === 0) {
    throw new BloodStrikeInvalidUpstreamResponseError('No permanent products found')
  }
  return toResponse(products)
}
import type { RovPack, RovPacksResponse } from '../types/rov'

export const PUBGM_MIDASBUY_SOURCE =
  'https://www.midasbuy.com/midasbuy/th/buy/pubgm'

export const PUBGM_SHELVES_API =
  'https://www.midasbuy.com/frontend/api/midasbuy/v1/shelves/query'

export const PUBGM_APP_ID = 1450015065

export class PubgmUpstreamUnavailableError extends Error {
  constructor(message = 'PUBG Mobile Midasbuy upstream unavailable') {
    super(message)
    this.name = 'PubgmUpstreamUnavailableError'
  }
}

export class PubgmInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid PUBG Mobile Midasbuy response') {
    super(message)
    this.name = 'PubgmInvalidUpstreamResponseError'
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

function toNumber(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return NaN
  return Number(String(value).replace(/,/g, ''))
}

/** Full/list price: prefer display_amount when present (>0), else amount. */
function fullPrice(price: MidasPrice): number {
  const display = toNumber(price.display_amount)
  const amount = toNumber(price.amount)
  if (Number.isFinite(display) && display > 0) return display
  if (Number.isFinite(amount) && amount > 0) return amount
  return NaN
}

function pickPrice(product: MidasProduct): MidasPrice | null {
  // Primary `prices` only — skip carrier collapsed rows.
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

function isMainVipUc(product: MidasProduct): boolean {
  if (!/^\d+_coins_vip$/.test(product.product_id || '')) return false
  if (product.product_type && product.product_type !== 'GameCoins') return false
  const coins = Number(product.game_coins_num)
  if (!Number.isFinite(coins) || coins <= 0) return false
  const price = pickPrice(product)
  if (!price) return false
  return Number.isFinite(fullPrice(price))
}

function mapProducts(products: MidasProduct[]): RovPack[] {
  return products
    .filter(isMainVipUc)
    .map((product, index) => {
      const price = pickPrice(product)!
      const base = Number(product.game_coins_num)
      const full = fullPrice(price)
      const idMatch = String(product.product_id).match(/^(\d+)_coins_vip$/)
      const id = idMatch ? Number(idMatch[1]) : index + 1
      return {
        id,
        name: `UC ${base}`,
        baseItemAmount: base,
        bonusItemAmount: 0,
        totalItemAmount: base,
        price: full,
        currency: price.currency || 'THB'
      } satisfies RovPack
    })
    .sort((a, b) => a.baseItemAmount - b.baseItemAmount || a.price - b.price)
}

export async function fetchPubgMobileMidasbuyPacks(options?: {
  signal?: AbortSignal
}): Promise<RovPacksResponse> {
  const signal = options?.signal ?? AbortSignal.timeout(25_000)
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Origin: 'https://www.midasbuy.com',
    Referer: PUBGM_MIDASBUY_SOURCE,
    'User-Agent':
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
  }

  try {
    await fetch(PUBGM_MIDASBUY_SOURCE, {
      signal,
      headers: {
        Accept: 'text/html',
        'User-Agent': headers['User-Agent']
      }
    })
  } catch {
    // shelves may still work
  }

  let response: Response
  try {
    response = await fetch(PUBGM_SHELVES_API, {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify({
        app_id: String(PUBGM_APP_ID),
        client_ver: 'android',
        is_vip_product: true,
        language: 'th',
        product_types: ['GameCoins'],
        region: 'TH',
        server_id: '1',
        shop_code: 'midasbuy'
      })
    })
  } catch {
    throw new PubgmUpstreamUnavailableError()
  }

  if (!response.ok) throw new PubgmUpstreamUnavailableError()

  let body: { shelf?: { products?: MidasProduct[] } }
  try {
    body = (await response.json()) as typeof body
  } catch {
    throw new PubgmInvalidUpstreamResponseError()
  }

  const products = body.shelf?.products
  if (!Array.isArray(products) || products.length === 0) {
    throw new PubgmInvalidUpstreamResponseError('empty shelf products')
  }

  const packs = mapProducts(products)
  if (packs.length === 0) {
    throw new PubgmInvalidUpstreamResponseError('no VIP UC packs in shelf')
  }

  return {
    game: {
      id: PUBGM_APP_ID,
      slug: 'pubg-mobile',
      name: 'PUBG Mobile',
      itemName: 'UC',
      itemIcon: ''
    },
    categories: [
      {
        id: 1,
        name: 'Midasbuy TH UC (full price)',
        status: 0,
        message:
          'Live VIP shelf from Midasbuy — price uses original/list (display_amount) when available',
        packCount: packs.length,
        packs
      }
    ],
    summary: {
      categoryCount: 1,
      packCount: packs.length
    },
    fetchedAt: new Date().toISOString(),
    source: PUBGM_MIDASBUY_SOURCE
  }
}
import type { RovPack, RovPacksResponse } from '../types/rov'

export const CLASH_OF_CRITTERS_STORE_SOURCE =
  'https://store.farlightgames.com/coc'

export const CLASH_OF_CRITTERS_API_BASE =
  'https://global-api.plutomall.com'

export const CLASH_OF_CRITTERS_GAME_ID = 10090
export const CLASH_OF_CRITTERS_APP_ID = 10088021
export const CLASH_OF_CRITTERS_CUSTOM_PATH = '/coc'

export class ClashOfCrittersUpstreamUnavailableError extends Error {
  constructor(message = 'Clash of Critters Farlight upstream unavailable') {
    super(message)
    this.name = 'ClashOfCrittersUpstreamUnavailableError'
  }
}

export class ClashOfCrittersInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Clash of Critters Farlight response') {
    super(message)
    this.name = 'ClashOfCrittersInvalidUpstreamResponseError'
  }
}

type FarlightProduct = {
  productId?: string | number
  price?: number
  currency?: string
  displayOrder?: number
  staticConfig?: string
}

type StaticConfig = {
  name?: string
  category?: string
  summary?: string
}

function parseBaseAmount(name: string): number {
  const match = name.match(/([\d,]+)\s*Ignis\s*Gems/i)
  if (!match) return 0
  return Number(match[1].replace(/,/g, ''))
}

function parseBonusAmount(summary: string): number {
  const match = summary.match(/\+\s*([\d,]+)\s*Extra/i)
  if (!match) return 0
  return Number(match[1].replace(/,/g, ''))
}

function currencyCode(raw?: string): string {
  if (!raw) return 'THB'
  const match = raw.match(/\(([A-Z]{3})\)/)
  return match?.[1] ?? (raw.includes('THB') ? 'THB' : raw)
}

function mapProducts(products: FarlightProduct[], source: string): RovPacksResponse {
  const packs: RovPack[] = products
    .map((product) => {
      let config: StaticConfig = {}
      if (product.staticConfig) {
        try {
          config = JSON.parse(product.staticConfig) as StaticConfig
        } catch {
          config = {}
        }
      }
      const name = config.name || `Ignis Gems ${product.productId}`
      const base = parseBaseAmount(name)
      const bonus = parseBonusAmount(config.summary || '')
      const id = Number(product.productId)
      const price = Number(product.price)
      if (!Number.isFinite(id) || !Number.isFinite(price)) return null
      return {
        id,
        name,
        baseItemAmount: base,
        bonusItemAmount: bonus,
        totalItemAmount: base + bonus,
        price,
        currency: currencyCode(product.currency)
      } satisfies RovPack
    })
    .filter((pack): pack is RovPack => pack !== null)
    .sort((a, b) => a.price - b.price || a.id - b.id)

  return {
    game: {
      id: CLASH_OF_CRITTERS_GAME_ID,
      slug: 'clash-of-critters',
      name: 'Clash of Critters',
      itemName: 'Ignis Gems',
      itemIcon: ''
    },
    categories: [
      {
        id: 1,
        name: 'Farlight Official Store (full price)',
        status: 0,
        message:
          'Live list/catalog price from guestProducts — excludes coupon/sale final',
        packCount: packs.length,
        packs
      }
    ],
    summary: {
      categoryCount: 1,
      packCount: packs.length
    },
    fetchedAt: new Date().toISOString(),
    source
  }
}

async function resolveMallId(signal?: AbortSignal): Promise<number> {
  const url = new URL(`${CLASH_OF_CRITTERS_API_BASE}/webpay/mall/detail`)
  url.searchParams.set('mallId', '0')
  url.searchParams.set('customPath', CLASH_OF_CRITTERS_CUSTOM_PATH)

  let response: Response
  try {
    response = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(15_000),
      headers: {
        Accept: 'application/json',
        Origin: 'https://store.farlightgames.com',
        Referer: CLASH_OF_CRITTERS_STORE_SOURCE,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      }
    })
  } catch {
    throw new ClashOfCrittersUpstreamUnavailableError('mall detail unavailable')
  }

  if (!response.ok) {
    throw new ClashOfCrittersUpstreamUnavailableError('mall detail unavailable')
  }

  let body: { code?: number; data?: { mallId?: number } }
  try {
    body = (await response.json()) as typeof body
  } catch {
    throw new ClashOfCrittersInvalidUpstreamResponseError('mall detail not JSON')
  }

  if (body.code === 0 && body.data?.mallId) return body.data.mallId
  throw new ClashOfCrittersInvalidUpstreamResponseError('mallId missing')
}

export async function fetchClashOfCrittersOfficialPacks(options?: {
  signal?: AbortSignal
}): Promise<RovPacksResponse> {
  const mallId = await resolveMallId(options?.signal)

  const url = new URL(
    `${CLASH_OF_CRITTERS_API_BASE}/webpay/product/guestProducts`
  )
  url.searchParams.set('mallId', String(mallId))
  url.searchParams.set('appId', String(CLASH_OF_CRITTERS_APP_ID))

  let response: Response
  try {
    response = await fetch(url, {
      signal: options?.signal ?? AbortSignal.timeout(20_000),
      headers: {
        Accept: 'application/json',
        Origin: 'https://store.farlightgames.com',
        Referer: CLASH_OF_CRITTERS_STORE_SOURCE,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      }
    })
  } catch {
    throw new ClashOfCrittersUpstreamUnavailableError()
  }

  if (!response.ok) {
    throw new ClashOfCrittersUpstreamUnavailableError()
  }

  let body: {
    code?: number
    data?: { productList?: FarlightProduct[]; currency?: string }
  }
  try {
    body = (await response.json()) as typeof body
  } catch {
    throw new ClashOfCrittersInvalidUpstreamResponseError()
  }

  const products = body.data?.productList
  if (body.code !== 0 || !Array.isArray(products) || products.length === 0) {
    throw new ClashOfCrittersInvalidUpstreamResponseError('empty productList')
  }

  const mapped = mapProducts(products, CLASH_OF_CRITTERS_STORE_SOURCE)
  if (mapped.summary.packCount === 0) {
    throw new ClashOfCrittersInvalidUpstreamResponseError('no mappable packs')
  }
  return mapped
}

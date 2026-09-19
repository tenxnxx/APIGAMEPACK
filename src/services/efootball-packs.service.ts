import type { RovPack, RovPacksResponse } from '../types/rov'

export const EFOOTBALL_CODASHOP_SOURCE =
  'https://efootball.codashop.com/th-th/efootball'

export const EFOOTBALL_GVT_ID = 317

export class EfootballUpstreamUnavailableError extends Error {
  constructor(message = 'eFootball Codashop upstream unavailable') {
    super(message)
    this.name = 'EfootballUpstreamUnavailableError'
  }
}

export class EfootballInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid eFootball Codashop response') {
    super(message)
    this.name = 'EfootballInvalidUpstreamResponseError'
  }
}

type ParsedIosPack = {
  id: number
  sku: string
  name: string
  base: number
  bonus: number
  price: number
}

function parseIosSection(html: string): ParsedIosPack[] {
  const sectionMatch = html.match(/>iOS<\/h2>([\s\S]*?)(?:<h2[^>]*>|$)/i)
  if (!sectionMatch) return []

  const section = sectionMatch[1]
  const cards = [
    ...section.matchAll(
      /capture-custom-sku-id="([^"]+)"[^>]*capture-custom-sku-name="([^"]+)"/g
    )
  ]
  const prices = [
    ...section.matchAll(/(?:\u0e3f|฿)\s*([\d,]+(?:\.\d+)?)/g)
  ].map((m) => Number(m[1].replace(/,/g, '')))

  if (cards.length === 0 || prices.length === 0 || cards.length !== prices.length) {
    return []
  }

  return cards.map((card, index) => {
    const sku = card[1]
    const name = card[2]
    const parts = sku.match(/coin_(\d+)_(\d+)_(\d+)_(\d+)/)
    const base = parts ? Number(parts[2]) : 0
    const bonus = parts ? Number(parts[3]) : 0
    return {
      id: index + 1,
      sku,
      name,
      base,
      bonus,
      price: prices[index]
    }
  })
}

function toResponse(packs: ParsedIosPack[], source: string): RovPacksResponse {
  const mapped: RovPack[] = packs.map((pack) => ({
    id: pack.id,
    name: pack.name || `eFootball Coin ${pack.base + pack.bonus}`,
    baseItemAmount: pack.base,
    bonusItemAmount: pack.bonus,
    totalItemAmount: pack.base + pack.bonus,
    price: pack.price,
    currency: 'THB'
  }))

  return {
    game: {
      id: EFOOTBALL_GVT_ID,
      slug: 'efootball',
      name: 'eFootball',
      itemName: 'eFootballT Coin',
      itemIcon: ''
    },
    categories: [
      {
        id: 1,
        name: 'Codashop TH iOS',
        status: 0,
        message: 'Live iOS packs from Codashop TH (no fallback)',
        packCount: mapped.length,
        packs: mapped
      }
    ],
    summary: {
      categoryCount: 1,
      packCount: mapped.length
    },
    fetchedAt: new Date().toISOString(),
    source
  }
}

export async function fetchEfootballIosPacks(options?: {
  signal?: AbortSignal
}): Promise<RovPacksResponse> {
  let response: Response
  try {
    response = await fetch(EFOOTBALL_CODASHOP_SOURCE, {
      signal: options?.signal ?? AbortSignal.timeout(20_000),
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8'
      }
    })
  } catch {
    throw new EfootballUpstreamUnavailableError()
  }

  if (!response.ok) {
    throw new EfootballUpstreamUnavailableError()
  }

  const html = await response.text()
  const parsed = parseIosSection(html)
  if (parsed.length === 0) {
    throw new EfootballInvalidUpstreamResponseError('iOS pack section not found')
  }

  return toResponse(parsed, EFOOTBALL_CODASHOP_SOURCE)
}
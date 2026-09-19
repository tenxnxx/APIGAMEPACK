import type { RovPack, RovPacksResponse } from '../types/rov'

export const LASTWAR_24BUYM_SOURCE =
  'https://www.24buym.com/topup/lastwarsurvival'

export const LASTWAR_24BUYM_GAME_ID = 24002

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Match pack names like `39 ฿ | 0.99 $` / `1990 ฿ | 49.99 $`.
 * Baht may appear as U+0E3F, Thai baht letters, or latin "baht".
 */
const PACKNAME_MARKED_RE =
  /(\d+(?:\.\d+)?)\s*(?:\u0E3F|\u0E1A\u0E32\u0E17|baht)\s*[|\uFF5C]?\s*(\d+(?:\.\d+)?)\s*\$/i

const PACKNAME_PIPE_RE =
  /(\d+(?:\.\d+)?)\s*[^\d|\uFF5C]*\s*[|\uFF5C]\s*(\d+(?:\.\d+)?)\s*\$/

export class LastWar24buymUpstreamUnavailableError extends Error {
  constructor(message = '24buym Last War upstream unavailable') {
    super(message)
    this.name = 'LastWar24buymUpstreamUnavailableError'
  }
}

export class LastWar24buymInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid 24buym Last War response') {
    super(message)
    this.name = 'LastWar24buymInvalidUpstreamResponseError'
  }
}

export type ParsedLastWar24buymPack = {
  id: number
  name: string
  /** Full listed THB from pack name (not data-price sale). */
  priceThb: number
  /** USD from pack name (never FX-invented). */
  priceUsd: number
  /** data-price attribute (sale amount). */
  dataPrice: number
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp('\\b' + name + '="([^"]*)"', 'i'))
  return match ? match[1] : null
}

/**
 * CRITICAL: FULL THB+USD from packname only.
 * data-price is SALE and must not be used as full THB.
 */
export function parseThbUsdFromPackname(
  name: string
): { priceThb: number; priceUsd: number } | null {
  const marked = name.match(PACKNAME_MARKED_RE) ?? name.match(PACKNAME_PIPE_RE)
  if (marked) {
    const priceThb = Number(marked[1])
    const priceUsd = Number(marked[2])
    if (Number.isFinite(priceThb) && Number.isFinite(priceUsd)) {
      return { priceThb, priceUsd }
    }
  }

  // Simpler fallback: first number = THB, number before $ = USD
  const usdMatch = name.match(/(\d+(?:\.\d+)?)\s*\$/)
  const thbMatch = name.match(/(\d+(?:\.\d+)?)/)
  if (!usdMatch || !thbMatch) return null
  if ((thbMatch.index ?? 0) >= (usdMatch.index ?? 0)) return null
  const priceThb = Number(thbMatch[1])
  const priceUsd = Number(usdMatch[1])
  if (!Number.isFinite(priceThb) || !Number.isFinite(priceUsd)) return null
  return { priceThb, priceUsd }
}

/**
 * Parse ALL pack cards from 24buym Last War Survival HTML via
 * data-id / data-price / data-packname.
 *
 * Pricing rules (critical):
 * - Full THB and USD always from pack name (`N currency | X.XX $`).
 * - data-price is the SALE amount and must NOT be used as full THB.
 * - Packs without parseable packname THB+USD are skipped.
 * - Never invent FX.
 */
export function parse24buymLastWarPacks(html: string): ParsedLastWar24buymPack[] {
  const cardTagRegex =
    /<div\b[^>]*\bclass="[^"]*\bcard-select-topup-multi\b[^"]*"[^>]*>/gi

  const packs: ParsedLastWar24buymPack[] = []
  const seen = new Set<number>()

  for (const match of html.matchAll(cardTagRegex)) {
    const tag = match[0]
    const idRaw = attr(tag, 'data-id')
    const priceRaw = attr(tag, 'data-price')
    const name = (attr(tag, 'data-packname') ?? '').trim()
    if (!idRaw || !priceRaw || !name) continue

    const id = Number(idRaw)
    const dataPrice = Number(String(priceRaw).replace(/,/g, '').trim())
    if (!Number.isFinite(id) || !Number.isFinite(dataPrice) || seen.has(id)) continue

    const prices = parseThbUsdFromPackname(name)
    if (!prices) continue

    seen.add(id)
    packs.push({
      id,
      name,
      priceThb: prices.priceThb,
      priceUsd: prices.priceUsd,
      dataPrice
    })
  }

  packs.sort((a, b) => a.id - b.id)
  return packs
}

export async function fetchLastWar24buymPacks(options?: {
  signal?: AbortSignal
  /** Inject HTML for unit tests (skips live 24buym fetch). */
  html?: string
}): Promise<RovPacksResponse> {
  let html = options?.html
  if (html === undefined) {
    let response: Response
    try {
      response = await fetch(LASTWAR_24BUYM_SOURCE, {
        signal: options?.signal ?? AbortSignal.timeout(20_000),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
          'User-Agent': BROWSER_UA,
          Referer: 'https://www.24buym.com/'
        }
      })
    } catch {
      throw new LastWar24buymUpstreamUnavailableError()
    }

    if (!response.ok) {
      throw new LastWar24buymUpstreamUnavailableError(
        '24buym returned HTTP ' + response.status
      )
    }

    try {
      html = await response.text()
    } catch {
      throw new LastWar24buymUpstreamUnavailableError()
    }
  }

  const parsed = parse24buymLastWarPacks(html)
  if (parsed.length === 0) {
    throw new LastWar24buymInvalidUpstreamResponseError(
      'No pack cards found in 24buym Last War HTML'
    )
  }

  const notes: string[] = [
    'All packs: full THB and USD taken from pack name; data-price is sale and is not used as full THB.',
    'No FX conversion; price_usd always from pack name when present.'
  ]

  const packs: RovPack[] = parsed.map((p) => {
    const issues: string[] = []
    if (p.dataPrice !== p.priceThb) {
      issues.push(
        'data-price=' +
          p.dataPrice +
          ' is sale; full THB=' +
          p.priceThb +
          ' taken from pack name'
      )
    }

    return {
      id: p.id,
      name: p.name,
      baseItemAmount: 0,
      bonusItemAmount: 0,
      totalItemAmount: 0,
      price: p.priceThb,
      currency: 'THB',
      price_thb: p.priceThb,
      price_usd: p.priceUsd,
      prices: { THB: p.priceThb, USD: p.priceUsd },
      price_thb_source: '24buym',
      price_usd_source: '24buym',
      ...(issues.length > 0 ? { issues } : {})
    }
  })

  return {
    game: {
      id: LASTWAR_24BUYM_GAME_ID,
      slug: 'lastwar-24buym',
      name: 'Last War',
      itemName: 'Gold Brick',
      itemIcon: ''
    },
    categories: [
      {
        id: 1,
        name: '24BUYM Last War',
        status: 0,
        message: '',
        packCount: packs.length,
        packs
      }
    ],
    summary: {
      categoryCount: 1,
      packCount: packs.length
    },
    fetchedAt: new Date().toISOString(),
    source: LASTWAR_24BUYM_SOURCE,
    sources: {
      thb: LASTWAR_24BUYM_SOURCE,
      // Always present (string | null). Successful Last War responses always have
      // packname USD, so usd is the page URL (never omitted).
      usd: LASTWAR_24BUYM_SOURCE
    },
    notes
  }
}

import type { RovPack, RovPacksResponse } from '../types/rov'

export const COOKIERUN_CLASSIC_24BUYM_SOURCE =
  'https://www.24buym.com/topup/cookierun-classic'

export const COOKIERUN_CLASSIC_24BUYM_GAME_ID = 24001

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** Match "N บาท (X.XX $)" / "N baht (X.XX $)" including UTF-8 Thai บาท. */
const BAHT_NAMED_PRICE_RE =
  /(\d+(?:\.\d+)?)\s*(?:\u0E1A\u0E32\u0E17|baht)\s*\(\s*(\d+(?:\.\d+)?)\s*\$?\s*\)/i

const DIAMOND_GP_RE =
  /(\d[\d,]*)\s*Diamond(?:\s*\+\s*(\d[\d,]*)\s*GP)?/i

export class CookieRunClassic24buymUpstreamUnavailableError extends Error {
  constructor(message = '24buym Cookie Run Classic upstream unavailable') {
    super(message)
    this.name = 'CookieRunClassic24buymUpstreamUnavailableError'
  }
}

export class CookieRunClassic24buymInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid 24buym Cookie Run Classic response') {
    super(message)
    this.name = 'CookieRunClassic24buymInvalidUpstreamResponseError'
  }
}

export type ParsedCrc24buymPack = {
  id: number
  name: string
  /** Full listed THB (from name when baht-named; else data-price). */
  priceThb: number
  /** USD from name when baht-named; otherwise null (never FX-invented). */
  priceUsd: number | null
  /** True when THB+USD were taken from pack name, not data-price. */
  pricesFromName: boolean
  /** data-price attribute (often a sale amount for baht-named packs). */
  dataPrice: number
  baseItemAmount: number
  bonusItemAmount: number
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))
  return match ? match[1] : null
}

function parseAmounts(name: string): { base: number; bonus: number } {
  const diamond = name.match(DIAMOND_GP_RE)
  if (diamond) {
    const base = Number(diamond[1].replace(/,/g, ''))
    const bonus = diamond[2] ? Number(diamond[2].replace(/,/g, '')) : 0
    return {
      base: Number.isFinite(base) ? base : 0,
      bonus: Number.isFinite(bonus) ? bonus : 0
    }
  }
  return { base: 0, bonus: 0 }
}

/**
 * Parse ALL pack cards from 24buym Cookie Run Classic HTML via
 * data-id / data-price / data-packname.
 *
 * Pricing rules (critical):
 * - If name embeds `N บาท (X.XX $)` → full THB=N and USD=X.XX from NAME.
 *   data-price is the SALE amount and must NOT be used as full THB.
 * - Else (Diamond / Party Run Pass) → price_thb=data-price, price_usd=null.
 *   Do NOT invent FX; do NOT call Century Games.
 */
export function parse24buymCookieRunClassicPacks(html: string): ParsedCrc24buymPack[] {
  const cardTagRegex =
    /<div\b[^>]*\bclass="[^"]*\bcard-select-topup-multi\b[^"]*"[^>]*>/gi

  const packs: ParsedCrc24buymPack[] = []
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

    const bahtNamed = name.match(BAHT_NAMED_PRICE_RE)
    let priceThb: number
    let priceUsd: number | null
    let pricesFromName: boolean

    if (bahtNamed) {
      priceThb = Number(bahtNamed[1])
      priceUsd = Number(bahtNamed[2])
      if (!Number.isFinite(priceThb) || !Number.isFinite(priceUsd)) continue
      pricesFromName = true
    } else {
      priceThb = dataPrice
      priceUsd = null
      pricesFromName = false
    }

    const { base, bonus } = parseAmounts(name)
    seen.add(id)
    packs.push({
      id,
      name,
      priceThb,
      priceUsd,
      pricesFromName,
      dataPrice,
      baseItemAmount: base,
      bonusItemAmount: bonus
    })
  }

  // Keep stable upstream / discovery order (by id ascending).
  packs.sort((a, b) => a.id - b.id)
  return packs
}

export async function fetchCookieRunClassic24buymPacks(options?: {
  signal?: AbortSignal
  /** Inject HTML for unit tests (skips live 24buym fetch). */
  html?: string
}): Promise<RovPacksResponse> {
  let html = options?.html
  if (html === undefined) {
    let response: Response
    try {
      response = await fetch(COOKIERUN_CLASSIC_24BUYM_SOURCE, {
        signal: options?.signal ?? AbortSignal.timeout(20_000),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
          'User-Agent': BROWSER_UA,
          Referer: 'https://www.24buym.com/'
        }
      })
    } catch {
      throw new CookieRunClassic24buymUpstreamUnavailableError()
    }

    if (!response.ok) {
      throw new CookieRunClassic24buymUpstreamUnavailableError(
        `24buym returned HTTP ${response.status}`
      )
    }

    try {
      html = await response.text()
    } catch {
      throw new CookieRunClassic24buymUpstreamUnavailableError()
    }
  }

  const parsed = parse24buymCookieRunClassicPacks(html)
  if (parsed.length === 0) {
    throw new CookieRunClassic24buymInvalidUpstreamResponseError(
      'No pack cards found in 24buym Cookie Run Classic HTML'
    )
  }

  const anyUsdFromName = parsed.some((p) => p.priceUsd !== null)
  const notes: string[] = [
    'Diamond / Party Run Pass: price_thb from data-price; price_usd=null (no FX, no Century Games).',
    'Baht-named packs: full THB and USD taken from pack name `N บาท (X.XX $)`; data-price is sale and is not used as full THB.'
  ]

  const packs: RovPack[] = parsed.map((p) => {
    const issues: string[] = []
    if (p.pricesFromName && p.dataPrice !== p.priceThb) {
      issues.push(
        `data-price=${p.dataPrice} is sale; full THB=${p.priceThb} taken from pack name`
      )
    }

    return {
      id: p.id,
      name: p.name,
      baseItemAmount: p.baseItemAmount,
      bonusItemAmount: p.bonusItemAmount,
      totalItemAmount: p.baseItemAmount + p.bonusItemAmount,
      price: p.priceThb,
      currency: 'THB',
      price_thb: p.priceThb,
      price_usd: p.priceUsd,
      prices: { THB: p.priceThb, USD: p.priceUsd },
      price_thb_source: '24buym',
      price_usd_source: p.priceUsd !== null ? '24buym' : null,
      ...(issues.length > 0 ? { issues } : {})
    }
  })

  return {
    game: {
      id: COOKIERUN_CLASSIC_24BUYM_GAME_ID,
      slug: 'cookierun-classic-24buym',
      name: 'Cookie Run Classic',
      itemName: 'Diamonds',
      itemIcon: ''
    },
    categories: [
      {
        id: 1,
        name: '24BUYM Cookie Run Classic',
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
    source: COOKIERUN_CLASSIC_24BUYM_SOURCE,
    sources: {
      thb: COOKIERUN_CLASSIC_24BUYM_SOURCE,
      // Always present: page URL when any pack got USD from name; else null
      usd: anyUsdFromName ? COOKIERUN_CLASSIC_24BUYM_SOURCE : null
    },
    notes
  }
}

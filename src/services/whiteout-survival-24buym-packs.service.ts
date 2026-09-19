import type { RovPack, RovPacksResponse } from '../types/rov'
import { fetchWhiteoutSurvivalOfficialPacks } from './whiteout-survival-packs.service'

export const WHITEOUT_SURVIVAL_24BUYM_SOURCE =
  'https://www.24buym.com/topup/whiteoutsurvival'

export const WHITEOUT_SURVIVAL_24BUYM_GAME_ID = 20121

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export class WhiteoutSurvival24buymUpstreamUnavailableError extends Error {
  constructor(message = '24buym Whiteout Survival upstream unavailable') {
    super(message)
    this.name = 'WhiteoutSurvival24buymUpstreamUnavailableError'
  }
}

export class WhiteoutSurvival24buymInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid 24buym Whiteout Survival response') {
    super(message)
    this.name = 'WhiteoutSurvival24buymInvalidUpstreamResponseError'
  }
}

export type Parsed24buymPack = {
  id: number
  name: string
  priceThb: number
  frostStars: number
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'i'))
  return match ? match[1] : null
}

/**
 * Parse ALL pack cards from 24buym HTML via data-id / data-price / data-packname.
 *
 * Verified on live HTML: data-price is the only listed THB on each card (cash-pay
 * display matches it). There is no separate original vs sale price attribute.
 * Page is THB-only (schema.org priceCurrency THB; no USD currency switch).
 */
export function parse24buymWhiteoutSurvivalPacks(html: string): Parsed24buymPack[] {
  const cardTagRegex =
    /<div\b[^>]*\bclass="[^"]*\bcard-select-topup-multi\b[^"]*"[^>]*>/gi

  const packs: Parsed24buymPack[] = []
  const seen = new Set<number>()

  for (const match of html.matchAll(cardTagRegex)) {
    const tag = match[0]
    const idRaw = attr(tag, 'data-id')
    const priceRaw = attr(tag, 'data-price')
    const name = (attr(tag, 'data-packname') ?? '').trim()
    if (!idRaw || !priceRaw || !name) continue

    const id = Number(idRaw)
    const priceThb = Number(String(priceRaw).replace(/,/g, '').trim())
    if (!Number.isFinite(id) || !Number.isFinite(priceThb) || seen.has(id)) continue

    const amountMatch = name.match(/(\d[\d,]*)\s*Frost\s*Star/i)
    if (!amountMatch) continue
    const frostStars = Number(amountMatch[1].replace(/,/g, ''))
    if (!Number.isFinite(frostStars) || frostStars <= 0) continue

    seen.add(id)
    packs.push({ id, name, priceThb, frostStars })
  }

  packs.sort((a, b) => a.frostStars - b.frostStars)
  return packs
}

function extractFrostStarsFromOfficialName(name: string, baseItemAmount: number): number {
  const match = name.match(/(\d[\d,]*)\s*Frost\s*Star/i)
  if (match) {
    const n = Number(match[1].replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0) return n
  }
  return baseItemAmount
}

type UsdLookup = Map<number, number | 'ambiguous'>

function buildOfficialUsdIndex(
  packs: Array<{ name: string; baseItemAmount: number; price: number; currency: string }>
): UsdLookup {
  const buckets = new Map<number, number[]>()
  for (const pack of packs) {
    if (pack.currency !== 'USD') continue
    const amount = extractFrostStarsFromOfficialName(pack.name, pack.baseItemAmount)
    if (!Number.isFinite(amount) || amount <= 0) continue
    const list = buckets.get(amount) ?? []
    list.push(pack.price)
    buckets.set(amount, list)
  }

  const index: UsdLookup = new Map()
  for (const [amount, prices] of buckets) {
    const unique = [...new Set(prices)]
    index.set(amount, unique.length === 1 ? unique[0] : 'ambiguous')
  }
  return index
}

export async function fetchWhiteoutSurvival24buymPacks(options?: {
  signal?: AbortSignal
  /** Inject HTML for unit tests (skips live 24buym fetch). */
  html?: string
  /** Inject official USD packs for unit tests (skips Century Games fetch). */
  officialUsdPacks?: Array<{
    name: string
    baseItemAmount: number
    price: number
    currency: string
  }>
}): Promise<RovPacksResponse> {
  let html = options?.html
  if (html === undefined) {
    let response: Response
    try {
      response = await fetch(WHITEOUT_SURVIVAL_24BUYM_SOURCE, {
        signal: options?.signal ?? AbortSignal.timeout(20_000),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
          'User-Agent': BROWSER_UA,
          Referer: 'https://www.24buym.com/'
        }
      })
    } catch {
      throw new WhiteoutSurvival24buymUpstreamUnavailableError()
    }

    if (!response.ok) {
      throw new WhiteoutSurvival24buymUpstreamUnavailableError(
        `24buym returned HTTP ${response.status}`
      )
    }

    try {
      html = await response.text()
    } catch {
      throw new WhiteoutSurvival24buymUpstreamUnavailableError()
    }
  }

  const parsed = parse24buymWhiteoutSurvivalPacks(html)
  if (parsed.length === 0) {
    throw new WhiteoutSurvival24buymInvalidUpstreamResponseError(
      'No Frost Star pack cards found in 24buym HTML'
    )
  }

  let usdIndex: UsdLookup = new Map()
  let usdFetchIssue: string | undefined
  let centurySource = 'https://store.centurygames.com/wos'

  if (options?.officialUsdPacks) {
    usdIndex = buildOfficialUsdIndex(options.officialUsdPacks)
    centurySource = 'https://cg-vip-mall-wos.centurygame.com/api/activity/packages_info'
  } else {
    try {
      const official = await fetchWhiteoutSurvivalOfficialPacks({
        signal: options?.signal,
        currency: 'USD'
      })
      centurySource = official.source
      const flat = official.categories.flatMap((c) => c.packs)
      usdIndex = buildOfficialUsdIndex(flat)
    } catch {
      usdFetchIssue =
        'Century Games USD secondary fetch failed; price_usd left null (no FX conversion)'
    }
  }

  const notes: string[] = [
    '24buym page is THB-only; data-price is the full listed THB (no separate sale/original on pack cards).',
    'USD prices come from live Century Games official WOS packs matched by Frost Star amount — not FX-converted from THB.'
  ]
  if (usdFetchIssue) notes.push(usdFetchIssue)

  const packs: RovPack[] = parsed.map((p) => {
    const lookup = usdIndex.get(p.frostStars)
    const issues: string[] = []
    let priceUsd: number | null = null
    let priceUsdSource: string | null = null

    if (lookup === undefined) {
      issues.push(
        `No Century Games USD pack matched for ${p.frostStars} Frost Stars; price_usd=null (no invented FX)`
      )
    } else if (lookup === 'ambiguous') {
      issues.push(
        `Multiple Century Games USD prices for ${p.frostStars} Frost Stars; price_usd=null (unreliable mapping)`
      )
    } else {
      priceUsd = lookup
      priceUsdSource = 'centurygames'
    }

    return {
      id: p.id,
      name: p.name,
      baseItemAmount: p.frostStars,
      bonusItemAmount: 0,
      totalItemAmount: p.frostStars,
      price: p.priceThb,
      currency: 'THB',
      price_thb: p.priceThb,
      price_usd: priceUsd,
      prices: { THB: p.priceThb, USD: priceUsd },
      price_thb_source: '24buym',
      price_usd_source: priceUsdSource,
      ...(issues.length > 0 ? { issues } : {})
    }
  })

  return {
    game: {
      id: WHITEOUT_SURVIVAL_24BUYM_GAME_ID,
      slug: 'whiteout-survival-24buym',
      name: 'Whiteout Survival',
      itemName: 'Frost Stars',
      itemIcon: ''
    },
    categories: [
      {
        id: 1,
        name: '24BUYM THB (primary) + Century Games USD (secondary)',
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
    source: WHITEOUT_SURVIVAL_24BUYM_SOURCE,
    sources: {
      thb: WHITEOUT_SURVIVAL_24BUYM_SOURCE,
      // Always present: null when Century fetch failed or no USD index — never undefined/omit
      usd: usdFetchIssue || usdIndex.size === 0 ? null : centurySource
    },
    notes
  }
}

import { isTermgameUpstream } from '../lib/guards'
import type { RovPack, RovPacksResponse } from '../types/rov'
import {
  buildUsdByAmount,
  buildUsdByThbTier,
  dualIapToRovPacks,
  fetchAppStoreHtml,
  mergeAppStoreDual,
  parseAppStoreIapFromHtml,
  type AppStoreDualIap,
  type AppStoreNamedPrice
} from './appstore-iap'

export class UpstreamUnavailableError extends Error {
  constructor() {
    super('Upstream service unavailable')
    this.name = 'UpstreamUnavailableError'
  }
}

export class InvalidUpstreamResponseError extends Error {
  constructor() {
    super('Invalid upstream response')
    this.name = 'InvalidUpstreamResponseError'
  }
}

export type TermgameUsdEnrichment = {
  /** App Store TH product page (IAP list with ฿). */
  appStoreThUrl?: string
  /** App Store US product page (IAP list with $). Optional when unavailable. */
  appStoreUsUrl?: string
  /**
   * Optional secondary termgame region that returns USD rows
   * (e.g. Free Fire `region=US`). Merged by app_point_amount only.
   */
  termgameUsdRegion?: string
  termgameUsdLanguage?: string
  /**
   * When true (default if category name set), append App Store dual IAP as a
   * category. Set false to use App Store only as a THB↔USD price-tier oracle.
   */
  appendAppStoreCategory?: boolean
  /** Category name for App Store dual packs appended after termgame channels. */
  appStoreCategoryName?: string
  appStoreCategoryId?: number
}

export type FetchTermgamePacksOptions = {
  appId: number
  slug: string
  region?: string
  language?: string
  signal?: AbortSignal
  /** When set, attach dual THB/USD fields and optional App Store category. */
  usdEnrichment?: TermgameUsdEnrichment
  /** Inject termgame JSON for unit tests (skips live TH fetch). */
  upstreamFixture?: unknown
  /** Inject termgame USD-region JSON for unit tests. */
  upstreamUsdFixture?: unknown
  /** Inject App Store TH HTML for unit tests. */
  appStoreThHtml?: string
  /** Inject App Store US HTML for unit tests. */
  appStoreUsHtml?: string
}

export function buildTermgamePacksSource(
  appId: number,
  region = 'IN.TH',
  language = 'th'
): string {
  return `https://termgame.com/api/shop/apps/channels?app_id=${appId}&region=${region}&language=${language}`
}

type UsdLookup = {
  byAmount: Map<number, { usd: number; source: string }>
  byThbTier: Map<number, { usd: number; source: string }>
  appStoreDual: AppStoreDualIap[]
  sourcesUsd: string | null
  notes: string[]
}

async function fetchTermgameUpstream(
  source: string,
  appId: number,
  signal: AbortSignal,
  fixture?: unknown
): Promise<unknown> {
  if (fixture !== undefined) return fixture

  let response: Response
  try {
    response = await fetch(source, {
      headers: {
        Accept: 'application/json',
        Referer: `https://termgame.com/?app=${appId}`
      },
      signal
    })
  } catch {
    throw new UpstreamUnavailableError()
  }
  if (!response.ok) {
    throw new UpstreamUnavailableError()
  }
  try {
    return await response.json()
  } catch {
    throw new InvalidUpstreamResponseError()
  }
}

async function buildUsdLookup(
  appId: number,
  enrichment: TermgameUsdEnrichment,
  signal: AbortSignal,
  options: FetchTermgamePacksOptions
): Promise<UsdLookup> {
  const notes: string[] = []
  const byAmount = new Map<number, { usd: number; source: string }>()
  const byThbTier = new Map<number, { usd: number; source: string }>()
  let appStoreDual: AppStoreDualIap[] = []
  const usdSourceUrls: string[] = []

  let thHtml: string | null = null
  let usHtml: string | null = null

  if (enrichment.appStoreThUrl) {
    try {
      thHtml =
        options.appStoreThHtml !== undefined
          ? options.appStoreThHtml
          : await fetchAppStoreHtml(
              enrichment.appStoreThUrl,
              'th-TH,th;q=0.9,en;q=0.8',
              signal
            )
    } catch (error) {
      notes.push(
        'App Store TH fetch failed: ' +
          (error instanceof Error ? error.message : 'error')
      )
    }
  }

  if (enrichment.appStoreUsUrl) {
    try {
      usHtml =
        options.appStoreUsHtml !== undefined
          ? options.appStoreUsHtml
          : await fetchAppStoreHtml(
              enrichment.appStoreUsUrl,
              'en-US,en;q=0.9',
              signal
            )
    } catch (error) {
      notes.push(
        'App Store US fetch failed: ' +
          (error instanceof Error ? error.message : 'error')
      )
    }
  }

  let usPacks: AppStoreNamedPrice[] = []
  let thPacks: AppStoreNamedPrice[] = []

  if (thHtml) {
    thPacks = parseAppStoreIapFromHtml(thHtml, 'THB')
  }
  if (usHtml) {
    usPacks = parseAppStoreIapFromHtml(usHtml, 'USD')
  }

  if (thHtml && usHtml) {
    appStoreDual = mergeAppStoreDual(thPacks, usPacks)
    if (appStoreDual.length > 0) {
      usdSourceUrls.push(enrichment.appStoreUsUrl!)
      // Only amount-bearing duals feed the THB tier oracle so promo/supply
      // IAPs (amount=null) do not mis-tag unrelated termgame THB packs.
      const tier = buildUsdByThbTier(
        appStoreDual.filter((row) => row.amount != null)
      )
      for (const [thb, usd] of tier) {
        byThbTier.set(thb, { usd, source: 'appstore' })
      }
      const amt = buildUsdByAmount(
        appStoreDual.map((row) => ({
          amount: row.amount,
          priceUsd: row.priceUsd
        }))
      )
      for (const [amount, usd] of amt) {
        byAmount.set(amount, { usd, source: 'appstore' })
      }
      notes.push(
        `App Store dual IAP matched by name/amount: ${appStoreDual.length} offer(s).`
      )
    } else {
      notes.push('App Store TH+US IAP name/amount merge produced 0 dual offers.')
    }
  } else if (thHtml && !enrichment.appStoreUsUrl) {
    notes.push(
      'App Store US URL not configured for this game (TH-only storefront).'
    )
  }

  // US-only amount → USD (e.g. Delta Force global US packs with no TH twin).
  // Does not invent FX; only attaches live App Store US prices by item amount.
  if (usPacks.length > 0) {
    const usAmt = buildUsdByAmount(
      usPacks.map((row) => ({ amount: row.amount, priceUsd: row.price }))
    )
    let added = 0
    for (const [amount, usd] of usAmt) {
      if (!byAmount.has(amount)) {
        byAmount.set(amount, { usd, source: 'appstore' })
        added++
      }
    }
    if (added > 0) {
      if (enrichment.appStoreUsUrl && !usdSourceUrls.includes(enrichment.appStoreUsUrl)) {
        usdSourceUrls.push(enrichment.appStoreUsUrl)
      }
      notes.push(
        `App Store US amount map: ${added} additional unique amount(s).`
      )
    }
  }

  if (enrichment.termgameUsdRegion) {
    const usdSource = buildTermgamePacksSource(
      appId,
      enrichment.termgameUsdRegion,
      enrichment.termgameUsdLanguage ?? 'en'
    )
    try {
      const usdUpstream = await fetchTermgameUpstream(
        usdSource,
        appId,
        signal,
        options.upstreamUsdFixture
      )
      if (isTermgameUpstream(usdUpstream)) {
        const seen = new Map<number, number>()
        const ambiguous = new Set<number>()
        for (const channel of usdUpstream.channels) {
          if (!channel.visible) continue
          for (const item of channel.items) {
            if (item.currency !== 'USD') continue
            const amount = item.app_point_amount
            const usd = item.currency_amount
            if (ambiguous.has(amount)) continue
            const prev = seen.get(amount)
            if (prev !== undefined && prev !== usd) {
              seen.delete(amount)
              ambiguous.add(amount)
              continue
            }
            seen.set(amount, usd)
          }
        }
        let added = 0
        for (const [amount, usd] of seen) {
          // Prefer App Store when both exist for the same amount.
          if (!byAmount.has(amount)) {
            byAmount.set(amount, { usd, source: 'termgame-us' })
            added++
          }
        }
        if (added > 0 || seen.size > 0) {
          usdSourceUrls.push(usdSource)
          notes.push(
            `Termgame USD region=${enrichment.termgameUsdRegion}: ${seen.size} unique amount(s).`
          )
        } else {
          notes.push(
            `Termgame USD region=${enrichment.termgameUsdRegion}: no USD rows.`
          )
        }
      } else {
        notes.push('Termgame USD region payload invalid; skipped.')
      }
    } catch {
      notes.push(
        `Termgame USD region=${enrichment.termgameUsdRegion} unavailable; skipped.`
      )
    }
  }

  return {
    byAmount,
    byThbTier,
    appStoreDual,
    sourcesUsd: usdSourceUrls[0] ?? null,
    notes
  }
}

function resolveUsd(
  baseItemAmount: number,
  priceThb: number,
  lookup: UsdLookup
): { usd: number; source: string } | null {
  const byAmt = lookup.byAmount.get(baseItemAmount)
  if (byAmt) return byAmt
  const byTier = lookup.byThbTier.get(priceThb)
  if (byTier) return byTier
  return null
}

/**
 * Live termgame packs. Optional usdEnrichment adds dual fields + App Store category.
 * Unmatched USD → price_usd=null (no FX). Other termgame games omit enrichment.
 */
export async function fetchTermgamePacks({
  appId,
  slug,
  region = 'IN.TH',
  language = 'th',
  signal: outerSignal,
  usdEnrichment,
  upstreamFixture,
  upstreamUsdFixture,
  appStoreThHtml,
  appStoreUsHtml
}: FetchTermgamePacksOptions): Promise<RovPacksResponse> {
  const signal = outerSignal ?? AbortSignal.timeout(25_000)
  const source = buildTermgamePacksSource(appId, region, language)

  const upstream = await fetchTermgameUpstream(
    source,
    appId,
    signal,
    upstreamFixture
  )
  if (!isTermgameUpstream(upstream)) {
    throw new InvalidUpstreamResponseError()
  }

  let lookup: UsdLookup | null = null
  if (usdEnrichment) {
    lookup = await buildUsdLookup(appId, usdEnrichment, signal, {
      appId,
      slug,
      upstreamUsdFixture,
      appStoreThHtml,
      appStoreUsHtml
    })
  }

  const categories = upstream.channels
    .filter((channel) => channel.visible)
    .map((channel) => {
      const packs: RovPack[] = channel.items.map((item) => {
        const base: RovPack = {
          id: item.id,
          name: `${upstream.app_info.point_name} ${item.app_point_amount}`,
          baseItemAmount: item.app_point_amount,
          bonusItemAmount: item.promo.total_promo_amount,
          totalItemAmount:
            item.app_point_amount + item.promo.total_promo_amount,
          price: item.currency_amount,
          currency: item.currency
        }

        if (!lookup || item.currency !== 'THB') {
          return base
        }

        const matched = resolveUsd(
          item.app_point_amount,
          item.currency_amount,
          lookup
        )
        return {
          ...base,
          price_thb: item.currency_amount,
          price_usd: matched ? matched.usd : null,
          prices: {
            THB: item.currency_amount,
            USD: matched ? matched.usd : null
          },
          price_thb_source: 'termgame',
          price_usd_source: matched ? matched.source : null
        }
      })

      return {
        id: channel.channel,
        name: channel.name,
        status: channel.status,
        message: channel.message,
        packCount: packs.length,
        packs
      }
    })

  const shouldAppendAppStore =
    !!lookup &&
    lookup.appStoreDual.length > 0 &&
    !!usdEnrichment &&
    usdEnrichment.appendAppStoreCategory === true

  if (shouldAppendAppStore && lookup && usdEnrichment) {
    const appStorePacks = dualIapToRovPacks(
      lookup.appStoreDual,
      upstream.app_info.point_name
    )
    categories.push({
      id: usdEnrichment.appStoreCategoryId ?? 900001,
      name:
        usdEnrichment.appStoreCategoryName ?? 'App Store In-App Purchases',
      status: 0,
      message:
        'Live App Store TH+USD IAP merged by offer name (full dual prices)',
      packCount: appStorePacks.length,
      packs: appStorePacks
    })
  }

  const response: RovPacksResponse = {
    game: {
      id: upstream.app_info.app_id,
      slug,
      name: upstream.app_info.app_name,
      itemName: upstream.app_info.point_name,
      itemIcon: upstream.app_info.point_icon
    },
    categories,
    summary: {
      categoryCount: categories.length,
      packCount: categories.reduce(
        (sum, category) => sum + category.packCount,
        0
      )
    },
    fetchedAt: new Date().toISOString(),
    source
  }

  if (lookup) {
    response.sources = {
      thb: source,
      usd: lookup.sourcesUsd
    }
    response.notes = [
      'THB from live termgame (region IN.TH); GS rows keep legacy price/currency only.',
      'USD attached when uniquely matched by item amount or App Store THB price tier; else null (no FX).',
      'App Store dual offers appended as their own category when TH+US name/amount merge succeeds.',
      ...lookup.notes
    ]
  }

  return response
}

import type { RovPack, RovPacksResponse } from '../types/rov'

export const COOKIERUN_CLASSIC_APP_ID = 6759596824
export const COOKIERUN_CLASSIC_SLUG = 'cookierun-classic'
export const COOKIERUN_CLASSIC_APPSTORE_TH_URL =
  'https://apps.apple.com/th/app/cookierun-classic/id6759596824'
export const COOKIERUN_CLASSIC_APPSTORE_US_URL =
  'https://apps.apple.com/us/app/cookierun-classic/id6759596824'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class CookieRunClassicAppStoreUpstreamUnavailableError extends Error {
  constructor(message = 'Cookie Run Classic App Store upstream unavailable') {
    super(message)
    this.name = 'CookieRunClassicAppStoreUpstreamUnavailableError'
  }
}

export class CookieRunClassicAppStoreInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Cookie Run Classic App Store response') {
    super(message)
    this.name = 'CookieRunClassicAppStoreInvalidUpstreamResponseError'
  }
}

type NamedPrice = {
  name: string
  price: number
}

type MergedIap = {
  name: string
  priceThb: number | null
  priceUsd: number | null
}

/** Stable positive int from pack name (RovPack.id is number). */
export function packNameToId(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const id = h >>> 0
  return id === 0 ? 1 : id
}

export function parseThbAmount(raw: string): number | null {
  const cleaned = raw
    .replace(/\u0e3f/g, '') // Thai baht sign
    .replace(/THB/gi, '')
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '')
    .trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function parseUsdAmount(raw: string): number | null {
  const cleaned = raw
    .replace(/\$/g, '')
    .replace(/USD/gi, '')
    .replace(/US/gi, '')
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '')
    .trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Prefer embedded App Store JSON textPairs / items_V3 under
 * shelfMapping.information → title "In-App Purchases".
 * Falls back to HTML text-pair scraping when JSON is absent.
 */
export function parseCookieRunClassicIapFromHtml(
  html: string,
  currency: 'THB' | 'USD'
): NamedPrice[] {
  const fromJson = parseFromEmbeddedJson(html, currency)
  if (fromJson.length > 0) return dedupeByName(fromJson)

  const fromHtml = parseFromHtmlText(html, currency)
  return dedupeByName(fromHtml)
}

/** Keep first occurrence per offer name (App Store often lists duplicate names). */
function dedupeByName(packs: NamedPrice[]): NamedPrice[] {
  const seen = new Set<string>()
  const out: NamedPrice[] = []
  for (const pack of packs) {
    const key = pack.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(pack)
  }
  return out
}

function parseFromEmbeddedJson(
  html: string,
  currency: 'THB' | 'USD'
): NamedPrice[] {
  const scriptMatch = html.match(
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i
  )
  if (!scriptMatch) return []

  let root: unknown
  try {
    root = JSON.parse(scriptMatch[1])
  } catch {
    return []
  }

  const pairs = collectTextPairs(root)
  const out: NamedPrice[] = []
  const seenPair = new Set<string>()
  for (const [leading, trailing] of pairs) {
    const name = String(leading ?? '').trim()
    if (!name) continue
    const price =
      currency === 'THB'
        ? parseThbAmount(String(trailing ?? ''))
        : parseUsdAmount(String(trailing ?? ''))
    if (price === null) continue
    const pairKey = name.toLowerCase() + '|' + price
    if (seenPair.has(pairKey)) continue
    seenPair.add(pairKey)
    out.push({ name, price })
  }
  return out
}

function collectTextPairs(node: unknown): Array<[string, string]> {
  const out: Array<[string, string]> = []
  walk(node)

  function walk(obj: unknown, underIap = false): void {
    if (!obj || typeof obj !== 'object') return

    if (Array.isArray(obj)) {
      for (const item of obj) walk(item, underIap)
      return
    }

    const rec = obj as Record<string, unknown>
    const title = typeof rec.title === 'string' ? rec.title : ''
    const isIapSection =
      underIap || /^In-App Purchases$/i.test(title.trim())

    if (isIapSection) {
      const itemsV3 = rec.items_V3
      if (Array.isArray(itemsV3)) {
        for (const item of itemsV3) {
          if (!item || typeof item !== 'object') continue
          const row = item as Record<string, unknown>
          if (
            typeof row.leadingText === 'string' &&
            typeof row.trailingText === 'string'
          ) {
            out.push([row.leadingText, row.trailingText])
          }
        }
      }

      const items = rec.items
      if (Array.isArray(items)) {
        for (const item of items) {
          if (!item || typeof item !== 'object') continue
          const row = item as Record<string, unknown>
          const textPairs = row.textPairs
          if (Array.isArray(textPairs)) {
            for (const pair of textPairs) {
              if (
                Array.isArray(pair) &&
                pair.length >= 2 &&
                typeof pair[0] === 'string' &&
                typeof pair[1] === 'string'
              ) {
                out.push([pair[0], pair[1]])
              }
            }
          }
        }
      }
    }

    for (const value of Object.values(rec)) {
      walk(value, isIapSection)
    }
  }

  return out
}

function parseFromHtmlText(
  html: string,
  currency: 'THB' | 'USD'
): NamedPrice[] {
  const out: NamedPrice[] = []
  if (currency === 'THB') {
    const re =
      /([A-Za-z0-9][^<\n]{0,80}?)[\s\S]{0,120}?(?:\u0e3f|THB|&#3647;)\s*([\d,]+(?:\.\d+)?)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const name = m[1].replace(/\s+/g, ' ').trim()
      const thb = parseThbAmount(m[2])
      if (!name || thb === null) continue
      if (!/crystal|package|pass|bundle|treasure|soul|key/i.test(name)) continue
      out.push({ name, price: thb })
    }
    return out
  }

  const re =
    /([A-Za-z0-9][^<\n]{0,80}?)[\s\S]{0,80}?\$\s*([\d,]+(?:\.\d+)?)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const name = m[1].replace(/\s+/g, ' ').trim()
    const usd = parseUsdAmount(m[2])
    if (!name || usd === null) continue
    if (!/crystal|package|pass|bundle|treasure|soul|key/i.test(name)) continue
    out.push({ name, price: usd })
  }
  return out
}

export function mergeCookieRunClassicIap(
  thbPacks: NamedPrice[],
  usdPacks: NamedPrice[]
): MergedIap[] {
  const byName = new Map<string, MergedIap>()

  for (const pack of thbPacks) {
    const key = pack.name.trim().toLowerCase()
    const existing = byName.get(key)
    if (existing) {
      if (existing.priceThb === null) existing.priceThb = pack.price
      continue
    }
    byName.set(key, {
      name: pack.name.trim(),
      priceThb: pack.price,
      priceUsd: null
    })
  }

  for (const pack of usdPacks) {
    const key = pack.name.trim().toLowerCase()
    const existing = byName.get(key)
    if (existing) {
      if (existing.priceUsd === null) existing.priceUsd = pack.price
      continue
    }
    byName.set(key, {
      name: pack.name.trim(),
      priceThb: null,
      priceUsd: pack.price
    })
  }

  return [...byName.values()]
}

function toResponse(packs: MergedIap[]): RovPacksResponse {
  const mapped: RovPack[] = packs
    .slice()
    .sort((a, b) => {
      const aThb = a.priceThb ?? Number.POSITIVE_INFINITY
      const bThb = b.priceThb ?? Number.POSITIVE_INFINITY
      if (aThb !== bThb) return aThb - bThb
      const aUsd = a.priceUsd ?? Number.POSITIVE_INFINITY
      const bUsd = b.priceUsd ?? Number.POSITIVE_INFINITY
      if (aUsd !== bUsd) return aUsd - bUsd
      return a.name.localeCompare(b.name)
    })
    .map((pack) => {
      const priceThb = pack.priceThb
      const priceUsd = pack.priceUsd
      return {
        id: packNameToId(pack.name),
        name: pack.name,
        baseItemAmount: 0,
        bonusItemAmount: 0,
        totalItemAmount: 0,
        price: priceThb ?? priceUsd ?? 0,
        currency: priceThb !== null ? 'THB' : 'USD',
        ...(priceThb !== null ? { price_thb: priceThb } : {}),
        price_usd: priceUsd,
        prices: {
          THB: (priceThb ?? 0) as number,
          USD: priceUsd
        },
        ...(priceThb !== null
          ? { price_thb_source: 'appstore' as const }
          : {}),
        price_usd_source: priceUsd !== null ? 'appstore' : null
      } as RovPack
    })

  return {
    game: {
      id: COOKIERUN_CLASSIC_APP_ID,
      slug: COOKIERUN_CLASSIC_SLUG,
      name: 'Cookie Run Classic',
      itemName: 'Crystals',
      itemIcon: ''
    },
    categories: [
      {
        id: 1,
        name: 'App Store In-App Purchases',
        status: 0,
        message:
          'Live IAP list from App Store TH + US (merged by offer name; no fallback)',
        packCount: mapped.length,
        packs: mapped
      }
    ],
    summary: {
      categoryCount: 1,
      packCount: mapped.length
    },
    fetchedAt: new Date().toISOString(),
    source: COOKIERUN_CLASSIC_APPSTORE_TH_URL,
    sources: {
      thb: COOKIERUN_CLASSIC_APPSTORE_TH_URL,
      usd: COOKIERUN_CLASSIC_APPSTORE_US_URL
    },
    notes: [
      'THB from App Store TH In-App Purchases trailing price text.',
      'USD from App Store US In-App Purchases trailing price text.',
      'Merged by offer/product name (duplicate names collapsed; no per-IAP product ids in page JSON).',
      'Live-fetch only; empty/unparseable upstream → error (no static catalog).'
    ]
  }
}

async function fetchAppStoreHtml(
  url: string,
  acceptLanguage: string,
  signal?: AbortSignal
): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(25_000),
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': acceptLanguage,
        'User-Agent': BROWSER_UA
      }
    })
  } catch (error) {
    throw new CookieRunClassicAppStoreUpstreamUnavailableError(
      error instanceof Error ? error.message : 'network error'
    )
  }

  if (!response.ok) {
    throw new CookieRunClassicAppStoreUpstreamUnavailableError(
      'HTTP ' + response.status + ' for ' + url
    )
  }

  try {
    return await response.text()
  } catch (error) {
    throw new CookieRunClassicAppStoreUpstreamUnavailableError(
      error instanceof Error ? error.message : 'failed to read body'
    )
  }
}

/**
 * Live Cookie Run Classic packs from App Store TH + US product pages.
 * Parses embedded JSON textPairs / items_V3 (preferred) or HTML IAP pairs.
 * Merges by offer name. Never hardcodes pack prices; upstream fail → throw.
 */
export async function fetchCookieRunClassicAppStorePacks(options?: {
  signal?: AbortSignal
  /** Inject TH HTML for unit tests (skips live TH fetch). */
  htmlTh?: string
  /** Inject US HTML for unit tests (skips live US fetch). */
  htmlUs?: string
}): Promise<RovPacksResponse> {
  let htmlTh: string
  let htmlUs: string

  if (options && 'htmlTh' in options) {
    if (typeof options.htmlTh !== 'string' || options.htmlTh.length === 0) {
      throw new CookieRunClassicAppStoreInvalidUpstreamResponseError(
        'Empty TH HTML fixture'
      )
    }
    htmlTh = options.htmlTh
  } else {
    htmlTh = await fetchAppStoreHtml(
      COOKIERUN_CLASSIC_APPSTORE_TH_URL,
      'th-TH,th;q=0.9,en;q=0.8',
      options?.signal
    )
  }

  if (options && 'htmlUs' in options) {
    if (typeof options.htmlUs !== 'string' || options.htmlUs.length === 0) {
      throw new CookieRunClassicAppStoreInvalidUpstreamResponseError(
        'Empty US HTML fixture'
      )
    }
    htmlUs = options.htmlUs
  } else {
    htmlUs = await fetchAppStoreHtml(
      COOKIERUN_CLASSIC_APPSTORE_US_URL,
      'en-US,en;q=0.9',
      options?.signal
    )
  }

  const thbPacks = parseCookieRunClassicIapFromHtml(htmlTh, 'THB')
  const usdPacks = parseCookieRunClassicIapFromHtml(htmlUs, 'USD')

  if (thbPacks.length === 0) {
    throw new CookieRunClassicAppStoreInvalidUpstreamResponseError(
      'In-App Purchases section not found or empty on App Store TH'
    )
  }
  if (usdPacks.length === 0) {
    throw new CookieRunClassicAppStoreInvalidUpstreamResponseError(
      'In-App Purchases section not found or empty on App Store US'
    )
  }

  const merged = mergeCookieRunClassicIap(thbPacks, usdPacks)
  if (merged.length === 0) {
    throw new CookieRunClassicAppStoreInvalidUpstreamResponseError(
      'No packs after merging App Store TH + US IAP lists'
    )
  }

  return toResponse(merged)
}

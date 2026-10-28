import type { RovPack, RovPacksResponse } from '../types/rov'
import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, type AppStoreFullIapRow } from './appstore-full-iap'

export const YULGANG_W_APP_ID = 6756002784
export const YULGANG_W_SLUG = 'yulgang-w'
export const YULGANG_W_APPSTORE_URL =
  'https://apps.apple.com/th/app/yulgang-w/id6756002784'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const TAEL_NULL_REASON =
  'Tael amount not published: the App Store item only says: Get N.NNUSD pack after purchase (no Tael count), the official Efun store requires login, and no official page lists Tael per App Store tier.'

export class YulgangWUpstreamUnavailableError extends Error {
  constructor(message = 'Yulgang W App Store upstream unavailable') {
    super(message)
    this.name = 'YulgangWUpstreamUnavailableError'
  }
}

export class YulgangWInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Yulgang W App Store response') {
    super(message)
    this.name = 'YulgangWInvalidUpstreamResponseError'
  }
}

type ParsedIap = {
  name: string
  priceUsd: number
  priceThb: number
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

export function parseUsdFromPackName(name: string): number | null {
  const m = name.match(/([0-9]+(?:\.[0-9]+)?)\s*USD\s*Pack/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/**
 * Prefer embedded App Store JSON textPairs / items_V3 under
 * shelfMapping.information โ’ title "In-App Purchases".
 * Falls back to HTML text-pair scraping when JSON is absent.
 */
export function parseYulgangWIapFromHtml(html: string): ParsedIap[] {
  const fromJson = parseFromEmbeddedJson(html)
  if (fromJson.length > 0) return dedupeByUsd(fromJson)

  const fromHtml = parseFromHtmlText(html)
  return dedupeByUsd(fromHtml)
}

function dedupeByUsd(packs: ParsedIap[]): ParsedIap[] {
  const seen = new Set<number>()
  const out: ParsedIap[] = []
  for (const pack of packs) {
    if (seen.has(pack.priceUsd)) continue
    seen.add(pack.priceUsd)
    out.push(pack)
  }
  return out
}

function parseFromEmbeddedJson(html: string): ParsedIap[] {
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
  const out: ParsedIap[] = []
  for (const [leading, trailing] of pairs) {
    const name = String(leading ?? '').trim()
    const usd = parseUsdFromPackName(name)
    const thb = parseThbAmount(String(trailing ?? ''))
    if (usd === null || thb === null) continue
    out.push({ name, priceUsd: usd, priceThb: thb })
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
          if (typeof row.leadingText === 'string' && typeof row.trailingText === 'string') {
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

function parseFromHtmlText(html: string): ParsedIap[] {
  const out: ParsedIap[] = []
  // e.g. 0.99USD Pack โ€ฆ เธฟ35.00  (baht may appear as mojibake)
  const re =
    /([0-9]+(?:\.[0-9]+)?\s*USD\s*Pack)[\s\S]{0,240}?(?:\u0e3f|THB|&#3647;|&baht;|[^\x00-\x7F]{1,3})\s*([\d,]+(?:\.\d+)?)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const name = m[1].replace(/\s+/g, ' ').trim()
    const usd = parseUsdFromPackName(name)
    const thb = parseThbAmount(m[2])
    if (usd === null || thb === null) continue
    out.push({ name: name.replace(/\s+/g, ''), priceUsd: usd, priceThb: thb })
  }

  // Also try adjacent plain text pairs without baht symbol (mojibake stripped)
  if (out.length === 0) {
    const loose =
      /([0-9]+(?:\.[0-9]+)?)USD Pack[\s\S]{0,80}?([\d,]+\.\d{2})/g
    while ((m = loose.exec(html)) !== null) {
      const usd = Number(m[1])
      const thb = parseThbAmount(m[2])
      if (!Number.isFinite(usd) || thb === null) continue
      out.push({
        name: `${m[1]}USD Pack`,
        priceUsd: usd,
        priceThb: thb
      })
    }
  }

  return out
}

function toResponse(packs: ParsedIap[], source: string): RovPacksResponse {
  const mapped = packs
    .slice()
    .sort((a, b) => a.priceUsd - b.priceUsd)
    .map((pack) => ({
      id: packNameToId(pack.name),
      name: pack.name,
      baseItemAmount: null,
      bonusItemAmount: null,
      totalItemAmount: null,
      base_null_reason: TAEL_NULL_REASON,
      bonus_null_reason: TAEL_NULL_REASON,
      total_null_reason: TAEL_NULL_REASON,
      item_pack: false,
      price: pack.priceThb,
      currency: 'THB',
      price_thb: pack.priceThb,
      price_usd: pack.priceUsd,
      prices: { THB: pack.priceThb, USD: pack.priceUsd },
      price_thb_source: 'appstore',
      price_usd_source: 'appstore'
    })) as unknown as RovPack[]

  return {
    game: {
      id: YULGANG_W_APP_ID,
      slug: YULGANG_W_SLUG,
      name: 'Yulgang W',
      itemName: 'Pack',
      itemIcon: ''
    },
    categories: [
      {
        id: 1,
        name: 'App Store In-App Purchases',
        status: 0,
        message:
          'Live IAP list from App Store TH (fallback: official Efun TH store th.efunsea.com/recharge requires account login, no public price list)',
        packCount: mapped.length,
        packs: mapped
      }
    ],
    summary: {
      categoryCount: 1,
      packCount: mapped.length
    },
    fetchedAt: new Date().toISOString(),
    source,
    sources: {
      thb: source,
      usd: source
    },
    notes: [
      'Official Efun Thailand top-up (th.efunsea.com/recharge, payth.efunsea.com payItems) requires login; no public price list, so the App Store TH IAP list is used as fallback.',
      'App Store US has no Yulgang W listing (TH/SEA-only), so USD comes from the official IAP product name (N.NNUSD Pack).',
      'Tael base/bonus amounts are not shown on the App Store; they are null with a reason.',
      'FULL THB from App Store In-App Purchases price text (เธฟ).',
      'USD parsed from offer name pattern N.NNUSD Pack (not FX).',
      'Live-fetch only; empty/unparseable upstream โ’ error (no static catalog).'
    ]
  }
}

/** App Store storefronts priced in real USD by Apple (US has no Yulgang W listing; KH/LA are USD storefronts). */
export const YULGANG_W_USD_STOREFRONTS = ['kh', 'la'] as const
export const yulgangWCatalogUrl = (cc: string) =>
  `https://apps.apple.com/api/apps/v1/catalog/${cc}/apps/${YULGANG_W_APP_ID}/top-in-apps`

const PACK_CATEGORY = 'Packs'
const SPECIAL_CATEGORY = 'Special Packs'
/** Efun product ids: ae.aerxjhw.{N}usd.{base|pack}[.efun]; the .efun suffix is the "Special Pack" line. */
const isSpecial = (r: AppStoreFullIapRow) => /\.efun$/i.test(r.offerName ?? '') || /special pack/i.test(r.name)

type UsdList = { cc: string; rows: AppStoreFullIapRow[] } | { cc: null; reason: string }

async function fetchUsdList(signal?: AbortSignal): Promise<UsdList> {
  const errors: string[] = []
  for (const cc of YULGANG_W_USD_STOREFRONTS) {
    try {
      const rows = await fetchAppStoreFullIap(cc, String(YULGANG_W_APP_ID), 'en-GB', signal)
      if (rows.some((r) => r.currency === 'USD')) return { cc, rows: rows.filter((r) => r.currency === 'USD') }
      errors.push(`${cc}: no USD prices`)
    } catch (e) {
      errors.push(`${cc}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { cc: null, reason: errors.join('; ') }
}

/** Exact cross-storefront match: Apple offerName (Efun product id), else the same Apple item id. Never by name. */
export function matchYulgangWUsd(rows: AppStoreFullIapRow[], th: AppStoreFullIapRow): { row: AppStoreFullIapRow; by: string } | null {
  if (th.offerName) {
    const hits = rows.filter((r) => r.offerName === th.offerName)
    if (hits.length === 1) return { row: hits[0], by: `offerName=${th.offerName}` }
  }
  if (th.id) {
    const hit = rows.find((r) => r.id === th.id)
    if (hit) return { row: hit, by: `item ${th.id}` }
  }
  return null
}

/** Response from the full App Store TH list (THB) + an Apple USD storefront (USD), matched by offerName / item id. */
export function buildYulgangWFullResponse(
  thRows: AppStoreFullIapRow[],
  usd: UsdList,
  thai: { rows: AppStoreFullIapRow[] } | { rows: null; reason: string } = { rows: null, reason: 'Thai-language App Store list not requested' }
): RovPacksResponse {
  const thb = thRows.filter((r) => r.currency === 'THB' || r.currency === '')
  const toPack = (r: AppStoreFullIapRow) => {
    const m = usd.cc ? matchYulgangWUsd(usd.rows, r) : null
    const priceUsd = m ? m.row.price : null
    const usdReason = usd.cc
      ? m ? undefined : `not found on App Store ${usd.cc.toUpperCase()} (USD storefront) by offerName/Apple item id`
      : `App Store USD storefront list unavailable (${'reason' in usd ? usd.reason : 'unknown'}); App Store US has no Yulgang W listing`
    const thLang = thai.rows ? thai.rows.find((x) => (r.offerName && x.offerName === r.offerName) || x.id === r.id) : undefined
    const descTh = thLang?.description ?? null
    const descEn = r.description ?? null
    const description = [descTh, descEn].filter(Boolean).join(' / ') || null
    return {
      id: Number(r.id) || packNameToId(r.name),
      name: r.name,
      name_th: thLang?.name ?? null,
      description,
      description_th: descTh,
      description_en: descEn,
      ...(description ? {} : { description_null_reason: 'Apple App Store has no description text for this item' }),
      ...(descTh ? {} : { description_th_null_reason: thai.rows ? 'not in the Thai-language App Store TH list' : `Thai-language App Store TH list unavailable (${'reason' in thai ? thai.reason : ''})` }),
      family_shareable: typeof r.familyShareable === 'boolean' ? r.familyShareable : null,
      apple_item_id: r.id || null,
      product_id: r.offerName ?? null,
      baseItemAmount: null,
      bonusItemAmount: null,
      totalItemAmount: null,
      base_null_reason: TAEL_NULL_REASON,
      bonus_null_reason: TAEL_NULL_REASON,
      total_null_reason: TAEL_NULL_REASON,
      item_pack: false,
      price: r.price,
      currency: 'THB',
      price_thb: r.price,
      price_usd: priceUsd,
      prices: { THB: r.price, USD: priceUsd },
      price_thb_source: `apple-app-store-th (item ${r.id}${r.offerName ? `, offerName=${r.offerName}` : ''})`,
      price_usd_source: m ? `apple-app-store-${usd.cc} (USD storefront, ${m.by})` : null,
      /** Nominal USD tier in Efun's own product name (e.g. '5.99USD Pack'); informational, not Apple's charge. */
      usd_in_product_name: parseUsdFromPackName(r.name),
      ...(usdReason ? { price_usd_null_reason: usdReason } : {})
    }
  }
  const sortKey = (a: AppStoreFullIapRow, b: AppStoreFullIapRow) => a.price - b.price || a.name.localeCompare(b.name)
  const regular = thb.filter((r) => !isSpecial(r)).sort(sortKey).map(toPack) as unknown as RovPack[]
  const special = thb.filter(isSpecial).sort(sortKey).map(toPack) as unknown as RovPack[]
  const categories = [
    { id: 1, name: PACK_CATEGORY, status: 0, message: 'Efun product ids ae.aerxjhw.{N}usd.base / .pack', packCount: regular.length, packs: regular },
    { id: 2, name: SPECIAL_CATEGORY, status: 0, message: 'Efun product ids ending .efun ("Special Pack")', packCount: special.length, packs: special }
  ].filter((c) => c.packCount > 0)
  const packCount = regular.length + special.length
  return {
    game: { id: YULGANG_W_APP_ID, slug: YULGANG_W_SLUG, name: 'Yulgang W', itemName: 'Pack', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount },
    fetchedAt: new Date().toISOString(),
    source: yulgangWCatalogUrl('th'),
    sources: {
      thb: yulgangWCatalogUrl('th'),
      usd: usd.cc ? yulgangWCatalogUrl(usd.cc) : null,
      appstore_th_page: YULGANG_W_APPSTORE_URL
    },
    notes: [
      'Official Efun Thailand top-up (th.efunsea.com/recharge) redirects to login; no public price list, so official Apple App Store prices are used.',
      'THB = Apple App Store TH price (full in-app purchase list, every item).',
      `USD = Apple App Store ${usd.cc ? usd.cc.toUpperCase() : 'KH/LA'} price (Apple storefront billed in USD; App Store US has no Yulgang W listing), matched to the TH item exactly by Apple offerName (Efun product id) or Apple item id. No FX conversion, no resellers.`,
      'usd_in_product_name = the USD tier written in the official Efun product name (N.NNUSD Pack), informational only. The Apple KH/LA USD price is higher for some tiers (e.g. 5.99USD Pack is $6.99 on App Store KH); price_usd is the actual Apple storefront price.',
      'Tael base/bonus amounts are not shown on the App Store; they are null with a reason.',
      'description = Apple App Store item description (Thai from App Store TH l=th, then English), name_th = Thai item name; developer-written text, not edited.',
      APPSTORE_FULL_IAP_NOTE,
      'Live-fetch only; empty/unparseable upstream -> error (no static catalog).'
    ]
  } as unknown as RovPacksResponse
}

/**
 * Live Yulgang W packs. Primary: full App Store TH IAP list (THB) + Apple USD storefront (USD).
 * Fallback: App Store TH product page (top 10 only; USD from the official product name N.NNUSD Pack).
 * Never hardcodes pack prices; upstream fail -> throw.
 */
export async function fetchYulgangWPacks(options?: {
  signal?: AbortSignal
  /** Inject raw HTML for unit tests (skips live fetch). */
  html?: string
}): Promise<RovPacksResponse> {
  let html: string

  if (options && 'html' in options) {
    if (typeof options.html !== 'string' || options.html.length === 0) {
      throw new YulgangWInvalidUpstreamResponseError('Empty HTML fixture')
    }
    html = options.html
  } else {
    try {
      const thRows = await fetchAppStoreFullIap('th', String(YULGANG_W_APP_ID), 'en-GB', options?.signal)
      if (thRows.some((r) => r.currency === 'THB')) {
        const usd = await fetchUsdList(options?.signal)
        let thai: { rows: AppStoreFullIapRow[] } | { rows: null; reason: string }
        try {
          thai = { rows: await fetchAppStoreFullIap('th', String(YULGANG_W_APP_ID), 'th', options?.signal) }
        } catch (e) {
          thai = { rows: null, reason: e instanceof Error ? e.message : String(e) }
        }
        return buildYulgangWFullResponse(thRows, usd, thai)
      }
    } catch {
      /* full list unavailable -> product page (top 10) */
    }
    let response: Response
    try {
      response = await fetch(YULGANG_W_APPSTORE_URL, {
        signal: options?.signal ?? AbortSignal.timeout(25_000),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
          'User-Agent': BROWSER_UA
        }
      })
    } catch (error) {
      throw new YulgangWUpstreamUnavailableError(
        error instanceof Error ? error.message : 'network error'
      )
    }

    if (!response.ok) {
      throw new YulgangWUpstreamUnavailableError('HTTP ' + response.status)
    }

    try {
      html = await response.text()
    } catch (error) {
      throw new YulgangWUpstreamUnavailableError(
        error instanceof Error ? error.message : 'failed to read body'
      )
    }
  }

  const packs = parseYulgangWIapFromHtml(html)
  if (packs.length === 0) {
    throw new YulgangWInvalidUpstreamResponseError(
      'In-App Purchases section not found or empty'
    )
  }

  return toResponse(packs, YULGANG_W_APPSTORE_URL)
}

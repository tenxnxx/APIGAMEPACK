import type { RovPacksResponse } from '../types/rov'
import {
  APPSTORE_FULL_IAP_NOTE,
  APPSTORE_IAP_API_BASE,
  fetchAppStoreFullIap,
  type AppStoreFullIapRow
} from './appstore-full-iap'
import { parseCookieRunClassicIapFromHtml } from './cookierun-classic-appstore-packs.service'

/**
 * CookieRun: Crumble - Idle RPG (Devsisters Corp., App Store id 6749251466, bundle com.devsisters.cc;
 * released 2026-07-29, listed on the App Store TH storefront with Thai language support).
 * Devsisters runs no top-up webshop for it (in-app purchases go through Apple / Google Play; the CookieRun Store
 * sells merchandise only). So:
 *   THB = official Apple App Store TH full in-app purchase list (catalog API, Thai names/descriptions with l=th),
 *   USD = App Store US, per-item fallback KH / LA / MM (USD storefronts), matched by Apple item id / offerName
 *   (Devsisters product id, dev.cc.*). No FX, no resellers, no hardcoded prices or amounts.
 * Catalog API down -> App Store TH product page (top items only); USD null there (TH page names are Thai, US are
 * English, so they cannot be paired without item ids).
 */

export const COOKIERUN_CRUMBLE_APP_ID = 6749251466
export const COOKIERUN_CRUMBLE_SLUG = 'cookierun-crumble'
export const COOKIERUN_CRUMBLE_OFFICIAL_TITLE = 'CookieRun: Crumble - Idle RPG'
export const COOKIERUN_CRUMBLE_PUBLISHER = 'Devsisters Corp.'
export const COOKIERUN_CRUMBLE_APPSTORE_TH_URL = 'https://apps.apple.com/th/app/cookierun-crumble-idle-rpg/id6749251466'
export const COOKIERUN_CRUMBLE_APPSTORE_US_URL = 'https://apps.apple.com/us/app/cookierun-crumble-idle-rpg/id6749251466'
export const COOKIERUN_CRUMBLE_SUPPORT_IAP_URL =
  'https://cs-cookieruncrumble.devsisters.com/hc/en-us/sections/59012454247833-Problems-with-in-app-purchases'
const USD_CCS = ['us', 'kh', 'la', 'mm'] as const
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class CookieRunCrumbleUpstreamUnavailableError extends Error {
  constructor(message = 'CookieRun: Crumble App Store upstream unavailable') {
    super(message)
    this.name = 'CookieRunCrumbleUpstreamUnavailableError'
  }
}
export class CookieRunCrumbleInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid CookieRun: Crumble App Store response') {
    super(message)
    this.name = 'CookieRunCrumbleInvalidUpstreamResponseError'
  }
}

export type CrbKind = 'currency' | 'pass' | 'bundle'

/** Currency item named by Devsisters' product id (dev.cc.crystals.* / runecrystals.* / stellarpoint.*). */
export function crbCurrencyItem(productId: string | null, name: string): string | null {
  const pid = productId ?? ''
  if (/\.runecrystals\./i.test(pid)) return 'Rune Crystals'
  if (/\.stellarpoint\./i.test(pid)) return 'Stellar Points'
  if (/\.crystals\./i.test(pid)) return 'Crystals'
  if (!pid) {
    if (/^\s*(?:rune crystals?|ผลึกรูน)\s*(?:x?\d+)?\s*$/i.test(name)) return 'Rune Crystals'
    if (/^\s*(?:stellar points?|พ้อยต์สเตลลาร์)\s*(?:x?\d+)?\s*$/i.test(name)) return 'Stellar Points'
    if (/^\s*(?:crystals?|คริสตัล)\s*(?:x?\d+)?\s*$/i.test(name)) return 'Crystals'
  }
  return null
}

/** Classify by product id (Apple offerName), else by name. */
export function crbKind(productId: string | null, name: string): CrbKind {
  if (crbCurrencyItem(productId, name)) return 'currency'
  const pid = productId ?? ''
  if (/pass|subscription|demovalackage/i.test(pid) || (!pid && /\bpass\b|สมาชิก/i.test(name))) return 'pass'
  return 'bundle'
}

export type CrbContent = { item: string; amount: number | null }
/**
 * Contents only when Apple's official description names them. Crumble's descriptions are mostly generic
 * ("Package containing various rewards and items") -> null. "Package containing crystals" -> Crystals (amount unstated).
 */
export function crbContents(description: string | null | undefined): CrbContent[] | null {
  const d = (description ?? '').replace(/\s+/g, ' ').trim()
  const m = d.match(/^(?:a\s+)?(?:special\s+)?(?:package|packs?)\s+(?:containing|including)\s+(.+?)\.?$/i)
  if (!m) return null
  if (/various|variety|rewards and items|essential items/i.test(m[1])) return null
  const out: CrbContent[] = []
  for (const raw of m[1].split(/\s*,\s*|\s+and\s+/i)) {
    const part = raw.trim()
    if (!part) continue
    const n = part.match(/^([\d,]+)\s+(.+)$/)
    const item = (n ? n[2] : part).replace(/^\w/, (c) => c.toUpperCase())
    out.push({ item, amount: n ? Number(n[1].replace(/,/g, '')) : null })
  }
  return out.length ? out : null
}

const hasThai = (s: string | undefined | null) => !!s && /[\u0E00-\u0E7F]/.test(s)

async function fetchUsdFor(need: AppStoreFullIapRow[], signal?: AbortSignal) {
  const match = new Map<string, { row: AppStoreFullIapRow; cc: string }>()
  const reasons: string[] = []
  let pending = need.slice()
  for (const cc of USD_CCS) {
    if (!pending.length) break
    let rows: AppStoreFullIapRow[]
    try {
      rows = (await fetchAppStoreFullIap(cc, String(COOKIERUN_CRUMBLE_APP_ID), cc === 'us' ? 'en-US' : null, signal)).filter(
        (r) => r.currency === 'USD'
      )
    } catch (e) {
      reasons.push(`${cc.toUpperCase()}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    const byId = new Map(rows.map((r) => [r.id, r]))
    const byOffer = new Map(rows.filter((r) => r.offerName).map((r) => [r.offerName!, r]))
    const still: AppStoreFullIapRow[] = []
    for (const t of pending) {
      const u = byId.get(t.id) ?? (t.offerName ? byOffer.get(t.offerName) : undefined)
      if (u) match.set(t.id, { row: u, cc })
      else still.push(t)
    }
    if (still.length) reasons.push(`${cc.toUpperCase()}: ${still.length} item(s) not listed`)
    pending = still
  }
  return { match, reasons }
}

const AMOUNT_REASON =
  'Official item name gives only a tier number (e.g. "Crystals 3" / "คริสตัล 3"), not an amount; Apple lists no amount'

function amountFields(kind: CrbKind) {
  return kind === 'currency'
    ? {
        baseItemAmount: null,
        bonusItemAmount: null,
        totalItemAmount: null,
        base_null_reason: AMOUNT_REASON,
        bonus_null_reason: 'No bonus published on the official listing',
        total_null_reason: AMOUNT_REASON,
        bonus_available: false
      }
    : {
        baseItemAmount: null,
        bonusItemAmount: null,
        totalItemAmount: null,
        base_null_reason: kind === 'pass' ? 'Pass / membership item; not a plain currency amount' : 'Package / bundle item; not a plain currency amount',
        bonus_null_reason: 'No currency bonus on pass / package items',
        total_null_reason: 'Not a plain currency amount',
        bonus_available: false
      }
}

function contentsFields(kind: CrbKind, currencyItem: string | null, descEn: string | null) {
  if (kind === 'currency' && currencyItem)
    return { contents: [{ item: currencyItem, amount: null }], contents_note: 'Amount not stated on the official listing' }
  const c = crbContents(descEn)
  return c
    ? { contents: c }
    : {
        contents: null,
        contents_null_reason:
          'Apple official description is generic ("Package containing various rewards and items"); itemised contents are shown in-game only'
      }
}

const CAT_NAMES: Record<CrbKind, string> = {
  currency: 'Crystals / Rune Crystals / Stellar Points (App Store)',
  pass: 'Passes & Memberships (App Store)',
  bundle: 'Packages & Bundles (App Store)'
}

function buildCategories(packs: any[], message: string) {
  const byPrice = (a: any, b: any) =>
    (a.price_thb ?? Infinity) - (b.price_thb ?? Infinity) ||
    (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) ||
    String(a.product_id ?? a.name).localeCompare(String(b.product_id ?? b.name))
  let n = 0
  return (['currency', 'pass', 'bundle'] as CrbKind[])
    .map((k, i) => ({ id: i + 1, name: CAT_NAMES[k], packs: packs.filter((p) => p.kind === k) }))
    .filter((c) => c.packs.length)
    .map((c) => {
      c.packs.sort(byPrice)
      for (const p of c.packs) p.id = ++n
      return { ...c, status: 0, message, packCount: c.packs.length }
    })
}

function envelope(categories: any[], extra: Record<string, unknown>, notes: string[]): RovPacksResponse {
  return {
    game: { id: COOKIERUN_CRUMBLE_APP_ID, slug: COOKIERUN_CRUMBLE_SLUG, name: 'CookieRun: Crumble', itemName: 'Crystals', itemIcon: '' },
    official_title: COOKIERUN_CRUMBLE_OFFICIAL_TITLE,
    publisher: COOKIERUN_CRUMBLE_PUBLISHER,
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s: number, c: any) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    ...extra,
    notes
  } as unknown as RovPacksResponse
}

const COMMON_NOTES = [
  `Devsisters has no top-up webshop for CookieRun: Crumble; purchases are in-app via Apple / Google Play (${COOKIERUN_CRUMBLE_SUPPORT_IAP_URL}). The CookieRun Store sells merchandise only.`,
  'Crystals / Rune Crystals / Stellar Points: Apple names them by tier ("Crystals 1..6"), not amount, so base / bonus / total are null with a reason (no wiki or reseller figures used).',
  'Passes, memberships and packages are item_pack:true. contents come only from Apple\'s official description when it names items; most Crumble descriptions are generic, so contents are null with a reason.'
]

async function fromCatalogApi(signal?: AbortSignal): Promise<RovPacksResponse> {
  const th = (await fetchAppStoreFullIap('th', String(COOKIERUN_CRUMBLE_APP_ID), 'th', signal)).filter((r) => r.currency === 'THB')
  if (!th.length) throw new Error('App Store TH returned no THB rows')
  const seen = new Set<string>()
  const uniq = th.filter((r) => {
    const k = r.offerName || r.id
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const usd = await fetchUsdFor(uniq, signal)
  const usdCcs = new Set<string>()
  const packs = uniq.map((t) => {
    const m = usd.match.get(t.id)
    if (m) usdCcs.add(m.cc)
    const nameEn = m?.row.name ?? (hasThai(t.name) ? null : t.name)
    const pid = t.offerName ?? null
    const kind = crbKind(pid, nameEn ?? t.name)
    const currencyItem = crbCurrencyItem(pid, nameEn ?? t.name)
    const descEn = (m?.row.description || (!hasThai(t.description) ? t.description : '') || '').trim() || null
    const descTh = hasThai(t.description) ? t.description!.trim() : null
    const pack: any = {
      id: 0,
      name: nameEn ?? t.name,
      name_en: nameEn,
      name_th: hasThai(t.name) ? t.name : null,
      product_id: pid,
      apple_item_id: t.id,
      kind,
      ...(currencyItem ? { item: currencyItem } : {}),
      item_pack: kind !== 'currency',
      ...amountFields(kind),
      price: t.price,
      currency: 'THB',
      prices: { THB: t.price, USD: m?.row.price ?? null },
      price_thb: t.price,
      price_thb_source: `apple-app-store-th (${pid ? `offerName=${pid}, ` : ''}item ${t.id})`,
      price_usd: m?.row.price ?? null,
      price_usd_source: m ? `apple-app-store-${m.cc} (item ${m.row.id})` : null,
      description_th: descTh,
      description_en: descEn,
      ...contentsFields(kind, currencyItem, descEn),
      family_shareable: t.familyShareable ?? null
    }
    if (!pack.name_en) pack.name_en_null_reason = 'No USD storefront listed this item, and App Store TH gives only the Thai name'
    if (!pack.name_th) pack.name_th_null_reason = `App Store TH (Thai locale) lists this item under its Latin-script name only ("${t.name}"), no Thai name`
    if (!descTh) pack.description_th_null_reason = 'App Store TH returned no Thai description for this item'
    if (!descEn) pack.description_en_null_reason = 'No English description on a USD App Store storefront for this item'
    if (!m)
      pack.price_usd_null_reason =
        'Not found on App Store US / KH / LA / MM by item id or offerName' + (usd.reasons.length ? ` (${usd.reasons.join('; ')})` : '') + '; no FX conversion'
    return pack
  })
  const categories = buildCategories(packs, 'Live App Store full in-app purchase list (no fallback catalog)')
  const usdList = [...usdCcs]
  const api = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${COOKIERUN_CRUMBLE_APP_ID}/top-in-apps`
  const notes = [
    'THB = official Apple App Store TH (full in-app purchase list, Thai names / descriptions). USD = App Store US; items missing there fall back to KH / LA / MM (USD storefronts). Matched by Apple item id / offerName. No FX conversion, no resellers, no hardcoded prices.',
    ...COMMON_NOTES
  ]
  if (usd.reasons.length) notes.push('USD lookup: ' + usd.reasons.join('; '))
  notes.push(APPSTORE_FULL_IAP_NOTE)
  return envelope(
    categories,
    {
      source: api('th'),
      sources: { thb: COOKIERUN_CRUMBLE_APPSTORE_TH_URL, usd: COOKIERUN_CRUMBLE_APPSTORE_US_URL },
      source_details: {
        thb_api: api('th'),
        usd_api: (usdList.length ? usdList : ['us']).map(api),
        usd_storefronts: usdList,
        devsisters_iap_support: COOKIERUN_CRUMBLE_SUPPORT_IAP_URL
      },
      source_mode: 'appstore-catalog-api'
    },
    notes
  )
}

async function fetchHtml(url: string, signal?: AbortSignal): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(25_000),
      headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8', 'User-Agent': BROWSER_UA }
    })
  } catch (e) {
    throw new CookieRunCrumbleUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!res.ok) throw new CookieRunCrumbleUpstreamUnavailableError('HTTP ' + res.status + ' for ' + url)
  try {
    return await res.text()
  } catch (e) {
    throw new CookieRunCrumbleUpstreamUnavailableError(e instanceof Error ? e.message : 'failed to read body')
  }
}

/** Fallback: App Store TH product page (top items only). */
async function fromProductPage(signal: AbortSignal | undefined, apiReason: string): Promise<RovPacksResponse> {
  const html = await fetchHtml(COOKIERUN_CRUMBLE_APPSTORE_TH_URL, signal)
  const rows = parseCookieRunClassicIapFromHtml(html, 'THB')
  if (!rows.length) throw new CookieRunCrumbleInvalidUpstreamResponseError('In-App Purchases section not found or empty on App Store TH')
  const usdReason =
    'Catalog API unavailable; the App Store product pages give no item ids and TH names are Thai while US names are English, so USD cannot be paired; no FX conversion'
  const packs = rows.map((r) => {
    const kind = crbKind(null, r.name)
    const currencyItem = crbCurrencyItem(null, r.name)
    const th = hasThai(r.name)
    return {
      id: 0,
      name: r.name,
      name_en: th ? null : r.name,
      ...(th ? { name_en_null_reason: 'Product page fallback shows the Thai name only' } : {}),
      name_th: th ? r.name : null,
      ...(th ? {} : { name_th_null_reason: 'App Store TH page shows this item without a Thai name' }),
      product_id: null,
      kind,
      ...(currencyItem ? { item: currencyItem } : {}),
      item_pack: kind !== 'currency',
      ...amountFields(kind),
      price: r.price,
      currency: 'THB',
      prices: { THB: r.price, USD: null },
      price_thb: r.price,
      price_thb_source: 'apple-app-store-th (product page)',
      price_usd: null,
      price_usd_source: null,
      price_usd_null_reason: usdReason,
      description_th: null,
      description_th_null_reason: 'App Store product page shows only names and prices (catalog API unavailable)',
      description_en: null,
      description_en_null_reason: 'App Store product page shows only names and prices (catalog API unavailable)',
      ...(kind === 'currency' && currencyItem
        ? contentsFields(kind, currencyItem, null)
        : { contents: null, contents_null_reason: 'App Store product page shows only names and prices (catalog API unavailable)' })
    }
  })
  return envelope(
    buildCategories(packs, 'Live App Store TH product page (top items only; catalog API unavailable)'),
    {
      source: COOKIERUN_CRUMBLE_APPSTORE_TH_URL,
      sources: { thb: COOKIERUN_CRUMBLE_APPSTORE_TH_URL, usd: null },
      source_mode: 'appstore-product-page',
      api_error: apiReason
    },
    [`Fallback mode: App Store catalog API unavailable (${apiReason}); THB read from the App Store TH product page, which lists only the top in-app purchases.`, ...COMMON_NOTES]
  )
}

/** Live CookieRun: Crumble packs. Never hardcodes prices; all sources down -> throws (route returns 502). */
export async function fetchCookieRunCrumblePacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  let apiReason: string
  try {
    return await fromCatalogApi(options?.signal)
  } catch (e) {
    apiReason = e instanceof Error ? e.message : String(e)
  }
  return fromProductPage(options?.signal, apiReason)
}

import type { RovPacksResponse } from '../types/rov'
import {
  APPSTORE_FULL_IAP_NOTE,
  APPSTORE_IAP_API_BASE,
  fetchAppStoreFullIap,
  type AppStoreFullIapRow
} from './appstore-full-iap'
import { parseCookieRunClassicIapFromHtml } from './cookierun-classic-appstore-packs.service'

/**
 * Shared builder for games whose official THB price list is the Apple App Store TH full in-app purchase list
 * (no official THB webshop). THB = App Store TH (catalog API, Thai locale), USD = App Store US, per-item fallback
 * KH / LA / MM (USD storefronts), matched by Apple item id / offerName (publisher product id). No FX, no resellers,
 * no hardcoded prices or amounts. Catalog API down -> App Store TH product page (top items only, USD null).
 */

export type AsKind = 'currency' | 'pass' | 'bundle'
export type AsContent = { item: string; amount: number | null }
export type AsClassified = {
  kind: AsKind
  /** currency item name (currency kind only) */
  item?: string | null
  /** amount stated by the official name / description (currency kind only) */
  baseItemAmount?: number | null
  /** bonus explicitly stated by an official source; otherwise left null with a reason */
  bonusItemAmount?: number | null
  bonus_note?: string
  contents?: AsContent[] | null
  contents_null_reason?: string
}
export type AsItemInput = {
  productId: string | null
  nameEn: string | null
  nameTh: string | null
  rawName: string
  descEn: string | null
  descTh: string | null
}
export type AppStoreGameConfig = {
  appId: number
  slug: string
  name: string
  officialTitle: string
  publisher: string
  itemName: string
  thUrl: string
  usUrl: string
  categoryNames: Record<AsKind, string>
  classify: (it: AsItemInput) => AsClassified
  notes: string[]
  sourceDetails?: Record<string, unknown>
  /** fallback when the TH locale gives a Latin-only name */
  nameThNullReason?: (rawName: string) => string
}

export class AppStoreGameUpstreamUnavailableError extends Error {
  constructor(message = 'App Store upstream unavailable') {
    super(message)
    this.name = 'AppStoreGameUpstreamUnavailableError'
  }
}
export class AppStoreGameInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid App Store response') {
    super(message)
    this.name = 'AppStoreGameInvalidUpstreamResponseError'
  }
}

export const USD_STOREFRONTS = ['us', 'kh', 'la', 'mm'] as const
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
export const hasThai = (s: string | undefined | null) => !!s && /[\u0E00-\u0E7F]/.test(s)
export const appStoreApiUrl = (cc: string, appId: number) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${appId}/top-in-apps`

/** USD price per item: App Store US first, then KH / LA / MM, matched by Apple item id or offerName (product id). */
export async function fetchAppStoreUsdFor(
  appId: number,
  need: { key: string; id?: string | null; offerName?: string | null }[],
  signal?: AbortSignal
) {
  const match = new Map<string, { row: AppStoreFullIapRow; cc: string }>()
  const reasons: string[] = []
  let pending = need.slice()
  for (const cc of USD_STOREFRONTS) {
    if (!pending.length) break
    let rows: AppStoreFullIapRow[]
    try {
      rows = (await fetchAppStoreFullIap(cc, String(appId), cc === 'us' ? 'en-US' : null, signal)).filter((r) => r.currency === 'USD')
    } catch (e) {
      reasons.push(`${cc.toUpperCase()}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    const byId = new Map(rows.map((r) => [r.id, r]))
    const byOffer = new Map(rows.filter((r) => r.offerName).map((r) => [r.offerName!, r]))
    const still: typeof pending = []
    for (const t of pending) {
      const u = (t.id ? byId.get(t.id) : undefined) ?? (t.offerName ? byOffer.get(t.offerName) : undefined)
      if (u) match.set(t.key, { row: u, cc })
      else still.push(t)
    }
    if (still.length) reasons.push(`${cc.toUpperCase()}: ${still.length} item(s) not listed`)
    pending = still
  }
  return { match, reasons }
}

export function amountFields(c: AsClassified) {
  if (c.kind !== 'currency')
    return {
      baseItemAmount: null,
      bonusItemAmount: null,
      totalItemAmount: null,
      base_null_reason: c.kind === 'pass' ? 'Pass / membership item; not a plain currency amount' : 'Package / bundle item; not a plain currency amount',
      bonus_null_reason: 'No currency bonus on pass / package items',
      total_null_reason: 'Not a plain currency amount',
      bonus_available: false
    }
  const base = c.baseItemAmount ?? null
  const bonus = c.bonusItemAmount ?? null
  const out: Record<string, unknown> = {
    baseItemAmount: base,
    bonusItemAmount: bonus,
    totalItemAmount: base != null && bonus != null ? base + bonus : null,
    bonus_available: bonus != null && bonus > 0
  }
  if (base == null) out.base_null_reason = 'The official item name / description states no amount'
  if (bonus == null)
    out.bonus_null_reason =
      'No bonus stated on the official App Store listing (any first-purchase / event bonus is shown in-game only); not assumed to be 0'
  if (c.bonus_note) out.bonus_note = c.bonus_note
  if (base == null || bonus == null)
    out.total_null_reason = base == null ? 'Base amount unknown' : 'Bonus not published by an official source, so base+bonus total is not stated'
  return out
}

function contentsFields(c: AsClassified) {
  if (c.contents && c.contents.length) return { contents: c.contents }
  if (c.kind === 'currency' && c.item)
    return { contents: [{ item: c.item, amount: c.baseItemAmount ?? null }] }
  return { contents: null, contents_null_reason: c.contents_null_reason ?? 'The official listing does not itemise the contents (shown in-game only)' }
}

function buildCategories(cfg: AppStoreGameConfig, packs: any[], message: string) {
  const byPrice = (a: any, b: any) =>
    (a.price_thb ?? Infinity) - (b.price_thb ?? Infinity) ||
    (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) ||
    String(a.product_id ?? a.name).localeCompare(String(b.product_id ?? b.name))
  let n = 0
  return (['currency', 'pass', 'bundle'] as AsKind[])
    .map((k, i) => ({ id: i + 1, name: cfg.categoryNames[k], packs: packs.filter((p) => p.kind === k) }))
    .filter((c) => c.packs.length)
    .map((c) => {
      c.packs.sort(byPrice)
      for (const p of c.packs) p.id = ++n
      return { ...c, status: 0, message, packCount: c.packs.length }
    })
}

export function gameEnvelope(
  game: { appId: number; slug: string; name: string; itemName: string; officialTitle: string; publisher: string },
  categories: any[],
  extra: Record<string, unknown>,
  notes: string[]
): RovPacksResponse {
  return {
    game: { id: game.appId, slug: game.slug, name: game.name, itemName: game.itemName, itemIcon: '' },
    official_title: game.officialTitle,
    publisher: game.publisher,
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s: number, c: any) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    ...extra,
    notes
  } as unknown as RovPacksResponse
}

async function fromCatalogApi(cfg: AppStoreGameConfig, signal?: AbortSignal): Promise<RovPacksResponse> {
  const th = (await fetchAppStoreFullIap('th', String(cfg.appId), 'th', signal)).filter((r) => r.currency === 'THB')
  if (!th.length) throw new Error('App Store TH returned no THB rows')
  const seen = new Set<string>()
  const uniq = th.filter((r) => {
    const k = r.offerName || r.id
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const usd = await fetchAppStoreUsdFor(cfg.appId, uniq.map((t) => ({ key: t.id, id: t.id, offerName: t.offerName })), signal)
  const usdCcs = new Set<string>()
  const packs = uniq.map((t) => {
    const m = usd.match.get(t.id)
    if (m) usdCcs.add(m.cc)
    const nameEn = m?.row.name ?? (hasThai(t.name) ? null : t.name)
    const nameTh = hasThai(t.name) ? t.name : null
    const pid = t.offerName ?? null
    const descEn = (m?.row.description || (!hasThai(t.description) ? t.description : '') || '').trim() || null
    const descTh = hasThai(t.description) ? t.description!.trim() : null
    const c = cfg.classify({ productId: pid, nameEn, nameTh, rawName: t.name, descEn, descTh })
    const pack: any = {
      id: 0,
      name: nameEn ?? t.name,
      name_en: nameEn,
      name_th: nameTh,
      product_id: pid,
      apple_item_id: t.id,
      kind: c.kind,
      ...(c.kind === 'currency' && c.item ? { item: c.item } : {}),
      item_pack: c.kind !== 'currency',
      ...amountFields(c),
      price: t.price,
      currency: 'THB',
      prices: { THB: t.price, USD: m?.row.price ?? null },
      price_thb: t.price,
      price_thb_source: `apple-app-store-th (${pid ? `offerName=${pid}, ` : ''}item ${t.id})`,
      price_usd: m?.row.price ?? null,
      price_usd_source: m ? `apple-app-store-${m.cc} (item ${m.row.id})` : null,
      description_th: descTh,
      description_en: descEn,
      ...contentsFields(c),
      family_shareable: t.familyShareable ?? null
    }
    if (!pack.name_en) pack.name_en_null_reason = 'No USD storefront listed this item, and App Store TH gives only the Thai name'
    if (!pack.name_th)
      pack.name_th_null_reason =
        cfg.nameThNullReason?.(t.name) ?? `App Store TH (Thai locale) lists this item under its Latin-script name only ("${t.name}"), no Thai name`
    if (!descTh) pack.description_th_null_reason = 'App Store TH returned no Thai-language description for this item'
    if (!descEn) pack.description_en_null_reason = 'No English description on a USD App Store storefront for this item'
    if (!m)
      pack.price_usd_null_reason =
        'Not found on App Store US / KH / LA / MM by item id or offerName' + (usd.reasons.length ? ` (${usd.reasons.join('; ')})` : '') + '; no FX conversion'
    return pack
  })
  const usdList = [...usdCcs]
  const notes = [
    'THB = official Apple App Store TH (full in-app purchase list, Thai locale). USD = App Store US; items missing there fall back to KH / LA / MM (USD storefronts). Matched by Apple item id / offerName. No FX conversion, no resellers, no hardcoded prices.',
    ...cfg.notes
  ]
  if (usd.reasons.length) notes.push('USD lookup: ' + usd.reasons.join('; '))
  notes.push(APPSTORE_FULL_IAP_NOTE)
  return gameEnvelope(
    cfg,
    buildCategories(cfg, packs, 'Live App Store full in-app purchase list (no fallback catalog)'),
    {
      source: appStoreApiUrl('th', cfg.appId),
      sources: { thb: cfg.thUrl, usd: cfg.usUrl },
      source_details: {
        thb_api: appStoreApiUrl('th', cfg.appId),
        usd_api: (usdList.length ? usdList : ['us']).map((cc) => appStoreApiUrl(cc, cfg.appId)),
        usd_storefronts: usdList,
        ...(cfg.sourceDetails ?? {})
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
    throw new AppStoreGameUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!res.ok) throw new AppStoreGameUpstreamUnavailableError('HTTP ' + res.status + ' for ' + url)
  try {
    return await res.text()
  } catch (e) {
    throw new AppStoreGameUpstreamUnavailableError(e instanceof Error ? e.message : 'failed to read body')
  }
}

async function fromProductPage(cfg: AppStoreGameConfig, signal: AbortSignal | undefined, apiReason: string): Promise<RovPacksResponse> {
  const html = await fetchHtml(cfg.thUrl, signal)
  const rows = parseCookieRunClassicIapFromHtml(html, 'THB')
  if (!rows.length) throw new AppStoreGameInvalidUpstreamResponseError(`In-App Purchases section not found or empty on App Store TH (${cfg.name})`)
  const usdReason =
    'Catalog API unavailable; the App Store product pages give no item ids, so USD items cannot be paired with TH items; no FX conversion'
  const pageReason = 'App Store product page shows only names and prices (catalog API unavailable)'
  const packs = rows.map((r) => {
    const th = hasThai(r.name)
    const c = cfg.classify({ productId: null, nameEn: th ? null : r.name, nameTh: th ? r.name : null, rawName: r.name, descEn: null, descTh: null })
    return {
      id: 0,
      name: r.name,
      name_en: th ? null : r.name,
      ...(th ? { name_en_null_reason: 'Product page fallback shows the Thai name only' } : {}),
      name_th: th ? r.name : null,
      ...(th ? {} : { name_th_null_reason: 'App Store TH page shows this item without a Thai name' }),
      product_id: null,
      kind: c.kind,
      ...(c.kind === 'currency' && c.item ? { item: c.item } : {}),
      item_pack: c.kind !== 'currency',
      ...amountFields(c),
      price: r.price,
      currency: 'THB',
      prices: { THB: r.price, USD: null },
      price_thb: r.price,
      price_thb_source: 'apple-app-store-th (product page)',
      price_usd: null,
      price_usd_source: null,
      price_usd_null_reason: usdReason,
      description_th: null,
      description_th_null_reason: pageReason,
      description_en: null,
      description_en_null_reason: pageReason,
      ...contentsFields({ ...c, contents_null_reason: c.contents ? undefined : pageReason })
    }
  })
  return gameEnvelope(
    cfg,
    buildCategories(cfg, packs, 'Live App Store TH product page (top items only; catalog API unavailable)'),
    { source: cfg.thUrl, sources: { thb: cfg.thUrl, usd: null }, source_mode: 'appstore-product-page', api_error: apiReason },
    [`Fallback mode: App Store catalog API unavailable (${apiReason}); THB read from the App Store TH product page, which lists only the top in-app purchases.`, ...cfg.notes]
  )
}

/** Live packs for an App Store-sourced game. Never hardcodes prices; all sources down -> throws (route returns 502). */
export async function fetchAppStoreGamePacks(cfg: AppStoreGameConfig, signal?: AbortSignal): Promise<RovPacksResponse> {
  let apiReason: string
  try {
    return await fromCatalogApi(cfg, signal)
  } catch (e) {
    apiReason = e instanceof Error ? e.message : String(e)
  }
  return fromProductPage(cfg, signal, apiReason)
}

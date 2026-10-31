import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'

/**
 * Clash of Clans (Supercell).
 * 1st choice: Supercell Store (store.supercell.com/clashofclans). Its TH market is THB, but the public page is a
 *   "store-preview" that says "Log in to view offers" (state.props.reason = not-authenticated): no public offer list.
 *   The service reads that page live and reports its status; it never logs in.
 * So THB = official Apple App Store TH (full IAP list, Thai locale), USD = App Store US, else KH / LA / MM
 *   (USD storefronts), matched by Apple item id / offerName (Supercell's own product id, com.supercell.magic.*).
 * Generic in-game "Special Offer" price-tier SKUs (offer_X.XX, deals_, resource_X.XX, softconversion_, gemconversion_,
 *   featuredproduct_) and the gem-pack price-test tiers (packageN.tNN / packageN_TNN) are not standalone products,
 *   so they are counted in notes, not listed. No FX, no resellers, no hardcoded prices or amounts.
 */
export const COC_SLUG = 'clash-of-clans'
export const COC_APP_ID = 529479190
export const COC_STORE_URL = 'https://store.supercell.com/clashofclans'
export const COC_APPSTORE_TH = `https://apps.apple.com/th/app/id${COC_APP_ID}`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const USD_CCS = ['us', 'kh', 'la', 'mm'] as const

export class CocUpstreamUnavailableError extends Error {
  constructor(message = 'Clash of Clans App Store TH upstream unavailable') { super(message); this.name = 'CocUpstreamUnavailableError' }
}
export class CocInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Clash of Clans upstream response') { super(message); this.name = 'CocInvalidUpstreamResponseError' }
}

export type CocKind = 'currency' | 'pass' | 'bundle' | 'tier' | 'gem-tier'
const TIER_RE = /\.(?:offer|featuredproduct|deals|resource|softconversion|gemconversion)_\d+(?:\.\d+)?$/i
const GEM_TIER_RE = /\.package\d+(?:\.t|_t)\d+$/i
/** Classify by Supercell's product id (Apple offerName); generic "Special Offer" names are tiers too. */
export function cocKind(productId: string, nameEn: string): CocKind {
  if (GEM_TIER_RE.test(productId)) return 'gem-tier'
  if (TIER_RE.test(productId) || /^special offer$/i.test(nameEn.trim())) return 'tier'
  if (/\.package\d+$/i.test(productId)) return 'currency'
  if (/goldpass|eventpass/i.test(productId)) return 'pass'
  return 'bundle'
}
export const cocPassType = (pid: string) => (/goldpass/i.test(pid) ? 'gold-pass' : /eventpassmini/i.test(pid) ? 'mini-event-pass' : /eventpass/i.test(pid) ? 'event-pass' : null)
const hasThai = (s: string | undefined) => !!s && /[\u0E00-\u0E7F]/.test(s)

const unescapeHtml = (s: string) => s.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
export type CocStoreStatus = { ok: boolean; currency: string | null; country: string | null; route: string | null; reason: string | null; error?: string }
/** Reads the public Supercell Store page: market (country/currency) and why offers are hidden. */
export function parseCocStorePage(html: string): CocStoreStatus {
  const grab = (id: string): any => {
    const m = html.match(new RegExp(`<noscript id="${id}" data-[a-z-]+="([^"]*)"`))
    if (!m) return null
    try { return JSON.parse(unescapeHtml(m[1])) } catch { return null }
  }
  const market = grab('market'); const state = grab('state')
  return {
    ok: !!(market || state), currency: market?.currencyCode ?? null, country: market?.countryCode ?? null,
    route: state?.route ?? null, reason: state?.props?.reason ?? (/Log in to view offers/i.test(html) ? 'login required' : null)
  }
}
async function fetchStoreStatus(signal?: AbortSignal): Promise<CocStoreStatus> {
  try {
    const r = await fetch(COC_STORE_URL, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8' } })
    if (!r.ok) return { ok: false, currency: null, country: null, route: null, reason: null, error: 'HTTP ' + r.status }
    return parseCocStorePage(await r.text())
  } catch (e) {
    return { ok: false, currency: null, country: null, route: null, reason: null, error: e instanceof Error ? e.message : String(e) }
  }
}

type UsdList = { rows: AppStoreFullIapRow[] | null; cc: string; reason?: string }
async function fetchUsd(signal?: AbortSignal): Promise<UsdList> {
  const reasons: string[] = []
  for (const cc of USD_CCS) {
    try {
      const rows = (await fetchAppStoreFullIap(cc, String(COC_APP_ID), cc === 'us' ? 'en-US' : null, signal)).filter((r) => r.currency === 'USD')
      if (rows.length) return { rows, cc, reason: reasons.length ? reasons.join('; ') : undefined }
      reasons.push(`${cc.toUpperCase()}: no USD rows`)
    } catch (e) { reasons.push(`${cc.toUpperCase()}: ${e instanceof Error ? e.message : String(e)}`) }
  }
  return { rows: null, cc: 'us', reason: reasons.join('; ') }
}

export async function fetchClashOfClansPacks(signal?: AbortSignal): Promise<RovPacksResponse> {
  const store = await fetchStoreStatus(signal)
  let th: AppStoreFullIapRow[]
  try { th = await fetchAppStoreFullIap('th', String(COC_APP_ID), 'th', signal) } catch (e) {
    throw new CocUpstreamUnavailableError('App Store TH: ' + (e instanceof Error ? e.message : String(e)))
  }
  th = th.filter((r) => r.currency === 'THB')
  if (!th.length) throw new CocInvalidUpstreamResponseError('App Store TH returned no THB rows')
  // Sequential after TH: Apple rate-limits bursts.
  const usd = await fetchUsd(signal)
  const usdCc = usd.cc.toUpperCase()
  const usdById = new Map((usd.rows ?? []).map((r) => [r.id, r]))
  const usdByOffer = new Map((usd.rows ?? []).filter((r) => r.offerName).map((r) => [r.offerName!, r]))

  const storeReason = store.ok
    ? `Supercell Store (${store.country ?? '?'} market, ${store.currency ?? '?'}) shows offers only after a Supercell ID login (${store.reason ?? store.route ?? 'no public offer list'})`
    : `Supercell Store page unavailable (${store.error ?? 'unparseable'})`
  const skipped = { tier: 0, 'gem-tier': 0 } as Record<string, number>
  const seen = new Set<string>()
  const packs: any[] = []
  for (const t of th) {
    const pid = t.offerName ?? ''
    const key = pid || t.id
    if (seen.has(key)) continue
    seen.add(key)
    const u = (t.id && usdById.get(t.id)) || (pid ? usdByOffer.get(pid) : undefined)
    const nameEn = u?.name ?? (hasThai(t.name) ? '' : t.name)
    const kind = cocKind(pid, nameEn || t.name)
    if (kind === 'tier' || kind === 'gem-tier') { skipped[kind]++; continue }
    const isCur = kind === 'currency'
    const pack: any = {
      id: 0, name: nameEn || t.name, name_th: hasThai(t.name) ? t.name : null, product_id: pid || null, apple_item_id: t.id || null,
      kind, item_pack: !isCur,
      prices: { THB: t.price, USD: u?.price ?? null },
      price_thb: t.price, price_thb_source: `apple-app-store-th (${pid ? `offerName=${pid}, ` : ''}item ${t.id})`,
      price_usd: u?.price ?? null, price_usd_source: u ? `apple-app-store-${usd.cc} (item ${u.id})` : null,
      price: t.price, currency: 'THB',
      baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, bonus_available: false,
      base_null_reason: isCur
        ? `Gem amount not published by an official source: Apple lists only the pack name and price; ${storeReason}`
        : `${kind === 'pass' ? 'Pass' : 'Bundle'} item; not a plain Gems amount`,
      bonus_null_reason: isCur ? 'No official bonus amount published (Apple/Supercell Store public data has none)' : 'No currency bonus on pass/bundle items',
      description_en: (u?.description && u.description.trim()) || nameEn || null,
      description_th: hasThai(t.description) ? t.description : hasThai(t.name) ? t.name : null,
      contents: null,
      contents_null_reason: isCur
        ? 'Gem amount is not published by Apple or the public Supercell Store page'
        : 'Apple lists only the item name and price tier; contents vary by Town Hall / event and are shown in-game only'
    }
    if (kind === 'pass') pack.pass_type = cocPassType(pid)
    if (!pack.description_en) pack.description_en_null_reason = 'No English text: App Store USD storefronts unavailable and TH lists it in Thai only'
    if (!pack.description_th) pack.description_th_null_reason = 'Apple shows this item in English only on the TH storefront'
    if (!u) pack.price_usd_null_reason = usd.rows ? `Not on App Store ${usdCc} (by item id / offerName)` : 'App Store USD storefronts (US/KH/LA/MM) unavailable: ' + usd.reason
    packs.push(pack)
  }
  if (!packs.length) throw new CocInvalidUpstreamResponseError('No Clash of Clans products in App Store TH list')

  const byThb = (a: any, b: any) => a.price_thb - b.price_thb || String(a.product_id).localeCompare(String(b.product_id))
  const msg = 'Live (no fallback catalog)'
  let n = 0
  const categories = [
    { id: 1, name: 'Gems (App Store)', packs: packs.filter((p) => p.kind === 'currency') },
    { id: 2, name: 'Gold Pass & Event Pass (App Store)', packs: packs.filter((p) => p.kind === 'pass') },
    { id: 3, name: 'Packs & Bundles (App Store)', packs: packs.filter((p) => p.kind === 'bundle') }
  ].filter((c) => c.packs.length).map((c) => {
    c.packs.sort(byThb)
    c.packs.forEach((p) => (p.id = ++n))
    return { ...c, status: 0, message: msg, packCount: c.packs.length }
  })

  const notes = [
    `Supercell Store checked live: ${storeReason}. No public offer list, so it is not used for prices.`,
    'THB = official Apple App Store TH (full in-app purchase list, Thai locale). USD = App Store US, fallback KH / LA / MM (USD storefronts), matched by Apple item id / offerName (Supercell product id). No FX conversion, no resellers, no hardcoded prices.',
    'Gem amounts (base/bonus/total) and pack contents are null: Apple publishes only names and price tiers, and the Supercell Store needs a login. Unofficial wiki figures are not used.',
    `Excluded from the list (not standalone products): ${skipped.tier} generic "Special Offer" price-tier SKUs and ${skipped['gem-tier']} gem-pack price-test tiers (packageN.tNN).`,
    'description_th = Apple TH Thai text where Apple has one; otherwise null with a reason. description_en = Apple US/USD-storefront text.'
  ]
  if (usd.cc !== 'us' && usd.rows) notes.push(`App Store USD prices from ${usdCc} (${usd.reason})`)
  if (!usd.rows) notes.push('App Store USD storefronts unavailable: ' + usd.reason)
  notes.push(APPSTORE_FULL_IAP_NOTE)
  return ({
    game: { id: COC_APP_ID, slug: COC_SLUG, name: 'Clash of Clans', itemName: 'Gems', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: `${APPSTORE_IAP_API_BASE}/th/apps/${COC_APP_ID}/top-in-apps`,
    sources: {
      supercell_store: COC_STORE_URL,
      thb: `${APPSTORE_IAP_API_BASE}/th/apps/${COC_APP_ID}/top-in-apps`,
      usd: `${APPSTORE_IAP_API_BASE}/${usd.cc}/apps/${COC_APP_ID}/top-in-apps`,
      appstore_th_page: COC_APPSTORE_TH
    },
    store_status: store,
    notes
  } as unknown) as RovPacksResponse
}

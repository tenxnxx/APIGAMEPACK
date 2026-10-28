import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'
import { matchApple } from './where-winds-meet-packs.service'

/**
 * Love and Deepspace (Infold Games / Papergames, global build com.papegames.lysk.en, App Store app 6443467666).
 * Official web store: Infold "Top-Up Center" https://loveanddeepspace.infoldgames.com/charge/en-EN/ . Its product list
 * (passport.paperdb.com /v2/payment/user/products, clientid 1067) only answers for a logged-in Infold account with a
 * selected server/role (anonymous calls get code 1002 "Parameter error", and the page shows "Unavailable"), so there is no
 * public live price API to read. THB therefore comes from App Store TH; USD from App Store US (or LA / MM / KH when an item
 * is not sold in the US), matched only by Apple offerName or Apple item id. No resellers, no FX conversion, no hardcoded prices.
 */
export const LADS_SLUG = 'love-and-deepspace'
export const LADS_NAME = 'Love and Deepspace'
export const LADS_APPSTORE_ID = 6443467666
export const LADS_WEB_STORE = 'https://loveanddeepspace.infoldgames.com/charge/en-EN/'
export const LADS_WEB_STORE_API = 'https://passport.paperdb.com/v2/payment/user/products'
export const LADS_USD_FALLBACK_STOREFRONTS = ['la', 'mm', 'kh'] as const
export const ladsCatalogUrl = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${LADS_APPSTORE_ID}/top-in-apps`
const WEB_STORE_REASON = `official Infold Top-Up Center (${LADS_WEB_STORE}) lists products only for a logged-in account with a selected role (no public price API)`

export class LoveAndDeepspaceUpstreamUnavailableError extends Error {
  constructor(message = 'Love and Deepspace upstream unavailable') { super(message); this.name = 'LoveAndDeepspaceUpstreamUnavailableError' }
}
export class LoveAndDeepspaceInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Love and Deepspace upstream response') { super(message); this.name = 'LoveAndDeepspaceInvalidUpstreamResponseError' }
}

type List = { rows: AppStoreFullIapRow[] } | { rows: null; reason: string }
async function list(cc: string, l: string | null, signal?: AbortSignal, retryMs = 2500): Promise<List> {
  for (let attempt = 0; ; attempt++) {
    try { return { rows: await fetchAppStoreFullIap(cc, String(LADS_APPSTORE_ID), l, signal) } } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      if (attempt === 0 && /\b429\b/.test(reason) && !signal?.aborted) { await new Promise((r) => setTimeout(r, retryMs)); continue }
      return { rows: null, reason }
    }
  }
}
const reasonOf = (x: List) => ('reason' in x ? x.reason : '')
const notSold = (x: List) => (/\b404\b/.test(reasonOf(x)) ? '; not sold on this storefront' : '')

export type LadsKind = 'currency' | 'pass' | 'double-pack' | 'bundle'
/** Crystals tiers: offerName com.papegames.lysk.en.pack<N> named "<N> Crystals". Passes by name. Double Packs by offerName. */
export function ladsKind(offerName: string | null | undefined, name: string): LadsKind {
  const o = offerName ?? ''
  if (/\.pack\d+$/.test(o) && /^\s*\d[\d,]*\s+crystals?\s*$/i.test(name)) return 'currency'
  if (/\bpass\b|promise|\bvow\b/i.test(name)) return 'pass'
  if (/doublegift/i.test(o) || /double pack/i.test(name)) return 'double-pack'
  return 'bundle'
}
export function ladsPassType(name: string): string {
  if (/aurum/i.test(name)) return 'aurum-pass-monthly'
  if (/yearly/i.test(name)) return 'yearly-pass'
  if (/upgrade|extra/i.test(name)) return 'promise-pass-upgrade'
  if (/promise|vow/i.test(name)) return 'promise-pass'
  return 'pass'
}
/** "Buy and get Aurum Pass for 30 Days" -> 30 */
export const passDays = (s: string | null | undefined) => { const m = (s ?? '').match(/(\d+)\s*days?/i); return m ? Number(m[1]) : null }
/** "60 Crystals" -> 60 */
export const crystalsInName = (name: string) => { const m = name.match(/^\s*(\d[\d,]*)\s+crystals?\s*$/i); return m ? Number(m[1].replace(/,/g, '')) : null }
/** Apple description "Gets 60 Crystals" -> 60 (total Crystals delivered as stated by the listing). */
export const crystalsInDesc = (d: string | null | undefined) => { const m = (d ?? '').match(/gets?\s+(\d[\d,]*)\s+crystals?/i); return m ? Number(m[1].replace(/,/g, '')) : null }
const hasThai = (s: string | null | undefined) => /[\u0e00-\u0e7f]/.test(s ?? '')

export async function fetchLoveAndDeepspacePacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  // Sequential (Apple rate-limits bursts).
  const thEn = await list('th', 'en-GB', signal)
  if (!thEn.rows) {
    const msg = `App Store TH: ${reasonOf(thEn)}`
    if (/bad shape|empty list/i.test(msg)) throw new LoveAndDeepspaceInvalidUpstreamResponseError(msg)
    throw new LoveAndDeepspaceUpstreamUnavailableError(msg)
  }
  const thRows = thEn.rows.filter((r) => r.currency === 'THB')
  if (!thRows.length) throw new LoveAndDeepspaceInvalidUpstreamResponseError('App Store TH returned no THB items')
  const thTh = await list('th', 'th', signal)
  const us = await list('us', 'en-US', signal)
  const fallbackUsd: Record<string, List> = {}
  const usdFor = async (ref: { offerName?: string | null; id?: string | null }) => {
    const m = matchApple(us.rows, ref)
    if (m && m.row.currency === 'USD') return { m, cc: 'us' }
    for (const cc of LADS_USD_FALLBACK_STOREFRONTS) {
      fallbackUsd[cc] ??= await list(cc, null, signal)
      const f = matchApple(fallbackUsd[cc].rows, ref)
      if (f && f.row.currency === 'USD') return { m: f, cc }
    }
    return null
  }
  const storefronts = () =>
    `App Store US${us.rows ? '' : ` (${reasonOf(us)}${notSold(us)})`} or ` +
    LADS_USD_FALLBACK_STOREFRONTS.map((c) => `${c.toUpperCase()}${fallbackUsd[c] && !fallbackUsd[c].rows ? ` (${reasonOf(fallbackUsd[c])}${notSold(fallbackUsd[c])})` : ''}`).join('/')

  const packs: any[] = []
  for (const row of thRows) {
    const kind = ladsKind(row.offerName, row.name)
    const ref = { offerName: row.offerName ?? null, id: row.id }
    const th = thTh.rows ? matchApple(thTh.rows, ref)?.row : undefined
    const u = await usdFor(ref)
    const description_en = row.description?.trim() || null
    // Apple's Thai-locale list (l=th) is only used when it really carries Thai text; Infold ships English-only IAP text.
    const name_th = th && hasThai(th.name) ? th.name.trim() : null
    const description_th = th?.description && hasThai(th.description) ? th.description.trim() : null
    const parts: string[] = []
    for (const s of [description_th, description_en]) if (s && !parts.includes(s)) parts.push(s)
    const name = row.name.trim()
    let amounts: Record<string, unknown>
    if (kind === 'currency') {
      const base = crystalsInName(name)
      const total = crystalsInDesc(description_en)
      const bonus = base !== null && total !== null && total >= base ? total - base : null
      amounts = {
        baseItemAmount: base, bonusItemAmount: bonus, totalItemAmount: bonus !== null ? total : null, item_pack: false,
        ...(base === null ? { base_null_reason: 'Crystals amount not stated in the App Store item name' } : {}),
        ...(bonus === null ? { bonus_null_reason: 'App Store description does not state the delivered Crystals total', total_null_reason: 'Bonus unknown, so total is not stated' } : {}),
        first_purchase_bonus: null,
        first_purchase_bonus_null_reason: `the in-game first-purchase double bonus is not published by the App Store listing ("${description_en ?? ''}"), and the ${WEB_STORE_REASON}`
      }
    } else {
      amounts = {
        baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, item_pack: true,
        base_null_reason: `${kind === 'pass' ? 'Pass' : kind === 'double-pack' ? 'Double Pack' : 'Bundle'} item; not a plain Crystals amount (contents are shown in game, Apple only says "${description_en ?? name}")`,
        bonus_null_reason: 'App Store lists no bonus for pass/bundle items',
        total_null_reason: 'Pass/bundle contents are not a single Crystals amount',
        ...(kind === 'pass' ? { pass_type: ladsPassType(name), pass_days: passDays(description_en ?? name) } : {}),
        ...(kind === 'pass' && passDays(description_en ?? name) === null ? { pass_days_null_reason: 'Apple listing states no duration' } : {}),
        ...(kind === 'double-pack' ? { first_purchase_double: true, bonus_note: 'Apple description: "Buy to double the rewards"' } : {}),
        ...(/monthly pack|weekly pack/i.test(name) ? { periodic_pack: /monthly/i.test(name) ? 'monthly' : 'weekly' } : {})
      }
    }
    const pack: any = {
      id: Number(row.id) || 0, name, name_en: name, product_id: row.offerName ?? null, kind, store: 'apple-app-store',
      name_th, name_th_source: name_th ? 'apple-app-store-th (l=th)' : null,
      description: parts.join(' / ') || null,
      description_th, description_th_source: description_th ? 'apple-app-store-th (l=th)' : null,
      description_en, description_en_source: description_en ? 'apple-app-store-th (en-GB)' : null,
      apple_item_id: row.id,
      family_shareable: typeof row.familyShareable === 'boolean' ? row.familyShareable : null,
      ...amounts,
      price_thb: row.price,
      price_thb_source: `apple-app-store-th (item ${row.id}${row.offerName ? `, offerName=${row.offerName}` : ''})`,
      price_usd: u ? u.m.row.price : null,
      price_usd_source: u ? `apple-app-store-${u.cc} (USD storefront, ${u.m.by})` : null,
      price: row.price, currency: 'THB'
    }
    const thReason = thTh.rows
      ? th ? 'App Store TH Thai-locale list (l=th) returns the English text for this item (no Thai localisation published by Infold)' : 'not in the Thai-language App Store TH list by offerName/Apple item id'
      : `Thai-language App Store TH list unavailable (${reasonOf(thTh)})`
    if (!name_th) pack.name_th_null_reason = thReason
    if (!description_th) pack.description_th_null_reason = description_en ? thReason : 'Apple lists no description for this item'
    if (!description_en) pack.description_en_null_reason = 'Apple lists no description for this item'
    if (!parts.length) pack.description_null_reason = 'Apple lists no description for this item'
    if (!u) pack.price_usd_null_reason = `not found on ${storefronts()} (USD storefronts) by offerName/Apple item id; ${WEB_STORE_REASON}`
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    packs.push(pack)
  }

  const sortP = (a: any, b: any) => a.price_thb - b.price_thb || (a.baseItemAmount ?? 0) - (b.baseItemAmount ?? 0) || String(a.product_id).localeCompare(String(b.product_id))
  const msg = 'Live (no fallback catalog)'
  const of = (kinds: string[]) => packs.filter((p) => kinds.includes(p.kind)).sort(sortP)
  const cats = [
    { id: 1, name: 'Crystals (App Store TH, base + bonus)', packs: of(['currency']), message: msg },
    { id: 2, name: 'Passes: Aurum Pass (monthly), Promise passes, Yearly passes (App Store TH)', packs: of(['pass']), message: msg },
    { id: 3, name: 'Double Packs (first-purchase double rewards, App Store TH)', packs: of(['double-pack']), message: msg },
    { id: 4, name: 'Packs & Bundles (App Store TH)', packs: of(['bundle']), message: msg }
  ]
  const categories = cats.filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, packCount: c.packs.length }))
  const usdUsed = [...new Set(packs.map((p) => p.price_usd_source).filter(Boolean).map((s: string) => s.split(' ')[0].replace('apple-app-store-', '')))]
  const notes = [
    `Game: ${LADS_NAME} (Infold Games / Papergames), App Store app ${LADS_APPSTORE_ID} (com.papegames.lysk.en).`,
    `Official web store: ${LADS_WEB_STORE}. Its product API (${LADS_WEB_STORE_API}) needs an Infold login and a selected server/role, so it cannot be read anonymously; prices come from Apple instead.`,
    'THB = App Store TH price; USD = App Store US, else LA / MM / KH, matched only by Apple offerName or Apple item id. No FX conversion. No resellers (Codashop / SEAGM / UniPin) are used.',
    'Crystals: base from the item name, total from the Apple description ("Gets N Crystals"); bonus = total - base. The in-game first-purchase double bonus is not published by Apple, so first_purchase_bonus is null. Passes, Double Packs and bundles are item_pack:true.',
    `USD storefronts used: ${usdUsed.length ? usdUsed.map((c) => c.toUpperCase()).join(', ') : 'none'}`,
    APPSTORE_FULL_IAP_NOTE
  ]
  if (!thTh.rows) notes.push('App Store TH (Thai): ' + reasonOf(thTh))
  else if (!packs.some((p) => p.name_th)) notes.push('App Store TH Thai-locale list returns English names/descriptions for every item (Infold publishes no Thai IAP text), so name_th/description_th are null.')
  if (!us.rows) notes.push('App Store US: ' + reasonOf(us) + notSold(us))
  return ({
    game: { id: LADS_APPSTORE_ID, slug: LADS_SLUG, name: LADS_NAME, itemName: 'Crystals', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: ladsCatalogUrl('th'),
    sources: {
      thb: ladsCatalogUrl('th'), appstore_th: ladsCatalogUrl('th'), appstore_us: ladsCatalogUrl('us'),
      appstore_usd_fallback: LADS_USD_FALLBACK_STOREFRONTS.map(ladsCatalogUrl),
      official_web_store: LADS_WEB_STORE, official_web_store_api: LADS_WEB_STORE_API
    },
    notes
  } as unknown) as RovPacksResponse
}

import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'
import { matchApple } from './where-winds-meet-packs.service'

/**
 * ONE PUNCH MAN: The Strongest (FingerFun (HK) Limited, SEA build, App Store app 1491275510, bundle com.onepunchman.ios.ob.sea).
 * The official SEA web top-up (opmsea-topup.fingerfun.com, Ourpalm/gamesbean billing) needs an account login, and its Thailand
 * payment channels are third-party resellers (Codashop / UniPin / lsshop), so it has no usable official THB price.
 * Prices therefore come from Apple: THB = App Store TH, USD = App Store US, or a USD storefront (LA, then MM) when the SEA app
 * is not sold in the US. Storefronts are matched only by Apple offerName (FingerFun product id) or Apple item id, never by name.
 * No FX, no resellers, no hardcoded prices.
 */
export const OPM_SLUG = 'one-punch-man-the-strongest'
export const OPM_APP_ID = 1491275510
export const OPM_NAME = 'ONE PUNCH MAN: The Strongest'
export const OPM_OFFICIAL_TOPUP_URL = 'https://opmsea-topup.fingerfun.com/sdkpage/pcpay_yqcr/index.html'
export const OPM_USD_FALLBACK_STOREFRONTS = ['la', 'mm'] as const
export const opmCatalogUrl = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${OPM_APP_ID}/top-in-apps`

export class OnePunchManUpstreamUnavailableError extends Error {
  constructor(message = 'ONE PUNCH MAN: The Strongest App Store TH upstream unavailable') { super(message); this.name = 'OnePunchManUpstreamUnavailableError' }
}
export class OnePunchManInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid ONE PUNCH MAN: The Strongest App Store response') { super(message); this.name = 'OnePunchManInvalidUpstreamResponseError' }
}

export type OpmKind = 'currency' | 'pass' | 'bundle'
/** Plain Funds = offerName "opm_sea_ios_<N>" named "<N> Funds"; month / half-month cards are passes; everything else (gift / rookie packs) is a bundle. */
export function opmKind(offerName: string | null | undefined, name: string): OpmKind {
  const o = offerName ?? ''
  if (/^opm_sea_ios_\d+$/i.test(o) && /^\s*\d[\d,]*\s+funds\s*$/i.test(name)) return 'currency'
  if (/monthcard|monthhalfcard|weekcard|weeklycard/i.test(o) || /monthly card|week bonus|weekly card/i.test(name)) return 'pass'
  return 'bundle'
}
export function opmPassType(offerName: string | null | undefined, name: string): string {
  const s = `${offerName ?? ''} ${name}`
  if (/monthhalfcard|2-week|two-week/i.test(s)) return 'two-week-card'
  if (/week/i.test(s)) return 'weekly-card'
  return 'monthly-card'
}
/** Funds amount from the live Apple item name ("70 Funds"); null when the name carries no single amount. */
export function opmFunds(name: string): number | null {
  const m = name.match(/^\s*(\d[\d,]*)\s+funds\s*$/i)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

type List = { rows: AppStoreFullIapRow[] } | { rows: null; reason: string }
async function list(cc: string, l: string | null, signal?: AbortSignal): Promise<List> {
  try { return { rows: await fetchAppStoreFullIap(cc, String(OPM_APP_ID), l, signal) } } catch (e) { return { rows: null, reason: e instanceof Error ? e.message : String(e) } }
}
const reasonOf = (x: List) => ('reason' in x ? x.reason : '')

export async function fetchOnePunchManPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  // Sequential (Apple rate-limits bursts).
  const thEn = await list('th', 'en-GB', signal)
  const thTh = await list('th', 'th', signal)
  const base = thEn.rows ?? thTh.rows
  if (!base) {
    const r = reasonOf(thEn)
    if (/empty list/i.test(r)) throw new OnePunchManInvalidUpstreamResponseError('App Store TH: ' + r)
    throw new OnePunchManUpstreamUnavailableError('App Store TH: ' + r + ' / ' + reasonOf(thTh))
  }
  const thRows = base.filter((r) => r.currency === 'THB')
  if (!thRows.length) throw new OnePunchManInvalidUpstreamResponseError('App Store TH list has no THB prices')
  const us = await list('us', 'en-US', signal)
  const fallbackUsd: Record<string, List> = {}
  const usdFor = async (ref: { offerName?: string | null; id?: string | null }) => {
    const m = matchApple(us.rows, ref)
    if (m && m.row.currency === 'USD') return { m, cc: 'us' }
    for (const cc of OPM_USD_FALLBACK_STOREFRONTS) {
      fallbackUsd[cc] ??= await list(cc, null, signal)
      const f = matchApple(fallbackUsd[cc].rows, ref)
      if (f && f.row.currency === 'USD') return { m: f, cc }
    }
    return null
  }
  const usdReason = () =>
    `not found on App Store US${us.rows ? '' : ` (${reasonOf(us)}; SEA app not sold in the US)`} or ` +
    OPM_USD_FALLBACK_STOREFRONTS.map((c) => `${c.toUpperCase()}${fallbackUsd[c] && !fallbackUsd[c].rows ? ` (${reasonOf(fallbackUsd[c])})` : ''}`).join('/') +
    ' (USD storefronts) by offerName/Apple item id'

  const packs: any[] = []
  for (const row of thRows) {
    const ref = { offerName: row.offerName ?? null, id: row.id }
    const en = thEn.rows ? matchApple(thEn.rows, ref)?.row : undefined
    const th = thTh.rows ? matchApple(thTh.rows, ref)?.row : undefined
    const name = en?.name ?? row.name
    const kind = opmKind(row.offerName, name)
    const funds = kind === 'currency' ? opmFunds(name) : null
    const u = await usdFor(ref)
    const usd = u ? u.m.row.price : null
    const description_en = en?.description ?? null
    const description_th = th?.description ?? null
    const parts: string[] = []
    for (const s of [description_th, description_en]) if (s && !parts.includes(s)) parts.push(s)
    const pack: any = {
      id: Number(row.id) || 0, name, product_id: row.offerName ?? null, kind, store: 'apple-app-store',
      name_th: th?.name ?? null, name_th_source: th ? 'apple-app-store-th (th)' : null,
      description: parts.join(' / ') || null,
      description_th, description_th_source: description_th ? 'apple-app-store-th (th)' : null,
      description_en, description_en_source: description_en ? 'apple-app-store-th (en-GB)' : null,
      apple_item_id: row.id,
      family_shareable: typeof row.familyShareable === 'boolean' ? row.familyShareable : null,
      ...(kind === 'currency'
        ? {
            baseItemAmount: funds, bonusItemAmount: null, totalItemAmount: null, item_pack: false,
            ...(funds === null ? { base_null_reason: 'Apple item name carries no single Funds amount' } : {}),
            bonus_null_reason: 'App Store lists no bonus Funds and the official web store (login + reseller channels for TH) is not used',
            total_null_reason: 'Bonus unknown, so total (base + bonus) is not stated; base = Funds in the Apple item name'
          }
        : {
            baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, item_pack: true,
            base_null_reason: (kind === 'pass' ? 'Pass/card' : 'Bundle/gift pack') + ' item; not a plain Funds amount (contents in name/description)',
            bonus_null_reason: 'App Store lists no bonus for pass/bundle items',
            total_null_reason: 'Pass/bundle contents are not a single Funds amount',
            ...(kind === 'pass' ? { pass_type: opmPassType(row.offerName, name) } : {})
          }),
      price_thb: row.price,
      price_thb_source: `apple-app-store-th (item ${row.id}${row.offerName ? `, offerName=${row.offerName}` : ''})`,
      price_usd: usd,
      price_usd_source: u ? `apple-app-store-${u.cc} (USD storefront, ${u.m.by})` : null,
      price: row.price, currency: 'THB'
    }
    if (!th) pack.name_th_null_reason = thTh.rows ? 'not in the Thai-language App Store TH list by offerName/Apple item id' : `Thai-language App Store TH list unavailable (${reasonOf(thTh)})`
    if (!description_en && !description_th) pack.description_null_reason = 'Apple lists no description for this item'
    if (usd === null) pack.price_usd_null_reason = usdReason()
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    packs.push(pack)
  }

  const sortP = (a: any, b: any) => a.price_thb - b.price_thb || (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) || String(a.product_id).localeCompare(String(b.product_id))
  const msg = 'Live (no fallback catalog)'
  const of = (k: OpmKind) => packs.filter((p) => p.kind === k).sort(sortP)
  const cats = [
    { id: 1, name: 'Funds (App Store TH)', packs: of('currency'), message: msg },
    { id: 2, name: 'Monthly / 2-Week Cards (App Store TH)', packs: of('pass'), message: msg },
    { id: 3, name: 'Funds Packs & Bundles (App Store TH)', packs: of('bundle'), message: msg }
  ]
  const categories = cats.filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, packCount: c.packs.length }))
  const usedFallback = [...new Set(packs.map((p) => p.price_usd_source).filter(Boolean).map((s: string) => s.split(' ')[0].replace('apple-app-store-', '')))]
  const notes = [
    `Game: ${OPM_NAME} (FingerFun (HK) Limited, SEA build, App Store app ${OPM_APP_ID}). This is the One Punch Man title sold on App Store TH.`,
    `Official SEA web top-up (${OPM_OFFICIAL_TOPUP_URL}) requires an account login and its Thailand payment channels are third-party resellers (Codashop / UniPin / lsshop), so it is not used (no resellers).`,
    'THB = App Store TH (en-GB list for names/descriptions, th list for Thai names/descriptions). USD = App Store US, or a USD storefront (LA, then MM) when the SEA app is not sold in the US; matched only by Apple offerName or Apple item id. No FX conversion.',
    'Funds = plain currency items (offerName opm_sea_ios_<N>; base = Funds in the Apple name; Apple lists no bonus, so bonus/total are null with reasons). Funds Packs / Recruit packs (bundles) and Monthly / 2-Week cards (passes) are item_pack:true.',
    `USD storefronts used: ${usedFallback.length ? usedFallback.map((c) => c.toUpperCase()).join(', ') : 'none'}`
  ]
  notes.push(APPSTORE_FULL_IAP_NOTE)
  if (!thEn.rows) notes.push('App Store TH (en-GB): ' + reasonOf(thEn))
  if (!thTh.rows) notes.push('App Store TH (Thai): ' + reasonOf(thTh))
  if (!us.rows) notes.push('App Store US: ' + reasonOf(us) + ' (SEA app not sold in the US)')
  return ({
    game: { id: OPM_APP_ID, slug: OPM_SLUG, name: OPM_NAME, itemName: 'Funds', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: opmCatalogUrl('th'),
    sources: {
      thb: opmCatalogUrl('th'), appstore_th: opmCatalogUrl('th'), appstore_us: opmCatalogUrl('us'),
      appstore_usd_fallback: OPM_USD_FALLBACK_STOREFRONTS.map(opmCatalogUrl), official_topup_not_used: OPM_OFFICIAL_TOPUP_URL
    },
    notes
  } as unknown) as RovPacksResponse
}

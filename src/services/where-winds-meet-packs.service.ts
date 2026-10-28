import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'
import { sojThbLocalPrice, sojWindow } from './sword-of-justice-packs.service'

/**
 * Where Winds Meet (NetEase, global) - official NetEase GamesClub top-up (pay.neteasegames.com, game code "wherewindsmeet",
 * goodsids "yysls.*.oversea"). THB = product extra.local_price.TH.default (official), USD = product.price (same product).
 * Bonus / discounts (with end dates) from the live activitys API (alpha2=TH). Apple App Store (app 6472396866) adds:
 * THB (App Store TH) only where the official store has no THB, USD from App Store US (KH when not sold in the US),
 * Apple-only items (not on the web store), and name_th / description_th / description_en. Apple rows are matched to
 * official goodsids and to each other ONLY by Apple offerName (= NetEase goodsid) or Apple item id, never by name.
 * No FX, no resellers, no hardcoded prices.
 */
export const WWM_SLUG = 'where-winds-meet'
export const WWM_APP_ID = 6472396866
export const WWM_GAME_CODE = 'wherewindsmeet'
export const WWM_TOPUP_URL = 'https://pay.neteasegames.com/wherewindsmeet/topup'
export const WWM_PRODUCTS_API_URL = 'https://pay.neteasegames.com/gameclub/products/wherewindsmeet?gc_client_version=1.13.55'
export const WWM_ACTIVITYS_API_URL =
  'https://pay.neteasegames.com/gameclub/products/wherewindsmeet/activitys?gc_client_version=1.13.55&pay_method=gameclub_wallet&pay_type=NetEase+Credit_gameclub_wallet&alpha2=TH'
export const WWM_USD_FALLBACK_STOREFRONTS = ['kh'] as const
export const wwmCatalogUrl = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${WWM_APP_ID}/top-in-apps`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const FOREVER = 2147483647

export class WhereWindsMeetUpstreamUnavailableError extends Error {
  constructor(message = 'Where Winds Meet NetEase GamesClub upstream unavailable') { super(message); this.name = 'WhereWindsMeetUpstreamUnavailableError' }
}
export class WhereWindsMeetInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Where Winds Meet NetEase GamesClub response') { super(message); this.name = 'WhereWindsMeetInvalidUpstreamResponseError' }
}

export type WwmKind = 'currency' | 'pass' | 'bundle'
export function wwmKind(goodsid: string): WwmKind {
  if (/\.\d+cmz\./i.test(goodsid)) return 'currency'
  if (/monthlycard|battlepass|weeklycard|newbiebp/i.test(goodsid)) return 'pass'
  return 'bundle'
}
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const strip = (s: unknown) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '')
const iso = (t: number | null) => (t !== null && t < FOREVER ? new Date(t * 1000).toISOString() : null)

export type WwmActivity = {
  bonus: Map<string, { amount: number; until: string | null }>
  discounts: Map<string, { THB: number | null; USD: number | null; until: string | null }>
}
/** activity_type 0 = GameClub bonus (marketing_free_amount); 27 = discount (after_discount_price_map). Active, alpha2 all/TH only. */
export function parseWwmActivitys(json: any, now: number): WwmActivity | null {
  if (json?.code !== '0000' || !Array.isArray(json?.data?.list)) return null
  const out: WwmActivity = { bonus: new Map(), discounts: new Map() }
  for (const a of json.data.list) {
    if (typeof a?.goodsid !== 'string') continue
    if (a.alpha2 !== undefined && a.alpha2 !== 'all' && a.alpha2 !== 'TH') continue
    if (sojWindow(a, now) !== 'active') continue
    const t = String(a.activity_type)
    const until = iso(num(a.expired_time))
    if (t === '0' && typeof a.marketing_free_amount === 'number' && a.marketing_free_amount > 0) {
      const prev = out.bonus.get(a.goodsid)
      out.bonus.set(a.goodsid, { amount: (prev?.amount ?? 0) + a.marketing_free_amount, until: prev?.until ?? until })
    }
    if (t === '27' && a.after_discount_price_map && typeof a.after_discount_price_map === 'object')
      out.discounts.set(a.goodsid, { THB: num(a.after_discount_price_map.THB), USD: num(a.after_discount_price_map.USD), until })
  }
  return out
}

export type WwmProduct = {
  goodsid: string; kind: WwmKind; name: string; detail: string; usd: number; thb: number | null; base: number; inGameBonus: number
  image: string | null; available_until: string | null; purchase_limit: unknown
}
/** status 1, USD-priced, currently on sale (expired / not yet started dropped); platform copies deduped by goodsid. */
export function parseWwmProducts(json: any, now: number): { products: WwmProduct[]; expired: string[]; upcoming: string[] } {
  if (json?.code !== '0000' || !Array.isArray(json?.data)) throw new WhereWindsMeetInvalidUpstreamResponseError('products: ' + (json?.msg ?? 'bad shape'))
  const seen = new Set<string>(); const products: WwmProduct[] = []; const expired: string[] = []; const upcoming: string[] = []
  for (const p of json.data as any[]) {
    if (typeof p?.goodsid !== 'string' || p.currency !== 'USD' || p.status !== 1 || seen.has(p.goodsid)) continue
    seen.add(p.goodsid)
    const ml = p.multi_language?.default?.default ?? {}
    const name = strip(ml.goodsinfo) || strip(p.goodsinfo)
    const w = sojWindow(p, now)
    if (w === 'expired') { expired.push(name); continue }
    if (w === 'upcoming') { upcoming.push(name); continue }
    const usd = num(p.price)
    if (usd === null) continue
    const list = Array.isArray(ml.product_free_amount_activity_list) ? ml.product_free_amount_activity_list : []
    products.push({
      goodsid: p.goodsid, kind: wwmKind(p.goodsid), name, detail: strip(ml.goods_detail), usd, thb: sojThbLocalPrice(p.extra),
      base: (num(p.pay_yuanbao) ?? 0) + (num(p.free_yuanbao) ?? 0),
      inGameBonus: list.filter((x: any) => x?.activity_description !== 'GameClubBonus').reduce((s: number, x: any) => s + (num(x?.amount) ?? 0), 0),
      image: ml.image_info?.normal ?? null, available_until: iso(num(p.expired_time)), purchase_limit: p.purchase_limit ?? null
    })
  }
  return { products, expired, upcoming }
}

type List = { rows: AppStoreFullIapRow[] } | { rows: null; reason: string }
/** Match only by Apple offerName (NetEase goodsid) or Apple item id. Never by display name. */
export function matchApple(rows: AppStoreFullIapRow[] | null, ref: { offerName?: string | null; id?: string | null }): { row: AppStoreFullIapRow; by: string } | null {
  if (!rows) return null
  if (ref.offerName) {
    const hits = rows.filter((r) => r.offerName === ref.offerName)
    if (hits.length === 1) return { row: hits[0], by: `offerName=${ref.offerName}` }
  }
  if (ref.id) {
    const hit = rows.find((r) => r.id === ref.id)
    if (hit) return { row: hit, by: `item ${ref.id}` }
  }
  return null
}

async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  let r: Response
  try {
    r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'application/json', Referer: WWM_TOPUP_URL } })
  } catch (e) {
    throw new WhereWindsMeetUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!r.ok) throw new WhereWindsMeetUpstreamUnavailableError('HTTP ' + r.status)
  try { return await r.json() } catch { throw new WhereWindsMeetInvalidUpstreamResponseError('Non-JSON response') }
}
async function list(cc: string, l: string | null, signal?: AbortSignal): Promise<List> {
  try { return { rows: await fetchAppStoreFullIap(cc, String(WWM_APP_ID), l, signal) } } catch (e) { return { rows: null, reason: e instanceof Error ? e.message : String(e) } }
}
const reasonOf = (x: List) => ('reason' in x ? x.reason : '')

export async function fetchWhereWindsMeetPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [prod, actRaw] = await Promise.all([
    getJson(WWM_PRODUCTS_API_URL, signal),
    getJson(WWM_ACTIVITYS_API_URL, signal).catch((e) => ({ __error: e instanceof Error ? e.message : String(e) }))
  ])
  const now = num(actRaw?.data?.server_ts) ?? Date.now() / 1000
  const { products, expired, upcoming } = parseWwmProducts(prod, now)
  if (!products.length) throw new WhereWindsMeetInvalidUpstreamResponseError('No active products')
  const act = parseWwmActivitys(actRaw, now)
  const actReason = 'Official activitys endpoint unavailable: ' + (actRaw?.__error ?? actRaw?.msg ?? 'bad shape')

  // Apple lists sequentially (Apple rate-limits bursts). Failures never break the official packs.
  const thEn = await list('th', 'en-GB', signal)
  const thTh = await list('th', 'th', signal)
  const us = await list('us', 'en-US', signal)
  const fallbackUsd: Record<string, List> = {}
  const usdFor = async (ref: { offerName?: string | null; id?: string | null }) => {
    const m = matchApple(us.rows, ref)
    if (m) return { m, cc: 'us' }
    for (const cc of WWM_USD_FALLBACK_STOREFRONTS) {
      fallbackUsd[cc] ??= await list(cc, null, signal)
      const f = matchApple(fallbackUsd[cc].rows, ref)
      if (f && f.row.currency === 'USD') return { m: f, cc }
    }
    return null
  }
  const usdReason = () =>
    `not found on App Store US${us.rows ? '' : ` (list unavailable: ${reasonOf(us)})`} or ${WWM_USD_FALLBACK_STOREFRONTS.map((c) => c.toUpperCase()).join('/')} (USD storefront) by offerName/Apple item id`

  const details = (thRow: AppStoreFullIapRow | undefined, ref: { offerName?: string | null; id?: string | null }, official: string) => {
    const th = matchApple(thTh.rows, ref)?.row
    const description_th = th?.description ?? null
    const description_en = thRow?.description ?? null
    const parts: string[] = []
    for (const s of [description_th, description_en, official]) if (s && !parts.includes(s)) parts.push(s)
    const appleReason = thEn.rows ? 'not in the App Store TH list by offerName/Apple item id' : `App Store TH list unavailable (${reasonOf(thEn)})`
    return {
      name_th: th?.name ?? null,
      description: parts.join(' / ') || null,
      description_th, description_en,
      description_official: official || null,
      ...(description_th ? {} : { description_th_null_reason: thTh.rows ? 'not in the Thai-language App Store TH list by offerName/Apple item id' : `Thai-language App Store TH list unavailable (${reasonOf(thTh)})` }),
      ...(description_en ? {} : { description_en_null_reason: thRow ? 'Apple App Store has no description text for this item' : appleReason }),
      ...(th ? {} : { name_th_null_reason: thTh.rows ? 'not in the Thai-language App Store TH list' : `Thai-language App Store TH list unavailable (${reasonOf(thTh)})` }),
      apple_item_id: thRow?.id ?? null,
      family_shareable: typeof thRow?.familyShareable === 'boolean' ? thRow.familyShareable : null
    }
  }
  const itemFields = (kind: WwmKind, goodsid: string) => ({
    baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null,
    base_null_reason: (kind === 'pass' ? 'Pass' : 'Bundle') + ' item; not a plain Echo Beads amount (contents in description)',
    bonus_null_reason: 'No currency bonus on pass/bundle items',
    item_pack: true,
    ...(kind === 'pass' ? { pass_type: /battlepass|newbiebp/i.test(goodsid) ? 'battle-pass' : /weeklycard/i.test(goodsid) ? 'weekly-pass' : 'monthly-pass' } : {})
  })

  const official = await Promise.all(products.map(async (p) => {
    const isCur = p.kind === 'currency'
    const ref = { offerName: p.goodsid }
    const thRow = matchApple(thEn.rows, ref)?.row
    const thb = p.thb ?? (thRow && thRow.currency === 'THB' ? thRow.price : null)
    const b = act?.bonus.get(p.goodsid)
    const gc = act ? (b?.amount ?? 0) : null
    const bonus = isCur ? (gc === null ? null : p.inGameBonus + gc) : null
    const disc = act?.discounts.get(p.goodsid)
    const pack: any = {
      id: Number(thRow?.id) || 0, name: p.name, product_id: p.goodsid, kind: p.kind, store: 'netease-gameclub',
      ...details(thRow, ref, p.detail),
      ...(isCur
        ? {
            baseItemAmount: p.base, bonusItemAmount: bonus, totalItemAmount: p.base + (bonus ?? 0),
            bonus_breakdown: { in_game_bonus: p.inGameBonus, gameclub_bonus: gc, gameclub_bonus_until: b?.until ?? null },
            bonus_available: act !== null, bonus_source: act ? 'netease-gameclub activitys (alpha2=TH, NetEase Credit) + product list' : null, item_pack: false
          }
        : itemFields(p.kind, p.goodsid)),
      image_url: p.image,
      price_thb: thb, price_thb_source: p.thb !== null ? 'netease-gameclub-official (local_price TH)' : thb !== null ? `apple-app-store-th (item ${thRow!.id}, offerName=${p.goodsid})` : null,
      price_usd: p.usd, price_usd_source: 'netease-gameclub-official',
      price: thb ?? p.usd, currency: thb !== null ? 'THB' : 'USD',
      discount_price_thb: disc?.THB ?? null, discount_price_usd: disc?.USD ?? null, discount_until: disc?.until ?? null,
      available_until: p.available_until, purchase_limit: p.purchase_limit
    }
    if (thb === null) pack.price_thb_null_reason = 'No official TH local_price; ' + (thEn.rows ? 'not on App Store TH by offerName/Apple item id' : `App Store TH list unavailable (${reasonOf(thEn)})`)
    if (isCur && !act) pack.bonus_null_reason = actReason
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  }))

  // Apple-only items (offerName not sold on the official web store): THB from App Store TH, USD from US (else KH).
  const officialIds = new Set(products.map((p) => p.goodsid))
  const appleOnlyRefs: AppStoreFullIapRow[] = []
  for (const r of [...(thEn.rows ?? []), ...(us.rows ?? [])]) {
    if (r.offerName && officialIds.has(r.offerName)) continue
    if (appleOnlyRefs.some((x) => (r.offerName && x.offerName === r.offerName) || x.id === r.id)) continue
    appleOnlyRefs.push(r)
  }
  const appleOnly = await Promise.all(appleOnlyRefs.map(async (r) => {
    const ref = { offerName: r.offerName ?? null, id: r.id }
    const thRow = matchApple(thEn.rows, ref)?.row
    const u = await usdFor(ref)
    const kind = wwmKind(r.offerName ?? '')
    const thb = thRow && thRow.currency === 'THB' ? thRow.price : null
    const usd = u && u.m.row.currency === 'USD' ? u.m.row.price : null
    const pack: any = {
      id: Number(r.id) || 0, name: (thRow ?? r).name, product_id: r.offerName ?? null, kind, store: 'apple-app-store',
      ...details(thRow ?? (r.currency === 'THB' ? r : undefined), ref, ''),
      ...(kind === 'currency'
        ? { baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, item_pack: false, base_null_reason: 'Apple lists no Echo Beads amount field and the item is not on the official web store', bonus_null_reason: 'No official bonus source for App Store-only items' }
        : itemFields(kind, r.offerName ?? '')),
      price_thb: thb, price_thb_source: thb !== null ? `apple-app-store-th (item ${thRow!.id}${thRow!.offerName ? `, offerName=${thRow!.offerName}` : ''})` : null,
      price_usd: usd, price_usd_source: usd !== null ? `apple-app-store-${u!.cc} (USD storefront, ${u!.m.by})` : null,
      price: thb ?? usd, currency: thb !== null ? 'THB' : usd !== null ? 'USD' : null
    }
    if (pack.apple_item_id === null) pack.apple_item_id = r.id
    if (thb === null) pack.price_thb_null_reason = thEn.rows ? 'not sold on App Store TH (matched by offerName/Apple item id); not on the official web store' : `App Store TH list unavailable (${reasonOf(thEn)})`
    if (usd === null) pack.price_usd_null_reason = usdReason()
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  }))

  const all = [...official, ...appleOnly]
  all.forEach((p, i) => { if (!p.id) p.id = i + 1 })
  const sortP = (a: any, b: any) => (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) || (a.price_thb ?? Infinity) - (b.price_thb ?? Infinity)
  const msg = 'Live (no fallback catalog)'
  const cats = [
    { id: 1, name: 'Echo Beads (Official NetEase GamesClub)', packs: official.filter((p) => p.kind === 'currency').sort(sortP), message: msg },
    { id: 2, name: 'Monthly Pass & Battle Pass (Official NetEase GamesClub)', packs: official.filter((p) => p.kind === 'pass').sort(sortP), message: msg },
    { id: 3, name: 'Bundles (Official NetEase GamesClub)', packs: official.filter((p) => p.kind === 'bundle').sort(sortP),
      message: msg + (expired.length ? `; ended (excluded): ${expired.join(', ')}` : '') + (upcoming.length ? `; not yet on sale (excluded): ${upcoming.join(', ')}` : '') },
    { id: 4, name: 'App Store-only items (TH THB / US USD, by offerName)', packs: appleOnly.sort(sortP), message: msg }
  ]
  const categories = cats.filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, packCount: c.packs.length }))
  const notes = [
    'Main: official NetEase GamesClub top-up (game code wherewindsmeet, live products API). THB = official extra.local_price.TH; USD = product.price of the same product. No FX conversion, no resellers.',
    'Bonus = product-list bonus + GameClub bonus from the activitys API (alpha2=TH, NetEase Credit); discounts = activitys activity_type 27 (discount_price_*, discount_until). An empty activitys list means no live bonus/discount (bonus 0).',
    `Apple App Store (app ${WWM_APP_ID}): matched to official goodsids and between storefronts only by Apple offerName (NetEase goodsid) or Apple item id. Supplies THB where the official store has none, App Store-only items (THB from TH, USD from US, else KH), and name_th / description_th / description_en.`,
    'description = Apple Thai description / Apple English description / official goods_detail (duplicates removed); developer-written text, not edited.',
    'Ended or not-yet-started limited bundles are excluded (listed in the bundles category message).'
  ]
  if (expired.length) notes.push(`Ended on the official store (excluded): ${expired.join(', ')}`)
  if (upcoming.length) notes.push(`Not yet on sale on the official store (excluded): ${upcoming.join(', ')}`)
  if (!act) notes.push(actReason)
  notes.push(APPSTORE_FULL_IAP_NOTE)
  if (!thEn.rows) notes.push('App Store TH: ' + reasonOf(thEn))
  if (!thTh.rows) notes.push('App Store TH (Thai): ' + reasonOf(thTh))
  if (!us.rows) notes.push('App Store US: ' + reasonOf(us))
  return ({
    game: { id: WWM_APP_ID, slug: WWM_SLUG, name: 'Where Winds Meet', itemName: 'Echo Beads', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: WWM_PRODUCTS_API_URL,
    sources: { products: WWM_PRODUCTS_API_URL, bonus: WWM_ACTIVITYS_API_URL, thb: WWM_PRODUCTS_API_URL, usd: WWM_PRODUCTS_API_URL, appstore_th: wwmCatalogUrl('th'), appstore_us: wwmCatalogUrl('us'), appstore_usd_fallback: wwmCatalogUrl('kh') },
    notes
  } as unknown) as RovPacksResponse
}

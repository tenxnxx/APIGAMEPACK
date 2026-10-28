import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'
import { sojThbLocalPrice, sojWindow } from './sword-of-justice-packs.service'
import { matchApple } from './where-winds-meet-packs.service'

/**
 * Racing Master (NetEase, SEA) - official NetEase GamesClub top-up (pay.neteasegames.com, game code "racingmastersea",
 * goodsids "g112sea.*" for the default SEA server and "g112seaasia.*" for the dedicated "asia" server tag).
 * THB = product extra.local_price.TH.default (official), USD = product.price (same product). Thai name / description from the
 * official multi_language.TH block. Bonus / discounts (with end dates) from the live activitys API (alpha2=TH).
 * Apple App Store (SEA app 6736940411, com.netease.dfjssea) adds: THB (App Store TH) only where the official store has none,
 * USD from App Store US or, when the app is not sold there, KH (USD storefront), Apple-only items, and Apple descriptions.
 * Apple rows are matched ONLY by Apple offerName (= NetEase goodsid) or Apple item id, never by name.
 * (Game code "racingmaster" is the TW/HK/Macao TWD store; not used for Thailand.) No FX, no resellers, no hardcoded prices.
 */
export const RM_SLUG = 'racing-master'
export const RM_APP_ID = 6736940411
export const RM_GAME_CODE = 'racingmastersea'
export const RM_TOPUP_URL = 'https://pay.neteasegames.com/racingmastersea/topup'
export const RM_PRODUCTS_API_URL = 'https://pay.neteasegames.com/gameclub/products/racingmastersea?gc_client_version=1.13.55'
export const RM_ACTIVITYS_API_URL =
  'https://pay.neteasegames.com/gameclub/products/racingmastersea/activitys?gc_client_version=1.13.55&pay_method=gameclub_wallet&pay_type=NetEase+Credit_gameclub_wallet&alpha2=TH'
export const RM_USD_FALLBACK_STOREFRONTS = ['kh'] as const
export const rmCatalogUrl = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${RM_APP_ID}/top-in-apps`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const FOREVER = 2147483647

export class RacingMasterUpstreamUnavailableError extends Error {
  constructor(message = 'Racing Master NetEase GamesClub upstream unavailable') { super(message); this.name = 'RacingMasterUpstreamUnavailableError' }
}
export class RacingMasterInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Racing Master NetEase GamesClub response') { super(message); this.name = 'RacingMasterInvalidUpstreamResponseError' }
}

export type RmKind = 'currency' | 'pass' | 'bundle'
/** Plain Gems = goodsid "<prefix>.online.gem<N>"; passes by official name (Master Pass / MP, Season Pass, weekly / monthly card, growth fund). */
export function rmKind(goodsid: string, name: string): RmKind {
  if (/^g112[a-z]*\.online\.gem\d+$/i.test(goodsid)) return 'currency'
  if (/car pack/i.test(name) && !/\bMP\b|master pass/i.test(name)) return 'bundle'
  if (/\bMP\b|master pass|season pass|weekly card|monthly card|growth fund/i.test(name)) return 'pass'
  if (/weekly(pack|card)|monthlycard|\.online\.monthlypack$|growthfund/i.test(goodsid)) return 'pass'
  return 'bundle'
}
export function rmPassType(goodsid: string, name: string): string {
  if (/weekly/i.test(goodsid + ' ' + name)) return 'weekly-pass'
  if (/monthly/i.test(goodsid + ' ' + name)) return 'monthly-pass'
  if (/growth/i.test(goodsid + ' ' + name)) return 'growth-fund'
  return 'master-pass'
}
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const strip = (s: unknown) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '')
const iso = (t: number | null) => (t !== null && t > 0 && t < FOREVER ? new Date(t * 1000).toISOString() : null)
export const rmKey = (goodsid: string, sub?: string | null) => (sub ? `${goodsid}_${sub}` : goodsid)

export type RmActivity = {
  bonus: Map<string, { amount: number; until: string | null; activityids: string[] }>
  discounts: Map<string, { THB: number | null; USD: number | null; until: string | null }>
  coupons: number
}
/**
 * activity_type 0 / 12 = GameClub bonus Gems (marketing_free_amount, "_add_" activities); 27 = discount (after_discount_price_map);
 * 104 / 13 / 204 = coupon eligibility (no price or amount; counted only). Active window, alpha2 all/TH only. Keys = goodsid[_sub_item].
 */
export function parseRmActivitys(json: any, now: number): RmActivity | null {
  if (json?.code !== '0000' || !Array.isArray(json?.data?.list)) return null
  const out: RmActivity = { bonus: new Map(), discounts: new Map(), coupons: 0 }
  for (const a of json.data.list) {
    if (typeof a?.goodsid !== 'string') continue
    if (a.alpha2 !== undefined && a.alpha2 !== 'all' && a.alpha2 !== 'TH') continue
    if (sojWindow(a, now) !== 'active') continue
    const t = String(a.activity_type)
    const until = iso(num(a.expired_time))
    if ((t === '0' || t === '12') && typeof a.marketing_free_amount === 'number' && a.marketing_free_amount > 0) {
      const prev = out.bonus.get(a.goodsid)
      out.bonus.set(a.goodsid, {
        amount: (prev?.amount ?? 0) + a.marketing_free_amount,
        until: prev?.until && until ? (prev.until < until ? prev.until : until) : (prev?.until ?? until),
        activityids: [...(prev?.activityids ?? []), String(a.activityid ?? '')]
      })
    } else if (t === '27' && a.after_discount_price_map && typeof a.after_discount_price_map === 'object') {
      out.discounts.set(a.goodsid, { THB: num(a.after_discount_price_map.THB), USD: num(a.after_discount_price_map.USD), until })
    } else if (t === '104' || t === '13' || t === '204') out.coupons++
  }
  return out
}

export type RmProduct = {
  key: string; goodsid: string; sub_item: string | null; kind: RmKind; name: string; detail: string; name_th: string | null; detail_th: string | null
  usd: number; thb: number | null; base: number; inGameBonus: number; server_tag: string; image: string | null
  available_from: string | null; available_until: string | null; purchase_limit: unknown
}
/** status 1, USD-priced, currently on sale (expired / not yet started dropped, per platform copy); active platform copies deduped by goodsid + sub_item. */
export function parseRmProducts(json: any, now: number): { products: RmProduct[]; expired: string[]; upcoming: string[] } {
  if (json?.code !== '0000' || !Array.isArray(json?.data)) throw new RacingMasterInvalidUpstreamResponseError('products: ' + (json?.msg ?? 'bad shape'))
  const seen = new Set<string>(); const products: RmProduct[] = []; const expiredBy = new Map<string, string>(); const upcomingBy = new Map<string, string>()
  for (const p of json.data as any[]) {
    if (typeof p?.goodsid !== 'string' || p.currency !== 'USD' || p.status !== 1) continue
    const sub = typeof p.sub_item === 'string' && p.sub_item ? p.sub_item : null
    const key = rmKey(p.goodsid, sub)
    const ml = p.multi_language?.default?.default ?? {}
    const th = p.multi_language?.TH?.default ?? {}
    const name = strip(ml.goodsinfo) || strip(p.goodsinfo)
    const w = sojWindow(p, now)
    if (w === 'expired') { expiredBy.set(key, name); continue }
    if (w === 'upcoming') { upcomingBy.set(key, name); continue }
    if (seen.has(key)) continue
    seen.add(key)
    const usd = num(p.price)
    if (usd === null) continue
    const list = Array.isArray(ml.product_free_amount_activity_list) ? ml.product_free_amount_activity_list : []
    products.push({
      key, goodsid: p.goodsid, sub_item: sub, kind: rmKind(p.goodsid, name), name, detail: strip(ml.goods_detail),
      name_th: strip(th.goodsinfo) || null, detail_th: strip(th.goods_detail) || null,
      usd, thb: sojThbLocalPrice(p.extra),
      base: (num(p.pay_yuanbao) ?? 0) + (num(p.free_yuanbao) ?? 0),
      inGameBonus: list.filter((x: any) => x?.activity_description !== 'GameClubBonus').reduce((s: number, x: any) => s + (num(x?.amount) ?? 0), 0),
      server_tag: strip(p.product_activity_type?.dedicated_server_tag) || 'default',
      image: (p.multi_language?.TH?.default?.image_info?.normal ?? ml.image_info?.normal) ?? null,
      available_from: iso(num(p.effective_time)), available_until: iso(num(p.expired_time)), purchase_limit: p.purchase_limit ?? null
    })
  }
  const names = (m: Map<string, string>) => [...new Set([...m].filter(([k]) => !seen.has(k)).map(([, n]) => n))]
  return { products, expired: names(expiredBy), upcoming: names(upcomingBy) }
}

type List = { rows: AppStoreFullIapRow[] } | { rows: null; reason: string }
async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  let r: Response
  try {
    r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'application/json', Referer: RM_TOPUP_URL } })
  } catch (e) {
    throw new RacingMasterUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!r.ok) throw new RacingMasterUpstreamUnavailableError('HTTP ' + r.status)
  try { return await r.json() } catch { throw new RacingMasterInvalidUpstreamResponseError('Non-JSON response') }
}
async function list(cc: string, l: string | null, signal?: AbortSignal): Promise<List> {
  try { return { rows: await fetchAppStoreFullIap(cc, String(RM_APP_ID), l, signal) } } catch (e) { return { rows: null, reason: e instanceof Error ? e.message : String(e) } }
}
const reasonOf = (x: List) => ('reason' in x ? x.reason : '')
const serverLabel = (tag: string) => (tag === 'default' ? 'default SEA server' : `dedicated "${tag}" server`)

export async function fetchRacingMasterPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [prod, actRaw] = await Promise.all([
    getJson(RM_PRODUCTS_API_URL, signal),
    getJson(RM_ACTIVITYS_API_URL, signal).catch((e) => ({ __error: e instanceof Error ? e.message : String(e) }))
  ])
  const now = num(actRaw?.data?.server_ts) ?? Date.now() / 1000
  const { products, expired, upcoming } = parseRmProducts(prod, now)
  if (!products.length) throw new RacingMasterInvalidUpstreamResponseError('No active products')
  const act = parseRmActivitys(actRaw, now)
  const actReason = 'Official activitys endpoint unavailable: ' + (actRaw?.__error ?? actRaw?.msg ?? 'bad shape')

  // Apple lists sequentially (Apple rate-limits bursts). Failures never break the official packs.
  const thEn = await list('th', 'en-GB', signal)
  const thTh = await list('th', 'th', signal)
  const us = await list('us', 'en-US', signal)
  const fallbackUsd: Record<string, List> = {}
  const usdFor = async (ref: { offerName?: string | null; id?: string | null }) => {
    const m = matchApple(us.rows, ref)
    if (m && m.row.currency === 'USD') return { m, cc: 'us' }
    for (const cc of RM_USD_FALLBACK_STOREFRONTS) {
      fallbackUsd[cc] ??= await list(cc, null, signal)
      const f = matchApple(fallbackUsd[cc].rows, ref)
      if (f && f.row.currency === 'USD') return { m: f, cc }
    }
    return null
  }
  const usdReason = () =>
    `not found on App Store US${us.rows ? '' : ` (list unavailable: ${reasonOf(us)})`} or ${RM_USD_FALLBACK_STOREFRONTS.map((c) => c.toUpperCase()).join('/')} (USD storefront) by offerName/Apple item id`

  const details = (
    thRow: AppStoreFullIapRow | undefined,
    ref: { offerName?: string | null; id?: string | null },
    official: { name_th: string | null; detail_th: string | null; detail_en: string }
  ) => {
    const th = matchApple(thTh.rows, ref)?.row
    const name_th = official.name_th ?? th?.name ?? null
    const description_th = official.detail_th ?? th?.description ?? null
    const description_en = thRow?.description ?? (official.detail_en || null)
    const parts: string[] = []
    for (const s of [description_th, description_en]) if (s && !parts.includes(s)) parts.push(s)
    const thList = thTh.rows ? 'not in the Thai-language App Store TH list by offerName/Apple item id' : `Thai-language App Store TH list unavailable (${reasonOf(thTh)})`
    return {
      name_th, name_th_source: official.name_th ? 'netease-gameclub-official (multi_language TH)' : th ? 'apple-app-store-th (th)' : null,
      description: parts.join(' / ') || null,
      description_th, description_th_source: official.detail_th ? 'netease-gameclub-official (multi_language TH)' : th?.description ? 'apple-app-store-th (th)' : null,
      description_en, description_en_source: thRow?.description ? 'apple-app-store-th (en-GB)' : official.detail_en ? 'netease-gameclub-official (goods_detail)' : null,
      ...(name_th ? {} : { name_th_null_reason: 'No official Thai name (multi_language TH) and ' + thList }),
      ...(description_th ? {} : { description_th_null_reason: 'No official Thai description (multi_language TH) and ' + thList }),
      ...(description_en ? {} : { description_en_null_reason: 'No official goods_detail and no Apple description (matched by offerName/Apple item id)' }),
      apple_item_id: thRow?.id ?? null,
      family_shareable: typeof thRow?.familyShareable === 'boolean' ? thRow.familyShareable : null
    }
  }

  const official = await Promise.all(products.map(async (p) => {
    const isCur = p.kind === 'currency'
    const ref = { offerName: p.goodsid }
    const thRow = matchApple(thEn.rows, ref)?.row
    const appleThb = thRow && thRow.currency === 'THB' ? thRow.price : null
    const thb = p.thb ?? appleThb
    const b = act?.bonus.get(p.key) ?? (p.sub_item ? undefined : act?.bonus.get(p.goodsid))
    const gc = act ? (b?.amount ?? 0) : null
    const disc = act?.discounts.get(p.key) ?? act?.discounts.get(p.goodsid)
    const breakdown = { in_game_bonus: p.inGameBonus, gameclub_bonus: gc, gameclub_bonus_until: b?.until ?? null, gameclub_bonus_activityids: b?.activityids ?? [] }
    const pack: any = {
      id: Number(thRow?.id) || 0, name: p.name, product_id: p.goodsid, sub_item: p.sub_item, kind: p.kind, store: 'netease-gameclub',
      server_tag: p.server_tag, server: serverLabel(p.server_tag),
      ...details(thRow, ref, { name_th: p.name_th, detail_th: p.detail_th, detail_en: p.detail }),
      ...(isCur
        ? {
            baseItemAmount: p.base, bonusItemAmount: gc === null ? null : p.inGameBonus + gc, totalItemAmount: p.base + (gc === null ? 0 : p.inGameBonus + gc),
            item_pack: false
          }
        : {
            baseItemAmount: null, bonusItemAmount: gc ? gc : null, totalItemAmount: null, item_pack: true,
            base_null_reason: (p.kind === 'pass' ? 'Pass' : 'Bundle') + ' item; not a plain Gems amount (contents in name/description)',
            ...(gc ? {} : { bonus_null_reason: act ? 'No live GameClub bonus Gems on this item' : actReason }),
            total_null_reason: 'Pass/bundle contents are not a single Gems amount',
            ...(p.kind === 'pass' ? { pass_type: rmPassType(p.goodsid, p.name) } : {})
          }),
      bonus_breakdown: breakdown,
      bonus_available: act !== null, bonus_source: act ? 'netease-gameclub activitys (alpha2=TH, NetEase Credit) + product list' : null,
      image_url: p.image,
      price_thb: thb,
      price_thb_source: p.thb !== null ? 'netease-gameclub-official (local_price TH)' : thb !== null ? `apple-app-store-th (item ${thRow!.id}, offerName=${p.goodsid})` : null,
      price_usd: p.usd, price_usd_source: 'netease-gameclub-official',
      price: thb ?? p.usd, currency: thb !== null ? 'THB' : 'USD',
      discount_price_thb: disc?.THB ?? null, discount_price_usd: disc?.USD ?? null, discount_until: disc?.until ?? null,
      available_from: p.available_from, available_until: p.available_until, purchase_limit: p.purchase_limit
    }
    if (thb === null) pack.price_thb_null_reason = 'No official TH local_price; ' + (thEn.rows ? 'not on App Store TH by offerName/Apple item id' : `App Store TH list unavailable (${reasonOf(thEn)})`)
    if (isCur && !act) pack.bonus_null_reason = actReason
    if (!disc) pack.discount_null_reason = act ? 'No live discount (activitys activity_type 27) for this item' : actReason
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
  const appleOnly: any[] = []
  for (const r of appleOnlyRefs) {
    const ref = { offerName: r.offerName ?? null, id: r.id }
    const thRow = matchApple(thEn.rows, ref)?.row
    const u = await usdFor(ref)
    const name = (thRow ?? r).name
    const kind = rmKind(r.offerName ?? '', name)
    const thb = thRow && thRow.currency === 'THB' ? thRow.price : null
    const usd = u && u.m.row.currency === 'USD' ? u.m.row.price : null
    const pack: any = {
      id: Number(r.id) || 0, name, product_id: r.offerName ?? null, kind, store: 'apple-app-store',
      server_tag: /^g112(seaasia|asiasea)\./i.test(r.offerName ?? '') ? 'asia' : 'default',
      ...details(thRow ?? (r.currency === 'THB' ? r : undefined), ref, { name_th: null, detail_th: null, detail_en: '' }),
      baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, item_pack: kind !== 'currency',
      base_null_reason: 'Apple lists no Gems amount field and the item is not on the official web store',
      bonus_null_reason: 'No official bonus source for App Store-only items',
      total_null_reason: 'No base Gems amount for App Store-only items',
      ...(kind === 'pass' ? { pass_type: rmPassType(r.offerName ?? '', name) } : {}),
      price_thb: thb, price_thb_source: thb !== null ? `apple-app-store-th (item ${thRow!.id}${thRow!.offerName ? `, offerName=${thRow!.offerName}` : ''})` : null,
      price_usd: usd, price_usd_source: usd !== null ? `apple-app-store-${u!.cc} (USD storefront, ${u!.m.by})` : null,
      price: thb ?? usd, currency: thb !== null ? 'THB' : usd !== null ? 'USD' : null
    }
    if (pack.apple_item_id === null) pack.apple_item_id = r.id
    if (thb === null) pack.price_thb_null_reason = thEn.rows ? 'not sold on App Store TH (matched by offerName/Apple item id); not on the official web store' : `App Store TH list unavailable (${reasonOf(thEn)})`
    if (usd === null) pack.price_usd_null_reason = usdReason()
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    appleOnly.push(pack)
  }

  const all = [...official, ...appleOnly]
  all.forEach((p, i) => { if (!p.id) p.id = i + 1 })
  const sortP = (a: any, b: any) => (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) || (a.price_thb ?? Infinity) - (b.price_thb ?? Infinity)
  const msg = 'Live (no fallback catalog)'
  const ofs = (kind: RmKind, tag: 'default' | 'asia') => official.filter((p) => p.kind === kind && (tag === 'default' ? p.server_tag === 'default' : p.server_tag !== 'default')).sort(sortP)
  const ended = (expired.length ? `; ended (excluded): ${expired.join(', ')}` : '') + (upcoming.length ? `; not yet on sale (excluded): ${upcoming.join(', ')}` : '')
  const cats = [
    { id: 1, name: 'Gems (Official NetEase GamesClub, SEA server)', packs: ofs('currency', 'default'), message: msg },
    { id: 2, name: 'Master Pass & Cards (Official NetEase GamesClub, SEA server)', packs: ofs('pass', 'default'), message: msg },
    { id: 3, name: 'Bundles (Official NetEase GamesClub, SEA server)', packs: ofs('bundle', 'default'), message: msg + ended },
    { id: 4, name: 'Gems (Official NetEase GamesClub, Asia server)', packs: ofs('currency', 'asia'), message: msg },
    { id: 5, name: 'Master Pass & Cards (Official NetEase GamesClub, Asia server)', packs: ofs('pass', 'asia'), message: msg },
    { id: 6, name: 'Bundles (Official NetEase GamesClub, Asia server)', packs: ofs('bundle', 'asia'), message: msg },
    { id: 7, name: 'App Store-only items (TH THB / USD storefront, by offerName)', packs: appleOnly.sort(sortP), message: msg }
  ]
  const categories = cats.filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, packCount: c.packs.length }))
  const notes = [
    'Main: official NetEase GamesClub top-up (game code racingmastersea, live products API). THB = official extra.local_price.TH; USD = product.price of the same product; Thai name/description = official multi_language TH. No FX conversion, no resellers.',
    'Two official product sets: g112sea.* (default SEA server, official THB) and g112seaasia.* (dedicated "asia" server tag, USD only on the web store; THB from App Store TH by offerName).',
    'Bonus = product-list bonus + GameClub bonus Gems from the activitys API (alpha2=TH, NetEase Credit; activity_type 0 and 12, with end dates); discounts = activity_type 27 (discount_price_*, discount_until).' +
      (act ? ` Live: ${act.bonus.size} bonus entries, ${act.discounts.size} discounts, ${act.coupons} coupon-eligibility entries (coupons carry no price/amount).` : ''),
    `Apple App Store (SEA app ${RM_APP_ID}): matched to official goodsids and between storefronts only by Apple offerName (NetEase goodsid) or Apple item id. Supplies THB where the official store has none, App Store-only items (THB from TH, USD from US, else KH when the app is not sold in the US), and descriptions.`,
    'Pass and bundle items are item_pack:true (base/total Gems null with reason; bonus = GameClub bonus Gems when live). Car variants (sub_item) are separate packs.',
    'Game code "racingmaster" (TW/HK/Macao, TWD) and the NA app are different regional versions and are not used.'
  ]
  if (expired.length) notes.push(`Ended on the official store (excluded): ${expired.join(', ')}`)
  if (upcoming.length) notes.push(`Not yet on sale on the official store (excluded): ${upcoming.join(', ')}`)
  if (!act) notes.push(actReason)
  notes.push(APPSTORE_FULL_IAP_NOTE)
  if (!thEn.rows) notes.push('App Store TH: ' + reasonOf(thEn))
  if (!thTh.rows) notes.push('App Store TH (Thai): ' + reasonOf(thTh))
  if (!us.rows) notes.push('App Store US: ' + reasonOf(us) + ' (SEA app not sold in the US; USD from KH)')
  return ({
    game: { id: RM_APP_ID, slug: RM_SLUG, name: 'Racing Master', itemName: 'Gems', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: RM_PRODUCTS_API_URL,
    sources: { products: RM_PRODUCTS_API_URL, bonus: RM_ACTIVITYS_API_URL, thb: RM_PRODUCTS_API_URL, usd: RM_PRODUCTS_API_URL, appstore_th: rmCatalogUrl('th'), appstore_us: rmCatalogUrl('us'), appstore_usd_fallback: rmCatalogUrl('kh') },
    notes
  } as unknown) as RovPacksResponse
}

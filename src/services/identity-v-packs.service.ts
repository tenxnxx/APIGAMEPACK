import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'
import { sojThbLocalPrice, sojWindow } from './sword-of-justice-packs.service'
import { matchApple } from './where-winds-meet-packs.service'

/**
 * Identity V (NetEase, global "h55na" server) - official NetEase GamesClub top-up (pay.neteasegames.com, game code "identityv").
 * Thailand store (region TH) = the official THB-currency Echoes products (extra.country TH, is_pass_currency TRUE, no MOL point-card
 * channel) + the monthly web-shop packs (THB from official extra.local_price.TH). USD = the official USD product of the same Echoes tier
 * (same "<N>echoes" goodsid tier and pay_yuanbao) / product.price of the same pack. Bonus = product free_yuanbao + GameClub bonus
 * (activitys API, alpha2=TH, activity_type 0) - the exact "+bonus" the TH store shows. Apple App Store (app 1347780764, com.netease.idv)
 * adds Apple item ids / descriptions (matched only by offerName "h55na.<N>echoes" or item id) and App Store-only items (THB from TH,
 * USD from US, else KH/LA/MM). No FX, no resellers, no hardcoded prices.
 */
export const IDV_SLUG = 'identity-v'
export const IDV_APP_ID = 1347780764
export const IDV_GAME_CODE = 'identityv'
export const IDV_TOPUP_URL = 'https://pay.neteasegames.com/identityv/topup'
export const IDV_PRODUCTS_API_URL = 'https://pay.neteasegames.com/gameclub/products/identityv?gc_client_version=1.13.56'
export const IDV_ACTIVITYS_API_URL =
  'https://pay.neteasegames.com/gameclub/products/identityv/activitys?gc_client_version=1.13.56&pay_method=gameclub_wallet&pay_type=NetEase+Credit_gameclub_wallet&alpha2=TH'
export const IDV_USD_FALLBACK_STOREFRONTS = ['kh', 'la', 'mm'] as const
export const idvCatalogUrl = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${IDV_APP_ID}/top-in-apps`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const FOREVER = 2147483647

export class IdentityVUpstreamUnavailableError extends Error {
  constructor(message = 'Identity V NetEase GamesClub upstream unavailable') { super(message); this.name = 'IdentityVUpstreamUnavailableError' }
}
export class IdentityVInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Identity V NetEase GamesClub response') { super(message); this.name = 'IdentityVInvalidUpstreamResponseError' }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const strip = (s: unknown) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '')
const iso = (t: number | null) => (t !== null && t > 0 && t < FOREVER ? new Date(t * 1000).toISOString() : null)
/** Echoes tier token of a plain Echoes goodsid ("h55na.mol.th.180echoes", "h55na.codashoop.180echoes", Apple "h55na.180echoes"). */
export function idvTier(goodsid: string): number | null {
  const m = /^h55na\.(?:[a-z]+\.)*?(\d+)echoes$/i.exec(goodsid)
  return m && !/\.prepaid\.|\.topup\./i.test(goodsid) ? Number(m[1]) : null
}
export const idvAppleOffer = (tier: number) => `h55na.${tier}echoes`

/** activity_type 0 = GameClub bonus Echoes (marketing_free_amount); 203/204 = coupons (counted). Active window, alpha2 all/TH. */
export function parseIdvActivitys(json: any, now: number): { bonus: Map<string, { amount: number; until: string | null; activityids: string[] }>; coupons: number } | null {
  if (json?.code !== '0000' || !Array.isArray(json?.data?.list)) return null
  const bonus = new Map<string, { amount: number; until: string | null; activityids: string[] }>()
  let coupons = 0
  for (const a of json.data.list) {
    if (typeof a?.goodsid !== 'string') continue
    if (a.alpha2 !== undefined && a.alpha2 !== 'all' && a.alpha2 !== 'TH') continue
    if (sojWindow(a, now) !== 'active') continue
    const t = String(a.activity_type)
    if ((t === '0' || t === '12') && typeof a.marketing_free_amount === 'number' && a.marketing_free_amount > 0) {
      const prev = bonus.get(a.goodsid); const until = iso(num(a.expired_time))
      bonus.set(a.goodsid, {
        amount: (prev?.amount ?? 0) + a.marketing_free_amount,
        until: prev?.until && until ? (prev.until < until ? prev.until : until) : (prev?.until ?? until),
        activityids: [...(prev?.activityids ?? []), String(a.activityid ?? '')]
      })
    } else if (t === '203' || t === '204' || t === '104' || t === '13') coupons++
  }
  return { bonus, coupons }
}

export type IdvEchoes = { goodsid: string; tier: number; price: number; pay: number; free: number; points: number | null; name: string }
export type IdvPack = {
  goodsid: string; name: string; name_th: string | null; detail_en: string; detail_th: string | null; name_cn: string
  usd: number; thb: number | null; points: number | null; image: string | null; available_from: string | null; available_until: string | null; purchase_limit: unknown
}
export type IdvParsed = { thEchoes: IdvEchoes[]; usdEchoes: Map<number, IdvEchoes>; packs: IdvPack[]; expired: string[]; upcoming: string[]; prepaidExcluded: number }

/** status 1, active window; deduped per goodsid across platforms (ad/ios/pc). */
export function parseIdvProducts(json: any, now: number): IdvParsed {
  if (json?.code !== '0000' || !Array.isArray(json?.data)) throw new IdentityVInvalidUpstreamResponseError('products: ' + (json?.msg ?? 'bad shape'))
  const out: IdvParsed = { thEchoes: [], usdEchoes: new Map(), packs: [], expired: [], upcoming: [], prepaidExcluded: 0 }
  const seen = new Set<string>(); const prepaid = new Set<string>()
  for (const p of json.data as any[]) {
    if (typeof p?.goodsid !== 'string' || p.status !== 1) continue
    const k = p.goodsid + '|' + p.currency
    if (seen.has(k)) continue
    const extra = p.extra && typeof p.extra === 'object' ? p.extra : {}
    const ml = p.multi_language?.default?.default ?? {}
    const th = p.multi_language?.TH?.default ?? {}
    const name = strip(ml.goodsinfo) || strip(p.goodsinfo)
    const w = sojWindow(p, now)
    if (w !== 'active') { seen.add(k); (w === 'expired' ? out.expired : out.upcoming).push(`${name} (${p.goodsid})`); continue }
    const price = num(p.price)
    if (price === null) continue
    seen.add(k)
    const points = num(p.product_activity_type?.fixed_point)
    const tier = idvTier(p.goodsid)
    if (p.currency === 'THB') {
      if (extra.country !== 'TH') continue
      // MOL point-card denominations (mol_channel_id / is_pass_currency FALSE): only shown with a point-card pay method; TH has none.
      if (extra.mol_channel_id || String(extra.is_pass_currency).toUpperCase() !== 'TRUE') { prepaid.add(p.goodsid); continue }
      if (tier === null) continue
      out.thEchoes.push({ goodsid: p.goodsid, tier, price, pay: num(p.pay_yuanbao) ?? 0, free: num(p.free_yuanbao) ?? 0, points, name })
    } else if (p.currency === 'USD') {
      if (extra.country) continue
      const hasLocal = extra.local_price !== undefined
      if (tier !== null && !hasLocal) {
        if (!out.usdEchoes.has(tier)) out.usdEchoes.set(tier, { goodsid: p.goodsid, tier, price, pay: num(p.pay_yuanbao) ?? 0, free: num(p.free_yuanbao) ?? 0, points, name })
        continue
      }
      out.packs.push({
        goodsid: p.goodsid, name, name_th: strip(th.goodsinfo) || null, detail_en: strip(ml.goods_detail), detail_th: strip(th.goods_detail) || null,
        name_cn: strip(p.goodsinfo), usd: price, thb: sojThbLocalPrice(extra), points,
        image: th.image_info?.normal ?? ml.image_info?.normal ?? null,
        available_from: iso(num(p.effective_time)), available_until: iso(num(p.expired_time)), purchase_limit: p.purchase_limit ?? null
      })
    }
  }
  out.prepaidExcluded = prepaid.size
  out.thEchoes.sort((a, b) => a.price - b.price)
  out.expired = [...new Set(out.expired)]; out.upcoming = [...new Set(out.upcoming)]
  return out
}

type List = { rows: AppStoreFullIapRow[] } | { rows: null; reason: string }
async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  let r: Response
  try {
    r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'application/json', Referer: IDV_TOPUP_URL } })
  } catch (e) {
    throw new IdentityVUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!r.ok) throw new IdentityVUpstreamUnavailableError('HTTP ' + r.status)
  try { return await r.json() } catch { throw new IdentityVInvalidUpstreamResponseError('Non-JSON response') }
}
async function list(cc: string, l: string | null, signal?: AbortSignal): Promise<List> {
  try { return { rows: await fetchAppStoreFullIap(cc, String(IDV_APP_ID), l, signal) } } catch (e) { return { rows: null, reason: e instanceof Error ? e.message : String(e) } }
}
const reasonOf = (x: List) => ('reason' in x ? x.reason : '')
const THAI = /[\u0E00-\u0E7F]/
/** Apple's Thai-language list only when the text is actually Thai (Apple falls back to English). */
const thai = (s: string | null | undefined) => (s && THAI.test(s) ? s : null)
const echoesInName = (s: string) => { const m = /^([\d,]+)\s*Echoes$/i.exec(s.trim()); return m ? Number(m[1].replace(/,/g, '')) : null }

export async function fetchIdentityVPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [prod, actRaw] = await Promise.all([
    getJson(IDV_PRODUCTS_API_URL, signal),
    getJson(IDV_ACTIVITYS_API_URL, signal).catch((e) => ({ __error: e instanceof Error ? e.message : String(e) }))
  ])
  const now = num(actRaw?.data?.server_ts) ?? Date.now() / 1000
  const parsed = parseIdvProducts(prod, now)
  if (!parsed.thEchoes.length && !parsed.packs.length) throw new IdentityVInvalidUpstreamResponseError('No active TH products')
  const act = parseIdvActivitys(actRaw, now)
  const actReason = 'Official activitys endpoint unavailable: ' + (actRaw?.__error ?? actRaw?.msg ?? 'bad shape')

  const thEn = await list('th', 'en-GB', signal)
  const thTh = await list('th', 'th', signal)
  const us = await list('us', 'en-US', signal)
  const fallback: Record<string, List> = {}
  const usdFor = async (ref: { offerName?: string | null; id?: string | null }) => {
    const m = matchApple(us.rows, ref)
    if (m && m.row.currency === 'USD') return { m, cc: 'us' }
    for (const cc of IDV_USD_FALLBACK_STOREFRONTS) {
      fallback[cc] ??= await list(cc, null, signal)
      const f = matchApple(fallback[cc].rows, ref)
      if (f && f.row.currency === 'USD') return { m: f, cc }
    }
    return null
  }
  const usdReason = () =>
    `not found on App Store US${us.rows ? '' : ` (list unavailable: ${reasonOf(us)})`} or ${IDV_USD_FALLBACK_STOREFRONTS.map((c) => c.toUpperCase()).join('/')} (USD storefronts) by offerName/Apple item id`
  const thList = () => (thTh.rows ? 'not in the Thai-language App Store TH list by offerName/Apple item id' : `Thai-language App Store TH list unavailable (${reasonOf(thTh)})`)
  const bonusOf = (goodsid: string) => act?.bonus.get(goodsid)
  const usedApple = new Set<string>()

  // 1) Echoes: official THB rows; USD from the official USD row of the same tier.
  const echoes = parsed.thEchoes.map((e) => {
    const u = parsed.usdEchoes.get(e.tier)
    const ref = { offerName: idvAppleOffer(e.tier) }
    const thRow = matchApple(thEn.rows, ref)?.row
    const thThRow = matchApple(thTh.rows, ref)?.row
    const thName = thai(thThRow?.name)
    if (thRow) usedApple.add(thRow.id)
    const b = bonusOf(e.goodsid)
    const gc = act ? (b?.amount ?? 0) : null
    const bonus = gc === null ? null : e.free + gc
    const ub = u ? bonusOf(u.goodsid) : undefined
    const pack: any = {
      id: Number(thRow?.id) || 0, name: e.name || `${e.pay} Echoes`, product_id: e.goodsid, kind: 'currency', store: 'netease-gameclub',
      name_th: thName, name_th_source: thName ? 'apple-app-store-th (th)' : null,
      ...(thName ? {} : { name_th_null_reason: 'Official product has no Thai name (multi_language default only) and ' + (thThRow ? 'the Thai-language App Store TH item name is not in Thai' : thList()) }),
      description: thRow?.description ?? null, description_en: thRow?.description ?? null, description_en_source: thRow ? `apple-app-store-th (en-GB, offerName=${ref.offerName})` : null,
      ...(thRow ? {} : { description_en_null_reason: 'No official goods_detail and not on App Store TH by offerName ' + ref.offerName }),
      apple_item_id: thRow?.id ?? null,
      baseItemAmount: e.pay, bonusItemAmount: bonus, totalItemAmount: bonus === null ? null : e.pay + bonus, item_pack: false,
      bonus_breakdown: { product_free_echoes: e.free, gameclub_bonus: gc, gameclub_bonus_until: b?.until ?? null, gameclub_bonus_activityids: b?.activityids ?? [] },
      bonus_available: act !== null, bonus_source: act ? 'netease-gameclub products free_yuanbao + activitys (alpha2=TH, activity_type 0)' : null,
      gameclub_points: e.points, gameclub_points_source: e.points !== null ? 'netease-gameclub-official (product_activity_type.fixed_point; GameClub account points, not Echoes)' : null,
      price_thb: e.price, price_thb_source: `netease-gameclub-official (THB product ${e.goodsid})`,
      price_usd: u ? u.price : null, price_usd_source: u ? `netease-gameclub-official (USD product ${u.goodsid}, same ${e.tier}echoes tier, ${u.pay} Echoes)` : null,
      usd_store_bonus: u && act ? u.free + (ub?.amount ?? 0) : null,
      price: e.price, currency: 'THB'
    }
    if (!u) pack.price_usd_null_reason = `No official USD Echoes product for the ${e.tier}echoes tier`
    else if (u.pay !== e.pay) pack.usd_amount_note = `USD product grants ${u.pay} base Echoes (THB product ${e.pay})`
    if (!act) pack.bonus_null_reason = actReason
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })

  // 2) Official web-shop packs (monthly packs): THB = local_price TH, USD = product.price.
  const packs = parsed.packs.filter((p) => p.thb !== null).map((p) => {
    const b = bonusOf(p.goodsid)
    const monthly = /每月|monthly/i.test(p.name_cn + ' ' + p.name)
    const pack: any = {
      id: 0, name: p.name, product_id: p.goodsid, kind: 'bundle', store: 'netease-gameclub',
      name_th: p.name_th, name_th_source: p.name_th ? 'netease-gameclub-official (multi_language TH)' : null,
      ...(p.name_th ? {} : { name_th_null_reason: 'No official Thai name (multi_language TH)' }),
      description: [p.detail_th, p.detail_en].filter(Boolean).join(' / ') || null,
      description_th: p.detail_th, description_th_source: p.detail_th ? 'netease-gameclub-official (multi_language TH)' : null,
      ...(p.detail_th ? {} : { description_th_null_reason: 'No official Thai description (multi_language TH)' }),
      description_en: p.detail_en || null, description_en_source: p.detail_en ? 'netease-gameclub-official (goods_detail)' : null,
      ...(p.detail_en ? {} : { description_en_null_reason: 'No official goods_detail' }),
      apple_item_id: null,
      baseItemAmount: null, bonusItemAmount: b ? b.amount : null, totalItemAmount: null, item_pack: true,
      pack_type: monthly ? 'monthly-pack' : 'bundle',
      base_null_reason: 'Item pack (contents in description); grants no Echoes', bonus_null_reason: b ? undefined : act ? 'No GameClub bonus on this pack' : actReason,
      total_null_reason: 'Item pack contents are not a single Echoes amount',
      gameclub_points: p.points, image_url: p.image,
      price_thb: p.thb, price_thb_source: 'netease-gameclub-official (local_price TH)',
      price_usd: p.usd, price_usd_source: 'netease-gameclub-official',
      price: p.thb, currency: 'THB', available_from: p.available_from, available_until: p.available_until, purchase_limit: p.purchase_limit
    }
    if (pack.bonus_null_reason === undefined) delete pack.bonus_null_reason
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })
  const usdOnlyPacks = parsed.packs.filter((p) => p.thb === null).map((p) => `${p.name} (${p.goodsid}, USD ${p.usd})`)

  // 3) App Store-only items (not sold on the official TH web store).
  const refs: AppStoreFullIapRow[] = []
  for (const r of [...(thEn.rows ?? []), ...(us.rows ?? [])]) {
    if (usedApple.has(r.id)) continue
    if (r.offerName && idvTier(r.offerName) !== null && parsed.thEchoes.some((e) => idvAppleOffer(e.tier) === r.offerName)) continue
    if (refs.some((x) => (r.offerName && x.offerName === r.offerName) || x.id === r.id)) continue
    refs.push(r)
  }
  const expiredIds = new Set(parsed.expired.map((s) => /\(([^)]+)\)$/.exec(s)?.[1]).filter(Boolean) as string[])
  const appleOnly: any[] = []
  for (const r of refs) {
    const ref = { offerName: r.offerName ?? null, id: r.id }
    const thRow = matchApple(thEn.rows, ref)?.row
    const thThRow = matchApple(thTh.rows, ref)?.row
    const thName = thai(thThRow?.name); const thDesc = thai(thThRow?.description)
    const u = await usdFor(ref)
    const name = (thRow ?? r).name
    const isCur = !!r.offerName && idvTier(r.offerName) !== null
    const amount = isCur ? echoesInName(name) : null
    const thb = thRow && thRow.currency === 'THB' ? thRow.price : null
    const usd = u ? u.m.row.price : null
    const limited = /\.limit\./i.test(r.offerName ?? '')
    const desc = thRow?.description ?? r.description ?? null
    const pack: any = {
      id: Number(r.id) || 0, name, product_id: r.offerName ?? null, kind: isCur ? 'currency' : 'bundle', store: 'apple-app-store',
      name_th: thName, name_th_source: thName ? 'apple-app-store-th (th)' : null,
      ...(thName ? {} : { name_th_null_reason: thThRow ? 'Thai-language App Store TH item name is not in Thai' : thList() }),
      description: [thDesc, desc].filter((x, i, a) => x && a.indexOf(x) === i).join(' / ') || null,
      description_th: thDesc, description_th_source: thDesc ? 'apple-app-store-th (th)' : null,
      ...(thDesc ? {} : { description_th_null_reason: thThRow ? 'Thai-language App Store TH description is not in Thai' : thList() }),
      description_en: desc, description_en_source: desc ? (thRow ? 'apple-app-store-th (en-GB)' : 'apple-app-store-us') : null,
      apple_item_id: r.id, family_shareable: typeof (thRow ?? r).familyShareable === 'boolean' ? (thRow ?? r).familyShareable : null,
      baseItemAmount: amount, base_source: amount !== null ? 'apple item name' : null,
      bonusItemAmount: null, totalItemAmount: amount, item_pack: !isCur,
      ...(amount === null ? { base_null_reason: isCur ? 'Apple name has no Echoes amount' : 'Item pack (Echoes + Essences etc. in description); not a single Echoes amount', total_null_reason: 'No base Echoes amount' } : {}),
      bonus_null_reason: 'No official bonus source for App Store-only items',
      ...(limited ? { pack_type: 'limited-event-pack', availability_note: 'Limited-time in-game event pack: Apple keeps listing past event IAPs; purchasable only while the in-game event runs' + (r.offerName && expiredIds.has(r.offerName) ? ' (official web store window for this goodsid has ended)' : '') } : {}),
      price_thb: thb, price_thb_source: thb !== null ? `apple-app-store-th (item ${thRow!.id}${thRow!.offerName ? `, offerName=${thRow!.offerName}` : ''})` : null,
      price_usd: usd, price_usd_source: u ? `apple-app-store-${u.cc} (USD storefront, ${u.m.by})` : null,
      price: thb ?? usd, currency: thb !== null ? 'THB' : usd !== null ? 'USD' : null
    }
    if (thb === null) pack.price_thb_null_reason = thEn.rows ? 'Not sold on App Store TH (matched by offerName/Apple item id); not on the official TH web store' : `App Store TH list unavailable (${reasonOf(thEn)})`
    if (usd === null) pack.price_usd_null_reason = usdReason()
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    appleOnly.push(pack)
  }

  const sortP = (a: any, b: any) => (a.price_thb ?? Infinity) - (b.price_thb ?? Infinity) || (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity)
  const all = [...echoes, ...packs, ...appleOnly]
  all.forEach((p, i) => { if (!p.id) p.id = i + 1 })
  const msg = 'Live (no fallback catalog)'
  const cats = [
    { id: 1, name: 'Echoes (Official NetEase GamesClub, TH store)', packs: echoes.sort(sortP), message: msg },
    { id: 2, name: 'Monthly Packs (Official NetEase GamesClub, TH store)', packs: packs.sort(sortP), message: msg },
    { id: 3, name: 'App Store-only Echoes (TH THB / USD storefront, by offerName)', packs: appleOnly.filter((p) => p.kind === 'currency').sort(sortP), message: msg },
    { id: 4, name: 'App Store Event Packs (Echoes + Essences, TH THB / USD storefront)', packs: appleOnly.filter((p) => p.kind !== 'currency').sort(sortP), message: msg }
  ]
  const categories = cats.filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, packCount: c.packs.length }))
  const notes = [
    'Main: official NetEase GamesClub top-up (game code identityv, live products API), Thailand region. THB = the official THB-currency Echoes products (extra.country TH) and official extra.local_price.TH for packs; USD = the official USD product of the same Echoes tier (goodsid tier "<N>echoes", same pay_yuanbao) / product.price of the same pack. No FX conversion, no resellers.',
    'The official USD Echoes goodsids are named "h55na.codashoop.*" inside NetEase\'s own product list; prices are read only from pay.neteasegames.com (no third-party store is called).',
    `Bonus = product free_yuanbao + GameClub bonus from the activitys API (alpha2=TH, NetEase Credit, activity_type 0), matching the TH store "+bonus". gameclub_points = official GameClub account points (fixed_point), not Echoes.` +
      (act ? ` Live: ${act.bonus.size} bonus entries, ${act.coupons} coupon-eligibility entries (coupons carry no price/amount).` : ''),
    `Excluded: ${parsed.prepaidExcluded} MOL point-card denominations (h55na.mol.th.prepaid.*, mol_channel_id set) - the TH store offers no point-card pay method, so they are not sold there.`,
    'Passes: Identity V sells no battle/season pass for money. Essences and the season Deduction pass are bought in-game with Echoes/Fragments; neither the official store nor App Store TH/US lists them as items. Essences appear only inside the App Store event packs (item_pack:true).',
    `Apple App Store (app ${IDV_APP_ID}, com.netease.idv): matched only by Apple offerName (NetEase goodsid "h55na.<N>echoes", event "h55na.*.limit.*") or Apple item id. Supplies Apple item ids/English descriptions for Echoes and App Store-only items (THB from TH, USD from US, else ${IDV_USD_FALLBACK_STOREFRONTS.map((c) => c.toUpperCase()).join('/')}).`
  ]
  if (parsed.expired.length) notes.push(`Ended on the official store (excluded): ${parsed.expired.join(', ')}`)
  if (parsed.upcoming.length) notes.push(`Not yet on sale on the official store (excluded): ${parsed.upcoming.join(', ')}`)
  if (usdOnlyPacks.length) notes.push(`Official packs without a TH price (not on the TH store, excluded): ${usdOnlyPacks.join(', ')}`)
  if (!act) notes.push(actReason)
  notes.push(APPSTORE_FULL_IAP_NOTE)
  if (!thEn.rows) notes.push('App Store TH: ' + reasonOf(thEn))
  if (!thTh.rows) notes.push('App Store TH (Thai): ' + reasonOf(thTh))
  if (!us.rows) notes.push('App Store US: ' + reasonOf(us))
  return ({
    game: { id: IDV_APP_ID, slug: IDV_SLUG, name: 'Identity V', itemName: 'Echoes', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: IDV_PRODUCTS_API_URL,
    sources: {
      products: IDV_PRODUCTS_API_URL, bonus: IDV_ACTIVITYS_API_URL, thb: IDV_PRODUCTS_API_URL, usd: IDV_PRODUCTS_API_URL, topup_page: IDV_TOPUP_URL,
      appstore_th: idvCatalogUrl('th'), appstore_us: idvCatalogUrl('us'), appstore_usd_fallback: IDV_USD_FALLBACK_STOREFRONTS.map(idvCatalogUrl)
    },
    notes
  } as unknown) as RovPacksResponse
}

import { appStoreFetch, APPSTORE_FULL_IAP_NOTE, isFullIapResponse, iapScope } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'
import { parseAppStoreIapRows, type IapRow } from './architect-packs.service'

/**
 * Sword of Justice (NetEase, global) - official NetEase GamesClub top-up (pay.neteasegames.com, game code "swordofjustice").
 * Thailand = the ".sea" product set. THB = product extra.local_price.TH.default (official), USD = product.price (same product).
 * Bonus: in-game "Bonus" from the product's free-amount list + "GameClubBonus" from the live activitys API (alpha2=TH).
 * Pass / bundle discounts (activity_type 27) are exposed as discount_price_* (list price kept). App Store TH (app 6743792504)
 * is used only for packs with no official THB. No FX, no resellers, no hardcoded prices.
 */
export const SOJ_SLUG = 'sword-of-justice'
export const SOJ_APP_ID = 6743792504
export const SOJ_TOPUP_URL = 'https://pay.neteasegames.com/swordofjustice/topup'
export const SOJ_PRODUCTS_API_URL = 'https://pay.neteasegames.com/gameclub/products/swordofjustice?gc_client_version=1.13.55'
export const SOJ_ACTIVITYS_API_URL =
  'https://pay.neteasegames.com/gameclub/products/swordofjustice/activitys?gc_client_version=1.13.55&pay_method=gameclub_wallet&pay_type=NetEase+Credit_gameclub_wallet&alpha2=TH'
export const SOJ_APPSTORE_TH = `https://apps.apple.com/th/app/id${SOJ_APP_ID}`
export const SOJ_REGION_SUFFIX = '.sea'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class SwordOfJusticeUpstreamUnavailableError extends Error {
  constructor(message = 'Sword of Justice NetEase GamesClub upstream unavailable') { super(message); this.name = 'SwordOfJusticeUpstreamUnavailableError' }
}
export class SwordOfJusticeInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Sword of Justice NetEase GamesClub response') { super(message); this.name = 'SwordOfJusticeInvalidUpstreamResponseError' }
}

export type SojKind = 'currency' | 'pass' | 'bundle'
export function sojKind(goodsid: string): SojKind {
  if (/wenyu/i.test(goodsid)) return 'currency'
  if (/yueka|zhanling/i.test(goodsid)) return 'pass'
  return 'bundle'
}
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const key = (n: string) => n.toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9]+/g, '')
const jadeAmt = (n: string): number | null => {
  const m = n.toLowerCase().replace(/,/g, '').match(/^\s*(\d+)\s*(?:ornate\s*)?jades?\s*$/)
  return m ? Number(m[1]) : null
}
const strip = (s: unknown) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '')

/** Official THB from extra.local_price (JSON string or object) -> TH.default when currency is THB. */
export function sojThbLocalPrice(extra: unknown): number | null {
  if (!extra || typeof extra !== 'object') return null
  let lp: any = (extra as any).local_price
  if (typeof lp === 'string') { try { lp = JSON.parse(lp) } catch { return null } }
  const d = lp?.TH?.default
  return d && d.currency === 'THB' ? num(d.price) : null
}

/** Live window: active if no window or effective <= now <= expired. */
export function sojWindow(p: any, now: number): 'active' | 'upcoming' | 'expired' {
  const eff = num(p?.effective_time); const exp = num(p?.expired_time)
  if (exp !== null && exp < now) return 'expired'
  if (eff !== null && eff > now) return 'upcoming'
  return 'active'
}

export type SojActivity = { gameClubBonus: Map<string, number>; discounts: Map<string, { THB: number | null; USD: number | null }> }
export function parseSojActivitys(json: any, now: number): SojActivity | null {
  if (json?.code !== '0000' || !Array.isArray(json?.data?.list)) return null
  const out: SojActivity = { gameClubBonus: new Map(), discounts: new Map() }
  for (const a of json.data.list) {
    if (typeof a?.goodsid !== 'string') continue
    if (a.alpha2 !== undefined && a.alpha2 !== 'all' && a.alpha2 !== 'TH') continue
    if (sojWindow(a, now) !== 'active') continue
    const t = String(a.activity_type)
    if (t === '0' && typeof a.marketing_free_amount === 'number' && a.marketing_free_amount > 0)
      out.gameClubBonus.set(a.goodsid, (out.gameClubBonus.get(a.goodsid) ?? 0) + a.marketing_free_amount)
    if (t === '27' && a.after_discount_price_map && typeof a.after_discount_price_map === 'object')
      out.discounts.set(a.goodsid, { THB: num(a.after_discount_price_map.THB), USD: num(a.after_discount_price_map.USD) })
  }
  return out
}

export type SojProduct = {
  goodsid: string; kind: SojKind; name: string; detail: string; usd: number; thb: number | null
  base: number; inGameBonus: number; image: string | null; window: 'active' | 'upcoming'
  available_from: number | null; available_until: number | null; purchase_limit: unknown
}
/** Filter to Thailand (.sea), status 1, USD-priced, not expired; dedupe platform copies by goodsid. */
export function parseSojProducts(json: any, now: number): { products: SojProduct[]; upcoming: SojProduct[] } {
  if (json?.code !== '0000' || !Array.isArray(json?.data)) throw new SwordOfJusticeInvalidUpstreamResponseError('products: ' + (json?.msg ?? 'bad shape'))
  const seen = new Set<string>(); const products: SojProduct[] = []; const upcoming: SojProduct[] = []
  for (const p of json.data as any[]) {
    if (typeof p?.goodsid !== 'string' || !p.goodsid.endsWith(SOJ_REGION_SUFFIX) || p.currency !== 'USD' || p.status !== 1) continue
    if (seen.has(p.goodsid)) continue
    const w = sojWindow(p, now)
    if (w === 'expired') continue
    const usd = num(p.price)
    if (usd === null) continue
    seen.add(p.goodsid)
    const ml = p.multi_language?.default?.default ?? {}
    const list = Array.isArray(ml.product_free_amount_activity_list) ? ml.product_free_amount_activity_list : []
    const inGameBonus = list.filter((x: any) => x?.activity_description !== 'GameClubBonus').reduce((s: number, x: any) => s + (num(x?.amount) ?? 0), 0)
    const row: SojProduct = {
      goodsid: p.goodsid, kind: sojKind(p.goodsid), name: strip(ml.goodsinfo) || strip(p.goodsinfo), detail: strip(ml.goods_detail),
      usd, thb: sojThbLocalPrice(p.extra), base: (num(p.pay_yuanbao) ?? 0) + (num(p.free_yuanbao) ?? 0), inGameBonus,
      image: ml.image_info?.normal ?? p.icon?.TH?.normal ?? null, window: w,
      available_from: num(p.effective_time), available_until: num(p.expired_time), purchase_limit: p.purchase_limit ?? null
    }
    ;(w === 'active' ? products : upcoming).push(row)
  }
  const order = { currency: 0, pass: 1, bundle: 2 }
  products.sort((a, b) => order[a.kind] - order[b.kind] || a.usd - b.usd)
  return { products, upcoming }
}

async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  let r: Response
  try {
    r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'application/json', Referer: SOJ_TOPUP_URL } })
  } catch (e) {
    throw new SwordOfJusticeUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!r.ok) throw new SwordOfJusticeUpstreamUnavailableError('HTTP ' + r.status)
  try { return await r.json() } catch { throw new SwordOfJusticeInvalidUpstreamResponseError('Non-JSON response') }
}

async function fetchIapTh(signal?: AbortSignal): Promise<{ rows: IapRow[] | null; reason?: string; full?: boolean }> {
  try {
    const r = await appStoreFetch(SOJ_APPSTORE_TH, { signal: signal ?? AbortSignal.timeout(20_000), redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' } })
    if (r.status !== 200) return { rows: null, reason: `App Store HTTP ${r.status}` }
    const rows = parseAppStoreIapRows(await r.text(), 'THB')
    return rows.length ? { rows, full: isFullIapResponse(r) } : { rows: null, reason: 'No IAP rows on App Store page' }
  } catch (e) {
    return { rows: null, reason: 'App Store fetch failed: ' + (e instanceof Error ? e.message : String(e)) }
  }
}

export async function fetchSwordOfJusticePacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [prod, actRaw] = await Promise.all([
    getJson(SOJ_PRODUCTS_API_URL, signal),
    getJson(SOJ_ACTIVITYS_API_URL, signal).catch((e) => ({ __error: e instanceof Error ? e.message : String(e) }))
  ])
  const now = num(actRaw?.data?.server_ts) ?? Date.now() / 1000
  const { products, upcoming } = parseSojProducts(prod, now)
  if (!products.length) throw new SwordOfJusticeInvalidUpstreamResponseError('No active Thailand (.sea) products')
  const act = parseSojActivitys(actRaw, now)
  const actReason = 'Official activitys endpoint unavailable: ' + (actRaw?.__error ?? actRaw?.msg ?? 'bad shape')

  // App Store TH only when the official store lacks THB for some pack.
  const iap = products.some((p) => p.thb === null) ? await fetchIapTh(signal) : null
  const findIap = (name: string) => {
    if (!iap?.rows) return undefined
    const a = jadeAmt(name)
    return iap.rows.find((x) => (a !== null ? jadeAmt(x.name) === a : key(x.name) === key(name)))
  }

  const packs = products.map((p, i) => {
    const isCur = p.kind === 'currency'
    const gc = act ? (act.gameClubBonus.get(p.goodsid) ?? 0) : null
    const bonus = isCur ? (gc === null ? null : p.inGameBonus + gc) : null
    const fb = p.thb === null ? findIap(p.name) : undefined
    const thb = p.thb ?? fb?.price ?? null
    const disc = act?.discounts.get(p.goodsid)
    const descParts = [p.detail]
    if (disc) descParts.push(`GameClub discount: ${disc.THB !== null ? '\u0E3F' + disc.THB : '-'} / ${disc.USD !== null ? '$' + disc.USD : '-'}`)
    const pack: any = {
      id: i + 1, name: p.name, product_id: p.goodsid, kind: p.kind,
      baseItemAmount: isCur ? p.base : null, bonusItemAmount: bonus, totalItemAmount: isCur ? p.base + (bonus ?? 0) : null,
      bonus_breakdown: isCur ? { in_game_bonus: p.inGameBonus, gameclub_bonus: gc } : null,
      bonus_available: isCur && act !== null, bonus_source: isCur && act ? 'netease-gameclub products (Bonus) + activitys (GameClubBonus, alpha2=TH)' : null,
      item_pack: !isCur, description: descParts.filter(Boolean).join(' | '),
      image_url: p.image,
      price_thb: thb, price_thb_source: p.thb !== null ? 'netease-gameclub-official (local_price TH)' : fb ? 'apple-app-store-th' : null,
      price_usd: p.usd, price_usd_source: 'netease-gameclub-official',
      price: thb ?? p.usd, currency: thb !== null ? 'THB' : 'USD',
      discount_price_thb: disc?.THB ?? null, discount_price_usd: disc?.USD ?? null,
      available_until: p.available_until !== null && p.available_until < 2147483647 ? new Date(p.available_until * 1000).toISOString() : null,
      purchase_limit: p.purchase_limit
    }
    if (thb === null) pack.price_thb_null_reason = iap?.rows
      ? `No official TH local_price; "${p.name}" not in App Store TH IAP list (${iapScope(iap.full)})`
      : 'No official TH local_price; App Store TH: ' + (iap?.reason ?? 'not fetched')
    if (isCur && !act) pack.bonus_null_reason = actReason
    if (!isCur) {
      pack.base_null_reason = (p.kind === 'pass' ? 'Pass' : 'Bundle') + ' item; not a plain Ornate Jade amount (contents in description)'
      pack.bonus_null_reason = 'No currency bonus on pass/bundle items'
      if (p.kind === 'pass') pack.pass_type = /zhanling/i.test(p.goodsid) ? 'battle-pass' : 'monthly-pass'
    }
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })

  const msg = 'Live (no fallback catalog)'
  const cats = [
    { id: 1, name: 'Ornate Jades (Official NetEase GamesClub, TH)', packs: packs.filter((p) => p.kind === 'currency') },
    { id: 2, name: 'Monthly Pass & Battle Pass', packs: packs.filter((p) => p.kind === 'pass') },
    { id: 3, name: 'Bundles (limited-time)', packs: packs.filter((p) => p.kind === 'bundle') }
  ]
  const categories = cats.filter((c) => c.packs.length).map((c) => ({
    ...c, status: 0,
    message: c.id === 3 && upcoming.length ? `${msg}; ${upcoming.length} upcoming flash bundle(s) not yet on sale` : msg,
    packCount: c.packs.length
  }))
  const notes = [
    'Main: official NetEase GamesClub top-up (game code swordofjustice, live products API), Thailand product set (.sea).',
    'THB = official extra.local_price.TH (THB); USD = product.price of the same product. No FX conversion, no resellers.',
    'Bonus = in-game "Bonus" (product list) + "GameClubBonus" (activitys API, alpha2=TH, NetEase Credit). First-purchase extras are not included.',
    'discount_price_thb / discount_price_usd = official GameClub discount (activitys activity_type 27); price_thb/price_usd stay the list price.',
    'Expired and not-yet-started limited bundles are excluded.'
  ]
  if (!act) notes.push(actReason)
  if (iap) { notes.push(APPSTORE_FULL_IAP_NOTE); if (!iap.rows) notes.push('App Store TH: ' + iap.reason) }
  return ({
    game: { id: SOJ_APP_ID, slug: SOJ_SLUG, name: 'Sword of Justice', itemName: 'Ornate Jades', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: SOJ_PRODUCTS_API_URL,
    sources: { products: SOJ_PRODUCTS_API_URL, bonus: SOJ_ACTIVITYS_API_URL, thb: SOJ_PRODUCTS_API_URL, usd: SOJ_PRODUCTS_API_URL, appstore_th_fallback: SOJ_APPSTORE_TH },
    notes
  } as unknown) as RovPacksResponse
}

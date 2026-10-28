import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, iapScope, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'

/**
 * Destiny: Rising (NetEase) - official NetEase GamesClub top-up (pay.neteasegames.com, game code "destinyrising").
 * The web store sells only the six Silver packs (g108na.silver1..6), USD only: extra.local_price has no TH entry.
 * USD + base live from the products API; bonus = product free-amount list + activitys marketing_free_amount (alpha2=TH);
 * discounts = activitys activity_type 27 (after_discount_price_map) with their end time.
 * THB: official local_price.TH when NetEase adds it, else the official Apple App Store TH price of the SAME product,
 * matched exactly by Apple's offerName (= NetEase goodsid, e.g. g108na.silver4) from the full App Store IAP list.
 * Passes / bundles exist only as App Store in-app purchases (TH THB + US USD, paired by Apple item id) -> item_pack.
 * No FX, no resellers, no hardcoded prices.
 */
export const DESTINY_RISING_SLUG = 'destiny-rising'
export const DESTINY_RISING_APP_ID = 1593326563
export const DESTINY_RISING_TOPUP_URL = 'https://pay.neteasegames.com/destinyrising/topup'
export const DESTINY_RISING_PRODUCTS_API_URL = 'https://pay.neteasegames.com/gameclub/products/destinyrising?gc_client_version=1.13.55'
export const DESTINY_RISING_ACTIVITYS_API_URL =
  'https://pay.neteasegames.com/gameclub/products/destinyrising/activitys?gc_client_version=1.13.55&pay_method=gameclub_wallet&pay_type=NetEase+Credit_gameclub_wallet&alpha2=TH'
export const DESTINY_RISING_APPSTORE_TH = `https://apps.apple.com/th/app/id${DESTINY_RISING_APP_ID}`
export const DESTINY_RISING_APPSTORE_US = `https://apps.apple.com/us/app/id${DESTINY_RISING_APP_ID}`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const NO_END = 2147483647

export class DestinyRisingUpstreamUnavailableError extends Error {
  constructor(message = 'Destiny: Rising NetEase GamesClub upstream unavailable') { super(message); this.name = 'DestinyRisingUpstreamUnavailableError' }
}
export class DestinyRisingInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Destiny: Rising NetEase GamesClub response') { super(message); this.name = 'DestinyRisingInvalidUpstreamResponseError' }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const strip = (s: unknown) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '')
const iso = (t: number | null) => (t !== null && t < NO_END ? new Date(t * 1000).toISOString() : null)
/** "60 Silver" / "300 Sliver" (NetEase typo) / "60silver" (App Store) -> 60 */
export const silverAmt = (n: string): number | null => {
  const m = n.toLowerCase().replace(/,/g, '').match(/^\s*(\d+)\s*s(?:il|li)ver\s*$/)
  return m ? Number(m[1]) : null
}

export type DrKind = 'currency' | 'pass' | 'bundle'
export type DrPassType = 'battle-pass' | 'weekly-card' | 'growth-fund' | null
/** Classify by the developer product id (goodsid / Apple offerName), falling back to the item name. */
export function drKind(productId: string | null, name: string): { kind: DrKind; pass_type: DrPassType } {
  const s = (productId ?? '') + ' ' + name
  if (/silver\d|^\s*\d+\s*s(?:il|li)ver/i.test(s) || silverAmt(name) !== null) return { kind: 'currency', pass_type: null }
  if (/battlepass|battle pass|pass plus/i.test(s)) return { kind: 'pass', pass_type: 'battle-pass' }
  if (/weekcard|monthcard|weekly|monthly/i.test(s)) return { kind: 'pass', pass_type: 'weekly-card' }
  if (/growthfund/i.test(s)) return { kind: 'pass', pass_type: 'growth-fund' }
  return { kind: 'bundle', pass_type: null }
}

/** Official THB from extra.local_price (JSON string or object) -> TH.default when currency is THB. */
export function drThbLocalPrice(extra: unknown): number | null {
  if (!extra || typeof extra !== 'object') return null
  let lp: any = (extra as any).local_price
  if (typeof lp === 'string') { try { lp = JSON.parse(lp) } catch { return null } }
  const d = lp?.TH?.default
  return d && d.currency === 'THB' ? num(d.price) : null
}

export function drWindow(p: any, now: number): 'active' | 'upcoming' | 'expired' {
  const eff = num(p?.effective_time); const exp = num(p?.expired_time)
  if (exp !== null && exp < now) return 'expired'
  if (eff !== null && eff > now) return 'upcoming'
  return 'active'
}

export type DrDiscount = { THB: number | null; USD: number | null; until: number | null }
export type DrActivity = { gameClubBonus: Map<string, number>; discounts: Map<string, DrDiscount>; count: number }
export function parseDrActivitys(json: any, now: number): DrActivity | null {
  if (json?.code !== '0000' || !Array.isArray(json?.data?.list)) return null
  const out: DrActivity = { gameClubBonus: new Map(), discounts: new Map(), count: json.data.list.length }
  for (const a of json.data.list) {
    if (typeof a?.goodsid !== 'string') continue
    if (a.alpha2 !== undefined && a.alpha2 !== 'all' && a.alpha2 !== 'TH') continue
    if (drWindow(a, now) !== 'active') continue
    const t = String(a.activity_type ?? '0')
    if (t === '0' && typeof a.marketing_free_amount === 'number' && a.marketing_free_amount > 0)
      out.gameClubBonus.set(a.goodsid, (out.gameClubBonus.get(a.goodsid) ?? 0) + a.marketing_free_amount)
    if (t === '27' && a.after_discount_price_map && typeof a.after_discount_price_map === 'object')
      out.discounts.set(a.goodsid, { THB: num(a.after_discount_price_map.THB), USD: num(a.after_discount_price_map.USD), until: num(a.expired_time) })
  }
  return out
}

export type DrProduct = {
  goodsid: string; name: string; detail: string; usd: number; thb: number | null; base: number; inGameBonus: number
  image: string | null; available_until: number | null; purchase_limit: unknown
}
/** Active, status 1, USD-priced products; dedupe the ios/ad/pc copies by goodsid. */
export function parseDrProducts(json: any, now: number): DrProduct[] {
  if (json?.code !== '0000' || !Array.isArray(json?.data)) throw new DestinyRisingInvalidUpstreamResponseError('products: ' + (json?.msg ?? 'bad shape'))
  const seen = new Set<string>(); const out: DrProduct[] = []
  for (const p of json.data as any[]) {
    if (typeof p?.goodsid !== 'string' || p.currency !== 'USD' || p.status !== 1 || seen.has(p.goodsid)) continue
    if (drWindow(p, now) !== 'active') continue
    const usd = num(p.price)
    if (usd === null) continue
    seen.add(p.goodsid)
    const ml = p.multi_language?.default?.default ?? {}
    const list = Array.isArray(ml.product_free_amount_activity_list) ? ml.product_free_amount_activity_list : []
    out.push({
      goodsid: p.goodsid, name: strip(ml.goodsinfo) || strip(p.goodsinfo), detail: strip(ml.goods_detail), usd, thb: drThbLocalPrice(p.extra),
      base: num(p.pay_yuanbao) ?? 0,
      inGameBonus: (num(p.free_yuanbao) ?? 0) + list.filter((x: any) => x?.activity_description !== 'GameClubBonus').reduce((s: number, x: any) => s + (num(x?.amount) ?? 0), 0),
      image: ml.image_info?.normal ?? p.icon?.default?.default?.normal ?? null, available_until: num(p.expired_time), purchase_limit: p.purchase_limit ?? null
    })
  }
  return out.sort((a, b) => a.usd - b.usd)
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
/**
 * App Store product page In-App Purchases rows (top 10). Unlike the shared parser this keeps same-name rows,
 * so two items called "premuim pass plus" at different prices are detected as ambiguous instead of first-wins.
 */
export function parseDrIapPage(html: string, currency: 'THB' | 'USD'): AppStoreFullIapRow[] {
  const out: AppStoreFullIapRow[] = []
  for (const m of html.matchAll(/<div class="text-pair[^"]*"><span>([^<]+)<\/span>\s*<span>([^<]+)<\/span>/g)) {
    const raw = m[2].trim()
    if (currency === 'THB' ? !raw.includes('\u0E3F') : !/^(\$|USD\s)/.test(raw)) continue
    const price = num(raw.replace(/[^\d.]/g, ''))
    if (price === null) continue
    const name = decode(m[1])
    if (out.some((r) => r.name === name && r.price === price)) continue
    out.push({ id: '', name, price, priceFormatted: raw, currency })
  }
  return out
}

type IapList = { rows: AppStoreFullIapRow[] | null; full: boolean; reason?: string }
/** Full App Store IAP list (with Apple item id + offerName); falls back to the product page top 10 (names only). */
async function fetchIapList(cc: 'th' | 'us', signal?: AbortSignal): Promise<IapList> {
  try {
    return { rows: await fetchAppStoreFullIap(cc, String(DESTINY_RISING_APP_ID), cc === 'th' ? 'en-GB' : 'en-US', signal), full: true }
  } catch (e) {
    const apiErr = e instanceof Error ? e.message : String(e)
    try {
      const url = cc === 'th' ? DESTINY_RISING_APPSTORE_TH : DESTINY_RISING_APPSTORE_US
      // Plain page fetch (the full-list API just failed): top 10 only.
      const r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html' } })
      if (r.status !== 200) return { rows: null, full: false, reason: `full list: ${apiErr}; page HTTP ${r.status}` }
      const rows = parseDrIapPage(await r.text(), cc === 'th' ? 'THB' : 'USD')
      return rows.length ? { rows, full: false, reason: `full list: ${apiErr}` } : { rows: null, full: false, reason: `full list: ${apiErr}; no IAP rows on page` }
    } catch (e2) {
      return { rows: null, full: false, reason: `full list: ${apiErr}; page fetch failed: ${e2 instanceof Error ? e2.message : String(e2)}` }
    }
  }
}

const nameKey = (n: string) => n.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '')
/** Exact match by offerName; otherwise by Silver amount / name, refusing ambiguous (same name, different prices). */
function matchIap(rows: AppStoreFullIapRow[] | null, productId: string | null, name: string): { row?: AppStoreFullIapRow; ambiguous?: number[]; by?: string } {
  if (!rows) return {}
  if (productId) { const r = rows.find((x) => x.offerName === productId); if (r) return { row: r, by: 'offerName' } }
  const amt = silverAmt(name)
  const hits = rows.filter((x) => (amt !== null ? silverAmt(x.name) === amt : nameKey(x.name) === nameKey(name)))
  if (!hits.length) return {}
  const prices = [...new Set(hits.map((h) => h.price))].sort((a, b) => a - b)
  return prices.length === 1 ? { row: hits[0], by: amt !== null ? 'silver amount' : 'name' } : { ambiguous: prices }
}

export async function fetchDestinyRisingPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [prod, actRaw] = await Promise.all([
    getJson(DESTINY_RISING_PRODUCTS_API_URL, signal),
    getJson(DESTINY_RISING_ACTIVITYS_API_URL, signal).catch((e) => ({ __error: e instanceof Error ? e.message : String(e) }))
  ])
  const now = num(actRaw?.data?.server_ts) ?? Date.now() / 1000
  const products = parseDrProducts(prod, now)
  if (!products.length) throw new DestinyRisingInvalidUpstreamResponseError('No active USD products')
  const act = parseDrActivitys(actRaw, now)
  const actReason = 'Official activitys endpoint unavailable: ' + (actRaw?.__error ?? actRaw?.msg ?? 'bad shape')
  // Sequential: Apple rate-limits bursts.
  const th = await fetchIapList('th', signal)
  const us = await fetchIapList('us', signal)
  const neteaseIds = new Set(products.map((p) => p.goodsid))

  const discFields = (goodsid: string | null, appStoreOnly: boolean) => {
    const d = goodsid && act ? act.discounts.get(goodsid) : undefined
    const f: any = { discount_price_thb: d?.THB ?? null, discount_price_usd: d?.USD ?? null, discount_until: d ? iso(d.until) : null }
    if (!d) f.discount_null_reason = appStoreOnly
      ? 'Sold only via App Store; Apple lists no discount for this item'
      : act ? 'No active official GameClub discount (activitys alpha2=TH has none for this product)' : actReason
    else {
      if (d.THB === null) f.discount_thb_null_reason = 'Official discount has no THB price'
      if (d.USD === null) f.discount_usd_null_reason = 'Official discount has no USD price'
    }
    return f
  }

  const silverPacks = products.map((p, i) => {
    const k = drKind(p.goodsid, p.name)
    const isCur = k.kind === 'currency' && p.base > 0
    const m = p.thb === null ? matchIap(th.rows, p.goodsid, p.name) : {}
    const thb = p.thb ?? m.row?.price ?? null
    const gc = act ? (act.gameClubBonus.get(p.goodsid) ?? 0) : null
    const bonus = isCur ? (gc === null ? null : p.inGameBonus + gc) : null
    const pack: any = {
      id: i + 1, name: p.name, product_id: p.goodsid, kind: isCur ? 'currency' : k.kind,
      baseItemAmount: isCur ? p.base : null, bonusItemAmount: bonus, totalItemAmount: isCur ? p.base + (bonus ?? 0) : null,
      bonus_breakdown: isCur ? { in_game_bonus: p.inGameBonus, gameclub_bonus: gc } : null,
      bonus_available: isCur && act !== null, bonus_source: isCur && act ? 'netease-gameclub products (free amount) + activitys (GameClubBonus, alpha2=TH)' : null,
      item_pack: !isCur, description: p.detail || (isCur ? `${p.base} Silver (official NetEase GamesClub top-up)` : ''),
      image_url: p.image,
      price_thb: thb,
      price_thb_source: p.thb !== null ? 'netease-gameclub-official (local_price TH)' : m.row ? `apple-app-store-th (${m.by === 'offerName' ? `offerName=${p.goodsid}, item ${m.row.id}` : `matched by ${m.by}`})` : null,
      price_usd: p.usd, price_usd_source: 'netease-gameclub-official',
      price: thb ?? p.usd, currency: thb !== null ? 'THB' : 'USD',
      ...discFields(p.goodsid, false),
      available_until: iso(p.available_until), purchase_limit: p.purchase_limit
    }
    if (thb === null) pack.price_thb_null_reason = m.ambiguous
      ? `Official NetEase store has no THB; App Store TH has "${p.name}" at several prices (${m.ambiguous.join(', ')}), not guessing`
      : th.rows ? `Official NetEase store has no THB; "${p.name}" not in App Store TH IAP list (${iapScope(th.full)})`
      : 'Official NetEase store has no THB; App Store TH unavailable: ' + th.reason
    if (isCur && !act) pack.bonus_null_reason = actReason
    if (!isCur) { pack.base_null_reason = 'Not a plain Silver amount'; pack.bonus_null_reason = 'No currency bonus on non-Silver items' }
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })

  // App Store-only items (passes / bundles): TH rows + US rows not in TH, paired by Apple item id (else name, unambiguous only).
  type Pair = { th?: AppStoreFullIapRow; us?: AppStoreFullIapRow; ambTh?: number[]; ambUs?: number[] }
  const pairs: Pair[] = []
  const inWeb = (r: AppStoreFullIapRow) => (r.offerName ? neteaseIds.has(r.offerName) : silverPacks.some((p) => silverAmt(r.name) !== null && silverAmt(r.name) === silverAmt(p.name)))
  const byId = (rows: AppStoreFullIapRow[] | null, r: AppStoreFullIapRow) => (rows && r.id ? rows.find((x) => x.id === r.id) : undefined)
  for (const r of th.rows ?? []) {
    if (inWeb(r)) continue
    let u = byId(us.rows, r); let ambUs: number[] | undefined
    if (!u && !r.id) { const m = matchIap(us.rows, null, r.name); u = m.row; ambUs = m.ambiguous }
    let ambTh: number[] | undefined
    if (!r.id) { const m = matchIap(th.rows, null, r.name); if (m.ambiguous) ambTh = m.ambiguous }
    if (ambTh && pairs.some((p) => p.th && nameKey(p.th.name) === nameKey(r.name))) continue
    pairs.push(ambTh ? { th: r, ambTh, ambUs } : { th: r, us: u, ambUs })
  }
  for (const u of us.rows ?? []) {
    if (inWeb(u)) continue
    if (pairs.some((p) => p.us === u || (p.th && u.id && p.th.id === u.id) || (p.th && !u.id && nameKey(p.th.name) === nameKey(u.name)))) continue
    pairs.push({ us: u })
  }
  const appPacks = pairs.map((pr, i) => {
    const r = (pr.th ?? pr.us)!
    const pid = r.offerName ?? null
    const k = drKind(pid, r.name)
    const thb = pr.ambTh ? null : pr.th?.price ?? null
    const usd = pr.ambUs || pr.ambTh ? null : pr.us?.price ?? null
    const pack: any = {
      id: 1001 + i, name: r.name, product_id: pid, apple_item_id: r.id || null, kind: k.kind === 'currency' ? 'bundle' : k.kind,
      baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, bonus_available: false, bonus_source: null,
      item_pack: true,
      description: `App Store in-app purchase "${r.name}"${pid ? ` (product ${pid})` : ''}; contents are not itemised by Apple or the NetEase web store`,
      image_url: null,
      price_thb: thb, price_thb_source: thb !== null ? `apple-app-store-th${r.id ? ` (item ${r.id})` : ''}` : null,
      price_usd: usd, price_usd_source: usd !== null ? `apple-app-store-us${r.id ? ` (item ${r.id})` : ''}` : null,
      price: thb ?? usd ?? 0, currency: thb !== null ? 'THB' : usd !== null ? 'USD' : '',
      ...discFields(null, true)
    }
    if (k.pass_type) pack.pass_type = k.pass_type
    pack.base_null_reason = (k.kind === 'pass' ? 'Pass' : 'Bundle') + ' item; not a plain Silver amount'
    pack.bonus_null_reason = 'No currency bonus on pass/bundle items'
    if (thb === null) pack.price_thb_null_reason = pr.ambTh ? `App Store TH lists "${r.name}" at several prices (${pr.ambTh.join(', ')}) and no item id is available to tell them apart`
      : th.rows ? `Not in App Store TH IAP list (${iapScope(th.full)})` : 'App Store TH unavailable: ' + th.reason
    if (usd === null) pack.price_usd_null_reason = pr.ambTh || pr.ambUs ? `"${r.name}" is listed at several prices; not guessing without Apple item ids`
      : us.rows ? `Not in App Store US IAP list (${iapScope(us.full)})` : 'App Store US unavailable: ' + us.reason
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })
  const order = { pass: 0, bundle: 1 } as Record<string, number>
  appPacks.sort((a, b) => order[a.kind] - order[b.kind] || (a.price_usd ?? 1e9) - (b.price_usd ?? 1e9))
  appPacks.forEach((p, i) => (p.id = 1001 + i))

  const msg = 'Live (no fallback catalog)'
  const categories = [
    { id: 1, name: 'Silver (Official NetEase GamesClub top-up)', packs: silverPacks },
    { id: 2, name: 'Battle Pass, Weekly Card & Growth Funds (App Store)', packs: appPacks.filter((p) => p.kind === 'pass') },
    { id: 3, name: 'Bundles (App Store)', packs: appPacks.filter((p) => p.kind === 'bundle') }
  ].filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, message: msg, packCount: c.packs.length }))
  const notes = [
    'Main: official NetEase GamesClub top-up (game code destinyrising, live products API). USD = product.price; base = pay_yuanbao; bonus = free amount + activitys GameClubBonus (alpha2=TH).',
    'The NetEase web store sells only Silver, in USD only (local_price has no TH). THB = official Apple App Store TH price of the same product, matched exactly by Apple offerName = NetEase goodsid (full App Store IAP list). No FX conversion, no resellers.',
    'Battle Pass / Weekly Card / Growth Funds / bundles are sold only as App Store in-app purchases: THB from App Store TH, USD from App Store US, paired by Apple item id.',
    'discount_price_thb / discount_price_usd / discount_until = official GameClub discount (activitys activity_type 27); price_thb / price_usd stay the list price.'
  ]
  if (act && act.count === 0) notes.push('Official activitys (alpha2=TH) currently lists no bonus or discount for Destiny: Rising.')
  if (!act) notes.push(actReason)
  notes.push(APPSTORE_FULL_IAP_NOTE)
  if (!th.full) notes.push('App Store TH: ' + (th.reason ?? 'top 10 only'))
  if (!us.full) notes.push('App Store US: ' + (us.reason ?? 'top 10 only'))
  return ({
    game: { id: DESTINY_RISING_APP_ID, slug: DESTINY_RISING_SLUG, name: 'Destiny: Rising', itemName: 'Silver', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: DESTINY_RISING_PRODUCTS_API_URL,
    sources: {
      products: DESTINY_RISING_PRODUCTS_API_URL, bonus: DESTINY_RISING_ACTIVITYS_API_URL, usd: DESTINY_RISING_PRODUCTS_API_URL,
      thb: `https://apps.apple.com/api/apps/v1/catalog/th/apps/${DESTINY_RISING_APP_ID}/top-in-apps`,
      appstore_us: `https://apps.apple.com/api/apps/v1/catalog/us/apps/${DESTINY_RISING_APP_ID}/top-in-apps`,
      appstore_th_page: DESTINY_RISING_APPSTORE_TH, appstore_us_page: DESTINY_RISING_APPSTORE_US
    },
    notes
  } as unknown) as RovPacksResponse
}

async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  let r: Response
  try {
    r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'application/json', Referer: DESTINY_RISING_TOPUP_URL } })
  } catch (e) {
    throw new DestinyRisingUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!r.ok) throw new DestinyRisingUpstreamUnavailableError('HTTP ' + r.status)
  try { return await r.json() } catch { throw new DestinyRisingInvalidUpstreamResponseError('Non-JSON response') }
}

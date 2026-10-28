import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'

/**
 * Realms of Pixel: Idle RPG (SEA) - publisher NovaSonic Interactive Limited (novasonicgames.com).
 * 1) Official NovaSonic web top-up center (pay-pixelrealms.novasonicgames.com, game code "pixelrealms"):
 *    live product list = Token packs, base product_num + bonus sub_product_num. It prices in USD only
 *    (country_price DEFAULT/USD), so THB there is null with a reason (no FX conversion).
 * 2) Apple App Store (SEA app 6748809191): THB from App Store TH; USD from App Store US, else KH (the SEA app is not
 *    sold in the US). TH <-> USD storefront rows are matched ONLY by Apple offerName or Apple item id, never by name.
 *    name_th / description_th from the Thai-language TH list, description_en from the en-GB TH list.
 * No resellers, no hardcoded prices.
 */
export const ROP_SLUG = 'realms-of-pixel'
export const ROP_APP_ID = 6748809191
export const ROP_GAME_CODE = 'pixelrealms'
export const ROP_TOPUP_URL = 'https://pay-pixelrealms.novasonicgames.com/payment/pixelrealms'
export const ROP_PRODUCTS_API_URL = 'https://pay-pixelrealms.novasonicgames.com/api/pixelrealms/product/list'
export const ROP_USD_STOREFRONTS = ['us', 'kh'] as const
export const ropCatalogUrl = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${ROP_APP_ID}/top-in-apps`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const FOREVER = 2147483647
/** Public client-info header the official web store sends with every API call (no login, no player token). */
export const ROP_CLIENT_INFO = JSON.stringify({
  gameCode: ROP_GAME_CODE, sCode: 'web', deviceId: 'apigamepack', packageName: `web.${ROP_GAME_CODE}`, sdkVersion: '0.0.1', os: 'web', osVersion: '0.0.1',
  deviceModel: 'browser', deviceBrand: UA, clientVersion: '0.0.1', clientBuildVersion: '0.0.1', gameLang: 'th', adid: '', regionCode: 'NA',
  countryCode: 'THA', countryCodeShort: 'TH'
})

export class RealmsOfPixelUpstreamUnavailableError extends Error {
  constructor(message = 'Realms of Pixel upstream unavailable') { super(message); this.name = 'RealmsOfPixelUpstreamUnavailableError' }
}
export class RealmsOfPixelInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Realms of Pixel upstream response') { super(message); this.name = 'RealmsOfPixelInvalidUpstreamResponseError' }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const iso = (t: number | null) => (t !== null && t > 0 && t < FOREVER ? new Date(t * 1000).toISOString() : null)

export type RopWebProduct = {
  product_id: string; title: string; bonusTitle: string; base: number | null; bonus: number | null; usd: number | null
  thb: number | null; logo: string | null; available_until: string | null; buy_limit: number | null
}
/** Official web store products: active (status 1, paid, inside open/close window). THB only if the official country price is THB. */
export function parseRopWebProducts(json: any, now: number): RopWebProduct[] {
  if (!json || !Array.isArray(json.products)) throw new RealmsOfPixelInvalidUpstreamResponseError('product/list: bad shape')
  const out: RopWebProduct[] = []
  const seen = new Set<string>()
  for (const p of json.products as any[]) {
    if (typeof p?.product_id !== 'string' || seen.has(p.product_id)) continue
    if (String(p.status) !== '1' || num(p.free) === 1) continue
    const open = num(p.open_time); const close = num(p.close_time)
    if ((open !== null && open > now) || (close !== null && close < now)) continue
    seen.add(p.product_id)
    const cp = p.country_price && typeof p.country_price === 'object' ? p.country_price : null
    const usd = p.currency === 'USD' ? num(p.amount) : cp?.currency === 'USD' ? num(cp.amount) : null
    out.push({
      product_id: p.product_id, title: String(p.product_title ?? '').trim(), bonusTitle: String(p.sub_product_title ?? '').trim(),
      base: num(p.product_num), bonus: num(p.sub_product_num) ?? 0, usd,
      thb: cp?.currency === 'THB' ? num(cp.amount) : null,
      logo: typeof p.product_logo === 'string' ? p.product_logo : null, available_until: iso(close), buy_limit: num(p.buy_limit)
    })
  }
  return out
}

/** Match only by Apple offerName (exactly one hit) or Apple item id. Never by display name. */
export function matchRopApple(rows: AppStoreFullIapRow[] | null, ref: { offerName?: string | null; id?: string | null }) {
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

type List = { rows: AppStoreFullIapRow[] } | { rows: null; reason: string }
async function list(cc: string, l: string | null, signal?: AbortSignal): Promise<List> {
  try { return { rows: await fetchAppStoreFullIap(cc, String(ROP_APP_ID), l, signal) } } catch (e) { return { rows: null, reason: e instanceof Error ? e.message : String(e) } }
}
const reasonOf = (x: List) => ('reason' in x ? x.reason : '')

async function getWeb(signal?: AbortSignal): Promise<any> {
  let r: Response
  try {
    r = await fetch(ROP_PRODUCTS_API_URL, {
      signal: signal ?? AbortSignal.timeout(20_000),
      headers: { 'User-Agent': UA, Accept: 'application/json', 'client-info': ROP_CLIENT_INFO, Referer: ROP_TOPUP_URL }
    })
  } catch (e) {
    throw new RealmsOfPixelUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!r.ok) throw new RealmsOfPixelUpstreamUnavailableError('HTTP ' + r.status)
  try { return await r.json() } catch { throw new RealmsOfPixelInvalidUpstreamResponseError('Non-JSON response') }
}

export async function fetchRealmsOfPixelPacks(options?: { signal?: AbortSignal; now?: number }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const now = options?.now ?? Date.now() / 1000
  // Official web store and Apple are independent; either may fail without breaking the other.
  const web: { products: RopWebProduct[] | null; reason?: string; error?: unknown } = await getWeb(signal)
    .then((j) => ({ products: parseRopWebProducts(j, now) }))
    .catch((e) => ({ products: null, reason: e instanceof Error ? e.message : String(e), error: e }))
  // Apple lists sequentially (Apple rate-limits bursts).
  const thEn = await list('th', 'en-GB', signal)
  const thTh = await list('th', 'th', signal)
  const usd: Record<string, List> = {}
  for (const cc of ROP_USD_STOREFRONTS) {
    usd[cc] = await list(cc, null, signal)
    if (usd[cc].rows) break
  }
  if (!web.products && !thEn.rows) {
    const e = (web as any).error
    throw e instanceof RealmsOfPixelInvalidUpstreamResponseError ? e : new RealmsOfPixelUpstreamUnavailableError(`web store: ${(web as any).reason}; App Store TH: ${reasonOf(thEn)}`)
  }

  const webPacks = (web.products ?? []).map((p, i) => {
    const pack: any = {
      id: i + 1, name: `${p.base ?? ''} ${p.title}`.trim() + (p.bonus ? ` + ${p.bonus} ${p.bonusTitle.replace(/^\+\s*/, '') || p.title}` : ''),
      product_id: p.product_id, kind: 'currency', store: 'novasonic-official-web',
      baseItemAmount: p.base, bonusItemAmount: p.bonus, totalItemAmount: p.base !== null ? p.base + (p.bonus ?? 0) : null,
      bonus_available: true, bonus_source: 'official web store sub_product_num (live)', item_pack: false,
      name_th: null, name_th_null_reason: 'Official web store product list has no Thai title (product_title is the same in every language)',
      description: null, description_th: null, description_en: null,
      description_null_reason: 'Official web store product list has no description field',
      description_th_null_reason: 'Official web store product list has no description field',
      description_en_null_reason: 'Official web store product list has no description field',
      image_url: p.logo,
      price_thb: p.thb, price_thb_source: p.thb !== null ? 'novasonic-official-web (country_price THB)' : null,
      price_usd: p.usd, price_usd_source: p.usd !== null ? 'novasonic-official-web' : null,
      price: p.thb ?? p.usd, currency: p.thb !== null ? 'THB' : p.usd !== null ? 'USD' : null,
      available_until: p.available_until, buy_limit: p.buy_limit
    }
    if (p.thb === null) pack.price_thb_null_reason = 'Official web store prices in USD only (country_price DEFAULT/USD); web product ids do not match any App Store offerName/item id; no FX conversion'
    if (p.usd === null) pack.price_usd_null_reason = 'Official web store returned no USD amount for this product'
    if (p.base === null) pack.base_null_reason = 'Official web store returned no product_num'
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })

  const usdCc = ROP_USD_STOREFRONTS.find((cc) => usd[cc]?.rows) ?? null
  const usdRows = usdCc ? usd[usdCc].rows : null
  const usdTried = ROP_USD_STOREFRONTS.filter((cc) => usd[cc]).map((cc) => `${cc.toUpperCase()}${usd[cc].rows ? '' : ` (${reasonOf(usd[cc])})`}`).join(', ')
  const appPacks = (thEn.rows ?? []).map((r, i) => {
    const ref = { offerName: r.offerName ?? null, id: r.id }
    const th = matchRopApple(thTh.rows, ref)?.row
    const u = matchRopApple(usdRows, ref)
    const usdPrice = u && u.row.currency === 'USD' ? u.row.price : null
    const thb = r.currency === 'THB' ? r.price : null
    const parts: string[] = []
    for (const s of [th?.description, r.description]) if (s && !parts.includes(s)) parts.push(s)
    const pack: any = {
      id: Number(r.id) || 1000 + i, name: r.name, product_id: r.offerName ?? null, apple_item_id: r.id, kind: 'bundle', store: 'apple-app-store',
      baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, item_pack: true,
      base_null_reason: 'App Store Value Pack: contents are an in-game bundle, Apple lists no Token amount',
      bonus_null_reason: 'Apple lists no bonus amount for Value Packs',
      name_th: th?.name ?? null,
      description: parts.join(' / ') || null,
      description_th: th?.description ?? null,
      description_en: r.description ?? null,
      family_shareable: typeof r.familyShareable === 'boolean' ? r.familyShareable : null,
      price_thb: thb, price_thb_source: thb !== null ? `apple-app-store-th (item ${r.id}${r.offerName ? `, offerName=${r.offerName}` : ''})` : null,
      price_usd: usdPrice, price_usd_source: usdPrice !== null ? `apple-app-store-${usdCc} (USD storefront, ${u!.by})` : null,
      price: thb ?? usdPrice, currency: thb !== null ? 'THB' : usdPrice !== null ? 'USD' : null
    }
    if (!th) pack.name_th_null_reason = pack.description_th_null_reason = thTh.rows ? 'not in the Thai-language App Store TH list by offerName/Apple item id' : `Thai-language App Store TH list unavailable (${reasonOf(thTh)})`
    else if (!th.description) pack.description_th_null_reason = 'Apple has no Thai description text for this item'
    if (!r.description) pack.description_en_null_reason = 'Apple has no English description text for this item'
    if (thb === null) pack.price_thb_null_reason = `App Store TH returned ${r.currency || 'no currency'}, not THB`
    if (usdPrice === null) pack.price_usd_null_reason = usdRows ? `not found on the App Store ${usdCc!.toUpperCase()} USD storefront by offerName/Apple item id` : `no USD App Store list (tried ${usdTried}; SEA app is not sold on App Store US)`
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })

  const sortP = (a: any, b: any) => (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) || (a.price_thb ?? Infinity) - (b.price_thb ?? Infinity)
  const cats = [
    { id: 1, name: 'Token (Official NovaSonic web top-up, USD)', packs: webPacks.sort(sortP), message: web.products ? 'Live (no fallback catalog)' : `Official web store unavailable: ${(web as any).reason}` },
    { id: 2, name: 'Value Packs (App Store TH THB / USD storefront)', packs: appPacks.sort(sortP), message: thEn.rows ? 'Live (no fallback catalog)' : `App Store TH unavailable: ${reasonOf(thEn)}` }
  ]
  const categories = cats.filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, packCount: c.packs.length }))
  const notes = [
    'Publisher: NovaSonic Interactive Limited. Official web top-up center: pay-pixelrealms.novasonicgames.com (game code pixelrealms), live product list. Token packs = product_num + sub_product_num bonus (total).',
    'The official web store prices in USD only (country_price DEFAULT), so web Token packs have no THB (null with reason). No FX conversion, no resellers.',
    `App Store (SEA app ${ROP_APP_ID}): THB from App Store TH; USD from App Store ${usdCc ? usdCc.toUpperCase() : 'US/KH (unavailable)'} - the SEA app is not sold on App Store US, so KH (a USD storefront) is used. Matched only by Apple offerName or Apple item id, never by name. Apple storefront prices are as listed (a KH price can differ from the USD figure in the pack name).`,
    'Value Packs are item_pack bundles (Apple lists no Token amount). name_th / description_th from the Thai-language App Store TH list, description_en from the English one.'
  ]
  if (!web.products) notes.push('Official web store: ' + (web as any).reason)
  notes.push(APPSTORE_FULL_IAP_NOTE)
  if (!thEn.rows) notes.push('App Store TH: ' + reasonOf(thEn))
  if (!thTh.rows) notes.push('App Store TH (Thai): ' + reasonOf(thTh))
  if (!usdRows) notes.push('USD App Store: tried ' + usdTried)
  return ({
    game: { id: ROP_APP_ID, slug: ROP_SLUG, name: 'Realms of Pixel: Idle RPG', itemName: 'Token', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: ROP_PRODUCTS_API_URL,
    sources: { products: ROP_PRODUCTS_API_URL, topup: ROP_TOPUP_URL, appstore_th: ropCatalogUrl('th'), appstore_usd: usdCc ? ropCatalogUrl(usdCc) : null },
    notes
  } as unknown) as RovPacksResponse
}

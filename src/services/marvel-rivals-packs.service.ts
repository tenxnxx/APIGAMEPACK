import type { RovPacksResponse } from '../types/rov'
import { sojWindow } from './sword-of-justice-packs.service'

/**
 * Marvel Rivals (NetEase, PC/PS5/Xbox; no App Store build) - official NetEase GamesClub top-up (pay.neteasegames.com,
 * game code "marvelrivals", goodsids "x20.*"). USD = product.price (official). Base / bonus Lattice = official pay_yuanbao /
 * free_yuanbao of the same product (+ live GameClub bonus from the activitys API, alpha2=TH).
 * GamesClub publishes no TH local_price for this game (local_price covers EU/HK/JP/KR/GB/BR/TW/MO only), so THB comes from the
 * official first-party PlayStation Store Thailand (en-th): the GamesClub product carries extra.ps5_product_id, and the PS Store
 * product id is "<PS5 title prefix discovered live from the PS Store TH concept page>-<ps5_product_id>" (matched by id, never by name).
 * Steam (app 2767030) sells Lattice only as in-game microtransactions (its only DLC is the free High-Resolution Pack) and Epic
 * does not expose the epic_offerid consumables publicly, so neither has a THB price. No FX, no resellers, no hardcoded prices.
 */
export const MR_SLUG = 'marvel-rivals'
export const MR_NAME = 'Marvel Rivals'
export const MR_GAME_CODE = 'marvelrivals'
export const MR_STEAM_APP_ID = 2767030
export const MR_PS_CONCEPT_ID = '10010451'
export const MR_TOPUP_URL = 'https://pay.neteasegames.com/marvelrivals/topup'
export const MR_PRODUCTS_API_URL = 'https://pay.neteasegames.com/gameclub/products/marvelrivals?gc_client_version=1.13.55'
export const MR_ACTIVITYS_API_URL =
  'https://pay.neteasegames.com/gameclub/products/marvelrivals/activitys?gc_client_version=1.13.55&pay_method=gameclub_wallet&pay_type=NetEase+Credit_gameclub_wallet&alpha2=TH'
export const MR_PS_STORE_BASE = 'https://store.playstation.com/en-th'
export const mrPsConceptUrl = () => `${MR_PS_STORE_BASE}/concept/${MR_PS_CONCEPT_ID}`
export const mrPsProductUrl = (productId: string) => `${MR_PS_STORE_BASE}/product/${productId}`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const FOREVER = 2147483647

export class MarvelRivalsUpstreamUnavailableError extends Error {
  constructor(message = 'Marvel Rivals NetEase GamesClub upstream unavailable') { super(message); this.name = 'MarvelRivalsUpstreamUnavailableError' }
}
export class MarvelRivalsInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Marvel Rivals NetEase GamesClub response') { super(message); this.name = 'MarvelRivalsInvalidUpstreamResponseError' }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const strip = (s: unknown) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() : '')
const iso = (t: number | null) => (t !== null && t > 0 && t < FOREVER ? new Date(t * 1000).toISOString() : null)

export type MrKind = 'currency' | 'pass' | 'bundle'
/** Plain Lattice = goodsid "x20.jg<N>.*"; passes by official name (battle pass / luxury / season pass); everything else is a bundle. */
export function mrKind(goodsid: string, name: string): MrKind {
  if (/^x20\.jg\d+(\.|$)/i.test(goodsid)) return 'currency'
  if (/battle ?pass|luxury|season pass|\bpass\b/i.test(name) || /\.bp\d*(\.|$)/i.test(goodsid)) return 'pass'
  return 'bundle'
}

export type MrActivity = { bonus: Map<string, { amount: number; until: string | null }>; discounts: Map<string, { USD: number | null; until: string | null }>; count: number }
/** activity_type 0 / 12 = GameClub bonus Lattice (marketing_free_amount); 27 = discount. Active window, alpha2 all/TH only. */
export function parseMrActivitys(json: any, now: number): MrActivity | null {
  if (json?.code !== '0000' || !Array.isArray(json?.data?.list)) return null
  const out: MrActivity = { bonus: new Map(), discounts: new Map(), count: json.data.list.length }
  for (const a of json.data.list) {
    if (typeof a?.goodsid !== 'string') continue
    if (a.alpha2 !== undefined && a.alpha2 !== 'all' && a.alpha2 !== 'TH') continue
    if (sojWindow(a, now) !== 'active') continue
    const t = String(a.activity_type); const until = iso(num(a.expired_time))
    if ((t === '0' || t === '12') && typeof a.marketing_free_amount === 'number' && a.marketing_free_amount > 0) {
      const prev = out.bonus.get(a.goodsid)
      out.bonus.set(a.goodsid, { amount: (prev?.amount ?? 0) + a.marketing_free_amount, until: prev?.until ?? until })
    } else if (t === '27' && a.after_discount_price_map && typeof a.after_discount_price_map === 'object') {
      out.discounts.set(a.goodsid, { USD: num(a.after_discount_price_map.USD), until })
    }
  }
  return out
}

export type MrProduct = {
  key: string; goodsid: string; sub_item: string | null; kind: MrKind; name: string; detail: string; usd: number
  pay: number; free: number; ps5_product_id: string | null; xbox_product_id: string | null; epic_offerid: string | null
  image: string | null; available_from: string | null; available_until: string | null; purchase_limit: unknown; local_price_regions: string[]
}
/** status 1, USD-priced, on sale now (ended / upcoming dropped and reported); platform copies (ad/pc/ios) deduped by goodsid + sub_item. */
export function parseMrProducts(json: any, now: number): { products: MrProduct[]; expired: string[]; upcoming: string[] } {
  if (json?.code !== '0000' || !Array.isArray(json?.data)) throw new MarvelRivalsInvalidUpstreamResponseError('products: ' + (json?.msg ?? 'bad shape'))
  const seen = new Set<string>(); const products: MrProduct[] = []; const expired = new Set<string>(); const upcoming = new Set<string>()
  for (const p of json.data as any[]) {
    if (typeof p?.goodsid !== 'string' || p.currency !== 'USD' || p.status !== 1) continue
    const sub = typeof p.sub_item === 'string' && p.sub_item ? p.sub_item : null
    const key = sub ? `${p.goodsid}_${sub}` : p.goodsid
    const ml = p.multi_language?.default?.default ?? {}
    const name = strip(ml.goodsinfo) || strip(p.goodsinfo)
    const w = sojWindow(p, now)
    const label = `${name}${sub ? ` (${sub})` : ''} [${iso(num(p.effective_time))?.slice(0, 10) ?? '?'}..${iso(num(p.expired_time))?.slice(0, 10) ?? '?'}]`
    if (w === 'expired') { expired.add(label); continue }
    if (w === 'upcoming') { upcoming.add(label); continue }
    if (seen.has(key)) continue
    const usd = num(p.price)
    if (usd === null) continue
    seen.add(key)
    const extra = p.extra && typeof p.extra === 'object' ? p.extra : {}
    let lp: any = extra.local_price
    if (typeof lp === 'string') { try { lp = JSON.parse(lp) } catch { lp = null } }
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    products.push({
      key, goodsid: p.goodsid, sub_item: sub, kind: mrKind(p.goodsid, name), name, detail: strip(ml.goods_detail), usd,
      pay: num(p.pay_yuanbao) ?? 0, free: num(p.free_yuanbao) ?? 0,
      ps5_product_id: s(extra.ps5_product_id), xbox_product_id: s(extra.xbox_product_id), epic_offerid: s(extra.epic_offerid),
      image: p.icon?.default?.default?.normal ?? ml.image_info?.normal ?? null,
      available_from: iso(num(p.effective_time)), available_until: iso(num(p.expired_time)), purchase_limit: p.purchase_limit ?? null,
      local_price_regions: lp && typeof lp === 'object' ? Object.keys(lp) : []
    })
  }
  return { products, expired: [...expired], upcoming: [...upcoming] }
}

/** Apollo cache objects embedded in a PlayStation Store page (<script id="env:..." type="application/json">{cache:{...}}). */
export function psCache(html: string): Record<string, any> {
  const out: Record<string, any> = {}
  const re = /<script id="env:[^"]*" type="application\/json">([\s\S]*?)<\/script>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) { try { Object.assign(out, JSON.parse(m[1])?.cache ?? {}) } catch { /* skip */ } }
  return out
}
/** PS5 title prefix ("UB0335-PPSA21669_00") of the concept's PS5 product. */
export function psPs5Prefix(cache: Record<string, any>): string | null {
  for (const k of Object.keys(cache)) {
    const m = k.match(/^Product:([A-Z]{2}\d{4}-PPSA\d{5}_\d{2})-[0-9A-Z]{16}$/)
    if (m) return m[1]
  }
  return null
}
export type PsPrice = { thb: number; thb_discount: number; description: string | null; sku: string }
/** THB price of one PS Store product page (OUTRIGHT add-to-cart CTA, priceCurrencyCode THB; value in satang). */
export function psProductPrice(cache: Record<string, any>, productId: string): PsPrice | null {
  for (const [k, v] of Object.entries(cache)) {
    if (!k.startsWith('GameCTA:') || !k.includes(productId)) continue
    const sd = v?.local?.telemetryMeta?.skuDetail
    const d = Array.isArray(sd?.skuPriceDetail) ? sd.skuPriceDetail.find((x: any) => x?.priceCurrencyCode === 'THB') : null
    const o = num(d?.originalPriceValue); const dp = num(d?.discountPriceValue)
    if (o === null) continue
    const desc = (cache[`Product:${productId}`]?.descriptions ?? []).find((x: any) => x?.type === 'LONG')?.value
    return { thb: o / 100, thb_discount: (dp ?? o) / 100, description: strip(String(desc ?? '').replace(/<br\s*\/?>/gi, ' ')) || null, sku: String(sd?.skuId ?? '') }
  }
  return null
}

async function getText(url: string, signal?: AbortSignal, json = false): Promise<string> {
  let r: Response
  try {
    r = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(20_000),
      headers: { 'User-Agent': UA, Accept: json ? 'application/json' : 'text/html', 'Accept-Language': 'en-US,en;q=0.9', ...(json ? { Referer: MR_TOPUP_URL } : {}) }
    })
  } catch (e) {
    throw new MarvelRivalsUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!r.ok) throw new MarvelRivalsUpstreamUnavailableError('HTTP ' + r.status)
  return await r.text()
}
async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  const t = await getText(url, signal, true)
  try { return JSON.parse(t) } catch { throw new MarvelRivalsInvalidUpstreamResponseError('Non-JSON response') }
}

export async function fetchMarvelRivalsPacks(options?: { signal?: AbortSignal; now?: number }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const now = options?.now ?? Math.floor(Date.now() / 1000)
  const [prod, actRes, conceptRes] = await Promise.all([
    getJson(MR_PRODUCTS_API_URL, signal),
    getJson(MR_ACTIVITYS_API_URL, signal).then((j) => ({ j }), (e) => ({ err: e instanceof Error ? e.message : String(e) })),
    getText(mrPsConceptUrl(), signal).then((h) => ({ h }), (e) => ({ err: e instanceof Error ? e.message : String(e) }))
  ])
  const { products, expired, upcoming } = parseMrProducts(prod, now)
  if (!products.length) throw new MarvelRivalsInvalidUpstreamResponseError('products: no live USD products')
  const act = 'j' in actRes ? parseMrActivitys(actRes.j, now) : null
  const actReason = 'j' in actRes ? 'GameClub activitys API returned an unexpected shape' : `GameClub activitys API unavailable (${actRes.err})`

  // PlayStation Store TH: discover the PS5 title prefix live, then read each product page by <prefix>-<ps5_product_id>.
  let prefix: string | null = null; let psReason = ''
  if ('h' in conceptRes) { prefix = psPs5Prefix(psCache(conceptRes.h)); if (!prefix) psReason = `PS Store TH concept ${MR_PS_CONCEPT_ID} page has no PS5 product id` }
  else psReason = `PS Store TH concept page unavailable (${conceptRes.err})`
  const ps = new Map<string, { price: PsPrice | null; reason: string | null; url: string }>()
  if (prefix) {
    const ids = [...new Set(products.map((p) => p.ps5_product_id).filter((x): x is string => !!x))]
    await Promise.all(ids.map(async (id) => {
      const pid = `${prefix}-${id}`; const url = mrPsProductUrl(pid)
      try {
        const price = psProductPrice(psCache(await getText(url, signal)), pid)
        ps.set(id, { price, reason: price ? null : `PS Store TH product ${pid} shows no THB purchase price`, url })
      } catch (e) {
        ps.set(id, { price: null, reason: `PS Store TH product ${pid} unavailable (${e instanceof Error ? e.message : String(e)})`, url })
      }
    }))
  }

  const packs = products.map((p, i) => {
    const isCur = p.kind === 'currency'
    const b = act?.bonus.get(p.key) ?? (p.sub_item ? undefined : act?.bonus.get(p.goodsid))
    const gc = act ? (b?.amount ?? 0) : null
    const disc = act?.discounts.get(p.key) ?? act?.discounts.get(p.goodsid)
    const psr = p.ps5_product_id ? ps.get(p.ps5_product_id) : undefined
    const thb = psr?.price?.thb ?? null
    const pack: any = {
      id: i + 1, name: p.name, product_id: p.goodsid, sub_item: p.sub_item, kind: p.kind, store: 'netease-gameclub',
      description: p.detail || psr?.price?.description || null, description_source: p.detail ? 'netease-gameclub goods_detail' : psr?.price?.description ? 'playstation-store-th product description' : null,
      name_th: null, name_th_null_reason: 'GamesClub has no TH language block for Marvel Rivals and the PS Store TH (en-th) page is English',
      ...(isCur
        ? {
            baseItemAmount: p.pay, bonusItemAmount: p.free + (gc ?? 0), totalItemAmount: p.pay + p.free + (gc ?? 0), item_pack: false,
            bonus_breakdown: { free_lattice: p.free, gameclub_bonus: gc, gameclub_bonus_until: b?.until ?? null },
            ...(act ? {} : { gameclub_bonus_null_reason: actReason })
          }
        : {
            baseItemAmount: null, bonusItemAmount: gc ? gc : null, totalItemAmount: null, item_pack: true,
            base_null_reason: (p.kind === 'pass' ? 'Pass' : 'Bundle') + ' item; not a plain Lattice amount (contents in description)',
            ...(gc ? {} : { bonus_null_reason: act ? 'No live GameClub bonus Lattice on this item' : actReason }),
            total_null_reason: 'Pass/bundle contents are not a single Lattice amount'
          }),
      image_url: p.image,
      price_thb: thb,
      price_thb_source: thb !== null ? `playstation-store-th (${psr!.url}, ps5_product_id=${p.ps5_product_id})` : null,
      price_usd: p.usd, price_usd_source: 'netease-gameclub-official',
      price: thb ?? p.usd, currency: thb !== null ? 'THB' : 'USD',
      discount_price_thb: psr?.price && psr.price.thb_discount < psr.price.thb ? psr.price.thb_discount : null,
      discount_price_usd: disc?.USD ?? null, discount_until: disc?.until ?? null,
      ps5_product_id: p.ps5_product_id, xbox_product_id: p.xbox_product_id, epic_offerid: p.epic_offerid,
      available_from: p.available_from, available_until: p.available_until, purchase_limit: p.purchase_limit
    }
    if (thb === null) {
      pack.price_thb_null_reason = `No official THB price: GamesClub local_price has no TH (regions: ${p.local_price_regions.join('/') || 'none'}); ` +
        (!p.ps5_product_id ? 'product has no ps5_product_id to match on PS Store TH' : prefix ? psr?.reason ?? 'not checked' : psReason) +
        '; Steam/Epic expose no THB price for Lattice'
    }
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })

  const sortP = (a: any, b: any) => a.price_usd - b.price_usd || (a.price_thb ?? Infinity) - (b.price_thb ?? Infinity)
  const msg = 'Live (no fallback catalog)'
  const ended = (expired.length ? `; ended (excluded): ${expired.join(', ')}` : '') + (upcoming.length ? `; not yet on sale (excluded): ${upcoming.join(', ')}` : '')
  const cats = [
    { id: 1, name: 'Lattice (Official NetEase GamesClub USD + PlayStation Store TH THB)', packs: packs.filter((p) => p.kind === 'currency').sort(sortP), message: msg + ended },
    { id: 2, name: 'Passes (Official NetEase GamesClub)', packs: packs.filter((p) => p.kind === 'pass').sort(sortP), message: msg },
    { id: 3, name: 'Bundles (Official NetEase GamesClub + PlayStation Store TH)', packs: packs.filter((p) => p.kind === 'bundle').sort(sortP), message: msg }
  ]
  const categories = cats.filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, packCount: c.packs.length }))
  const notes = [
    'USD, Lattice amounts, names and descriptions: official NetEase GamesClub top-up (game code marvelrivals, live products API). Base = pay_yuanbao (paid Lattice), bonus = free_yuanbao (+ live GameClub bonus), total = both, per product.',
    `THB: GamesClub publishes no TH local_price for Marvel Rivals, so THB comes from the official PlayStation Store Thailand (en-th, concept ${MR_PS_CONCEPT_ID}), matched by the GamesClub ps5_product_id (PS5 title prefix ${prefix ?? 'unavailable'} read live). PS Store TH prices are the PS5 storefront prices, not GamesClub prices.`,
    `Steam (app ${MR_STEAM_APP_ID}) sells Lattice only in-game (its only DLC is the free High-Resolution Pack) and Epic does not publish the Lattice offers (epic_offerid) publicly, so neither provides THB. No FX conversion, no resellers.`,
    'Battle Passes (incl. the Luxury Battle Pass) and costume bundles are bought in-game with Lattice; they are not sold for real money on GamesClub, so they have no THB/USD price here. Only real-money bundles from GamesClub (e.g. the Pick-Up Bundle) are listed, as item_pack:true.',
    act ? `GameClub activitys (alpha2=TH, NetEase Credit): ${act.count} live entries, ${act.bonus.size} bonus, ${act.discounts.size} discounts.` : actReason
  ]
  if (expired.length) notes.push(`Ended on the official store (excluded): ${expired.join(', ')}`)
  if (upcoming.length) notes.push(`Not yet on sale on the official store (excluded): ${upcoming.join(', ')}`)
  if (!prefix) notes.push(psReason)
  return ({
    game: { id: MR_STEAM_APP_ID, slug: MR_SLUG, name: MR_NAME, itemName: 'Lattice', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: MR_PRODUCTS_API_URL,
    sources: { products: MR_PRODUCTS_API_URL, bonus: MR_ACTIVITYS_API_URL, usd: MR_PRODUCTS_API_URL, thb: mrPsConceptUrl(), topup: MR_TOPUP_URL },
    notes
  } as unknown) as RovPacksResponse
}

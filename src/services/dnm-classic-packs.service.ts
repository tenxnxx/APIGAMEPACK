import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'

/**
 * Dragon Nest M: Classic (7road International HK Limited, SEA) — official web top-up https://dn-pay.wan.com/ (linked from dn.wan.com).
 * The shop runs on the Mobapay platform: GET https://api.mobapay.com/api/app_shop?app_id=127496&country=TH
 * returns the live Cash goods with price_local_show in THB. Title "600+26" = base + bonus Cash.
 * The official webshop has no USD region (only HK/TW/TH/SG/ID/MY/PH). USD comes from the App Store (app 6743824718),
 * storefront US, else KH / LA / MM, matched by the official product id (webshop lzgofficial.gem.payX -> App Store lzgios.gem.payX).
 * The App Store also sells "Limited-time Pack" items (in-app only): App Store TH THB + App Store USD by the same product id.
 * No resellers, no FX conversion, no hardcoded prices.
 */
export const DNM_SLUG = 'dragon-nest-m-classic'
export const DNM_NAME = 'Dragon Nest M: Classic'
export const DNM_MOBAPAY_APP_ID = 127496
export const DNM_APP_ID = 6743824718
export const DNM_TOPUP_URL = 'https://dn-pay.wan.com/'
export const DNM_SHOP_API_URL = `https://api.mobapay.com/api/app_shop?app_id=${DNM_MOBAPAY_APP_ID}&country=TH&language=en`
export const DNM_APPSTORE_TH = `https://apps.apple.com/th/app/dragon-nest-m-classic/id${DNM_APP_ID}`
export const DNM_USD_STOREFRONTS = ['us', 'kh', 'la', 'mm'] as const
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class DnmUpstreamUnavailableError extends Error {
  constructor(message = 'Dragon Nest M: Classic official shop unavailable') { super(message); this.name = 'DnmUpstreamUnavailableError' }
}
export class DnmInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Dragon Nest M: Classic official shop response') { super(message); this.name = 'DnmInvalidUpstreamResponseError' }
}

/** Webshop sku -> App Store offerName of the same product ("lzgofficial.gem.pay0.99" -> "lzgios.gem.pay0.99"). */
export const dnmAppleOffer = (sku: unknown) => { const m = String(sku ?? '').match(/^lzgofficial\.(.+)$/); return m ? `lzgios.${m[1]}` : null }
/** "600+26" -> { base: 600, bonus: 26 } */
export function parseDnmTitle(title: unknown): { base: number; bonus: number } | null {
  const m = String(title ?? '').replace(/,/g, '').match(/^\s*(\d+)\s*\+\s*(\d+)\s*$/)
  if (m) return { base: Number(m[1]), bonus: Number(m[2]) }
  const n = String(title ?? '').replace(/,/g, '').match(/^\s*(\d+)\s*$/)
  return n ? { base: Number(n[1]), bonus: 0 } : null
}

type List = { rows: AppStoreFullIapRow[]; cc: string } | { rows: null; cc: string; reason: string }
async function apple(cc: string, signal?: AbortSignal): Promise<List> {
  try { return { rows: await fetchAppStoreFullIap(cc, String(DNM_APP_ID), cc === 'th' ? 'th' : 'en-US', signal), cc } } catch (e) {
    return { rows: null, cc, reason: e instanceof Error ? e.message : String(e) }
  }
}
async function appleUsd(signal?: AbortSignal): Promise<List> {
  const tried: string[] = []
  for (const cc of DNM_USD_STOREFRONTS) {
    const r = await apple(cc, signal)
    if (r.rows && r.rows.some((x) => x.currency === 'USD')) return r
    tried.push(`${cc.toUpperCase()}: ${'reason' in r ? r.reason : 'no USD rows'}`)
  }
  return { rows: null, cc: '', reason: 'App Store USD unavailable (' + tried.join('; ') + ')' }
}
const byOffer = (l: List) => {
  const m = new Map<string, AppStoreFullIapRow>()
  for (const x of l.rows ?? []) if (x.offerName && !m.has(x.offerName)) m.set(x.offerName, x)
  return m
}

async function loadShop(signal?: AbortSignal): Promise<any[]> {
  let r: Response
  try {
    r = await fetch(DNM_SHOP_API_URL, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'application/json', Origin: 'https://dn-pay.wan.com', Referer: DNM_TOPUP_URL } })
  } catch (e) {
    throw new DnmUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!r.ok) throw new DnmUpstreamUnavailableError('HTTP ' + r.status)
  let j: any
  try { j = await r.json() } catch { throw new DnmInvalidUpstreamResponseError('Non-JSON response') }
  const shelves = j?.data?.shop_info?.shelf_location
  if (j?.code !== 0 || !Array.isArray(shelves)) throw new DnmInvalidUpstreamResponseError('app_shop: code ' + j?.code + ' ' + (j?.message ?? ''))
  const goods: any[] = []
  for (const s of shelves) for (const g of s?.goods ?? []) goods.push({ ...g, __shelf: s?.title ?? null })
  const thb = goods.filter((g) => g?.currency === 'THB' && Number(g?.price_local_show) > 0)
  if (!thb.length) throw new DnmInvalidUpstreamResponseError('No THB goods')
  return thb
}

/** "$25.99 Limited-time Pack" -> 25.99 (the developer's own USD tier label in the item name). */
const nameUsd = (name: string) => { const m = name.match(/^\$(\d+(?:\.\d+)?)\s/); return m ? Number(m[1]) : null }

export async function fetchDnmPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const thP = apple('th', signal)
  const usdP = appleUsd(signal)
  const goods = await loadShop(signal)
  const [th, usd] = await Promise.all([thP, usdP])
  const thMap = byOffer(th)
  const usdMap = byOffer(usd)
  const usdCc = usd.cc.toUpperCase()
  const usdSrc = usd.rows ? `App Store ${usdCc} (official in-app price, same product id)` : null
  const usdUnavailable = 'reason' in usd ? usd.reason : ''

  const cash = goods.map((g) => {
    const amt = parseDnmTitle(g.title)
    const price = Number(g.price_local_show)
    const offer = dnmAppleOffer(g.sku)
    const au = offer ? usdMap.get(offer) : undefined
    const at = offer ? thMap.get(offer) : undefined
    const pack: any = {
      id: 0, kind: 'cash', item_pack: false,
      name: amt ? `${String(g.title).replace(/\s+/g, '')} Cash` : String(g.title),
      product_id: g.sku ?? String(g.id), appstore_product_id: au?.offerName ?? at?.offerName ?? null,
      store: 'dn-pay.wan.com',
      baseItemAmount: amt?.base ?? null, bonusItemAmount: amt?.bonus ?? null, totalItemAmount: amt ? amt.base + amt.bonus : null,
      bonus_available: !!amt && amt.bonus > 0, bonus_source: amt ? 'official webshop title (base+bonus)' : null,
      description_en: g.description || g.label?.title || (amt ? `${amt.base} Cash + ${amt.bonus} bonus Cash = ${amt.base + amt.bonus} Cash` : null),
      description_th: amt ? `${amt.base} Cash + โบนัส ${amt.bonus} Cash = ${amt.base + amt.bonus} Cash` : null,
      image_url: g.icon ?? null,
      price_thb: price, price_thb_source: 'dn-pay.wan.com official (Mobapay, country TH)',
      appstore_th_price_thb: at && at.currency === 'THB' ? at.price : null,
      price_usd: au && au.currency === 'USD' ? au.price : null,
      price_usd_source: au && au.currency === 'USD' ? usdSrc : null,
      price: price, currency: 'THB',
      contents: amt ? [{ item: 'Cash', quantity: amt.base + amt.bonus }] : null
    }
    if (!amt) pack.base_null_reason = 'Title is not in "base+bonus" form'
    if (pack.price_usd === null) {
      pack.price_usd_null_reason = !usd.rows
        ? `Official webshop has no USD region; ${usdUnavailable}. No FX conversion.`
        : `Official webshop has no USD region and this tier (${g.sku}) has no App Store counterpart (${offer ?? 'no product id'} not on App Store ${usdCc}). No FX conversion.`
    }
    return pack
  })

  const limited: any[] = []
  for (const x of th.rows ?? []) {
    if (x.currency !== 'THB' || !x.offerName || /\.gem\./.test(x.offerName)) continue
    const u = usdMap.get(x.offerName)
    const pack: any = {
      id: 0, kind: 'app-store-pack', item_pack: true,
      name: x.name, product_id: x.offerName, appstore_product_id: x.offerName, store: 'app-store',
      baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null,
      base_null_reason: 'Item pack, not a Cash top-up', bonus_null_reason: 'Item pack; no Cash bonus',
      description_en: (u?.description ?? x.description) || null,
      description_th: null,
      description_th_null_reason: 'Apple shows this item in English only on the TH storefront; the official webshop does not sell it',
      contents: null,
      contents_null_reason: 'Apple lists only the price tier; the pack contents are shown in-game only and are not published by 7road',
      price_thb: x.price, price_thb_source: 'App Store TH (official in-app price)',
      appstore_th_price_thb: x.price,
      price_usd: u && u.currency === 'USD' ? u.price : null,
      price_usd_source: u && u.currency === 'USD' ? usdSrc : null,
      price: x.price, currency: 'THB', image_url: null
    }
    if (pack.price_usd === null) pack.price_usd_null_reason = usd.rows ? `Not on App Store ${usdCc}` : usdUnavailable
    const label = nameUsd(x.name)
    if (label !== null && pack.price_usd !== null && label !== pack.price_usd) {
      pack.issues = [`App Store ${usdCc} lists ${pack.price_usd} USD while the item name says $${label}; Apple's price is shown as-is`]
    }
    limited.push(pack)
  }

  let n = 1
  const byThb = (a: any, b: any) => a.price_thb - b.price_thb || (a.baseItemAmount ?? 0) - (b.baseItemAmount ?? 0) || String(a.product_id).localeCompare(String(b.product_id))
  const defs: [string, any[]][] = [
    ['Dragon Cash (Official top-up dn-pay.wan.com)', cash],
    ['Limited-time Packs (App Store in-app only)', limited]
  ]
  const categories = defs.filter(([, l]) => l.length).map(([name, l]) => {
    l.sort(byThb); l.forEach((p) => { p.id = n++; p.prices = { THB: p.price_thb, USD: p.price_usd } })
    return { name, status: 0, message: 'OK', packCount: l.length, packs: l }
  })
  const notes = [
    `Publisher: 7road International HK Limited. Main: official top-up ${DNM_TOPUP_URL} (Mobapay app_id ${DNM_MOBAPAY_APP_ID}, country TH). THB = price_local_show; base/bonus from the official title "base+bonus"; total = base + bonus.`,
    `USD: the official webshop has no USD region; USD = same product on App Store (US, else KH / LA / MM) by product id (lzgofficial.* -> lzgios.*). Webshop tiers with no App Store counterpart have USD null with a reason. The in-app THB price of the same product is shown as appstore_th_price_thb. No FX conversion, no resellers.`,
    'Limited-time Packs are sold only in-app: THB from App Store TH, USD from the App Store USD storefront by product id. Apple publishes only the price tier and a generic description; contents are null with a reason.',
    'Passes: no Battle Pass / monthly card is sold for THB or USD on the official webshop or the App Store in-app list (the DN Pass is unlocked in-game with Cash), so none is listed.',
    APPSTORE_FULL_IAP_NOTE
  ]
  if (!th.rows) notes.push('App Store TH unavailable: ' + th.reason)
  if (!usd.rows) notes.push(usdUnavailable)
  return ({
    game: { id: DNM_APP_ID, slug: DNM_SLUG, name: DNM_NAME, itemName: 'Cash', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: DNM_TOPUP_URL,
    sources: {
      topup_page: DNM_TOPUP_URL, shop: DNM_SHOP_API_URL, thb: DNM_SHOP_API_URL,
      appstore_th: `${APPSTORE_IAP_API_BASE}/th/apps/${DNM_APP_ID}/top-in-apps`,
      appstore_usd: `${APPSTORE_IAP_API_BASE}/${usd.cc || 'us'}/apps/${DNM_APP_ID}/top-in-apps`, appstore_th_page: DNM_APPSTORE_TH
    },
    notes
  } as unknown) as RovPacksResponse
}

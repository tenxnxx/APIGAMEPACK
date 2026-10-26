import type { RovPacksResponse } from '../types/rov'

/**
 * Dragon Nest M: Classic (7road, SEA) — official web top-up https://dn-pay.wan.com/ (linked from dn.wan.com).
 * The shop runs on the Mobapay platform: GET https://api.mobapay.com/api/app_shop?app_id=127496&country=TH
 * returns the live goods with price_local_show in THB. Title "600+26" = base + bonus Cash.
 * The official shop has no USD region (only HK/TW/TH/SG/ID/MY/PH); the App Store US fallback is checked live —
 * the game is not on the US App Store (HTTP 404), so USD is null with that reason. No FX conversion.
 */
export const DNM_SLUG = 'dragon-nest-m-classic'
export const DNM_MOBAPAY_APP_ID = 127496
export const DNM_APP_ID = 6743824718
export const DNM_TOPUP_URL = 'https://dn-pay.wan.com/'
export const DNM_SHOP_API_URL = `https://api.mobapay.com/api/app_shop?app_id=${DNM_MOBAPAY_APP_ID}&country=TH&language=en`
export const DNM_APPSTORE_US = `https://apps.apple.com/us/app/id${DNM_APP_ID}`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class DnmUpstreamUnavailableError extends Error {
  constructor(message = 'Dragon Nest M: Classic official shop unavailable') { super(message); this.name = 'DnmUpstreamUnavailableError' }
}
export class DnmInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Dragon Nest M: Classic official shop response') { super(message); this.name = 'DnmInvalidUpstreamResponseError' }
}

async function usStoreStatus(signal?: AbortSignal): Promise<string> {
  try {
    const r = await fetch(DNM_APPSTORE_US, { signal: signal ?? AbortSignal.timeout(15_000), redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'en-US' } })
    return r.status === 200 ? 'listed on App Store US but its pack prices are not published per pack' : `not on App Store US (HTTP ${r.status})`
  } catch (e) {
    return 'App Store US check failed: ' + (e instanceof Error ? e.message : String(e))
  }
}

export async function fetchDnmPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const usP = usStoreStatus(signal)
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
  for (const s of shelves) for (const g of s?.goods ?? []) goods.push({ ...g, __shelf: s.title })
  const thb = goods.filter((g) => g?.currency === 'THB' && Number(g?.price_local_show) > 0)
  if (!thb.length) throw new DnmInvalidUpstreamResponseError('No THB goods')
  const usReason = await usP
  const parsed = thb.map((g) => {
    const m = String(g.title).replace(/,/g, '').match(/^\s*(\d+)\s*\+\s*(\d+)\s*$/)
    return { g, base: m ? Number(m[1]) : null, bonus: m ? Number(m[2]) : null }
  }).sort((a, b) => (a.base ?? Infinity) - (b.base ?? Infinity) || Number(a.g.price_local_show) - Number(b.g.price_local_show))
  const packs = parsed.map(({ g, base, bonus }, i) => {
    const price = Number(g.price_local_show)
    const pack: any = {
      id: i + 1, name: base !== null ? `${g.title} Cash` : String(g.title), product_id: g.sku ?? String(g.id),
      baseItemAmount: base, bonusItemAmount: bonus, totalItemAmount: base !== null ? base + (bonus ?? 0) : null,
      bonus_available: bonus !== null, bonus_source: bonus !== null ? 'official shop title (base+bonus)' : null,
      item_pack: base === null, description: g.label?.title || g.description || '',
      image_url: g.icon ?? null,
      price_thb: price, price_thb_source: 'dn-pay.wan.com official (Mobapay, country TH)',
      price_usd: null, price_usd_source: null,
      price_usd_null_reason: `Official shop has no USD region (HK/TW/TH/SG/ID/MY/PH only); fallback: game ${usReason}. No FX conversion.`,
      price, currency: 'THB'
    }
    if (base === null) pack.base_null_reason = 'Title is not in "base+bonus" form'
    pack.prices = { THB: pack.price_thb, USD: null }
    return pack
  })
  const categories = [{ id: 1, name: 'Official Top-up dn-pay.wan.com (Dragon Cash)', packs, status: 0, message: 'Live (no fallback catalog)', packCount: packs.length }]
  return ({
    game: { id: DNM_APP_ID, slug: DNM_SLUG, name: 'Dragon Nest M: Classic', itemName: 'Cash', itemIcon: '' },
    categories,
    summary: { categoryCount: 1, packCount: packs.length },
    fetchedAt: new Date().toISOString(),
    source: DNM_TOPUP_URL,
    sources: { shop: DNM_SHOP_API_URL, thb: DNM_SHOP_API_URL, usd_fallback: DNM_APPSTORE_US },
    notes: [
      'Official 7road SEA top-up ' + DNM_TOPUP_URL + ' (Mobapay app_id ' + DNM_MOBAPAY_APP_ID + '). THB = price_local_show for country TH. base/bonus from pack title "base+bonus".',
      'USD: official shop has no USD region; App Store US fallback: ' + usReason + '. No FX conversion.'
    ]
  } as unknown) as RovPacksResponse
}

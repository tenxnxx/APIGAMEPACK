import { appStoreFetch, APPSTORE_FULL_IAP_NOTE } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'
import { parseAppStoreIapRows, type IapRow } from './architect-packs.service'

/**
 * Captain Tsubasa: Dream Team (KLab) — official KLab Dreamball Top-Up Center (charge.tsubasa-dreamteam.com).
 * USD + base (Paid Dreamball) + bonus (Free Dreamball) come live from the official web shop HTML (guest view).
 * The official shop shows guest prices in USD only (it says currency/price is shown per user info after
 * KLab ID login), so web-shop THB is null. App Store TH (THB) / US (USD) in-app items are listed as a fallback
 * category (same KLab app). No FX conversion, no resellers, no hardcoded prices. Web shop failure -> throw (502).
 */
export const TSUBASA_SLUG = 'captain-tsubasa-dream-team'
export const TSUBASA_APP_ID = 1293738123
export const TSUBASA_SHOP_URL = 'https://charge.tsubasa-dreamteam.com/?lang=en'
export const TSUBASA_APPSTORE_TH = `https://apps.apple.com/th/app/id${TSUBASA_APP_ID}`
export const TSUBASA_APPSTORE_US = `https://apps.apple.com/us/app/id${TSUBASA_APP_ID}`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class TsubasaUpstreamUnavailableError extends Error {
  constructor(message = 'Captain Tsubasa KLab top-up center unavailable') { super(message); this.name = 'TsubasaUpstreamUnavailableError' }
}
export class TsubasaInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Captain Tsubasa KLab top-up response') { super(message); this.name = 'TsubasaInvalidUpstreamResponseError' }
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const text = (s: string) => decode(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
const num = (s: string) => Number(s.replace(/,/g, ''))

export type TsubasaShopProduct = { productId: string; name: string; usd: number | null; currency: string | null; rawPrice: string; paid: number | null; free: number | null; bonusText: string }

export function parseTsubasaShop(html: string): TsubasaShopProduct[] {
  const out: TsubasaShopProduct[] = []
  const parts = html.split(/<div class="modal fade purchase-confirm-dialog" id="purchase-confirm-dialog-/).slice(1)
  for (const full of parts) {
    const end = full.indexOf('body--btn')
    const part = end > 0 ? full.slice(0, end) : full
    const productId = part.slice(0, part.indexOf('"'))
    const h3 = part.match(/<h3>([\s\S]*?)<\/h3>/)
    if (!productId || !h3) continue
    const name = text(h3[1].split(/<br\s*\/?>|<span/)[0])
    const bonusSpan = h3[1].match(/<span>([\s\S]*?)<\/span>/)
    const priceBlock = part.match(/detail--price">\s*<p>([\s\S]*?)<\/p>/)
    const rawPrice = priceBlock ? text(priceBlock[1]) : ''
    const pm = rawPrice.match(/^([A-Z]{3})\s*([\d,.]+)$/)
    const paidM = part.match(/Dreamball \(Paid\) x([\d,]+)/) ?? name.match(/^Dreamball x([\d,]+)$/)
    const freeM = part.match(/Dreamball \(Free\) ?x([\d,]+)/)
    out.push({
      productId, name, rawPrice,
      currency: pm ? pm[1] : null, usd: pm && pm[1] === 'USD' ? num(pm[2]) : null,
      paid: paidM ? num(paidM[1]) : null, free: freeM ? num(freeM[1]) : null,
      bonusText: bonusSpan ? text(bonusSpan[1]) : ''
    })
  }
  return out
}

async function fetchIap(url: string, cur: 'THB' | 'USD', lang: string, signal?: AbortSignal): Promise<{ rows: IapRow[] | null; reason?: string }> {
  try {
    const r = await appStoreFetch(url, { signal: signal ?? AbortSignal.timeout(20_000), redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': lang, Accept: 'text/html' } })
    if (r.status !== 200) return { rows: null, reason: `App Store HTTP ${r.status}` }
    const rows = parseAppStoreIapRows(await r.text(), cur)
    return rows.length ? { rows } : { rows: null, reason: 'No IAP rows on App Store page' }
  } catch (e) {
    return { rows: null, reason: 'App Store fetch failed: ' + (e instanceof Error ? e.message : String(e)) }
  }
}

const key = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim()

export async function fetchTsubasaPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const shopP = (async () => {
    let r: Response
    try {
      r = await fetch(TSUBASA_SHOP_URL, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' } })
    } catch (e) { throw new TsubasaUpstreamUnavailableError(e instanceof Error ? e.message : 'network error') }
    if (!r.ok) throw new TsubasaUpstreamUnavailableError('HTTP ' + r.status)
    return r.text()
  })()
  const [html, th, us] = await Promise.all([
    shopP,
    fetchIap(TSUBASA_APPSTORE_TH, 'THB', 'th-TH,th;q=0.9', signal),
    fetchIap(TSUBASA_APPSTORE_US, 'USD', 'en-US,en;q=0.9', signal)
  ])
  const products = parseTsubasaShop(html)
  if (!products.length) throw new TsubasaInvalidUpstreamResponseError('No products in KLab top-up center HTML')

  const webPacks = products.map((p, i) => {
    const base = p.paid
    const bonus = base !== null ? (p.free ?? 0) : null
    const pack: any = {
      id: i + 1, name: p.name, product_id: p.productId,
      baseItemAmount: base, bonusItemAmount: bonus, totalItemAmount: base !== null ? base + (bonus ?? 0) : null,
      bonus_available: base !== null, bonus_source: base !== null ? 'klab-topup-center (Dreamball (Free))' : null,
      item_pack: base === null, description: p.bonusText ? '+ ' + p.bonusText.replace(/^\+\s*/, '') : '',
      price_thb: null, price_thb_source: null,
      price_usd: p.usd, price_usd_source: p.usd !== null ? 'klab-topup-center-official' : null,
      price: p.usd ?? 0, currency: p.usd !== null ? 'USD' : ''
    }
    pack.price_thb_null_reason = 'Official KLab top-up center shows guest prices in USD only (local currency only after KLab ID login); web-shop pack not sold on App Store under same name. No FX conversion.'
    if (p.usd === null) pack.price_usd_null_reason = `Official shop price is not USD: "${p.rawPrice || 'missing'}"`
    if (base === null) pack.bonus_null_reason = 'No Dreamball amount listed for this product'
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })

  const appRows: IapRow[] = [...(th.rows ?? [])]
  for (const r of us.rows ?? []) if (!appRows.some((x) => key(x.name) === key(r.name))) appRows.push(r)
  const appPacks = appRows.map((r, i) => {
    const t = th.rows?.find((x) => key(x.name) === key(r.name)); const u = us.rows?.find((x) => key(x.name) === key(r.name))
    const m = r.name.match(/^Dreamballs? (\d[\d,]*)$/i) ?? r.name.match(/^Dreamball x(\d[\d,]*)\b/i)
    const base = m ? num(m[1]) : null
    const pack: any = {
      id: 1001 + i, name: r.name,
      baseItemAmount: base, bonusItemAmount: null, totalItemAmount: null,
      bonus_available: false, bonus_source: null,
      item_pack: base === null, description: '',
      price_thb: t ? t.price : null, price_thb_source: t ? 'apple-app-store-th' : null,
      price_usd: u ? u.price : null, price_usd_source: u ? 'apple-app-store-us' : null,
      price: t ? t.price : u ? u.price : 0, currency: t ? 'THB' : u ? 'USD' : ''
    }
    pack.bonus_null_reason = 'App Store lists name and price only (no bonus info)'
    if (!t) pack.price_thb_null_reason = th.rows ? 'Not in App Store TH IAP list (Apple web shows top 10 only)' : 'App Store TH: ' + th.reason
    if (!u) pack.price_usd_null_reason = us.rows ? 'Not in App Store US IAP list (Apple web shows top 10 only)' : 'App Store US: ' + us.reason
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })

  const msg = 'Live (no fallback catalog)'
  const categories = [
    { id: 1, name: 'Official KLab Dreamball Top-Up Center (charge.tsubasa-dreamteam.com, USD)', packs: webPacks },
    { id: 2, name: 'App Store in-app (TH THB / US USD)', packs: appPacks }
  ].filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, message: msg, packCount: c.packs.length }))
  const notes = [
    'Main: official KLab Dreamball Top-Up Center ' + TSUBASA_SHOP_URL + ' (live guest HTML). USD = shop price; base = Dreamball (Paid); bonus = Dreamball (Free).',
    'The official shop shows guest prices only in USD (local currency after KLab ID login), so web-shop THB is null. THB/USD for in-app items = App Store TH/US (KLab app ' + TSUBASA_APP_ID + '). No FX conversion.'
  ]
  notes.push(APPSTORE_FULL_IAP_NOTE)
  if (!th.rows) notes.push('App Store TH: ' + th.reason)
  if (!us.rows) notes.push('App Store US: ' + us.reason)
  return ({
    game: { id: TSUBASA_APP_ID, slug: TSUBASA_SLUG, name: 'Captain Tsubasa: Dream Team', itemName: 'Dreamball', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: TSUBASA_SHOP_URL,
    sources: { shop: TSUBASA_SHOP_URL, thb: TSUBASA_APPSTORE_TH, usd: TSUBASA_SHOP_URL, appstore_us: TSUBASA_APPSTORE_US },
    notes
  } as unknown) as RovPacksResponse
}

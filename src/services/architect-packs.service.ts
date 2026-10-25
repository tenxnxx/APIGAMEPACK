import type { RovPack, RovPacksResponse } from '../types/rov'

/**
 * Architect: Land of Exiles — publisher DRIMAGE Co., Ltd.
 * Main source: official DRIMAGE Web Shop (server-rendered, public, no login), prices in TWD (MyCard).
 * THB/USD: official Apple App Store TH/US IAP list, matched by diamond amount (never converted).
 */
export const ARCHITECT_SLUG = 'architect-land-of-exiles'
export const ARCHITECT_WEBSHOP_URL = 'https://atshop.drimage.com/webshop/architect?lang=en'
export const ARCHITECT_APP_ID = 6698862298
export const ARCHITECT_APPSTORE_TH_URL = `https://apps.apple.com/th/app/id${ARCHITECT_APP_ID}`
export const ARCHITECT_APPSTORE_US_URL = `https://apps.apple.com/us/app/id${ARCHITECT_APP_ID}`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class ArchitectUpstreamUnavailableError extends Error {
  constructor(message = 'Architect web shop unavailable') { super(message); this.name = 'ArchitectUpstreamUnavailableError' }
}
export class ArchitectInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Architect web shop response') { super(message); this.name = 'ArchitectInvalidUpstreamResponseError' }
}

export type ArchitectPack = Omit<RovPack, 'bonusItemAmount' | 'price_thb' | 'price_usd' | 'price_thb_source' | 'price_usd_source'> & {
  bonusItemAmount: number | null
  bonus_available: boolean
  bonus_source: string | null
  store_price: number | null
  store_currency: string | null
  price_thb: number | null
  price_usd: number | null
  price_thb_source: string | null
  price_usd_source: string | null
  price_thb_null_reason?: string
  price_usd_null_reason?: string
  extras?: string[]
  product_url?: string
}

const num = (s: string) => Number(s.replace(/[^0-9.]/g, ''))
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()

export type WebShopRow = { name: string; amount: number | null; price: number; currency: string; extras: string[]; href: string }

export function parseArchitectWebShop(html: string): WebShopRow[] {
  const out: WebShopRow[] = []
  for (const card of html.split('class="product-card"').slice(1)) {
    const name = card.match(/<p class="name">([^<]+)<\/p>/)
    const price = card.match(/<span class="price">([^<]+)<\/span>/)
    if (!name || !price) continue
    const pm = decode(price[1]).match(/^([\d,.]+)\s*([A-Z]{3})$/)
    if (!pm) continue
    const n = decode(name[1])
    const a = n.match(/^([\d,]+)\s*Diamonds?$/i)
    const href = card.match(/href="([^"]+)"/)
    out.push({
      name: n,
      amount: a ? num(a[1]) : null,
      price: num(pm[1]),
      currency: pm[2],
      extras: [...card.matchAll(/<span class="extra-item-value">([^<]+)<\/span>/g)].map((m) => decode(m[1])),
      href: href ? new URL(href[1], ARCHITECT_WEBSHOP_URL).toString() : ''
    })
  }
  return out
}

export type IapRow = { name: string; amount: number | null; price: number }
export function parseAppStoreIapRows(html: string, currency: 'THB' | 'USD'): IapRow[] {
  const out: IapRow[] = []
  for (const m of html.matchAll(/<div class="text-pair[^"]*"><span>([^<]+)<\/span>\s*<span>([^<]+)<\/span>/g)) {
    const name = decode(m[1])
    const raw = m[2].trim()
    if (currency === 'THB' ? !raw.includes('\u0E3F') : !raw.startsWith('$')) continue
    if (out.some((r) => r.name === name)) continue
    const a = name.match(/^([\d,]+)\s*Diamonds?$/i)
    out.push({ name, amount: a ? num(a[1]) : null, price: num(raw) })
  }
  return out
}

async function fetchText(url: string, lang: string, signal?: AbortSignal): Promise<{ status: number; text: string }> {
  const r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, 'Accept-Language': lang, Accept: 'text/html' } })
  return { status: r.status, text: await r.text() }
}

async function fetchIap(url: string, cur: 'THB' | 'USD', lang: string, signal?: AbortSignal): Promise<{ rows: IapRow[] | null; reason?: string }> {
  try {
    const r = await fetchText(url, lang, signal)
    if (r.status === 404) return { rows: null, reason: `Game not listed on App Store ${cur === 'THB' ? 'TH' : 'US'} (HTTP 404)` }
    if (r.status !== 200) return { rows: null, reason: `App Store HTTP ${r.status}` }
    const rows = parseAppStoreIapRows(r.text, cur)
    return rows.length ? { rows } : { rows: null, reason: 'No IAP rows on App Store page' }
  } catch (e) {
    return { rows: null, reason: 'App Store fetch failed: ' + (e instanceof Error ? e.message : String(e)) }
  }
}

export async function fetchArchitectPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  let shop: { status: number; text: string }
  try {
    shop = await fetchText(ARCHITECT_WEBSHOP_URL, 'en-US,en;q=0.9', options?.signal)
  } catch (e) {
    throw new ArchitectUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (shop.status !== 200) throw new ArchitectUpstreamUnavailableError('HTTP ' + shop.status)
  const rows = parseArchitectWebShop(shop.text)
  if (rows.length === 0) throw new ArchitectInvalidUpstreamResponseError('No product cards')

  const [th, us] = await Promise.all([
    fetchIap(ARCHITECT_APPSTORE_TH_URL, 'THB', 'th-TH,th;q=0.9', options?.signal),
    fetchIap(ARCHITECT_APPSTORE_US_URL, 'USD', 'en-US,en;q=0.9', options?.signal)
  ])
  const pick = (r: { rows: IapRow[] | null }, p: { amount: number | null; name: string }) =>
    r.rows?.find((x) => (p.amount !== null ? x.amount === p.amount : x.name.toLowerCase() === p.name.toLowerCase()))

  const fill = (pack: ArchitectPack, key: { amount: number | null; name: string }) => {
    for (const [cur, res, tag] of [['THB', th, 'th'], ['USD', us, 'us']] as const) {
      const f = cur === 'THB' ? 'thb' : 'usd'
      if (pack.store_currency === cur && pack.store_price !== null) {
        pack[`price_${f}`] = pack.store_price
        pack[`price_${f}_source`] = 'drimage-official-webshop'
        continue
      }
      const hit = pick(res, key)
      pack[`price_${f}`] = hit ? hit.price : null
      pack[`price_${f}_source`] = hit ? `apple-app-store-${tag}` : null
      if (!hit) pack[`price_${f}_null_reason`] = res.reason ?? `No same-amount pack on App Store ${tag.toUpperCase()} IAP list (Apple shows top items only)`
    }
    ;(pack as any).prices = { THB: pack.price_thb, USD: pack.price_usd, ...(pack.store_currency && pack.store_price !== null ? { [pack.store_currency]: pack.store_price } : {}) }
    pack.price = pack.price_thb ?? pack.price_usd ?? pack.store_price ?? 0
    pack.currency = pack.price_thb !== null ? 'THB' : pack.price_usd !== null ? 'USD' : pack.store_currency ?? ''
    return pack
  }

  const webPacks = rows.map((r, i) =>
    fill({
      id: i + 1, name: r.name,
      baseItemAmount: r.amount ?? 0, bonusItemAmount: r.amount !== null ? 0 : null, totalItemAmount: r.amount ?? 0,
      bonus_available: r.amount !== null, bonus_source: r.amount !== null ? 'drimage-official-webshop (no bonus diamonds listed)' : null,
      store_price: r.price, store_currency: r.currency, extras: r.extras, product_url: r.href,
      price_thb: null, price_usd: null, price_thb_source: null, price_usd_source: null, price: r.price, currency: r.currency
    } as unknown as ArchitectPack, r)
  )
  const appRows = th.rows ?? []
  const appPacks = appRows.map((r, i) =>
    fill({
      id: 1001 + i, name: r.name,
      baseItemAmount: r.amount ?? 0, bonusItemAmount: r.amount !== null ? 0 : null, totalItemAmount: r.amount ?? 0,
      bonus_available: r.amount !== null, bonus_source: r.amount !== null ? 'apple-app-store-th (no bonus shown)' : null,
      store_price: null, store_currency: null,
      price_thb: null, price_usd: null, price_thb_source: null, price_usd_source: null, price: r.price, currency: 'THB'
    } as unknown as ArchitectPack, r)
  )
  const msg = 'Live (no fallback catalog)'
  const categories = [
    { id: 1, name: `Web Shop (DRIMAGE, ${rows[0].currency})`, packs: webPacks },
    { id: 2, name: 'App Store TH (iOS IAP)', packs: appPacks }
  ].filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, message: msg, packCount: c.packs.length }))
  const notes = [
    'Main: official DRIMAGE Web Shop (public HTML, prices TWD via MyCard). Extras (AP / MILEAGE) are separate points, not diamonds.',
    'THB/USD from official Apple App Store TH/US IAP list matched by diamond amount (no conversion); null + *_null_reason when no match.'
  ]
  if (!th.rows) notes.push('App Store TH: ' + th.reason)
  if (!us.rows) notes.push('App Store US: ' + us.reason)
  return ({
    game: { id: ARCHITECT_APP_ID, slug: ARCHITECT_SLUG, name: 'Architect: Land of Exiles', itemName: 'Diamond', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: ARCHITECT_WEBSHOP_URL,
    sources: { webshop: ARCHITECT_WEBSHOP_URL, thb: ARCHITECT_APPSTORE_TH_URL, usd: ARCHITECT_APPSTORE_US_URL },
    notes
  } as unknown) as RovPacksResponse
}
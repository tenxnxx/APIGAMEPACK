import type { RovPack, RovPacksResponse } from '../types/rov'
import { isFiniteNumber, isRecord } from '../lib/guards'

/**
 * Aniimo — official web shop https://www.aniimo.com/store/en/ (Pawprint Studio / FunPlus-KingsGroup backend).
 * Live data from the same API the official shop page calls (POST store/init).
 * Currency is chosen by the upstream from the caller IP (get_ip_currency); TH IP -> THB.
 * base = coin, bonus = level_normal_rebate coin (standard bonus), full price = original_price.
 */
export const ANIIMO_SLUG = 'aniimo'
export const ANIIMO_GAME_ID = 999002
export const ANIIMO_SHOP_URL = 'https://www.aniimo.com/store/en/'
export const ANIIMO_STORE_API_URL = 'https://worldx-store-coin.kingsgroupgames.com/api/store/init'
const ANIIMO_STORE_BODY = { server_id: 1, game_id: ANIIMO_GAME_ID, game_project: 'worldx_global', source: 'web' }

export const ANIIMO_APPSTORE_TH_URL = 'https://apps.apple.com/th/app/aniimo/id6759098797'
export const ANIIMO_APPSTORE_US_URL = 'https://apps.apple.com/us/app/aniimo/id6759098797'

export type AppStoreIapRow = { name: string; price: number }

/** Parse "In-App Purchases" text pairs from an App Store product page. */
export function parseAniimoAppStoreIap(html: string, currency: 'THB' | 'USD'): AppStoreIapRow[] {
  const out: AppStoreIapRow[] = []
  const re = /<div class="text-pair[^"]*"><span>([^<]+)<\/span>\s*<span>([^<]+)<\/span>/g
  for (const m of html.matchAll(re)) {
    const name = m[1].replace(/\s+/g, ' ').trim()
    const raw = m[2].trim()
    if (currency === 'THB' ? !raw.includes('\u0E3F') : !raw.startsWith('$')) continue
    const price = Number(raw.replace(/[^0-9.]/g, ''))
    if (!Number.isFinite(price) || out.some((r) => r.name === name)) continue
    out.push({ name, price })
  }
  return out
}

/** Match key: crystal amount, or pass/handbook kind. */
export function aniimoIapKey(name: string): string | null {
  const n = name.toLowerCase()
  const c = n.match(/([\d,]+)\s*lumin crystals?/)
  if (c) return 'c' + Number(c[1].replace(/,/g, ''))
  if (n.includes('monthly pass')) return 'monthly'
  if (n.includes('advanced')) return 'advanced'
  if (n.includes('collector')) return 'collector'
  return null
}

async function fetchIap(url: string, currency: 'THB' | 'USD', lang: string, signal?: AbortSignal): Promise<Map<string, number>> {
  const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': lang, Accept: 'text/html' } })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const map = new Map<string, number>()
  for (const r of parseAniimoAppStoreIap(await res.text(), currency)) {
    const k = aniimoIapKey(r.name)
    if (k && !map.has(k)) map.set(k, r.price)
  }
  if (map.size === 0) throw new Error('no IAP rows')
  return map
}

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

/** Display-name translation only (labels the official EN page shows); never prices. */
const NAME_EN: Record<string, string> = {
  月度之证: 'Monthly Pass',
  进阶版同行手册: 'Advanced Companion Handbook',
  典藏版同行手册: "Collector's Companion Handbook"
}

export class AniimoUpstreamUnavailableError extends Error {
  constructor(message = 'Aniimo official shop upstream unavailable') {
    super(message)
    this.name = 'AniimoUpstreamUnavailableError'
  }
}
export class AniimoInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Aniimo official shop response') {
    super(message)
    this.name = 'AniimoInvalidUpstreamResponseError'
  }
}

export type AniimoPack = Omit<RovPack, 'bonusItemAmount' | 'price_thb' | 'price_usd' | 'price_thb_source' | 'price_usd_source'> & {
  bonusItemAmount: number | null
  bonus_available: boolean
  bonus_source: string | null
  first_purchase_bonus: number | null
  first_purchase_of_month_price: number | null
  product_id: string
  iap_key?: string | null
  store_price?: number
  store_currency?: string
  price_thb?: number | null
  price_usd?: number | null
  price_thb_source?: string | null
  price_usd_source?: string | null
  price_thb_null_reason?: string
  price_usd_null_reason?: string
}

function benefit(p: Record<string, unknown>, type: string): Record<string, unknown> | null {
  if (!Array.isArray(p.benefit)) return null
  const b = p.benefit.find((x) => isRecord(x) && x.act_type === type)
  return isRecord(b) ? b : null
}

export function parseAniimoProducts(payload: unknown): { currency: string; country: string | null; packs: AniimoPack[]; kind: Map<number, number> } {
  if (!isRecord(payload) || payload.code !== 0 || !isRecord(payload.data)) {
    throw new AniimoInvalidUpstreamResponseError('Unexpected store/init payload')
  }
  const gp = payload.data.game_products
  if (!isRecord(gp) || !Array.isArray(gp.data)) throw new AniimoInvalidUpstreamResponseError('No game_products')
  const ip = isRecord(payload.data.get_ip_currency) && isRecord(payload.data.get_ip_currency.data)
    ? payload.data.get_ip_currency.data : null
  const packs: AniimoPack[] = []
  const kind = new Map<number, number>()
  let currency = ''
  for (const p of gp.data) {
    if (!isRecord(p) || typeof p.currency !== 'string') continue
    const price = isFiniteNumber(p.original_price) ? p.original_price : isFiniteNumber(p.price) ? p.price : null
    if (price === null) continue
    currency = p.currency
    const coin = isFiniteNumber(p.coin) ? p.coin : 0
    const normal = benefit(p, 'level_normal_rebate')
    const first = benefit(p, 'level_first_rebate')
    const month = benefit(p, 'month_first_discount')
    const bonus = coin <= 0 ? 0 : normal && isFiniteNumber(normal.coin) ? normal.coin : null
    const desc = typeof p.description === 'string' ? p.description.trim() : ''
    const id = Number(p.package_id)
    const usd = p.currency === 'USD' ? price : null
    const thb = p.currency === 'THB' ? price : null
    const key = coin > 0 ? 'c' + coin : aniimoIapKey(NAME_EN[desc] ?? desc)
    packs.push({
      id: Number.isFinite(id) ? id : packs.length + 1,
      name: coin > 0 ? `${coin} Lumin Crystals` : NAME_EN[desc] ?? desc,
      baseItemAmount: coin,
      bonusItemAmount: bonus,
      totalItemAmount: coin + (bonus ?? 0),
      bonus_available: bonus !== null,
      bonus_source: bonus === null ? null : 'aniimo-official-shop-benefit',
      first_purchase_bonus: first && isFiniteNumber(first.coin) ? first.coin : null,
      first_purchase_of_month_price: month && isFiniteNumber(month.discount_price) ? month.discount_price : null,
      product_id: String(p.product_id ?? ''),
      iap_key: key,
      store_price: price,
      store_currency: p.currency,
      price,
      currency: p.currency,
      ...(thb !== null ? { price_thb: thb } : {}),
      price_usd: usd,
      prices: { THB: thb, USD: usd },
      ...(thb !== null ? { price_thb_source: 'aniimo-official-shop' } : {}),
      price_usd_source: usd !== null ? 'aniimo-official-shop' : undefined
    } as AniimoPack)
    kind.set(packs[packs.length - 1].id, isFiniteNumber(p.product_type) ? p.product_type : 0)
  }
  return { currency, country: ip && typeof ip.country === 'string' ? ip.country : null, packs, kind }
}

export async function fetchAniimoPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  let response: Response
  try {
    response = await fetch(ANIIMO_STORE_API_URL, {
      method: 'POST',
      signal: options?.signal ?? AbortSignal.timeout(25_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Referer: 'https://www.aniimo.com/', 'User-Agent': BROWSER_UA },
      body: JSON.stringify(ANIIMO_STORE_BODY)
    })
  } catch (error) {
    throw new AniimoUpstreamUnavailableError(error instanceof Error ? error.message : 'network error')
  }
  if (!response.ok) throw new AniimoUpstreamUnavailableError('HTTP ' + response.status)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new AniimoInvalidUpstreamResponseError('Non-JSON response')
  }
  const { currency, country, packs, kind } = parseAniimoProducts(payload)
  if (packs.length === 0) throw new AniimoInvalidUpstreamResponseError('No products')
  const extraNotes: string[] = []
  const sources: Record<string, string> = { store: ANIIMO_STORE_API_URL }
  for (const [cur, url, lang] of [['THB', ANIIMO_APPSTORE_TH_URL, 'th-TH,th;q=0.9'], ['USD', ANIIMO_APPSTORE_US_URL, 'en-US,en;q=0.9']] as const) {
    const field = cur === 'THB' ? 'price_thb' : 'price_usd'
    const srcField = (field + '_source') as 'price_thb_source' | 'price_usd_source'
    const reasonField = (field + '_null_reason') as 'price_thb_null_reason' | 'price_usd_null_reason'
    if (currency === cur) {
      sources[cur.toLowerCase()] = ANIIMO_STORE_API_URL
      continue // official web shop already returned this currency
    }
    let map: Map<string, number> | null = null
    let err = ''
    try {
      map = await fetchIap(url, cur, lang, options?.signal)
      sources[cur.toLowerCase()] = url
    } catch (e) {
      err = e instanceof Error ? e.message : String(e)
      extraNotes.push(`App Store ${cur} unavailable (${err}); ${field} null.`)
    }
    for (const p of packs) {
      const v = map && p.iap_key ? map.get(p.iap_key) : undefined
      p[field] = v ?? null
      p[srcField] = v !== undefined ? 'apple-app-store-' + (cur === 'THB' ? 'th' : 'us') : null
      if (v === undefined) p[reasonField] = map ? 'Not listed on App Store ' + (cur === 'THB' ? 'TH' : 'US') + ' IAP list (Apple shows top items only)' : 'App Store fetch failed: ' + err
      ;(p as any).prices = { THB: p.price_thb ?? null, USD: p.price_usd ?? null }
    }
  }
  for (const p of packs) {
    if (p.price_thb != null) { p.price = p.price_thb; p.currency = 'THB' }
    else if (p.price_usd != null) { p.price = p.price_usd; p.currency = 'USD' }
    delete p.iap_key
  }
  const msg = 'Live from Aniimo official shop (no fallback)'
  const cats = [
    { id: 1, name: 'Lumin Crystals', packs: packs.filter((p) => kind.get(p.id) === 1) },
    { id: 2, name: 'Passes & Handbooks', packs: packs.filter((p) => kind.get(p.id) !== 1) }
  ]
    .filter((c) => c.packs.length)
    .map((c) => ({ ...c, status: 0, message: msg, packCount: c.packs.length }))
  return ({
    game: { id: ANIIMO_GAME_ID, slug: ANIIMO_SLUG, name: 'Aniimo', itemName: 'Lumin Crystal', itemIcon: '' },
    categories: cats,
    summary: { categoryCount: cats.length, packCount: packs.length },
    fetchedAt: new Date().toISOString(),
    source: ANIIMO_SHOP_URL,
    sources,
    notes: [
      'Official Aniimo web shop API (same data as https://www.aniimo.com/store/en/).',
      `Official shop currency picked by upstream from server IP: ${currency || 'unknown'} (country ${country ?? 'unknown'}); request fields for country/currency are ignored upstream.`,
      'Price = original_price (full price). Bonus = level_normal_rebate coin (standard bonus); null if missing.',
      'first_purchase_bonus = level_first_rebate (first-time double); first_purchase_of_month_price = month_first_discount price (shown, not used as price).',
      'THB/USD: from official shop when it returns that currency; otherwise official Apple App Store TH/US IAP list matched by crystal amount / pass name (no conversion). store_price/store_currency = raw official-shop price.',
      'Live-fetch only; failure -> 502 (no static catalog).',
      ...extraNotes
    ]
  } as unknown) as RovPacksResponse
}

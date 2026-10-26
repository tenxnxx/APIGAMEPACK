import { appStoreFetch, APPSTORE_FULL_IAP_NOTE } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'
import { parseAppStoreIapRows, type IapRow } from './architect-packs.service'

/**
 * Destiny: Rising (NetEase) — official NetEase GamesClub top-up (pay.neteasegames.com, game code "destinyrising").
 * USD + base live from the official gameclub products API; bonus from the official activitys API (alpha2=TH).
 * The official store has no THB (USD only; extra.local_price has no TH entry), so THB comes only from the
 * official Apple App Store TH IAP list (app 1593326563), matched by Silver amount. No FX, no resellers, no hardcoding.
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

export class DestinyRisingUpstreamUnavailableError extends Error {
  constructor(message = 'Destiny: Rising NetEase GamesClub upstream unavailable') { super(message); this.name = 'DestinyRisingUpstreamUnavailableError' }
}
export class DestinyRisingInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Destiny: Rising NetEase GamesClub response') { super(message); this.name = 'DestinyRisingInvalidUpstreamResponseError' }
}

const key = (n: string) => n.toLowerCase().replace(/&amp;/g, '&').replace(/[^a-z0-9]+/g, '')
/** "60 Silver" / "300 Sliver" (NetEase typo) / "60silver" -> 60 */
const silverAmt = (n: string): number | null => {
  const m = n.toLowerCase().replace(/,/g, '').match(/^\s*(\d+)\s*s(?:il|li)ver\s*$/)
  return m ? Number(m[1]) : null
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

export async function fetchDestinyRisingPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [prod, act, th, us] = await Promise.all([
    getJson(DESTINY_RISING_PRODUCTS_API_URL, signal),
    getJson(DESTINY_RISING_ACTIVITYS_API_URL, signal).catch((e) => ({ __error: e instanceof Error ? e.message : String(e) })),
    fetchIap(DESTINY_RISING_APPSTORE_TH, 'THB', 'en-US,en;q=0.9', signal),
    fetchIap(DESTINY_RISING_APPSTORE_US, 'USD', 'en-US,en;q=0.9', signal)
  ])
  if (prod?.code !== '0000' || !Array.isArray(prod?.data)) throw new DestinyRisingInvalidUpstreamResponseError('products: ' + (prod?.msg ?? 'bad shape'))
  const bonusOk = act?.code === '0000' && Array.isArray(act?.data?.list)
  const bonusMap = new Map<string, number>()
  if (bonusOk) for (const a of act.data.list) if (typeof a?.goodsid === 'string' && typeof a?.marketing_free_amount === 'number') bonusMap.set(a.goodsid, a.marketing_free_amount)

  const now = Date.now() / 1000
  const seen = new Set<string>()
  const prods = (prod.data as any[]).filter((p) => {
    if (p?.currency !== 'USD' || typeof p?.goodsid !== 'string' || seen.has(p.goodsid) || p.status !== 1) return false
    if (typeof p.expired_time === 'number' && p.expired_time < now) return false
    seen.add(p.goodsid); return true
  })
  if (!prods.length) throw new DestinyRisingInvalidUpstreamResponseError('No USD products')
  prods.sort((a, b) => Number(a.price) - Number(b.price))

  const findRow = (rows: IapRow[] | null, name: string) => {
    if (!rows) return undefined
    const amt = silverAmt(name)
    return rows.find((x) => (amt !== null ? silverAmt(x.name) === amt : key(x.name) === key(name)))
  }
  const thReason = (n: string) => th.rows
    ? `Official NetEase store has no THB for Destiny: Rising; "${n}" not in App Store TH IAP list (Apple web shows top 10 only)`
    : 'Official NetEase store has no THB; App Store TH: ' + th.reason

  const webPacks = prods.map((p, i) => {
    const name = String(p.multi_language?.default?.default?.goodsinfo ?? p.goodsinfo)
    const base = Number(p.pay_yuanbao) || 0
    const isCur = base > 0
    const bonus = isCur ? (bonusOk ? (bonusMap.get(p.goodsid) ?? 0) + (Number(p.free_yuanbao) || 0) : null) : null
    const t = findRow(th.rows, name)
    const usd = Number(p.price)
    const pack: any = {
      id: i + 1, name, product_id: p.goodsid,
      baseItemAmount: isCur ? base : null, bonusItemAmount: bonus, totalItemAmount: isCur ? base + (bonus ?? 0) : null,
      bonus_available: isCur && bonusOk, bonus_source: isCur && bonusOk ? 'netease-gameclub-activitys (alpha2=TH, NetEase Credit)' : null,
      item_pack: !isCur, description: '',
      image_url: p.icon?.default?.default?.normal ?? null,
      price_thb: t ? t.price : null, price_thb_source: t ? 'apple-app-store-th' : null,
      price_usd: usd, price_usd_source: 'netease-gameclub-official',
      price: t ? t.price : usd, currency: t ? 'THB' : 'USD'
    }
    if (!t) pack.price_thb_null_reason = thReason(name)
    if (isCur && !bonusOk) pack.bonus_null_reason = 'Official activitys endpoint unavailable: ' + (act?.__error ?? act?.msg ?? 'bad shape')
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })
  const isWeb = (n: string) => webPacks.some((p) => (silverAmt(n) !== null ? silverAmt(p.name) === silverAmt(n) : key(p.name) === key(n)))
  const appRows: IapRow[] = (th.rows ?? []).filter((r) => !isWeb(r.name))
  for (const r of us.rows ?? []) if (!isWeb(r.name) && !appRows.some((x) => key(x.name) === key(r.name))) appRows.push(r)
  const appPacks = appRows.map((r, i) => {
    const t = findRow(th.rows, r.name); const u = findRow(us.rows, r.name)
    const base = silverAmt(r.name)
    const pack: any = {
      id: 1001 + i, name: r.name.replace(/&amp;/g, '&'),
      baseItemAmount: base, bonusItemAmount: base !== null ? 0 : null, totalItemAmount: base,
      bonus_available: base !== null, bonus_source: base !== null ? 'apple-app-store (no bonus shown)' : null,
      item_pack: base === null, description: '',
      price_thb: t ? t.price : null, price_thb_source: t ? 'apple-app-store-th' : null,
      price_usd: u ? u.price : null, price_usd_source: u ? 'apple-app-store-us' : null,
      price: t ? t.price : u ? u.price : 0, currency: t ? 'THB' : u ? 'USD' : ''
    }
    if (!t) pack.price_thb_null_reason = th.rows ? 'Not in App Store TH IAP list (top 10 only)' : 'App Store TH: ' + th.reason
    if (!u) pack.price_usd_null_reason = us.rows ? 'Not in App Store US IAP list (top 10 only)' : 'App Store US: ' + us.reason
    if (base === null) pack.base_null_reason = 'Bundle/pass item; contents not itemised on App Store'
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })
  const msg = 'Live (no fallback catalog)'
  const categories = [
    { id: 1, name: 'Official NetEase Top-up (pay.neteasegames.com, Silver)', packs: webPacks },
    { id: 2, name: 'App Store in-app bundles (TH THB / US USD)', packs: appPacks }
  ].filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, message: msg, packCount: c.packs.length }))
  const notes = [
    'Main: official NetEase GamesClub top-up (game code destinyrising, live products API). USD = product.price; base = pay_yuanbao; bonus = activitys marketing_free_amount (alpha2=TH) + free_yuanbao.',
    'The official store sells Destiny: Rising only in USD (local_price has no TH). THB = App Store TH (NetEase app ' + DESTINY_RISING_APP_ID + ') matched by Silver amount; otherwise null. No FX conversion.'
  ]
  notes.push(APPSTORE_FULL_IAP_NOTE)
  if (!th.rows) notes.push('App Store TH: ' + th.reason)
  if (!us.rows) notes.push('App Store US: ' + us.reason)
  return ({
    game: { id: DESTINY_RISING_APP_ID, slug: DESTINY_RISING_SLUG, name: 'Destiny: Rising', itemName: 'Silver', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: DESTINY_RISING_PRODUCTS_API_URL,
    sources: { products: DESTINY_RISING_PRODUCTS_API_URL, bonus: DESTINY_RISING_ACTIVITYS_API_URL, thb: DESTINY_RISING_APPSTORE_TH, usd: DESTINY_RISING_PRODUCTS_API_URL, appstore_us: DESTINY_RISING_APPSTORE_US },
    notes
  } as unknown) as RovPacksResponse
}

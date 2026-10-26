import { appStoreFetch, APPSTORE_FULL_IAP_NOTE } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'
import { parseAppStoreIapRows, type IapRow } from './architect-packs.service'

/**
 * Ace Racer (NetEase) — official NetEase GamesClub top-up center (pay.neteasegames.com/AceRacer/topup).
 * USD + base + bonus come live from the official gameclub products / activitys APIs.
 * The official store has no THB for Ace Racer (currencies: USD/TWD/JPY/KRW/VND, no extra.local_price),
 * so THB comes only from the official Apple App Store TH IAP list, matched by exact pack name.
 * No FX conversion, no resellers, no hardcoded prices. Upstream failure -> throw (route maps to 502).
 */
export const ACERACER_SLUG = 'ace-racer'
export const ACERACER_APP_ID = 1593356371
export const ACERACER_TOPUP_URL = 'https://pay.neteasegames.com/AceRacer/topup'
export const ACERACER_PRODUCTS_API_URL = 'https://pay.neteasegames.com/gameclub/products/aceracer?gc_client_version=1.13.55'
export const ACERACER_ACTIVITYS_API_URL =
  'https://pay.neteasegames.com/gameclub/products/aceracer/activitys?gc_client_version=1.13.55&pay_method=gameclub_wallet&pay_type=NetEase+Credit_gameclub_wallet&alpha2=TH'
export const ACERACER_APPSTORE_TH = `https://apps.apple.com/th/app/id${ACERACER_APP_ID}`
export const ACERACER_APPSTORE_US = `https://apps.apple.com/us/app/id${ACERACER_APP_ID}`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class AceRacerUpstreamUnavailableError extends Error {
  constructor(message = 'Ace Racer NetEase GamesClub upstream unavailable') { super(message); this.name = 'AceRacerUpstreamUnavailableError' }
}
export class AceRacerInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Ace Racer NetEase GamesClub response') { super(message); this.name = 'AceRacerInvalidUpstreamResponseError' }
}

const key = (n: string) => n.toLowerCase().replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  let r: Response
  try {
    r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'application/json', Referer: ACERACER_TOPUP_URL } })
  } catch (e) {
    throw new AceRacerUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!r.ok) throw new AceRacerUpstreamUnavailableError('HTTP ' + r.status)
  try { return await r.json() } catch { throw new AceRacerInvalidUpstreamResponseError('Non-JSON response') }
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

export async function fetchAceRacerPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [prod, act, th, us] = await Promise.all([
    getJson(ACERACER_PRODUCTS_API_URL, signal),
    getJson(ACERACER_ACTIVITYS_API_URL, signal).catch((e) => ({ __error: e instanceof Error ? e.message : String(e) })),
    fetchIap(ACERACER_APPSTORE_TH, 'THB', 'th-TH,th;q=0.9', signal),
    fetchIap(ACERACER_APPSTORE_US, 'USD', 'en-US,en;q=0.9', signal)
  ])
  if (prod?.code !== '0000' || !Array.isArray(prod?.data)) throw new AceRacerInvalidUpstreamResponseError('products: ' + (prod?.msg ?? 'bad shape'))
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
  if (!prods.length) throw new AceRacerInvalidUpstreamResponseError('No USD products')
  prods.sort((a, b) => Number(a.price) - Number(b.price))
  const thFor = (n: string) => th.rows?.find((x) => key(x.name) === key(n))
  const usFor = (n: string) => us.rows?.find((x) => key(x.name) === key(n))
  const thReason = (n: string) => th.rows ? `Official NetEase store has no THB for Ace Racer; "${n}" not in App Store TH IAP list (Apple web shows top 10 only)` : 'Official NetEase store has no THB; App Store TH: ' + th.reason

  const webPacks = prods.map((p, i) => {
    const name = String(p.multi_language?.default?.default?.goodsinfo ?? p.goodsinfo)
    const base = Number(p.pay_yuanbao) || 0
    const isCur = base > 0
    const bonus = isCur ? (bonusOk ? (bonusMap.get(p.goodsid) ?? 0) + (Number(p.free_yuanbao) || 0) : null) : null
    const t = thFor(name)
    const usd = Number(p.price)
    const pack: any = {
      id: i + 1, name, product_id: p.goodsid,
      baseItemAmount: isCur ? base : null, bonusItemAmount: bonus, totalItemAmount: isCur ? base + (bonus ?? 0) : null,
      bonus_available: isCur && bonusOk, bonus_source: isCur && bonusOk ? 'netease-gameclub-activitys (alpha2=TH, NetEase Credit)' : null,
      item_pack: !isCur, description: '',
      image_url: p.icon?.default?.default?.normal ?? null,
      price_thb: t ? t.price : null, price_thb_source: t ? 'apple-app-store-th' : null,
      price_usd: usd, price_usd_source: 'netease-gameclub-official',
      price: usd, currency: 'USD'
    }
    if (!t) pack.price_thb_null_reason = thReason(name)
    if (isCur && !bonusOk) pack.bonus_null_reason = 'Official activitys endpoint unavailable: ' + (act?.__error ?? act?.msg ?? 'bad shape')
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })
  const webKeys = new Set(webPacks.map((p) => key(p.name)))
  const appRows: IapRow[] = (th.rows ?? []).filter((r) => !webKeys.has(key(r.name)))
  for (const r of us.rows ?? []) if (!webKeys.has(key(r.name)) && !appRows.some((x) => key(x.name) === key(r.name))) appRows.push(r)
  const appPacks = appRows.map((r, i) => {
    const t = thFor(r.name); const u = usFor(r.name)
    const m = r.name.match(/^([\d,]+)\s*Tokens$/i)
    const base = m ? Number(m[1].replace(/,/g, '')) : null
    const pack: any = {
      id: 1001 + i, name: r.name.replace(/&amp;/g, '&'),
      baseItemAmount: base, bonusItemAmount: base !== null ? 0 : null, totalItemAmount: base,
      bonus_available: base !== null, bonus_source: base !== null ? 'apple-app-store (no bonus shown)' : null,
      item_pack: base === null, description: '',
      price_thb: t ? t.price : null, price_thb_source: t ? 'apple-app-store-th' : null,
      price_usd: u ? u.price : null, price_usd_source: u ? 'apple-app-store-us' : null,
      price: t ? t.price : u ? u.price : 0, currency: t ? 'THB' : u ? 'USD' : ''
    }
    if (!t) pack.price_thb_null_reason = th.rows ? 'Not in App Store TH IAP list (top 10 only)' : th.reason
    if (!u) pack.price_usd_null_reason = us.rows ? 'Not in App Store US IAP list (top 10 only)' : 'App Store US: ' + us.reason
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })
  const msg = 'Live (no fallback catalog)'
  const categories = [
    { id: 1, name: 'Official NetEase Top-up (pay.neteasegames.com, USD)', packs: webPacks },
    { id: 2, name: 'App Store in-app (TH THB / US USD)', packs: appPacks }
  ].filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, message: msg, packCount: c.packs.length }))
  const notes = [
    'Main: official NetEase GamesClub top-up ' + ACERACER_TOPUP_URL + ' (live products API). USD = product.price; base = pay_yuanbao; bonus = activitys marketing_free_amount (alpha2=TH) + free_yuanbao.',
    'The official store sells Ace Racer only in USD/TWD/JPY/KRW/VND (no THB, no local_price). THB = App Store TH (same NetEase app ' + ACERACER_APP_ID + ') matched by exact pack name; otherwise null. No FX conversion.'
  ]
  notes.push(APPSTORE_FULL_IAP_NOTE)
  if (!th.rows) notes.push('App Store TH: ' + th.reason)
  if (!us.rows) notes.push('App Store US: ' + us.reason)
  return ({
    game: { id: ACERACER_APP_ID, slug: ACERACER_SLUG, name: 'Ace Racer', itemName: 'Tokens', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: ACERACER_TOPUP_URL,
    sources: { products: ACERACER_PRODUCTS_API_URL, bonus: ACERACER_ACTIVITYS_API_URL, thb: ACERACER_APPSTORE_TH, usd: ACERACER_PRODUCTS_API_URL, appstore_us: ACERACER_APPSTORE_US },
    notes
  } as unknown) as RovPacksResponse
}
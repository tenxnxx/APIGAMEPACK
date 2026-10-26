import type { RovPacksResponse } from '../types/rov'
import { parseAppStoreIapRows as parseRaw, type IapRow, type ArchitectPack } from './architect-packs.service'

/**
 * BLEACH mobile games. THB = official Apple App Store TH IAP list (main upstream, 502 if unavailable).
 * USD = official Apple App Store USD storefronts (US / KH / LA). No FX conversion, no resellers.
 */
export type BleachGameConfig = {
  slug: string
  name: string
  appId: number
  publisher: string
  itemName: string
  usd: Array<[string, string]>
  extraNotes: string[]
}
const as = (cc: string, id: number, en = false) => `https://apps.apple.com/${cc}/app/id${id}${en ? '?l=en' : ''}`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export const BLEACH_GAMES: Record<string, BleachGameConfig> = {
  'bleach-brave-souls': {
    slug: 'bleach-brave-souls', name: 'BLEACH: Brave Souls', appId: 1003168863, publisher: 'KLab Inc.', itemName: 'Spirit Orbs',
    usd: [['us', as('us', 1003168863)]],
    extraNotes: ['KLab has no official web top-up store; only in-app purchases.']
  },
  'bleach-soul-resonance': {
    slug: 'bleach-soul-resonance', name: 'BLEACH: Soul Resonance', appId: 6745081346, publisher: 'Nuverse Pte. Ltd. (SEA build)', itemName: 'Premium Spiritual Jade',
    usd: [['kh', as('kh', 6745081346, true)], ['la', as('la', 6745081346, true)], ['us-crunchyroll-build', as('us', 6751220183)]],
    extraNotes: [
      'SEA/TH build (id 6745081346) is not on App Store US; USD from the same app on KH/LA storefronts (USD). "us-crunchyroll-build" = US version by Crunchyroll Games (id 6751220183), a different build; only exact-name matches are used.',
      'Official web top-up payment.playbleachsr.com (MobaPay api/env_info) lists only FR/DE/IT/ES/NL (EUR) and RU (RUB); api/app_shop for TH/US returns "App is closed" -> no official web THB/USD.'
    ]
  },
  'bleach-mirrors-high': {
    slug: 'bleach-mirrors-high', name: 'BLEACH Mirrors High', appId: 6758332966, publisher: 'Bandai Namco Entertainment', itemName: 'Item',
    usd: [['us', as('us', 6758332966)]],
    extraNotes: ['No official web top-up store found; only in-app purchases.']
  }
}
export const BLEACH_ALIASES: Record<string, string> = {
  bleach: 'bleach-brave-souls', 'bleach-bs': 'bleach-brave-souls', 'brave-souls': 'bleach-brave-souls',
  'bleach-sr': 'bleach-soul-resonance', 'soul-resonance': 'bleach-soul-resonance',
  'bleach-mh': 'bleach-mirrors-high', 'mirrors-high': 'bleach-mirrors-high'
}
export function resolveBleachGame(slug: string): BleachGameConfig | undefined {
  const s = slug.toLowerCase()
  return BLEACH_GAMES[s] ?? BLEACH_GAMES[BLEACH_ALIASES[s] ?? '']
}

export class BleachUpstreamUnavailableError extends Error {
  constructor(message = 'App Store TH unavailable') { super(message); this.name = 'BleachUpstreamUnavailableError' }
}
export class BleachInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid App Store TH response') { super(message); this.name = 'BleachInvalidUpstreamResponseError' }
}

/** Base currency amount from the pack name (Spirit Orbs / Premium Spiritual Jade); null = item pack. */
export function bleachAmount(name: string): number | null {
  const a = name.match(/^([\d,]+)\s*Spirit Orbs?$/i) ?? name.match(/Premium Spiritual Jade\s*[\u00D7xX*]\s*([\d,]+)/i)
  return a ? Number(a[1].replace(/,/g, '')) : null
}
export function parseBleachIap(html: string, cur: 'THB' | 'USD'): IapRow[] {
  return parseRaw(html, cur).map((r) => ({ ...r, amount: bleachAmount(r.name) }))
}
const key = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim()

async function fetchIap(url: string, cur: 'THB' | 'USD', lang: string, signal?: AbortSignal) {
  try {
    const r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, 'Accept-Language': lang, Accept: 'text/html' } })
    const text = await r.text()
    if (r.status === 404) return { rows: null as IapRow[] | null, reason: 'Not listed on this storefront (HTTP 404)', status: 404 }
    if (r.status !== 200) return { rows: null, reason: `App Store HTTP ${r.status}`, status: r.status }
    const rows = parseBleachIap(text, cur)
    return rows.length ? { rows, status: 200 } : { rows: null, reason: 'No IAP rows on App Store page', status: 200 }
  } catch (e) {
    return { rows: null, reason: 'App Store fetch failed: ' + (e instanceof Error ? e.message : String(e)), status: 0 }
  }
}

export async function fetchBleachPacks(slug: string, options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const g = resolveBleachGame(slug)
  if (g?.slug === 'bleach-soul-resonance') return fetchBleachSoulResonancePacks(options)
  if (!g) throw new BleachInvalidUpstreamResponseError('Unknown BLEACH game')
  const thUrl = as('th', g.appId)
  const [th, usdRes] = await Promise.all([
    fetchIap(thUrl, 'THB', 'th-TH,th;q=0.9', options?.signal),
    Promise.all(g.usd.map(([sf, url]) => fetchIap(url, 'USD', 'en-US,en;q=0.9', options?.signal).then((r) => [sf, r] as const)))
  ])
  if (!th.rows) {
    if (th.status === 200) throw new BleachInvalidUpstreamResponseError(th.reason)
    throw new BleachUpstreamUnavailableError(th.reason)
  }
  const usd: IapRow[] = []
  const usdReasons: string[] = []
  for (const [sf, r] of usdRes) {
    if (!r.rows) { usdReasons.push(sf.toUpperCase() + ': ' + r.reason); continue }
    for (const row of r.rows) if (!usd.some((x) => key(x.name) === key(row.name))) usd.push({ ...row, storefront: sf })
  }
  const names: IapRow[] = [...th.rows]
  for (const r of usd) if (!names.some((x) => key(x.name) === key(r.name))) names.push(r)

  const packs = names.map((r, i) => {
    const t = th.rows!.find((x) => key(x.name) === key(r.name))
    const u = usd.find((x) => key(x.name) === key(r.name))
    const amt = r.amount
    const p = {
      id: i + 1, name: r.name,
      baseItemAmount: amt, bonusItemAmount: amt !== null ? 0 : null, totalItemAmount: amt,
      bonus_available: amt !== null, bonus_source: amt !== null ? 'apple-app-store (no bonus shown)' : null,
      item_pack: amt === null,
      store_price: null, store_currency: null,
      price_thb: t ? t.price : null, price_thb_source: t ? 'apple-app-store-th' : null,
      price_usd: u ? u.price : null, price_usd_source: u ? `apple-app-store-${u.storefront}` : null,
      price: t ? t.price : u ? u.price : 0, currency: t ? 'THB' : u ? 'USD' : ''
    } as unknown as ArchitectPack
    if (!t) p.price_thb_null_reason = 'Same pack not in App Store TH IAP list (Apple web shows top 10 only); no official web THB store'
    if (!u) p.price_usd_null_reason = usd.length ? 'Same pack not in App Store USD storefront IAP lists (top 10 only)' + (usdReasons.length ? ' [' + usdReasons.join('; ') + ']' : '') : usdReasons.join('; ') || 'unavailable'
    ;(p as any).prices = { THB: p.price_thb, USD: p.price_usd }
    return p
  })
  const categories = [{ id: 1, name: `App Store (iOS IAP: TH THB / ${g.usd.map((x) => x[0].toUpperCase()).join('-')} USD)`, packs, status: 0, message: 'Live (no fallback catalog)', packCount: packs.length }]
  const notes = [
    `Publisher: ${g.publisher}. Main: official Apple App Store TH IAP list (live, real THB). USD from official App Store USD storefronts. No FX conversion; null + *_null_reason when no match.`,
    'Apple web shows only the top 10 IAP items per storefront, so some packs exist in only one currency.',
    ...g.extraNotes
  ]
  if (usdReasons.length) notes.push('USD storefronts: ' + usdReasons.join('; '))
  return ({
    game: { id: g.appId, slug: g.slug, name: g.name, itemName: g.itemName, itemIcon: '' },
    categories,
    summary: { categoryCount: 1, packCount: packs.length },
    fetchedAt: new Date().toISOString(),
    source: thUrl,
    sources: { thb: thUrl, usd: g.usd.map((x) => x[1]).join(' , ') },
    notes
  } as unknown) as RovPacksResponse
}
// ---------------- BLEACH: Soul Resonance official Nuverse web shop (primary) ----------------
export const BLEACH_SR_WEBSHOP_AID = 389369
export const BLEACH_SR_WEBSHOP_PAGE = `https://pay.nvsgames.com/Topup/${BLEACH_SR_WEBSHOP_AID}`
export const bleachSrWebshopApi = (country: string) => `https://pay.nvsgames.com/web/payment/app/${BLEACH_SR_WEBSHOP_AID}/country/${country}/all_goods_detail`
type NvsGood = {
  goods_type: number; product_name: string; local_product_name?: string; price: number; currency_type: string; product_id: string
  price_desc?: string; coins?: number; goods_desc?: string; image_url?: string; channels?: string[]
  firstsave_details?: { present_coin_num?: number; present_product_desc?: string } | null
  uptopresent_details?: { present_coin_num?: number; present_product_desc?: string } | null
}
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()

async function fetchNvsGoods(country: string, signal?: AbortSignal): Promise<NvsGood[]> {
  let r: Response
  try {
    r = await fetch(bleachSrWebshopApi(country), {
      method: 'POST', signal: signal ?? AbortSignal.timeout(20_000),
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Origin: 'https://pay.nvsgames.com', Referer: BLEACH_SR_WEBSHOP_PAGE },
      body: JSON.stringify({ aid: BLEACH_SR_WEBSHOP_AID, country })
    })
  } catch (e) {
    throw new BleachUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!r.ok) throw new BleachUpstreamUnavailableError('HTTP ' + r.status)
  let j: any
  try { j = await r.json() } catch { throw new BleachInvalidUpstreamResponseError('Non-JSON web shop response') }
  const goods = [...(j?.data?.activity ?? []), ...(j?.data?.normal ?? [])] as NvsGood[]
  if (j?.code !== 0 || !goods.length) throw new BleachInvalidUpstreamResponseError('Web shop: ' + (j?.message ?? 'no goods'))
  return goods
}

export async function fetchBleachSoulResonancePacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const g = BLEACH_GAMES['bleach-soul-resonance']
  const goods = await fetchNvsGoods('TH', options?.signal)
  const thUrl = as('th', g.appId)
  const [th, usdRes] = await Promise.all([
    fetchIap(thUrl, 'THB', 'th-TH,th;q=0.9', options?.signal),
    Promise.all(g.usd.map(([sf, url]) => fetchIap(url, 'USD', 'en-US,en;q=0.9', options?.signal).then((r) => [sf, r] as const)))
  ])
  const usd: IapRow[] = []
  const usdReasons: string[] = []
  for (const [sf, r] of usdRes) {
    if (!r.rows) { usdReasons.push(sf.toUpperCase() + ': ' + r.reason); continue }
    for (const row of r.rows) if (!usd.some((x) => key(x.name) === key(row.name))) usd.push({ ...row, storefront: sf })
  }
  const usdFor = (name: string) => usd.find((x) => key(x.name) === key(name))
  const usdNull = 'Official Nuverse web shop has no USD region (TH/SG/MY/PH/ID only; US/KH/LA "goods not found"); App Store USD storefronts (KH/LA/US-Crunchyroll) show top 10 only and this pack is not among them'

  const webPacks = goods.map((p, i) => {
    const isCur = p.goods_type === 2 && typeof p.coins === 'number'
    const base = isCur ? (bleachAmount(p.product_name) ?? p.coins!) : null
    const bonus = isCur ? Number(p.uptopresent_details?.present_coin_num ?? 0) : null
    const first = p.firstsave_details?.present_coin_num ? Number(p.firstsave_details.present_coin_num) : 0
    const u = usdFor(p.product_name)
    const price = p.price / 100
    const pack = {
      id: i + 1, name: p.local_product_name || p.product_name, product_id: p.product_id,
      baseItemAmount: base, bonusItemAmount: bonus, totalItemAmount: base !== null ? base + (bonus ?? 0) : null,
      first_purchase_bonus: isCur ? first : null,
      bonus_available: isCur, bonus_source: isCur ? 'nvsgames-official-webshop (uptopresent/firstsave details)' : null,
      item_pack: !isCur,
      description: p.goods_desc ? stripHtml(p.goods_desc) : '',
      image_url: p.image_url, channels: p.channels,
      store_price: price, store_currency: p.currency_type,
      price_thb: p.currency_type === 'THB' ? price : null, price_thb_source: p.currency_type === 'THB' ? 'nvsgames-official-webshop-th' : null,
      price_usd: u ? u.price : null, price_usd_source: u ? `apple-app-store-${u.storefront}` : null,
      price: price, currency: p.currency_type
    } as any
    if (!u) pack.price_usd_null_reason = usdNull
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })
  const appRows: IapRow[] = [...(th.rows ?? [])]
  for (const r of usd) if (!appRows.some((x) => key(x.name) === key(r.name))) appRows.push(r)
  const appPacks = appRows.map((r, i) => {
    const t = th.rows?.find((x) => key(x.name) === key(r.name))
    const u = usdFor(r.name)
    const w = goods.find((x) => key(x.product_name) === key(r.name))
    const pack = {
      id: 1001 + i, name: r.name,
      baseItemAmount: r.amount, bonusItemAmount: r.amount !== null ? 0 : null, totalItemAmount: r.amount,
      bonus_available: r.amount !== null, bonus_source: r.amount !== null ? 'apple-app-store (no bonus shown)' : null,
      item_pack: r.amount === null,
      description: w?.goods_desc ? stripHtml(w.goods_desc) : '',
      price_thb: t ? t.price : null, price_thb_source: t ? 'apple-app-store-th' : null,
      price_usd: u ? u.price : null, price_usd_source: u ? `apple-app-store-${u.storefront}` : null,
      price: t ? t.price : u ? u.price : 0, currency: t ? 'THB' : u ? 'USD' : ''
    } as any
    if (!t) pack.price_thb_null_reason = th.rows ? 'Not in App Store TH IAP list (Apple web shows top 10 only)' : th.reason
    if (!u) pack.price_usd_null_reason = 'Not in App Store USD storefront IAP lists (top 10 only)'
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })
  const msg = 'Live (no fallback catalog)'
  const categories = [
    { id: 1, name: 'Official Web Shop (Nuverse pay.nvsgames.com, TH THB)', packs: webPacks },
    { id: 2, name: 'App Store (iOS IAP: TH THB / KH-LA USD)', packs: appPacks }
  ].filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, message: msg, packCount: c.packs.length }))
  const notes = [
    'Main: official Nuverse SEA web top-up pay.nvsgames.com/Topup/389369 (linked as the Top-up button on www.bleach-soulresonance.com/th-TH), live API all_goods_detail country=TH; price in THB (API satang /100). No FX conversion.',
    'Spiritual Jade packs: base = coins; bonus = uptopresent_details.present_coin_num (0 in current data); first_purchase_bonus = firstsave_details.present_coin_num (null in current data -> 0). Item packs show contents from goods_desc.',
    'USD: official web shop has no USD region (only TH/SG/MY/PH/ID; US/KH/LA/VN return "goods not found"). USD only where the same pack name appears in App Store KH/LA (same app 6745081346, USD) or US Crunchyroll build 6751220183; else null + reason.',
    'payment.playbleachsr.com (MobaPay, global/Crunchyroll) lists only EUR/RUB regions; TH/US "App is closed".'
  ]
  if (!th.rows) notes.push('App Store TH: ' + th.reason)
  if (usdReasons.length) notes.push('USD storefronts: ' + usdReasons.join('; '))
  return ({
    game: { id: g.appId, slug: g.slug, name: g.name, itemName: g.itemName, itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: BLEACH_SR_WEBSHOP_PAGE,
    sources: { webshop: bleachSrWebshopApi('TH'), thb: BLEACH_SR_WEBSHOP_PAGE, usd: g.usd.map((x) => x[1]).join(' , '), appstore_th: thUrl },
    notes
  } as unknown) as RovPacksResponse
}
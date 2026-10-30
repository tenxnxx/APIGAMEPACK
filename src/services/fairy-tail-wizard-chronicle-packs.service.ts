import type { RovPacksResponse } from '../types/rov'

/**
 * FAIRY TAIL Wizard Chronicle - developed and self-published worldwide (incl. Thailand/SEA) by GOODROID, Inc. (Japan);
 * there is no separate Thai/SEA publisher. Official first-party top-up: the GOODROID "FAIRY TAIL Wizard Chronicle Web Shop"
 * on Xsolla (madochro-global.xsolla.site, Xsolla project 290404, merchant 830444). Live catalog = Xsolla Store public API
 * (store.xsolla.com/api/v2/project/290404/items/virtual_items): country=TH returns real THB prices, country=US returns the
 * shop's own USD prices (KH/LA/MM tried if US fails). Contents / limits come from the official item descriptions
 * ("▼Contents ・Paid Gems: x300 ・[Bonus] ...") and Xsolla purchase limits. Gems: base = Paid Gems, bonus = [Bonus] Free Gems.
 * Passes / cards that are sold in-app only (Battle Pass, Monthly Support Card, ...) come from Apple's App Store catalog
 * (app 6746717958, offerName jp.co.goodroid.fairy.product.NNN): TH storefront THB + US storefront USD (KH/LA/MM fallback).
 * Free gift codes are skipped. No FX, no resellers, no hardcoded prices.
 */
export const FTWC_SLUG = 'fairy-tail-wizard-chronicle'
export const FTWC_APPLE_ID = 6746717958
export const FTWC_XSOLLA_PROJECT = 290404
export const FTWC_SHOP_URL = 'https://madochro-global.xsolla.site/'
export const FTWC_APPSTORE_TH_URL = `https://apps.apple.com/th/app/fairy-tail-wizard-chronicle/id${FTWC_APPLE_ID}`
export const FTWC_USD_FALLBACK = ['kh', 'la', 'mm'] as const
export const ftwcItemsUrl = (country: string, offset = 0) =>
  `https://store.xsolla.com/api/v2/project/${FTWC_XSOLLA_PROJECT}/items/virtual_items?limit=50&offset=${offset}&country=${country}&locale=en`
/** Permanent in-app passes / cards (Apple IAP ids; prices are always read live). Event mission passes rotate and are not listed. */
export const FTWC_APPLE_PASS_IDS = [
  '6755384846', '6755384850', '6755384824', '6755384881', '6755384942', // Battle / Bond Gacha / Awakening / Battle Rush / Winemaking Pass
  '6755382271', '6755382727', '6755382128', '6755382104', '6755382245', '6755382171', '6755381968' // cards
] as const
export const ftwcAppleUrl = (cc: string, ids: readonly string[] = FTWC_APPLE_PASS_IDS) =>
  `https://apps.apple.com/api/apps/v1/catalog/${cc}/in-apps?ids=${ids.join(',')}&platform=iphone${cc === 'us' ? '&l=en-US' : ''}`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const NO_TH = 'The official GOODROID web shop (Xsolla, locale th not offered) and App Store IAP listings publish English text only; no official Thai description exists'

export class FairyTailUpstreamUnavailableError extends Error {
  constructor(message = 'FAIRY TAIL Wizard Chronicle official web shop upstream unavailable') { super(message); this.name = 'FairyTailUpstreamUnavailableError' }
}
export class FairyTailInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid FAIRY TAIL Wizard Chronicle web shop response') { super(message); this.name = 'FairyTailInvalidUpstreamResponseError' }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const int = (s: string) => Number(s.replace(/,/g, ''))
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")

export type FtwcContent = { item: string; quantity: number; bonus: boolean }
export type FtwcParsed = { contents: FtwcContent[]; notes: string[]; paidGems: number | null; freeGems: number }
/** "▼Contents\n・Paid Gems: x300\n・[Bonus] Monthly Miles: x300\n※note" -> structured contents. */
export function parseFtwcDescription(desc: unknown): FtwcParsed {
  const contents: FtwcContent[] = []; const notes: string[] = []
  let paidGems: number | null = null; let freeGems = 0
  for (const raw of decode(str(desc)).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || /^▼/.test(line)) continue
    if (/^[※*]/.test(line) && !/[x×]\s*[\d,]+\s*$/.test(line)) { notes.push(line.replace(/^[※*]\s*/, '')); continue }
    const m = /^[・\-*•]?\s*(\[Bonus\]\s*)?(.+?)\s*:?\s*[x×]\s*([\d,]+)\s*$/i.exec(line)
    if (!m) { const t = line.replace(/^[・\-*•]\s*/, ''); if (t) contents.push({ item: t, quantity: 1, bonus: false }); continue }
    const item = m[2].replace(/:\s*$/, '').trim(); const quantity = int(m[3]); const bonus = !!m[1]
    contents.push({ item, quantity, bonus })
    if (/^paid gems$/i.test(item)) paidGems = (paidGems ?? 0) + quantity
    else if (/^free gems$/i.test(item)) freeGems += quantity
  }
  return { contents, notes, paidGems, freeGems }
}

export type FtwcItem = {
  sku: string; item_id: number; name: string; description: string; image: string | null; price: number | null; currency: string | null
  list_price: number | null; groups: string[]; limit_total: number | null; limit_reset: string | null; can_be_bought: boolean
  periods: { from: string | null; until: string | null }[]
}
export function parseFtwcItems(json: any): { items: FtwcItem[]; hasMore: boolean } {
  if (!json || typeof json !== 'object' || !Array.isArray(json.items)) throw new FairyTailInvalidUpstreamResponseError('Unexpected Xsolla items payload')
  const items: FtwcItem[] = []
  for (const i of json.items) {
    if (!i || typeof i !== 'object' || !str(i.sku) || !str(i.name)) continue
    const amt = i.price ? Number(i.price.amount) : NaN; const list = i.price ? Number(i.price.amount_without_discount) : NaN
    const pu = i.limits?.per_user
    items.push({
      sku: i.sku, item_id: i.item_id, name: decode(i.name).replace(/\s+/g, ' ').trim(), description: str(i.description), image: str(i.image_url) || null,
      price: Number.isFinite(amt) && amt > 0 ? amt : null, currency: i.price ? str(i.price.currency) || null : null,
      list_price: Number.isFinite(list) && list > 0 ? list : null, groups: Array.isArray(i.groups) ? i.groups.map((g: any) => str(g?.external_id)).filter(Boolean) : [],
      limit_total: pu && typeof pu.total === 'number' ? pu.total : null, limit_reset: pu?.recurrent_schedule?.interval_type ?? null,
      can_be_bought: i.can_be_bought !== false,
      periods: Array.isArray(i.periods) ? i.periods.map((p: any) => ({ from: p?.date_from ?? null, until: p?.date_until ?? null })) : []
    })
  }
  return { items, hasMore: json.has_more === true }
}

async function getJson(url: string, signal?: AbortSignal, apple = false): Promise<any> {
  let r: Response
  try {
    r = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(20_000),
      headers: { 'User-Agent': UA, Accept: 'application/json', ...(apple ? { Origin: 'https://apps.apple.com', Referer: 'https://apps.apple.com/' } : { Referer: FTWC_SHOP_URL }) }
    })
  } catch (e) { throw new FairyTailUpstreamUnavailableError(e instanceof Error ? e.message : 'network error') }
  if (!r.ok) throw new FairyTailUpstreamUnavailableError('HTTP ' + r.status)
  try { return await r.json() } catch { throw new FairyTailInvalidUpstreamResponseError('Non-JSON response') }
}
async function shop(country: string, signal?: AbortSignal): Promise<FtwcItem[]> {
  const out: FtwcItem[] = []
  for (let offset = 0, page = 0; page < 20; page++) {
    const { items, hasMore } = parseFtwcItems(await getJson(ftwcItemsUrl(country, offset), signal))
    out.push(...items); offset += 50
    if (!hasMore || !items.length) break
  }
  return out
}
type AppleRow = { id: string; name: string; offerName: string | null; description: string | null; price: number; currency: string }
export function parseAppleInApps(json: any): AppleRow[] {
  if (!json || !Array.isArray(json.data)) throw new FairyTailInvalidUpstreamResponseError('Unexpected App Store in-apps payload')
  const rows: AppleRow[] = []
  for (const d of json.data) {
    const a = d?.attributes; const o = Array.isArray(a?.offers) ? a.offers[0] : null
    if (!a || !o || typeof o.price !== 'number' || !str(a.name)) continue
    rows.push({ id: String(d.id), name: str(a.name).trim(), offerName: str(a.offerName) || null, description: str(a.description?.standard).trim() || null, price: o.price, currency: str(o.currencyCode) })
  }
  return rows
}
const settle = async <T>(p: Promise<T>): Promise<{ ok: true; v: T } | { ok: false; reason: string }> => {
  try { return { ok: true, v: await p } } catch (e) { return { ok: false, reason: e instanceof Error ? e.message : String(e) } }
}

const GEMS_RE = /^[\d,]+\s+Gems$/i
const PASS_RE = /\b(pass|card)\b/i
const limitText = (i: FtwcItem) => i.limit_total === null ? null : `${i.limit_total} per account${i.limit_reset ? ` (resets ${i.limit_reset})` : ''}`

export async function fetchFairyTailWizardChroniclePacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const thItems = await shop('TH', signal)
  const paid = thItems.filter((i) => i.price !== null && i.currency === 'THB' && i.can_be_bought)
  if (!paid.length) throw new FairyTailInvalidUpstreamResponseError('No THB items in the official web shop')
  const skipped = thItems.filter((i) => !paid.includes(i)).map((i) => `${i.name} (${i.price === null ? 'free gift / redeem code' : i.currency})`)

  // USD: same official web shop, US storefront (KH/LA/MM if US is unavailable).
  let usd: { cc: string; map: Map<string, FtwcItem> } | null = null; const usdTried: string[] = []
  for (const cc of ['US', ...FTWC_USD_FALLBACK.map((c) => c.toUpperCase())]) {
    const r = await settle(shop(cc, signal))
    if (r.ok && r.v.some((i) => i.currency === 'USD' && i.price !== null)) { usd = { cc, map: new Map(r.v.filter((i) => i.currency === 'USD').map((i) => [i.sku, i])) }; break }
    usdTried.push(`${cc}: ${r.ok ? 'no USD prices' : r.reason}`)
  }

  const [appleTh, ...appleUsdTries] = await Promise.all([settle(getJson(ftwcAppleUrl('th'), signal, true).then(parseAppleInApps)), settle(getJson(ftwcAppleUrl('us'), signal, true).then(parseAppleInApps))])
  let appleUsd: { cc: string; rows: AppleRow[] } | null = null; const appleUsdTried: string[] = []
  const firstUs = appleUsdTries[0]
  if (firstUs.ok && firstUs.v.some((r) => r.currency === 'USD')) appleUsd = { cc: 'us', rows: firstUs.v }
  else {
    appleUsdTried.push(`us: ${firstUs.ok ? 'no USD rows' : firstUs.reason}`)
    for (const cc of FTWC_USD_FALLBACK) {
      const r = await settle(getJson(ftwcAppleUrl(cc), signal, true).then(parseAppleInApps))
      if (r.ok && r.v.some((x) => x.currency === 'USD')) { appleUsd = { cc, rows: r.v }; break }
      appleUsdTried.push(`${cc}: ${r.ok ? 'no USD rows' : r.reason}`)
    }
  }

  const shopPack = (i: FtwcItem) => {
    const p = parseFtwcDescription(i.description)
    const gems = GEMS_RE.test(i.name); const pass = PASS_RE.test(i.name)
    const u = usd?.map.get(i.sku)
    const base = p.paidGems ?? (p.freeGems > 0 ? 0 : null); const bonus = base === null ? null : p.freeGems
    const descEn = i.description ? decode(i.description).trim() : null
    const pack: any = {
      id: i.item_id, name: i.name, product_id: i.sku, store: 'goodroid-official-webshop-xsolla',
      kind: gems ? 'gems' : pass ? 'pass' : 'bundle', item_pack: !gems, ...(pass ? { pack_type: 'growth-pass' } : {}),
      name_en: i.name, name_th: null, name_th_null_reason: NO_TH,
      description: descEn, description_en: descEn, description_en_source: descEn ? 'goodroid-official-webshop (Xsolla item description)' : null,
      ...(descEn ? {} : { description_en_null_reason: 'No description on the official web shop item' }),
      description_th: null, description_th_null_reason: NO_TH,
      contents: p.contents, ...(p.notes.length ? { contents_notes: p.notes } : {}),
      baseItemAmount: base, bonusItemAmount: bonus, totalItemAmount: base === null ? null : base + (bonus ?? 0), item_name: 'Gems',
      ...(base === null ? { base_null_reason: 'No "Paid Gems" line in the official contents', bonus_null_reason: 'No gem amount in the official contents', total_null_reason: 'No gem amount in the official contents' } : {}),
      purchase_limit: limitText(i), limit_reset: i.limit_reset, image_url: i.image, groups: i.groups,
      ...(i.periods.length ? { available_periods: i.periods } : {}),
      original_price_thb: i.list_price !== null && i.list_price !== i.price ? i.list_price : null,
      price_thb: i.price, price_thb_source: `goodroid-official-webshop (Xsolla project ${FTWC_XSOLLA_PROJECT}, country=TH, sku ${i.sku})`,
      price_usd: u?.price ?? null, price_usd_source: u ? `goodroid-official-webshop (Xsolla country=${usd!.cc}, USD, sku ${i.sku})` : null,
      price: i.price, currency: 'THB'
    }
    if (!u) pack.price_usd_null_reason = usd ? `sku ${i.sku} is not sold on the official web shop's ${usd.cc} (USD) storefront` : `Official web shop USD storefronts unavailable (${usdTried.join('; ')})`
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  }
  const shopPacks = paid.map(shopPack)

  const applePacks = appleTh.ok ? appleTh.v.filter((r) => r.currency === 'THB').map((r) => {
    const u = appleUsd?.rows.find((x) => (r.offerName && x.offerName === r.offerName) || x.id === r.id)
    const desc = r.description && r.description !== r.name ? r.description : null
    const pack: any = {
      id: Number(r.id), name: r.name, product_id: r.offerName ?? r.id, apple_item_id: r.id, store: 'apple-app-store', kind: 'pass', item_pack: true,
      pack_type: /card/i.test(r.name) ? 'card' : 'pass',
      name_en: r.name, name_th: null, name_th_null_reason: NO_TH,
      description: desc ?? r.name, description_en: desc,
      ...(desc ? { description_en_source: 'apple-app-store' } : { description_en_null_reason: 'GOODROID publishes no contents for this in-app pass/card: the App Store description is only the product name, and it is not sold on the official web shop' }),
      description_th: null, description_th_null_reason: NO_TH,
      contents: null, contents_null_reason: 'No official contents list (App Store text = product name only; not on the official web shop)',
      baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null,
      base_null_reason: 'Pass/card: unlocks in-game rewards, not a fixed gem amount', bonus_null_reason: 'Pass/card: no gem bonus listed', total_null_reason: 'Pass/card: not a gem amount',
      availability_note: 'Sold in-app only (App Store / Google Play), not on the official web shop',
      price_thb: r.price, price_thb_source: `apple-app-store-th (item ${r.id}, offerName ${r.offerName})`,
      price_usd: u && u.currency === 'USD' ? u.price : null, price_usd_source: u ? `apple-app-store-${appleUsd!.cc} (USD storefront, offerName ${u.offerName})` : null,
      price: r.price, currency: 'THB'
    }
    if (pack.price_usd === null) pack.price_usd_null_reason = appleUsd ? `Not on the App Store ${appleUsd.cc.toUpperCase()} storefront` : `App Store USD storefronts unavailable (${appleUsdTried.join('; ')})`
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  }) : []

  const sortP = (a: any, b: any) => a.price_thb - b.price_thb || String(a.product_id).localeCompare(String(b.product_id))
  const groups: { name: string; packs: any[] }[] = []
  const add = (name: string, packs: any[]) => { if (packs.length) groups.push({ name, packs: packs.sort(sortP) }) }
  add('Gems (Official GOODROID Web Shop)', shopPacks.filter((p) => p.kind === 'gems'))
  add('Passes & Cards (Official Web Shop + App Store in-app)', [...shopPacks.filter((p) => p.kind === 'pass'), ...applePacks])
  add('Limited Offers (Official GOODROID Web Shop)', shopPacks.filter((p) => p.kind === 'bundle' && p.groups.includes('offer1')))
  add('Packs (Official GOODROID Web Shop)', shopPacks.filter((p) => p.kind === 'bundle' && !p.groups.includes('offer1')))
  const categories = groups.map((g, k) => ({ id: k + 1, name: g.name, packs: g.packs, status: 0, message: 'Live (no fallback catalog)', packCount: g.packs.length }))
  const notes = [
    `Publisher: GOODROID, Inc. (Japan) develops and self-publishes FAIRY TAIL Wizard Chronicle worldwide, Thailand included; no separate Thai/SEA publisher. Main: official GOODROID Web Shop ${FTWC_SHOP_URL} (Xsolla project ${FTWC_XSOLLA_PROJECT}), live API ${ftwcItemsUrl('TH')}. THB from country=TH, USD from the same shop's country=${usd?.cc ?? 'US'} storefront. No FX conversion, no resellers.`,
    'Gems: base = Paid Gems, bonus = [Bonus] Free Gems from the official contents; other [Bonus] items (Monthly Miles, tickets, characters) are listed in contents. Purchase limits come from Xsolla per-user limits.',
    `Passes & cards sold only in-app (Battle Pass, Bond Gacha / Awakening / Battle Rush / Winemaking Pass, Monthly / Permanent Support, No Ads, Idle Rewards, Winemaking, Book Hunt, VS Dragon Card): App Store TH THB + App Store ${appleUsd?.cc.toUpperCase() ?? 'US'} USD by Apple item id (${ftwcAppleUrl('th')}). Rotating event mission passes are not listed. Their contents are not published by GOODROID, so contents are null with a reason.`,
    'No official Thai text: description_th / name_th are null with a reason.',
    ...(skipped.length ? [`Skipped (no THB price): ${skipped.join(', ')}`] : [])
  ]
  if (!appleTh.ok) notes.push(`App Store TH passes unavailable: ${appleTh.reason}`)
  if (!usd) notes.push(`Official web shop USD unavailable: ${usdTried.join('; ')}`)
  return ({
    game: { id: FTWC_APPLE_ID, slug: FTWC_SLUG, name: 'FAIRY TAIL Wizard Chronicle', itemName: 'Gems' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packCount, 0) },
    fetchedAt: new Date().toISOString(),
    source: ftwcItemsUrl('TH'),
    sources: { thb: ftwcItemsUrl('TH'), usd: usd ? ftwcItemsUrl(usd.cc) : null, shop_page: FTWC_SHOP_URL, appstore_th: ftwcAppleUrl('th'), appstore_usd: appleUsd ? ftwcAppleUrl(appleUsd.cc) : null, appstore_page: FTWC_APPSTORE_TH_URL },
    notes
  } as unknown) as RovPacksResponse
}

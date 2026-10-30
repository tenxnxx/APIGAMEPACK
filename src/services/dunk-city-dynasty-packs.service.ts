import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, iapScope, iapNameKey, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'

/**
 * Dunk City Dynasty (NetEase) - official NetEase GamesClub top-up (pay.neteasegames.com, game code "dunkcitydynasty").
 * THB = official extra.local_price.TH.default (THB), USD = product.price (USD), both from the live products API.
 * Bonus / discounts = activitys (alpha2=TH). Contents come from NetEase's own goods_detail text (English only).
 * If a product has no official THB, the App Store TH price of the SAME product is used, matched by the Apple offerName
 * (com.netease.dunkcd.X <-> NetEase goodsid L33naxx2gb.3rd.X). Passes sold only in-app (Dual / Hooper / 20% Off
 * Premium Pass, Player Subscriptions) come from the App Store full IAP list: TH THB + US USD by Apple item id
 * (USD fallback KH/LA/MM). No FX, no resellers, no hardcoded prices.
 */
export const DCD_SLUG = 'dunk-city-dynasty'
export const DCD_APP_ID = 1555216030
export const DCD_TOPUP_URL = 'https://pay.neteasegames.com/dunkcitydynasty/topup'
export const DCD_PRODUCTS_API_URL = 'https://pay.neteasegames.com/gameclub/products/dunkcitydynasty?gc_client_version=1.13.55'
export const DCD_ACTIVITYS_API_URL =
  'https://pay.neteasegames.com/gameclub/products/dunkcitydynasty/activitys?gc_client_version=1.13.55&pay_method=gameclub_wallet&pay_type=NetEase+Credit_gameclub_wallet&alpha2=TH'
export const DCD_APPSTORE_TH = `https://apps.apple.com/th/app/id${DCD_APP_ID}`
export const DCD_USD_FALLBACK = ['kh', 'la', 'mm'] as const
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const NO_END = 2147483647
const NO_TH = 'NetEase publishes Dunk City Dynasty store text in English only (GamesClub has no Thai language entry); no official Thai text'

export class DunkCityUpstreamUnavailableError extends Error {
  constructor(message = 'Dunk City Dynasty NetEase GamesClub upstream unavailable') { super(message); this.name = 'DunkCityUpstreamUnavailableError' }
}
export class DunkCityInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Dunk City Dynasty NetEase GamesClub response') { super(message); this.name = 'DunkCityInvalidUpstreamResponseError' }
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/,/g, '')) : NaN
  return Number.isFinite(n) ? n : null
}
const strip = (s: unknown) => (typeof s === 'string' ? s.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : '')
const iso = (t: number | null) => (t !== null && t > 0 && t < NO_END ? new Date(t * 1000).toISOString() : null)
/** Apple offerName com.netease.dunkcd.X / NetEase goodsid L33naxx2gb.3rd.X -> X */
export const dcdKey = (id: string | null | undefined) => (id ?? '').replace(/^L33naxx2gb\.3rd\./i, '').replace(/^com\.netease\.dunc?kcd\./i, '').toLowerCase()

export type DcdKind = 'tokens' | 'first-topup' | 'pass' | 'bundle'
export function dcdKind(goodsid: string, name: string): DcdKind {
  const k = dcdKey(goodsid)
  if (/^\d+dqbonusa$/.test(k)) return 'first-topup'
  if (/^\d+dq$/.test(k)) return 'tokens'
  if (/bp|pass|yueka|zsk|subscri|vip|membership|access/i.test(k + ' ' + name)) return 'pass'
  return 'bundle'
}

export type DcdContent = { item: string; quantity: number | null; choices?: string[] }
/**
 * Official goods_detail -> contents. "Diamond*100,SuperStar Voucher*1" / "Superstar Voucher x8, Gold Coin x5,000, and
 * Uncommon Talent Material x50." / "Purchase to obtain [Gentleman] Set and a Star Player Choice Chest (...)".
 */
export function parseDcdContents(detail: string, tokens: number): DcdContent[] {
  const out: DcdContent[] = []
  if (tokens > 0) out.push({ item: 'Tokens', quantity: tokens })
  const choose = detail.match(/choose one of the following players:\s*(.+?)\.?$/i)
  const players = (t: string) => t.split(/,|\s+or\s+|\band\s+/i).map((x) => x.replace(/^\s*(?:and|or)\s+/i, '').trim()).filter(Boolean)
  if (choose) out.push({ item: 'Star Player (choose 1)', quantity: 1, choices: players(choose[1]) })
  const lead = detail.match(/^\s*Purchase to (?:receive|obtain)\s*(.*)$/i)
  if (lead && !/\bTokens\b/i.test(lead[1])) {
    let first = lead[1].split(/\.\s+(?=[A-Z])/)[0].replace(/\.$/, '')
    const paren = first.match(/\((?:you can )?choose one player from (.+)\)/i)
    first = first.replace(/\s*\([^)]*\)/g, '')
    for (const part of first.split(/,(?!\d{3})\s*(?:and\s+)?|\s+and\s+/i)) {
      const t = part.trim()
      if (!t) continue
      const m = t.match(/^(.+?)\s*(?:\*|\bx|×)\s*([\d,]+)$/i)
      out.push(m ? { item: m[1].trim(), quantity: num(m[2]) } : { item: t.replace(/^(?:a|an)\s+/i, ''), quantity: 1 })
    }
    if (paren && out.length) out[out.length - 1].choices = players(paren[1])
  }
  const bd = detail.match(/\+\s*([\d,]+)\s+Bonus Diamonds/i)
  if (bd) out.push({ item: 'Bonus Diamonds', quantity: num(bd[1]) })
  return out
}
/** Pass / membership perks: the official detail sentences after the first one ("Daily login grants 150 Diamonds, ..."). */
export function dcdBenefits(detail: string): string[] {
  return detail.split(/(?<=\.)\s+(?=[A-Z])/).map((x) => x.trim()).filter(Boolean)
}

export function dcdThb(extra: unknown): number | null {
  if (!extra || typeof extra !== 'object') return null
  let lp: any = (extra as any).local_price
  if (typeof lp === 'string') { try { lp = JSON.parse(lp) } catch { return null } }
  const d = lp?.TH?.default
  return d && d.currency === 'THB' ? num(d.price) : null
}

export type DcdProduct = {
  goodsid: string; name: string; detail: string; usd: number; thb: number | null; tokens: number; freeTokens: number
  image: string | null; effective: number | null; expires: number | null; perorder: number | null
}
export function parseDcdProducts(json: any, now: number): DcdProduct[] {
  if (json?.code !== '0000' || !Array.isArray(json?.data)) throw new DunkCityInvalidUpstreamResponseError('products: ' + (json?.msg ?? 'bad shape'))
  const seen = new Set<string>(); const out: DcdProduct[] = []
  for (const p of json.data as any[]) {
    if (typeof p?.goodsid !== 'string' || p.currency !== 'USD' || p.status !== 1 || seen.has(p.goodsid)) continue
    const eff = num(p.effective_time); const exp = num(p.expired_time)
    if ((exp !== null && exp < now) || (eff !== null && eff > now)) continue
    const usd = num(p.price)
    if (usd === null) continue
    seen.add(p.goodsid)
    const ml = p.multi_language?.default?.default ?? {}
    out.push({
      goodsid: p.goodsid, name: strip(ml.goodsinfo) || strip(p.goodsinfo), detail: strip(ml.goods_detail), usd, thb: dcdThb(p.extra),
      tokens: num(p.pay_yuanbao) ?? 0, freeTokens: num(p.free_yuanbao) ?? 0,
      image: ml.image_info?.normal ?? p.icon?.default?.default?.normal ?? null, effective: eff, expires: exp,
      perorder: num(p.purchase_limit?.perorder)
    })
  }
  return out
}

export type DcdActivity = { bonus: Map<string, number>; discounts: Map<string, { THB: number | null; USD: number | null; until: number | null }>; count: number }
export function parseDcdActivitys(json: any, now: number): DcdActivity | null {
  if (json?.code !== '0000' || !Array.isArray(json?.data?.list)) return null
  const out: DcdActivity = { bonus: new Map(), discounts: new Map(), count: 0 }
  for (const a of json.data.list) {
    if (typeof a?.goodsid !== 'string') continue
    if (a.alpha2 !== undefined && a.alpha2 !== 'all' && a.alpha2 !== 'TH') continue
    const eff = num(a.effective_time); const exp = num(a.expired_time)
    if ((exp !== null && exp < now) || (eff !== null && eff > now)) continue
    const t = String(a.activity_type ?? '0')
    if (t === '0' && typeof a.marketing_free_amount === 'number' && a.marketing_free_amount > 0) {
      out.bonus.set(a.goodsid, (out.bonus.get(a.goodsid) ?? 0) + a.marketing_free_amount); out.count++
    }
    if (t === '27' && a.after_discount_price_map && typeof a.after_discount_price_map === 'object') {
      out.discounts.set(a.goodsid, { THB: num(a.after_discount_price_map.THB), USD: num(a.after_discount_price_map.USD), until: exp }); out.count++
    }
  }
  return out
}

type IapList = { rows: AppStoreFullIapRow[] | null; cc: string; reason?: string }
async function iap(cc: string, signal?: AbortSignal): Promise<IapList> {
  try { return { rows: await fetchAppStoreFullIap(cc, String(DCD_APP_ID), cc === 'th' ? 'en-GB' : 'en-US', signal), cc } }
  catch (e) { return { rows: null, cc, reason: e instanceof Error ? e.message : String(e) } }
}
async function iapUsd(signal?: AbortSignal): Promise<IapList> {
  const tried: string[] = []
  for (const cc of ['us', ...DCD_USD_FALLBACK]) {
    const r = await iap(cc, signal)
    if (r.rows && r.rows.some((x) => x.currency === 'USD')) return r
    tried.push(`${cc.toUpperCase()}: ${r.reason ?? 'no USD prices'}`)
  }
  return { rows: null, cc: '', reason: tried.join('; ') }
}

export async function fetchDunkCityDynastyPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [prod, actRaw] = await Promise.all([
    getJson(DCD_PRODUCTS_API_URL, signal),
    getJson(DCD_ACTIVITYS_API_URL, signal).catch((e) => ({ __error: e instanceof Error ? e.message : String(e) }))
  ])
  const now = num(actRaw?.data?.server_ts) ?? Date.now() / 1000
  const products = parseDcdProducts(prod, now)
  if (!products.length) throw new DunkCityInvalidUpstreamResponseError('No active USD products')
  const act = parseDcdActivitys(actRaw, now)
  const actReason = 'Official activitys endpoint unavailable: ' + (actRaw?.__error ?? actRaw?.msg ?? 'bad shape')
  // Sequential: Apple rate-limits bursts.
  const th = await iap('th', signal)
  const us = await iapUsd(signal)
  const webKeys = new Set(products.map((p) => dcdKey(p.goodsid)))
  const webNames = new Set(products.map((p) => iapNameKey(p.name)))

  const webPacks = products.map((p) => {
    const kind = dcdKind(p.goodsid, p.name)
    const apple = p.thb === null ? th.rows?.find((r) => dcdKey(r.offerName) === dcdKey(p.goodsid)) : undefined
    const thb = p.thb ?? apple?.price ?? null
    const isCur = kind === 'tokens' || kind === 'first-topup'
    const gc = act ? (act.bonus.get(p.goodsid) ?? 0) : null
    // Bonus tokens: the official detail text decides. Plain packs say "+ N bonus Tokens" (= free_yuanbao);
    // first top-up packs give Bonus Diamonds (a different currency) instead, listed in contents.
    const saysBonusTokens = /bonus Tokens/i.test(p.detail) || /\d[\d,]*\s*free/i.test(p.name)
    const bonusTokens = isCur ? (saysBonusTokens ? p.freeTokens : 0) + (gc ?? 0) : p.tokens > 0 ? 0 : null
    const base = p.tokens > 0 ? p.tokens : null
    const d = act?.discounts.get(p.goodsid)
    const contents = parseDcdContents(p.detail || p.name, p.tokens)
    if (isCur && saysBonusTokens && p.freeTokens > 0) contents.splice(1, 0, { item: 'Bonus Tokens', quantity: p.freeTokens })
    const pack: any = {
      id: 0, name: p.name, product_id: p.goodsid, kind, item_pack: !isCur, store: 'netease-gameclub',
      ...(kind === 'pass' ? { pass_type: /bp|pass/i.test(dcdKey(p.goodsid) + p.name) ? 'battle-pass' : 'membership' } : {}),
      baseItemAmount: base, bonusItemAmount: base === null ? null : bonusTokens, totalItemAmount: base === null ? null : base + (bonusTokens ?? 0),
      bonus_breakdown: isCur ? { in_game_bonus_tokens: saysBonusTokens ? p.freeTokens : 0, gameclub_bonus_tokens: gc, bonus_diamonds: contents.find((c) => c.item === 'Bonus Diamonds')?.quantity ?? 0 } : null,
      bonus_source: isCur ? 'netease-gameclub products (goods_detail / free_yuanbao) + activitys (alpha2=TH)' : null,
      description: p.detail || p.name, description_en: p.detail || p.name, description_th: null, description_th_null_reason: NO_TH,
      name_en: p.name, name_th: null, name_th_null_reason: NO_TH,
      contents: contents.length ? contents : null, ...(kind === 'pass' ? { benefits: dcdBenefits(p.detail || p.name) } : {}), image_url: p.image,
      price_thb: thb,
      price_thb_source: p.thb !== null ? 'netease-gameclub-official (local_price TH)' : apple ? `apple-app-store-th (offerName ${apple.offerName}, item ${apple.id})` : null,
      price_usd: p.usd, price_usd_source: 'netease-gameclub-official',
      price: thb ?? p.usd, currency: thb !== null ? 'THB' : 'USD',
      discount_price_thb: d?.THB ?? null, discount_price_usd: d?.USD ?? null, discount_until: d ? iso(d.until) : null,
      purchase_limit: p.perorder ? `${p.perorder} per order` : null,
      available_from: iso(p.effective), available_until: iso(p.expires)
    }
    if (!contents.length) pack.contents_null_reason = kind === 'pass' ? 'Pass rewards are unlocked in-game; NetEase lists them only as text (see benefits)' : 'NetEase official detail does not itemise this pack: ' + (p.detail || p.name)
    if (!d) pack.discount_null_reason = act ? 'No active official GameClub discount (activitys alpha2=TH has none for this product)' : actReason
    if (thb === null) pack.price_thb_null_reason = th.rows
      ? `Official NetEase store has no THB (local_price TH) and offerName not in App Store TH (${iapScope(true)})`
      : 'Official NetEase store has no THB; App Store TH unavailable: ' + th.reason
    if (base === null) { pack.base_null_reason = 'Item pack; gives no Tokens'; pack.bonus_null_reason = 'No Token bonus on item packs' }
    if (isCur && !act) pack.bonus_null_reason = actReason
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })

  // Passes sold only in-app (not on the NetEase web store): App Store TH THB + US USD by Apple item id.
  const appRows = (th.rows ?? []).filter((r) => dcdKind(r.offerName ?? '', r.name) === 'pass' && !webKeys.has(dcdKey(r.offerName)) && !webNames.has(iapNameKey(r.name)))
  const appPacks = appRows.map((r) => {
    const u = us.rows?.find((x) => x.id === r.id && x.currency === 'USD')
    const desc = r.description && iapNameKey(r.description) !== iapNameKey(r.name) ? r.description : null
    const pack: any = {
      id: 0, name: r.name, product_id: r.offerName ?? null, apple_item_id: r.id, kind: 'pass', item_pack: true, store: 'apple-app-store',
      pass_type: /bp|pass/i.test((r.offerName ?? '') + r.name) ? 'battle-pass' : 'membership',
      baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null,
      base_null_reason: 'Pass item; not a Token amount', bonus_null_reason: 'No Token bonus on pass items',
      description: desc ?? r.name, description_en: desc, description_th: null, description_th_null_reason: NO_TH,
      name_en: r.name, name_th: null, name_th_null_reason: NO_TH,
      contents: null, contents_null_reason: 'Sold only as an App Store in-app purchase; NetEase does not itemise its rewards on any official store page',
      benefits: desc ? [desc] : null, image_url: null, purchase_limit: null,
      price_thb: r.price, price_thb_source: `apple-app-store-th (item ${r.id})`,
      price_usd: u?.price ?? null, price_usd_source: u ? `apple-app-store-${us.cc} (item ${r.id})` : null,
      price: r.price, currency: 'THB',
      discount_price_thb: null, discount_price_usd: null, discount_until: null, discount_null_reason: 'Sold only via App Store; Apple lists no discount for this item'
    }
    if (!desc) pack.description_en_null_reason = 'Apple description only repeats the item name'
    if (!u) pack.price_usd_null_reason = us.rows ? `Item ${r.id} not in App Store ${us.cc.toUpperCase()} IAP list` : 'App Store USD storefronts unavailable: ' + us.reason
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })

  const byThb = (a: any, b: any) => (a.price_thb ?? 1e9) - (b.price_thb ?? 1e9) || a.price_usd - b.price_usd
  const msg = 'Live (no fallback catalog)'
  const cats = [
    { id: 1, name: 'Tokens (Official NetEase GamesClub top-up)', packs: webPacks.filter((p) => p.kind === 'tokens') },
    { id: 2, name: 'Tokens + Bonus Diamonds (Official NetEase GamesClub top-up)', packs: webPacks.filter((p) => p.kind === 'first-topup') },
    { id: 3, name: 'Passes & Memberships (Official NetEase GamesClub top-up)', packs: webPacks.filter((p) => p.kind === 'pass') },
    { id: 4, name: 'Passes (App Store in-app only)', packs: appPacks },
    { id: 5, name: 'Packs & Bundles (Official NetEase GamesClub top-up)', packs: webPacks.filter((p) => p.kind === 'bundle') }
  ].filter((c) => c.packs.length)
  let n = 1
  const categories = cats.map((c) => { c.packs.sort(byThb); c.packs.forEach((p: any) => (p.id = n++)); return { ...c, status: 0, message: msg, packCount: c.packs.length } })
  const notes = [
    'Publisher: NetEase Games (NETEASE INTERACTIVE ENTERTAINMENT PTE. LTD) publishes Dunk City Dynasty in Thailand/SEA. Main: official NetEase GamesClub top-up https://pay.neteasegames.com/dunkcitydynasty/topup (game code dunkcitydynasty, live products API).',
    'THB = official local_price TH (THB); USD = official product price (USD). base = Tokens (pay_yuanbao); bonus = bonus Tokens stated in the official detail (free_yuanbao) + activitys GameClub bonus (alpha2=TH). First top-up packs give Bonus Diamonds (a separate currency), listed in contents and bonus_breakdown, not added to the Token total. No FX conversion, no resellers.',
    'Contents = parsed from NetEase\'s own goods_detail text. NetEase publishes this store in English only, so description_th / name_th are null with a reason.',
    'Passes sold only in-app (Dual / Hooper / 20% Off Premium Pass, Party Membership subscription, Player Subscriptions): App Store TH THB + App Store US USD (fallback KH/LA/MM) by Apple item id. Other App Store-only offers (rotating Chain / Limited Offer / Party Gift packs) are not listed because Apple does not show whether they are currently sold.'
  ]
  if (act && act.count === 0) notes.push('Official activitys (alpha2=TH) currently lists no extra bonus or discount for Dunk City Dynasty.')
  if (!act) notes.push(actReason)
  notes.push(APPSTORE_FULL_IAP_NOTE)
  if (!th.rows) notes.push('App Store TH unavailable: ' + th.reason)
  if (!us.rows) notes.push('App Store USD unavailable: ' + us.reason)
  return ({
    game: { id: DCD_APP_ID, slug: DCD_SLUG, name: 'Dunk City Dynasty', itemName: 'Tokens', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: DCD_PRODUCTS_API_URL,
    sources: {
      topup_page: DCD_TOPUP_URL, products: DCD_PRODUCTS_API_URL, bonus: DCD_ACTIVITYS_API_URL, thb: DCD_PRODUCTS_API_URL, usd: DCD_PRODUCTS_API_URL,
      appstore_th: `https://apps.apple.com/api/apps/v1/catalog/th/apps/${DCD_APP_ID}/top-in-apps`,
      appstore_usd: `https://apps.apple.com/api/apps/v1/catalog/${us.cc || 'us'}/apps/${DCD_APP_ID}/top-in-apps`,
      appstore_th_page: DCD_APPSTORE_TH
    },
    notes
  } as unknown) as RovPacksResponse
}

async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  let r: Response
  try {
    r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'application/json', Referer: DCD_TOPUP_URL } })
  } catch (e) {
    throw new DunkCityUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!r.ok) throw new DunkCityUpstreamUnavailableError('HTTP ' + r.status)
  try { return await r.json() } catch { throw new DunkCityInvalidUpstreamResponseError('Non-JSON response') }
}

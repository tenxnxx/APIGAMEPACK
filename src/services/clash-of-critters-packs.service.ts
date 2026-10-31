/**
 * Clash of Critters (Farlight Games) — live official prices.
 *
 * Main source: the official Farlight Games web store (store.farlightgames.com/coc), via its own public
 * plutomall API (webpay/mall/detail -> mallId, webpay/product/guestProducts, guest / no login).
 *  - Prices are in the currency the store assigns to the caller's region (THA(THB) from Thailand, USA(USD)
 *    elsewhere); request params do not change it, so nothing is forced or spoofed.
 *  - Names / descriptions in English (language=en) and Thai (language=th), the store's own language switch.
 *  - base = "<N> Ignis Gems" in the name; bonus = "+ N Extra Ignis Gems" (web-store Special Gift); contents
 *    = the official "Pack Contains / Special Gift" text.
 * The other currency (normally USD) comes from Apple's official App Store price tiers for the game
 * (id 6741567125, "Can redeem any $X value item in the mall"): the store price is matched to the one App
 * Store tier with the identical price on the same-currency storefront (TH for THB, US for USD), then the
 * same Apple item id is read on the other storefront (USD: US, then KH / LA / MM). No FX conversion,
 * no resellers, no hardcoded prices or amounts.
 * If the official store is down, the App Store TH tiers are served as the fallback list.
 */
import { fetchAppStoreFullIap, type AppStoreFullIapRow } from './appstore-full-iap'

export const CLASH_OF_CRITTERS_STORE_SOURCE = 'https://store.farlightgames.com/coc'
export const CLASH_OF_CRITTERS_API_BASE = 'https://global-api.plutomall.com'
export const CLASH_OF_CRITTERS_GAME_ID = 10090
export const CLASH_OF_CRITTERS_APP_ID = 10088021
export const CLASH_OF_CRITTERS_CUSTOM_PATH = '/coc'
export const CLASH_OF_CRITTERS_APPSTORE_ID = 6741567125
export const CLASH_OF_CRITTERS_APPSTORE_TH = `https://apps.apple.com/th/app/id${CLASH_OF_CRITTERS_APPSTORE_ID}`
const APPSTORE_API = 'https://apps.apple.com/api/apps/v1/catalog'
const USD_STOREFRONTS = ['us', 'kh', 'la', 'mm'] as const

export class ClashOfCrittersUpstreamUnavailableError extends Error {
  constructor(message = 'Clash of Critters Farlight upstream unavailable') {
    super(message)
    this.name = 'ClashOfCrittersUpstreamUnavailableError'
  }
}
export class ClashOfCrittersInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Clash of Critters Farlight response') {
    super(message)
    this.name = 'ClashOfCrittersInvalidUpstreamResponseError'
  }
}

type FarlightProduct = { productId?: string | number; price?: number; currency?: string; displayOrder?: number; staticConfig?: string }
type StaticConfig = { name?: string; category?: string; summary?: string; description?: string }
type StoreList = { currency: string; rawCurrency: string; products: FarlightProduct[]; discounts: unknown[] }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const HEADERS = { Accept: 'application/json', Origin: 'https://store.farlightgames.com', Referer: CLASH_OF_CRITTERS_STORE_SOURCE, 'User-Agent': UA }
const num = (s: string) => Number(s.replace(/,/g, ''))
const strip = (html: string) => html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim()

export function cocrCurrency(raw?: string): string {
  if (!raw) return ''
  return raw.match(/\(([A-Z]{3})\)/)?.[1] ?? (/^[A-Z]{3}$/.test(raw) ? raw : '')
}
export function cocrBase(name: string): number | null {
  const m = name.match(/([\d,]+)\s*Ignis\s*Gems?/i)
  return m ? num(m[1]) : null
}
export function cocrBonus(summary: string): number | null {
  const m = summary.match(/\+\s*([\d,]+)\s*Extra/i)
  return m ? num(m[1]) : null
}
/** Official "Pack Contains: … Special Gift: …" text -> [{ item, amount, part }]. */
export function cocrContents(descriptionHtml: string): { item: string; amount: number; part: 'base' | 'bonus' }[] | null {
  const text = strip(descriptionHtml)
  const pick = (label: RegExp) => text.match(label)?.[1]?.trim().match(/^([\d,]+)\s+(.+)$/)
  const base = pick(/Pack Contains:\s*\n?([^\n]+)/i)
  const gift = pick(/Special Gift:\s*\n?([^\n]+)/i)
  const out: { item: string; amount: number; part: 'base' | 'bonus' }[] = []
  if (base) out.push({ item: base[2].trim(), amount: num(base[1]), part: 'base' })
  if (gift) out.push({ item: gift[2].trim(), amount: num(gift[1]), part: 'bonus' })
  return out.length ? out : null
}
const parseConfig = (raw?: string): StaticConfig => {
  try { return raw ? (JSON.parse(raw) as StaticConfig) : {} } catch { return {} }
}

async function getJson(url: URL, signal: AbortSignal | undefined, ms: number): Promise<any> {
  let res: Response
  try {
    res = await fetch(url, { signal: signal ?? AbortSignal.timeout(ms), headers: HEADERS })
  } catch {
    throw new ClashOfCrittersUpstreamUnavailableError()
  }
  if (!res.ok) throw new ClashOfCrittersUpstreamUnavailableError(`HTTP ${res.status}`)
  try { return await res.json() } catch { throw new ClashOfCrittersInvalidUpstreamResponseError('not JSON') }
}

async function resolveMallId(signal?: AbortSignal): Promise<number> {
  const url = new URL(`${CLASH_OF_CRITTERS_API_BASE}/webpay/mall/detail`)
  url.searchParams.set('mallId', '0')
  url.searchParams.set('customPath', CLASH_OF_CRITTERS_CUSTOM_PATH)
  const body = await getJson(url, signal, 15_000)
  if (body?.code === 0 && body.data?.mallId) return Number(body.data.mallId)
  throw new ClashOfCrittersInvalidUpstreamResponseError('mallId missing')
}

function guestUrl(mallId: number, language: 'en' | 'th'): URL {
  const url = new URL(`${CLASH_OF_CRITTERS_API_BASE}/webpay/product/guestProducts`)
  url.searchParams.set('mallId', String(mallId))
  url.searchParams.set('appId', String(CLASH_OF_CRITTERS_APP_ID))
  url.searchParams.set('language', language)
  return url
}

async function fetchStoreList(mallId: number, language: 'en' | 'th', signal?: AbortSignal): Promise<StoreList> {
  const body = await getJson(guestUrl(mallId, language), signal, 20_000)
  const products = body?.data?.productList
  if (body?.code !== 0 || !Array.isArray(products) || products.length === 0) {
    throw new ClashOfCrittersInvalidUpstreamResponseError('empty productList')
  }
  const rawCurrency = String(products[0]?.currency ?? body.data.currency ?? '')
  return { currency: cocrCurrency(rawCurrency), rawCurrency, products, discounts: Array.isArray(body.data.discountInfoList) ? body.data.discountInfoList : [] }
}

type Tiers = { cc: string; rows: AppStoreFullIapRow[] }
async function appStoreTiers(cc: string, currency: string, signal?: AbortSignal): Promise<Tiers> {
  const rows = (await fetchAppStoreFullIap(cc, String(CLASH_OF_CRITTERS_APPSTORE_ID), cc === 'th' ? 'th' : cc === 'us' ? 'en-US' : null, signal ?? AbortSignal.timeout(60_000)))
    .filter((r) => r.currency === currency)
  if (!rows.length) throw new Error(`no ${currency} rows`)
  return { cc, rows }
}
async function usdTiers(signal?: AbortSignal): Promise<{ tiers: Tiers | null; reason: string }> {
  const reasons: string[] = []
  for (const cc of USD_STOREFRONTS) {
    try { return { tiers: await appStoreTiers(cc, 'USD', signal), reason: reasons.join('; ') } } catch (e) {
      reasons.push(`${cc.toUpperCase()}: ${e instanceof Error ? e.message : 'failed'}`)
    }
  }
  return { tiers: null, reason: reasons.join('; ') }
}
async function safe<T>(p: Promise<T>): Promise<{ v: T | null; err: string }> {
  try { return { v: await p, err: '' } } catch (e) { return { v: null, err: e instanceof Error ? e.message : 'failed' } }
}
/** The single App Store row with exactly this price, or null (missing / ambiguous). */
function uniqueByPrice(rows: AppStoreFullIapRow[], price: number): { row: AppStoreFullIapRow | null; count: number } {
  const hits = rows.filter((r) => Math.abs(r.price - price) < 1e-9)
  return { row: hits.length === 1 ? hits[0] : null, count: hits.length }
}

const GAME = { id: CLASH_OF_CRITTERS_GAME_ID, slug: 'clash-of-critters', name: 'Clash of Critters', itemName: 'Ignis Gems', itemIcon: '' }

export async function fetchClashOfCrittersOfficialPacks(options?: { signal?: AbortSignal }): Promise<Record<string, any>> {
  const signal = options?.signal
  let en: StoreList
  try {
    en = await fetchStoreList(await resolveMallId(signal), 'en', signal)
  } catch (storeError) {
    const fb = await appStoreFallback(storeError instanceof Error ? storeError.message : 'failed', signal)
    if (fb) return fb
    throw storeError
  }
  const mallId = await resolveMallId(signal).catch(() => null)
  const th = mallId ? await safe(fetchStoreList(mallId, 'th', signal)) : { v: null, err: 'mall detail unavailable' }

  const storeCur = en.currency
  if (storeCur !== 'THB' && storeCur !== 'USD') throw new ClashOfCrittersInvalidUpstreamResponseError(`unexpected currency ${en.rawCurrency}`)
  const otherCur = storeCur === 'THB' ? 'USD' : 'THB'
  // Official store prices by productId per currency (the TH-language call may land in the other region).
  const storePrice: Record<'THB' | 'USD', Map<string, number>> = { THB: new Map(), USD: new Map() }
  for (const list of [en, th.v]) {
    if (!list || (list.currency !== 'THB' && list.currency !== 'USD')) continue
    for (const p of list.products) if (Number.isFinite(Number(p.price))) storePrice[list.currency].set(String(p.productId), Number(p.price))
  }
  const thByPid = new Map((th.v?.products ?? []).map((p) => [String(p.productId), parseConfig(p.staticConfig)]))

  // App Store tiers for the missing currency, only when the store itself did not give it.
  const needAppStore = en.products.some((p) => !storePrice[otherCur].has(String(p.productId)))
  let same: Tiers | null = null, other: Tiers | null = null, appReason = ''
  if (needAppStore) {
    const s = await safe(appStoreTiers(storeCur === 'THB' ? 'th' : 'us', storeCur, signal))
    same = s.v
    if (!same) appReason = `App Store ${storeCur === 'THB' ? 'TH' : 'US'} tiers unavailable (${s.err})`
    else if (otherCur === 'USD') {
      const u = await usdTiers(signal)
      other = u.tiers
      if (!other) appReason = `App Store USD storefronts (US/KH/LA/MM) unavailable: ${u.reason}`
      else if (other.cc !== 'us') appReason = `App Store USD from ${other.cc.toUpperCase()} (${u.reason})`
    } else {
      const t = await safe(appStoreTiers('th', 'THB', signal))
      other = t.v
      if (!other) appReason = `App Store TH tiers unavailable (${t.err})`
    }
  }

  const packs = en.products.map((p) => {
    const pid = String(p.productId)
    const id = Number(p.productId)
    const cfg = parseConfig(p.staticConfig)
    const cfgTh = thByPid.get(pid)
    const name = cfg.name || `Ignis Gems ${pid}`
    const base = cocrBase(name)
    const bonus = base === null ? null : cocrBonus(cfg.summary || '') ?? (cfg.summary ? null : 0)
    const prices: Record<'THB' | 'USD', number | null> = { THB: storePrice.THB.get(pid) ?? null, USD: storePrice.USD.get(pid) ?? null }
    const src: Record<'THB' | 'USD', string | null> = {
      THB: prices.THB !== null ? 'farlight-official-store (guestProducts THA(THB))' : null,
      USD: prices.USD !== null ? 'farlight-official-store (guestProducts USA(USD))' : null
    }
    const nullReason: Record<string, string> = {}
    if (prices[otherCur] === null) {
      const own = prices[storeCur]
      if (!same || !other) nullReason[otherCur] = appReason
      else if (own === null) nullReason[otherCur] = `No official ${storeCur} store price to match`
      else {
        const hit = uniqueByPrice(same.rows, own)
        const twin = hit.row ? other.rows.filter((r) => r.id === hit.row!.id) : []
        if (!hit.row) nullReason[otherCur] = hit.count ? `${hit.count} App Store ${same.cc.toUpperCase()} tiers share ${storeCur} ${own}; not guessing` : `No App Store ${same.cc.toUpperCase()} tier priced ${storeCur} ${own}${own > Math.max(...same.rows.map((r) => r.price)) ? ' (App Store tiers top out below this pack)' : ''}; no FX conversion`
        else if (twin.length !== 1) nullReason[otherCur] = `App Store ${other.cc.toUpperCase()} has no item ${hit.row.id}`
        else {
          prices[otherCur] = twin[0].price
          src[otherCur] = `apple-app-store-${other.cc} (item ${twin[0].id} ${hit.row.offerName ?? ''} "${twin[0].name}", same tier as the ${storeCur} ${own} store price on App Store ${same.cc.toUpperCase()})`.replace('  ', ' ')
        }
      }
    }
    const contents = cfg.description ? cocrContents(cfg.description) : null
    const descTh = cfgTh?.description ? strip(cfgTh.description) : null
    const pack: Record<string, any> = {
      id,
      name,
      name_th: cfgTh?.name ?? null,
      product_id: pid,
      kind: 'currency',
      item_pack: false,
      baseItemAmount: base,
      bonusItemAmount: bonus,
      totalItemAmount: base === null || bonus === null ? null : base + bonus,
      price: prices.THB ?? prices.USD ?? 0,
      currency: prices.THB !== null ? 'THB' : 'USD',
      prices,
      price_thb: prices.THB,
      price_thb_source: src.THB,
      price_usd: prices.USD,
      price_usd_source: src.USD,
      description_en: cfg.description ? strip(cfg.description) : cfg.summary ?? null,
      description_th: descTh,
      contents,
      category: cfg.category ?? null
    }
    if (base === null) pack.base_null_reason = `Official name "${name}" has no Ignis Gems amount`
    if (bonus === null) pack.bonus_null_reason = base === null ? 'No base amount' : `Official summary "${cfg.summary}" has no "+ N Extra" amount`
    if (prices.THB === null) pack.price_thb_null_reason = nullReason.THB ?? 'No THB price'
    if (prices.USD === null) pack.price_usd_null_reason = nullReason.USD ?? 'No USD price'
    if (!descTh) pack.description_th_null_reason = th.v ? 'Official Thai store text missing for this product' : `Official store Thai language list unavailable (${th.err})`
    if (!contents) pack.contents_null_reason = 'Official description has no "Pack Contains" text'
    return pack
  })
  if (!packs.length) throw new ClashOfCrittersInvalidUpstreamResponseError('no mappable packs')
  packs.sort((a, b) => (a.price_thb ?? 1e12) - (b.price_thb ?? 1e12) || (a.price_usd ?? 1e12) - (b.price_usd ?? 1e12) || a.id - b.id)

  const usdCc = other && otherCur === 'USD' ? other.cc : 'us'
  const notes = [
    `Main: official Farlight Games web store (${CLASH_OF_CRITTERS_STORE_SOURCE}), live guestProducts (guest, no login). The store prices by the caller's region; this request got ${en.rawCurrency}.`,
    storeCur === 'THB'
      ? `USD = Apple App Store ${usdCc.toUpperCase()} price of the App Store tier whose App Store TH price equals the store THB price (paired by Apple item id; Farlight's tier text: "Can redeem any $X value item in the mall"). No FX conversion.`
      : 'THB = Apple App Store TH price of the App Store tier whose App Store US price equals the store USD price (paired by Apple item id). No FX conversion.',
    'base = Ignis Gems in the official name; bonus = official "+ N Extra Ignis Gems" (web-store Special Gift); contents = official "Pack Contains / Special Gift" text. description_th / name_th from the store in Thai (language=th).',
    'The official web store sells only Ignis Gems. Battle Pass / monthly cards / bundles are not listed with prices on any official page: in-game they are paid through generic App Store "$X Pack" tiers (19 tiers, excluded here as they are not specific items), so there are no item_pack entries.'
  ]
  if (appReason) notes.push(appReason)
  if (en.discounts.length) notes.push(`Store reports ${en.discounts.length} active discount(s); prices shown are list prices.`)
  return {
    game: GAME,
    categories: [{ id: 1, name: 'Farlight Official Store (Ignis Gems)', status: 0, message: 'Live list price from the official store guestProducts (excludes coupons)', packCount: packs.length, packs }],
    summary: { categoryCount: 1, packCount: packs.length },
    fetchedAt: new Date().toISOString(),
    source: CLASH_OF_CRITTERS_STORE_SOURCE,
    sources: {
      store: `${CLASH_OF_CRITTERS_API_BASE}/webpay/product/guestProducts?mallId=${mallId ?? ''}&appId=${CLASH_OF_CRITTERS_APP_ID}`,
      thb: storeCur === 'THB' ? CLASH_OF_CRITTERS_STORE_SOURCE : `${APPSTORE_API}/th/apps/${CLASH_OF_CRITTERS_APPSTORE_ID}/top-in-apps`,
      usd: storeCur === 'USD' ? CLASH_OF_CRITTERS_STORE_SOURCE : `${APPSTORE_API}/${usdCc}/apps/${CLASH_OF_CRITTERS_APPSTORE_ID}/top-in-apps`,
      appstore_th_page: CLASH_OF_CRITTERS_APPSTORE_TH
    },
    store_currency: en.rawCurrency,
    notes
  }
}

/** Official store down -> App Store TH tiers (THB) + same Apple item on the USD storefronts. */
async function appStoreFallback(storeReason: string, signal?: AbortSignal): Promise<Record<string, any> | null> {
  const th = await safe(appStoreTiers('th', 'THB', signal))
  if (!th.v) return null
  const u = await usdTiers(signal)
  const packs = th.v.rows.map((r) => {
    const twin = u.tiers?.rows.find((x) => x.id === r.id) ?? null
    const pack: Record<string, any> = {
      id: Number(r.id), name: twin?.name ?? r.name, name_th: /[\u0E00-\u0E7F]/.test(r.name) ? r.name : null, product_id: r.offerName ?? null, apple_item_id: r.id,
      kind: 'tier', item_pack: false, baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null,
      price: r.price, currency: 'THB', prices: { THB: r.price, USD: twin?.price ?? null }, price_thb: r.price,
      price_thb_source: `apple-app-store-th (item ${r.id})`, price_usd: twin?.price ?? null, price_usd_source: twin ? `apple-app-store-${u.tiers!.cc} (item ${r.id})` : null,
      description_en: twin?.description ?? null, description_th: r.description && /[\u0E00-\u0E7F]/.test(r.description) ? r.description : null, contents: null,
      base_null_reason: 'App Store tier is a generic mall-credit pack; Ignis Gems amount is only on the official store',
      bonus_null_reason: 'App Store tier is a generic mall-credit pack', contents_null_reason: 'Apple lists no contents for generic tiers'
    }
    if (!twin) pack.price_usd_null_reason = u.tiers ? `App Store ${u.tiers.cc.toUpperCase()} has no item ${r.id}` : `App Store USD storefronts (US/KH/LA/MM) unavailable: ${u.reason}`
    if (!pack.description_en) pack.description_en_null_reason = 'No English App Store text'
    if (!pack.description_th) pack.description_th_null_reason = 'Apple shows this tier in English only on the TH storefront'
    return pack
  }).sort((a, b) => a.price_thb - b.price_thb)
  return {
    game: GAME,
    categories: [{ id: 1, name: 'App Store TH price tiers (fallback)', status: 1, message: `Official store unavailable (${storeReason}); App Store tiers`, packCount: packs.length, packs }],
    summary: { categoryCount: 1, packCount: packs.length },
    fetchedAt: new Date().toISOString(),
    source: CLASH_OF_CRITTERS_APPSTORE_TH,
    sources: { store: null, thb: `${APPSTORE_API}/th/apps/${CLASH_OF_CRITTERS_APPSTORE_ID}/top-in-apps`, usd: u.tiers ? `${APPSTORE_API}/${u.tiers.cc}/apps/${CLASH_OF_CRITTERS_APPSTORE_ID}/top-in-apps` : null, appstore_th_page: CLASH_OF_CRITTERS_APPSTORE_TH },
    notes: [`Official Farlight store unavailable (${storeReason}); fallback = App Store TH generic "$X Pack" tiers (Ignis Gems amounts unknown).`]
  }
}

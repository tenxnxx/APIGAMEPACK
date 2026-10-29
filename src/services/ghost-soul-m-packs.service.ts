import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'

/**
 * Ghost Soul M (Thailand) - developer/IP owner MGAME; Thai publisher RGS Online Pte. Ltd. (Razer Game Service Online,
 * a Razer subsidiary), operated in Thailand by Ini3. Official first-party top-up: RGS Webshop for Ghost Soul M
 * (shop.ghostsoulm.in.th, live API webshop-api.rgsgame.com, clientId 6c37-54fd-4e53-eef8, countryCode TH, THB).
 * Red Diamonds (เพชรแดง) base + bonus are read from the live product name ("เพชรแดง 1,000 +100") or description
 * ("เพชรแดง 2,000+2,000 เม็ด"); Gold (ทอง) amounts likewise. Everything else is an item_pack with its official
 * description. The webshop sells THB only (other countryCodes return no products) and the App Store app (6747792469,
 * com.rgsonline.ghostsoulm) is sold only on the TH storefront, so USD is null with a live reason. App Store TH is used
 * for the reference App Store price of Red Diamond tiers and for passes not sold on the webshop.
 * No FX, no resellers, no hardcoded prices.
 */
export const GHOSTSOULM_SLUG = 'ghost-soul-m'
export const GHOSTSOULM_CLIENT_ID = '6c37-54fd-4e53-eef8'
export const GHOSTSOULM_APPLE_ID = 6747792469
export const GHOSTSOULM_SHOP_URL = 'https://shop.ghostsoulm.in.th/th/th'
export const GHOSTSOULM_API_BASE = 'https://webshop-api.rgsgame.com'
export const ghostSoulMProductsUrl = (countryCode = 'TH') =>
  `${GHOSTSOULM_API_BASE}/v1/webshop/payment/products?clientId=${GHOSTSOULM_CLIENT_ID}&countryCode=${countryCode}`
export const ghostSoulMCategoriesUrl = () => `${GHOSTSOULM_API_BASE}/v1/webshop/payment/products/category?clientId=${GHOSTSOULM_CLIENT_ID}`
export const GHOSTSOULM_USD_STOREFRONTS = ['us', 'kh', 'la', 'mm'] as const
export const ghostSoulMCatalogUrl = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${GHOSTSOULM_APPLE_ID}/top-in-apps`
/** Premium / Super / Ultra Premium tickets (7 / 30 days) on the webshop; permanent marketplace pass on the App Store. */
export const GHOSTSOULM_PASS_RE = /ตั๋ว(ซูเปอร์|อัลตร้า)?พรีเมี่ยม|บัตรผ่าน|market_ticket|\bpass\b/i
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class GhostSoulMUpstreamUnavailableError extends Error {
  constructor(message = 'Ghost Soul M RGS webshop upstream unavailable') { super(message); this.name = 'GhostSoulMUpstreamUnavailableError' }
}
export class GhostSoulMInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Ghost Soul M RGS webshop response') { super(message); this.name = 'GhostSoulMInvalidUpstreamResponseError' }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const int = (s: string) => Number(s.replace(/,/g, ''))
/** HTML -> plain lines (one per <br>/<p>). */
export const ghostSoulMText = (html: unknown): string[] =>
  str(html).replace(/<br\s*\/?>|<\/p>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)

export type GhostSoulMCurrency = { item: 'Red Diamonds' | 'Gold'; base: number; bonus: number; from: 'name' | 'description' }
/** "เพชรแดง 1,000 +100" / "เพชรแดง 5,000+5,000 เม็ด" / "ทอง 1,200,000" -> amounts; null for item packs. */
export function ghostSoulMCurrency(name: string, descLines: string[]): GhostSoulMCurrency | null {
  const one = (s: string, from: 'name' | 'description'): GhostSoulMCurrency | null => {
    const r = /^เพชรแดง\s*([\d,]+)\s*(?:\+\s*([\d,]+))?(?:\s*(?:เม็ด|เพชร))?$/.exec(s.trim())
    if (r) return { item: 'Red Diamonds', base: int(r[1]), bonus: r[2] ? int(r[2]) : 0, from }
    const g = /^ทอง\s*([\d,]+)$/.exec(s.trim())
    if (g) return { item: 'Gold', base: int(g[1]), bonus: 0, from }
    return null
  }
  return one(name, 'name') ?? (descLines.length === 1 ? one(descLines[0], 'description') : null)
}

export type GhostSoulMProduct = {
  id: string; code: string; name: string; price: number; currency: string; category: string; categoryId: string
  desc: string[]; event: string[]; image: string | null; from: string | null; to: string | null
  limitType: string; limitValue: number | null; frequency: string; productType: string; isHot: boolean
}
/** THB products only, currently on sale (same availableFrom/availableTo window as the shop page). */
export function parseGhostSoulMProducts(json: any, now = Date.now()): { products: GhostSoulMProduct[]; skipped: string[] } {
  if (!json || typeof json !== 'object' || json.status !== true || !Array.isArray(json.data)) throw new GhostSoulMInvalidUpstreamResponseError('Unexpected products payload')
  const products: GhostSoulMProduct[] = []; const skipped: string[] = []
  for (const p of json.data) {
    if (!p || typeof p !== 'object') continue
    const price = num(p.sellPrice); const code = str(p.productCode); const name = str(p.productName).trim()
    if (price === null || !code || !name) continue
    if (p.currencyCode !== 'THB') { skipped.push(`${name} (${p.currencyCode})`); continue }
    if (price <= 0 || p.productType === 'FREEGIFT') { skipped.push(`${name} (free gift)`); continue }
    const from = str(p.availableFrom) || null; const to = str(p.availableTo) || null
    if (from && Date.parse(from) > now) { skipped.push(`${name} (not yet on sale)`); continue }
    if (to && Date.parse(to) < now) { skipped.push(`${name} (ended)`); continue }
    products.push({
      id: str(p._id), code, name, price, currency: 'THB', category: str(p.category?.name).trim(), categoryId: str(p.category?._id),
      desc: ghostSoulMText(p.description), event: ghostSoulMText(p.eventText), image: str(p.thumbnailUrl) || null, from, to,
      limitType: str(p.limitType) || 'NONE', limitValue: num(p.limitValue), frequency: str(p.frequency) || 'NONE', productType: str(p.productType), isHot: p.isHot === true
    })
  }
  return { products, skipped }
}

async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  let r: Response
  try {
    r = await fetch(url, { signal: signal ?? AbortSignal.timeout(25_000), headers: { 'User-Agent': UA, Accept: 'application/json', 'Accept-Language': 'th-TH', Origin: 'https://shop.ghostsoulm.in.th', Referer: GHOSTSOULM_SHOP_URL } })
  } catch (e) { throw new GhostSoulMUpstreamUnavailableError(e instanceof Error ? e.message : 'network error') }
  if (!r.ok) throw new GhostSoulMUpstreamUnavailableError('HTTP ' + r.status)
  try { return await r.json() } catch { throw new GhostSoulMInvalidUpstreamResponseError('Non-JSON response') }
}
type List = { rows: AppStoreFullIapRow[] } | { rows: null; reason: string }
const reasonOf = (x: List) => ('reason' in x ? x.reason : '')
async function list(cc: string, l: string | null, signal?: AbortSignal): Promise<List> {
  try { return { rows: await fetchAppStoreFullIap(cc, String(GHOSTSOULM_APPLE_ID), l, signal) } } catch (e) { return { rows: null, reason: e instanceof Error ? e.message : String(e) } }
}

const limitText = (p: GhostSoulMProduct) =>
  p.limitType === 'NONE' ? null : `${p.limitValue ?? 1} per ${p.limitType.toLowerCase()}${p.frequency !== 'NONE' ? ` (${p.frequency.toLowerCase()})` : ''}`
const fullPrice = (ev: string[]) => { for (const l of ev) { const m = /ราคาเต็ม\s*฿?\s*([\d,]+)/.exec(l); if (m) return int(m[1]) } return null }

export async function fetchGhostSoulMPacks(options?: { signal?: AbortSignal; now?: number }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const url = ghostSoulMProductsUrl('TH')
  const parsed = parseGhostSoulMProducts(await getJson(url, signal), options?.now)
  if (!parsed.products.length) throw new GhostSoulMInvalidUpstreamResponseError('No THB products found')
  const cats = await getJson(ghostSoulMCategoriesUrl(), signal).catch(() => null)
  const catMeta = new Map<string, { order: number; description: string }>()
  if (cats?.status === true && Array.isArray(cats.data)) for (const c of cats.data) if (c?._id) catMeta.set(String(c._id), { order: num(c.displayOrder) ?? 99, description: str(c.description).trim() })

  // App Store: TH (Thai) for reference prices / App Store-only passes; USD storefronts checked live.
  const th = await list('th', 'th', signal)
  const usdLists: Record<string, List> = {}
  for (const cc of GHOSTSOULM_USD_STOREFRONTS) { usdLists[cc] = await list(cc, null, signal); if (usdLists[cc].rows?.length) break }
  const usdCc = GHOSTSOULM_USD_STOREFRONTS.find((cc) => usdLists[cc]?.rows?.length)
  const usdRows = usdCc ? usdLists[usdCc].rows! : null
  const usdByOffer = (offer?: string) => (offer && usdRows ? usdRows.find((r) => r.offerName === offer && r.currency === 'USD') : undefined)
  const usdWhy = Object.entries(usdLists).map(([cc, l]) => `${cc.toUpperCase()}: ${l.rows ? 'no matching item' : reasonOf(l)}`).join('; ')
  const webUsdReason = `Official RGS webshop sells in THB only (countryCode TH; no USD price list) and the App Store app ${GHOSTSOULM_APPLE_ID} has no USD storefront listing (${usdWhy})`
  const appleRuby = new Map<number, AppStoreFullIapRow>()
  for (const r of th.rows ?? []) { const m = /^เพชรแดง\s*([\d,]+)/.exec(r.name ?? ''); if (m && r.currency === 'THB' && /ruby_/.test(r.offerName ?? '')) appleRuby.set(int(m[1]), r) }

  const toPack = (p: GhostSoulMProduct) => {
    const cur = ghostSoulMCurrency(p.name, p.desc)
    const isPass = !cur && GHOSTSOULM_PASS_RE.test(p.name)
    const desc = p.desc.join(' / ') || null
    const apple = cur?.item === 'Red Diamonds' && !p.to && cur.from === 'name' ? appleRuby.get(cur.base) : undefined // regular tiers only (App Store tiers carry no bonus)
    const list = fullPrice(p.event)
    const pack: any = {
      id: p.id, name: p.name, product_id: p.code, kind: cur ? 'currency' : isPass ? 'pass' : 'bundle', store: 'rgs-webshop-ghostsoulm-th',
      item_name: cur?.item ?? null,
      name_th: p.name, name_th_source: 'rgs-webshop (official, th)',
      name_en: null, name_en_null_reason: 'Official Thai webshop publishes Thai names only (Accept-Language en returns the same Thai names)',
      description: desc, description_th: desc, description_th_source: desc ? 'rgs-webshop product description (official)' : null,
      ...(desc ? {} : { description_th_null_reason: 'No official description' }),
      event_text: p.event.join(' / ') || null,
      image_url: p.image, category_name: p.category,
      baseItemAmount: cur ? cur.base : null, bonusItemAmount: cur ? cur.bonus : null, totalItemAmount: cur ? cur.base + cur.bonus : null,
      item_pack: !cur,
      ...(cur
        ? { bonus_source: `rgs-webshop product ${cur.from} (live)`, bonus_available: true }
        : {
            pack_type: isPass ? (/30 วัน/.test(p.name) ? 'monthly-pass' : /7 วัน/.test(p.name) ? 'weekly-pass' : 'premium-pass')
              : /คัมภีร์/.test(p.name) ? 'growth-scroll' : /EXP/i.test(p.name) ? 'exp-boost' : 'bundle',
            base_null_reason: isPass ? 'Pass: rewards/duration in description, not a single currency amount' : 'Item pack (contents in description); not a single currency amount',
            bonus_null_reason: 'Item pack: no currency bonus', total_null_reason: 'Item pack contents are not a single currency amount'
          }),
      purchase_limit: limitText(p), available_from: p.from, available_until: p.to, limited_time: !!p.to,
      original_price_thb: list, ...(list === null ? {} : { original_price_source: 'rgs-webshop eventText (ราคาเต็ม)' }),
      appstore_th_price_thb: apple?.price ?? null, ...(apple ? { appstore_th_offer_name: apple.offerName } : {}),
      price_thb: p.price, price_thb_source: `rgs-webshop (official, countryCode TH, sellPrice, category ${p.category})`,
      price_usd: null, price_usd_source: null, price_usd_null_reason: webUsdReason,
      price: p.price, currency: 'THB'
    }
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  }

  const all = parsed.products.map(toPack)
  // App Store-only passes (not on the webshop), e.g. the permanent marketplace pass.
  const webCodes = new Set(parsed.products.map((p) => p.name))
  const applePasses = (th.rows ?? []).filter((r) => GHOSTSOULM_PASS_RE.test(`${r.name} ${r.offerName ?? ''} ${r.description ?? ''}`) && !webCodes.has(r.name) && r.currency === 'THB')
  const passPacks = applePasses.map((r) => {
    const u = usdByOffer(r.offerName)
    const pack: any = {
      id: r.id, name: r.name, product_id: r.offerName ?? r.id, kind: 'pass', store: 'apple-app-store',
      name_th: r.name, name_th_source: 'apple-app-store-th (th)', name_en: null, name_en_null_reason: 'App Store TH lists Thai names only; no other storefront sells the app',
      description: r.description ?? null, description_th: r.description ?? null, description_th_source: r.description ? 'apple-app-store-th (th)' : null,
      ...(r.description ? {} : { description_th_null_reason: 'No App Store description' }),
      baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, item_pack: true,
      pack_type: /market/i.test(r.offerName ?? '') ? 'marketplace-pass' : 'premium-pass',
      base_null_reason: 'Pass: unlocks a feature, not a currency amount', bonus_null_reason: 'Pass: no currency bonus', total_null_reason: 'Pass: not a currency amount',
      availability_note: 'Sold in-app via the App Store TH only (not on the RGS webshop)', apple_item_id: r.id,
      price_thb: r.price, price_thb_source: `apple-app-store-th (item ${r.id}, offerName=${r.offerName})`,
      price_usd: u?.price ?? null, price_usd_source: u ? `apple-app-store-${usdCc} (USD storefront, offerName)` : null,
      price: r.price, currency: 'THB'
    }
    if (!u) pack.price_usd_null_reason = `App Store app ${GHOSTSOULM_APPLE_ID} is not sold on a USD storefront (${usdWhy})`
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })

  const sortP = (a: any, b: any) => a.price_thb - b.price_thb || String(a.product_id).localeCompare(String(b.product_id))
  const groups: { name: string; packs: any[]; order: number }[] = []
  const add = (name: string, order: number, packs: any[]) => { if (packs.length) groups.push({ name, packs: packs.sort(sortP), order }) }
  add('Red Diamonds (เพชรแดง; Official RGS Webshop TH)', 0, all.filter((p) => p.item_name === 'Red Diamonds'))
  add('Gold (ทอง; Official RGS Webshop TH)', 1, all.filter((p) => p.item_name === 'Gold'))
  add('Passes (Premium tickets; Official RGS Webshop TH + App Store TH)', 2, [...all.filter((p) => p.kind === 'pass'), ...passPacks])
  const byCat = new Map<string, any[]>()
  for (const p of all.filter((x) => x.kind === 'bundle')) { const k = p.category_name || 'Packs'; byCat.set(k, [...(byCat.get(k) ?? []), p]) }
  const catOrder = (name: string) => { const pr = parsed.products.find((x) => x.category === name); return 3 + (pr ? catMeta.get(pr.categoryId)?.order ?? 50 : 50) }
  for (const [k, v] of byCat) add(`${k} (Item Packs; Official RGS Webshop TH)`, catOrder(k), v)
  groups.sort((a, b) => a.order - b.order)
  const msg = 'Live (no fallback catalog)'
  const categories = groups.map((g, k) => ({ id: k + 1, name: g.name, packs: g.packs, status: 0, message: msg, packCount: g.packs.length }))
  const notes = [
    `Main: official Ghost Soul M Webshop by RGS Online Pte. Ltd. (Razer Game Service Online; Thai publisher, operated with Ini3; developer MGAME), ${GHOSTSOULM_SHOP_URL}, live API ${url}. THB = sellPrice. No FX conversion, no resellers.`,
    'Red Diamonds / Gold base + bonus come from the live product name or description (e.g. "เพชรแดง 1,000 +100"); original_price_thb is the shop\'s own "ราคาเต็ม" list price.',
    `USD is null: the webshop returns products only for countryCode TH (THB), and the App Store app ${GHOSTSOULM_APPLE_ID} (com.rgsonline.ghostsoulm) is not on the US/KH/LA/MM storefronts (${usdWhy}). The separate "GhostM Global" app (MGAME) is a different service and is not used.`,
    'Passes: Premium / Super Premium / Ultra Premium tickets are on the webshop; the permanent marketplace pass is App Store TH only. Other App Store-only packs (level / dungeon boxes, daily / weekly / monthly and seasonal packs) are not listed because the official webshop is the primary store; App Store TH Red Diamond prices are shown as appstore_th_price_thb.',
    ...(parsed.skipped.length ? [`Skipped: ${parsed.skipped.join(', ')}`] : []),
    APPSTORE_FULL_IAP_NOTE
  ]
  if (!th.rows) notes.push('App Store TH (Thai): ' + reasonOf(th))
  return ({
    game: { id: GHOSTSOULM_APPLE_ID, slug: GHOSTSOULM_SLUG, name: 'Ghost Soul M', itemName: 'Red Diamonds' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packCount, 0) },
    fetchedAt: new Date().toISOString(),
    source: url,
    sources: { thb: url, categories: ghostSoulMCategoriesUrl(), shop_page: GHOSTSOULM_SHOP_URL, appstore_th: ghostSoulMCatalogUrl('th'), appstore_usd_checked: GHOSTSOULM_USD_STOREFRONTS.map(ghostSoulMCatalogUrl) },
    notes
  } as unknown) as RovPacksResponse
}

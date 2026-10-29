import { fetchAppStoreFullIap, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'

/**
 * Lineage W (NCSOFT; SEA server published by NCV Games Pte. Ltd., the NCSOFT x VNG Games joint venture).
 * Official web store: NCV Games Shop https://shop.ncvgames.com/th/game/lwth (Thailand, THB). The shop page embeds a
 * public storefront clientKey; its own anonymous product API (billing.vnggames.com fe/api/multiitemorder/static/getProducts,
 * the same call the page makes before login) returns every package with live THB prices and Thai names/descriptions.
 * English names/descriptions come from the same official shop's Singapore storefront (lwsg, lang=en), matched by
 * sellingProductID (its SGD prices are ignored). The official shop has no USD storefront (TH/SG/MY/ID/PH only), so USD is
 * read live from App Store US, else KH / LA / MM (app 6755233247, com.ncvgames.lineagewsa), matched by exact English name;
 * when Apple does not sell the app there, USD is null with the reason. No resellers, no FX conversion, no hardcoded prices.
 */
export const LINW_SLUG = 'lineage-w'
export const LINW_NAME = 'Lineage W'
export const LINW_APPSTORE_ID = 6755233247
export const LINW_SHOP_TH = 'https://shop.ncvgames.com/th/game/lwth'
export const LINW_SHOP_SG = 'https://shop.ncvgames.com/sg/game/lwsg'
export const LINW_PRODUCTS_API = 'https://billing.vnggames.com/fe/api/multiitemorder/static/getProducts'
export const LINW_USD_STOREFRONTS = ['us', 'kh', 'la', 'mm'] as const
export const linwCatalogUrl = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${LINW_APPSTORE_ID}/top-in-apps`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class LineageWUpstreamUnavailableError extends Error {
  constructor(message = 'Lineage W upstream unavailable') { super(message); this.name = 'LineageWUpstreamUnavailableError' }
}
export class LineageWInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Lineage W upstream response') { super(message); this.name = 'LineageWInvalidUpstreamResponseError' }
}

export type NcvProduct = {
  enable?: number; hidden?: number; sellingProductID: string; productName: string; productGroup?: string; description?: string
  productType?: string; prices?: Record<string, { currency?: string; price?: number }>; inGameCurrency?: string; orderDisplay?: number
  isSubscription?: number; isLimitedProduct?: number; image?: string
}
type Shop = { clientKey: string; groups: Record<string, string> }

/** The Next.js page embeds its storefront config as escaped JSON (\"clientKey\":\"...\"). */
export function parseShopPage(html: string): Shop | null {
  const ck = html.match(/\\?"clientKey\\?"\s*:\s*\\?"([A-Za-z0-9._-]{20,})\\?"/)
  if (!ck) return null
  let groups: Record<string, string> = {}
  const g = html.match(/\\?"productGroup\\?"\s*:\s*(\{[^{}]*\})/)
  if (g) { try { groups = JSON.parse(g[1].replace(/\\"/g, '"')) } catch { groups = {} } }
  return { clientKey: ck[1], groups }
}

async function getText(url: string, signal?: AbortSignal) {
  let r: Response
  try { r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'text/html' } }) } catch (e) {
    throw new LineageWUpstreamUnavailableError(`NCV shop page ${url}: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!r.ok) throw new LineageWUpstreamUnavailableError(`NCV shop page ${url}: HTTP ${r.status}`)
  return r.text()
}

async function loadShop(pageUrl: string, lang: string, country: string, signal?: AbortSignal) {
  const shop = parseShopPage(await getText(pageUrl, signal))
  if (!shop) throw new LineageWInvalidUpstreamResponseError(`NCV shop page ${pageUrl}: storefront clientKey not found`)
  let r: Response
  try {
    r = await fetch(LINW_PRODUCTS_API, {
      method: 'POST', signal: signal ?? AbortSignal.timeout(20_000),
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Accept: 'application/json', Origin: 'https://shop.ncvgames.com', Referer: pageUrl },
      body: new URLSearchParams({ lang, country, clientKey: shop.clientKey, bonusInfo: 'false' }).toString()
    })
  } catch (e) { throw new LineageWUpstreamUnavailableError(`NCV products API: ${e instanceof Error ? e.message : String(e)}`) }
  if (!r.ok) throw new LineageWUpstreamUnavailableError(`NCV products API HTTP ${r.status}`)
  let j: any
  try { j = await r.json() } catch { throw new LineageWInvalidUpstreamResponseError('NCV products API: not JSON') }
  if (j?.returnCode !== 1) throw new LineageWInvalidUpstreamResponseError(`NCV products API returnCode ${j?.returnCode} ${j?.returnMessage_ ?? ''}`.trim())
  const products = j?.data?.products
  if (!products || typeof products !== 'object') throw new LineageWInvalidUpstreamResponseError('NCV products API: bad shape (no data.products)')
  const list = (Object.values(products) as NcvProduct[]).filter((p) => p && typeof p.sellingProductID === 'string' && p.enable !== 0 && p.hidden !== 1)
  return { list, groups: shop.groups }
}

/** HTML description -> plain text, lines joined with " / ". */
export function cleanLines(s: string | null | undefined): string[] {
  if (!s) return []
  const t = s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  return t.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
}
export function cleanText(s: string | null | undefined): string | null {
  const lines = cleanLines(s)
  return lines.length ? lines.join(' / ') : null
}
const num = (s: string) => Number(s.replace(/,/g, ''))
/** "40 Diamonds" / "แพ็ค 40 เพชร" -> 40 (plain Diamond top-up tiers only). */
export function diamondsTier(nameEn: string | null, nameTh: string | null): number | null {
  const e = (nameEn ?? '').match(/^\s*(\d[\d,]*)\s+Diamonds?\s*$/i)
  if (e) return num(e[1])
  const t = (nameTh ?? '').match(/^\s*แพ็ค\s*(\d[\d,]*)\s*เพชร\s*$/)
  return t ? num(t[1]) : null
}
/** "40 Diamonds, 8 Mileage" -> {diamonds:40, mileage:8, other:false} */
export function tierContents(descEn: string | null, descTh: string | null) {
  const en = descEn ?? ''
  const th = descTh ?? ''
  const d = en.match(/(\d[\d,]*)\s+Diamonds?/i) ?? th.match(/เพชร\s*(\d[\d,]*)/)
  const m = en.match(/(\d[\d,]*)\s+Mileage/i) ?? th.match(/Mileage\s*(\d[\d,]*)/i)
  const plain = /^\s*\d[\d,]*\s+Diamonds?\s*,\s*\d[\d,]*\s+Mileage\s*$/i.test(en) || /^\s*เพชร\s*\d[\d,]*\s*,\s*Mileage\s*\d[\d,]*\s*$/i.test(th)
  return { diamonds: d ? num(d[1]) : null, mileage: m ? num(m[1]) : null, plain }
}
export const mileageIn = (s: string | null) => { const m = (s ?? '').match(/(?:Mileage|ไมล์เลจ)\s*x?\s*(\d[\d,]*)/i) ?? (s ?? '').match(/(\d[\d,]*)\s+Mileage/i); return m ? num(m[1]) : null }
export type LinwKind = 'currency' | 'membership' | 'pass' | 'bundle'
export function linwKind(p: NcvProduct, nameEn: string | null): LinwKind {
  const n = `${nameEn ?? ''} ${p.productName}`
  if (diamondsTier(nameEn, p.productName) !== null) return 'currency'
  if (p.productGroup === 'G4' || /membership|สมาชิก/i.test(n)) return 'membership'
  if (p.productGroup === 'G5' || /unlock key|journey of growth key|กุญแจปลดล็อก|กุญแจแห่งการเติบโต/i.test(n)) return 'pass'
  return 'bundle'
}
export function linwPassType(nameEn: string | null, nameTh: string): string {
  const n = `${nameEn ?? ''} ${nameTh}`
  if (/gold|โกลด์/i.test(n)) return 'gold-membership'
  if (/silver|ซิลเวอร์/i.test(n)) return 'silver-membership'
  if (/premium unlock|กุญแจปลดล็อกพรีเมียม/i.test(n)) return 'premium-pass-unlock'
  if (/growth|เติบโต/i.test(n)) return 'growth-journey-pass'
  return 'pass'
}
export const passDays = (s: string | null | undefined) => { const m = (s ?? '').match(/\((\d+)\s*(?:D|days?|วัน)\)/i) ?? (s ?? '').match(/(\d+)\s*(?:days?|วัน)/i); return m ? Number(m[1]) : null }
/** First description line stating a purchase limit ("Purchase Limit: 4 times/account/week"). Takes raw HTML. */
export const purchaseLimit = (html: string | null | undefined) => cleanLines(html).find((l) => /^(?:purchase\s+)?limit\b/i.test(l)) ?? null

type List = { rows: AppStoreFullIapRow[] } | { rows: null; reason: string }
async function appleList(cc: string, signal?: AbortSignal, retryMs = 2500): Promise<List> {
  for (let attempt = 0; ; attempt++) {
    try { return { rows: await fetchAppStoreFullIap(cc, String(LINW_APPSTORE_ID), cc === 'us' ? 'en-US' : null, signal) } } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      if (attempt === 0 && /\b429\b/.test(reason) && !signal?.aborted) { await new Promise((r) => setTimeout(r, retryMs)); continue }
      return { rows: null, reason }
    }
  }
}
const reasonOf = (x: List) => ('reason' in x ? x.reason : '')
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export async function fetchLineageWPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const th = await loadShop(LINW_SHOP_TH, 'th', 'TH', signal)
  const thList = th.list.filter((p) => typeof p.prices?.THB?.price === 'number')
  if (!thList.length) throw new LineageWInvalidUpstreamResponseError('NCV shop TH returned no THB-priced packages')
  let en: Map<string, NcvProduct> | null = null
  let enReason = ''
  try { en = new Map((await loadShop(LINW_SHOP_SG, 'en', 'SG', signal)).list.map((p) => [p.sellingProductID, p])) } catch (e) {
    enReason = `official NCV shop SG English list unavailable (${e instanceof Error ? e.message : String(e)})`
  }

  // USD: official shop has no USD storefront; App Store USD storefronts, sequential (Apple rate-limits bursts).
  const apple: Record<string, List> = {}
  for (const cc of LINW_USD_STOREFRONTS) {
    apple[cc] = await appleList(cc, signal)
  }
  const usdRows = LINW_USD_STOREFRONTS.flatMap((cc) => (apple[cc].rows ?? []).filter((r) => r.currency === 'USD').map((r) => ({ cc, r })))
  const storefrontsNote = LINW_USD_STOREFRONTS.map((cc) => `${cc.toUpperCase()}${apple[cc].rows ? '' : ` (${reasonOf(apple[cc])}${/\b404\b/.test(reasonOf(apple[cc])) ? ': app not sold there' : ''})`}`).join(', ')
  const NO_USD_SHOP = 'official NCV Games Shop sells Lineage W only in THB/SGD/MYR/IDR/PHP (no USD storefront)'

  const packs: any[] = []
  for (const p of thList) {
    const e = en?.get(p.sellingProductID)
    const name_th = p.productName.trim()
    const name_en = e?.productName?.trim() || null
    const description_th = cleanText(p.description)
    const description_en = cleanText(e?.description)
    const kind = linwKind(p, name_en)
    const priceThb = p.prices!.THB.price as number
    const usd = name_en ? usdRows.filter((x) => norm(x.r.name) === norm(name_en)) : []
    const u = usd.length === 1 ? usd[0] : null
    let amounts: Record<string, unknown>
    if (kind === 'currency') {
      const base = diamondsTier(name_en, name_th)
      const c = tierContents(description_en, description_th)
      const bonus = c.plain && c.diamonds === base ? 0 : null
      amounts = {
        baseItemAmount: base, bonusItemAmount: bonus, totalItemAmount: bonus !== null && base !== null ? base + bonus : null, item_pack: false,
        ...(base === null ? { base_null_reason: 'Diamonds amount not stated in the package name' } : {}),
        ...(bonus === null ? { bonus_null_reason: 'official shop description lists more than plain Diamonds + Mileage, so bonus is not a single number', total_null_reason: 'bonus unknown' } : {}),
        mileage: c.mileage, ...(c.mileage === null ? { mileage_null_reason: 'Mileage not stated in the description' } : {}),
        bonus_note: 'Mileage (shop loyalty points) is a separate currency and is not counted as bonus Diamonds',
        first_purchase_bonus: null, first_purchase_bonus_null_reason: 'the official NCV shop publishes no first-purchase bonus for Diamond packages'
      }
    } else {
      const days = kind === 'membership' ? passDays(name_en ?? name_th) : null
      amounts = {
        baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, item_pack: true,
        base_null_reason: `${kind === 'membership' ? 'Membership' : kind === 'pass' ? 'Pass key' : 'Bundle'} package; contents are items, not a single Diamonds amount (see description)`,
        bonus_null_reason: 'pass/bundle package; no bonus Diamonds amount', total_null_reason: 'pass/bundle contents are not a single Diamonds amount',
        mileage: mileageIn(description_en ?? description_th), ...(mileageIn(description_en ?? description_th) === null ? { mileage_null_reason: 'Mileage not stated in the description' } : {}),
        ...(kind !== 'bundle' ? { pass_type: linwPassType(name_en, name_th) } : {}),
        ...(kind === 'membership' ? { pass_days: days, ...(days === null ? { pass_days_null_reason: 'duration not stated in the name' } : {}) } : {}),
        purchase_limit: purchaseLimit(e?.description), ...(purchaseLimit(e?.description) === null ? { purchase_limit_null_reason: 'no purchase limit stated in the English description' } : {})
      }
    }
    const idNum = Number((p.sellingProductID.match(/(\d+)$/) ?? [])[1])
    const pack: any = {
      id: Number.isFinite(idNum) ? idNum : 0, name: name_en ?? name_th, name_en, name_th, product_id: p.sellingProductID, kind, store: 'ncv-games-shop',
      product_group: p.productGroup ?? null, product_group_name: (p.productGroup && th.groups[p.productGroup]) || null,
      name_th_source: 'ncv-games-shop-th (lwth, lang=th)', name_en_source: name_en ? 'ncv-games-shop-sg (lwsg, lang=en; same sellingProductID)' : null,
      description: [description_th, description_en].filter(Boolean).join(' / ') || null,
      description_th, description_th_source: description_th ? 'ncv-games-shop-th (lwth, lang=th)' : null,
      description_en, description_en_source: description_en ? 'ncv-games-shop-sg (lwsg, lang=en)' : null,
      image: p.image ?? null, order_display: p.orderDisplay ?? null,
      ...amounts,
      price_thb: priceThb, price_thb_source: `ncv-games-shop-th (${LINW_PRODUCTS_API}, sellingProductID=${p.sellingProductID})`,
      price_usd: u ? u.r.price : null, price_usd_source: u ? `apple-app-store-${u.cc} (USD storefront, exact English name, item ${u.r.id})` : null,
      price: priceThb, currency: 'THB'
    }
    if (!name_en) pack.name_en_null_reason = enReason || 'not in the official NCV shop SG English list by sellingProductID'
    if (!description_th) pack.description_th_null_reason = 'official shop lists no Thai description'
    if (!description_en) pack.description_en_null_reason = name_en ? 'official shop SG lists no English description' : pack.name_en_null_reason
    if (!pack.description) pack.description_null_reason = 'official shop lists no description'
    if (!u) {
      pack.price_usd_null_reason = usd.length > 1
        ? `ambiguous: ${usd.length} App Store USD items share this name`
        : `${NO_USD_SHOP}; App Store app ${LINW_APPSTORE_ID} has no matching USD item on ${storefrontsNote}${name_en ? '' : ' (no English name to match)'}; no FX conversion`
    }
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    packs.push(pack)
  }

  const sortP = (a: any, b: any) => (a.order_display ?? 999) - (b.order_display ?? 999) || a.price_thb - b.price_thb || String(a.product_id).localeCompare(String(b.product_id))
  const msg = 'Live (no fallback catalog)'
  const of = (k: string) => packs.filter((p) => p.kind === k).sort(sortP)
  const cats = [
    { id: 1, name: 'Diamonds (official NCV Games Shop TH, base + bonus)', packs: of('currency').sort((a, b) => a.price_thb - b.price_thb), message: msg },
    { id: 2, name: 'Memberships: Silver / Gold (28 days, official NCV Games Shop TH)', packs: of('membership'), message: msg },
    { id: 3, name: 'Passes: Premium unlock keys / Journey keys (official NCV Games Shop TH)', packs: of('pass'), message: msg },
    { id: 4, name: 'Packs & Bundles (official NCV Games Shop TH)', packs: of('bundle'), message: msg }
  ]
  const categories = cats.filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, packCount: c.packs.length }))
  const notes = [
    `Game: ${LINW_NAME} (NCSOFT), SEA server published by NCV Games Pte. Ltd.; App Store app ${LINW_APPSTORE_ID} (com.ncvgames.lineagewsa).`,
    `THB, Thai names/descriptions: official NCV Games Shop Thailand ${LINW_SHOP_TH} via its own anonymous product API (${LINW_PRODUCTS_API}, storefront clientKey read live from the page).`,
    `English names/descriptions: official NCV Games Shop Singapore ${LINW_SHOP_SG} (lang=en) by sellingProductID; its SGD prices are not used.`,
    `USD: ${NO_USD_SHOP}; App Store US, else KH / LA / MM checked live by exact English name. Storefronts: ${storefrontsNote}. No FX conversion. No resellers (Codashop / SEAGM / UniPin) are used.`,
    'Diamonds: base from the package name; the official description lists only Diamonds + Mileage, so bonus Diamonds = 0 and total = base. Mileage is reported separately. Memberships, pass keys and bundles are item_pack:true.'
  ]
  if (!en) notes.push(enReason)
  return ({
    game: { id: LINW_APPSTORE_ID, slug: LINW_SLUG, name: LINW_NAME, itemName: 'Diamonds', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: LINW_SHOP_TH,
    sources: {
      thb: LINW_PRODUCTS_API, official_web_store: LINW_SHOP_TH, official_web_store_en: LINW_SHOP_SG, official_web_store_api: LINW_PRODUCTS_API,
      appstore_usd: LINW_USD_STOREFRONTS.map(linwCatalogUrl)
    },
    notes
  } as unknown) as RovPacksResponse
}

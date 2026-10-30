import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import { parseShopPage, cleanLines, LINW_PRODUCTS_API } from './lineage-w-packs.service'
import type { RovPacksResponse } from '../types/rov'

/**
 * Dream and Lethe Record (developed by NetEase Games; published in Thailand/SEA by VNGGames, App Store seller VNG CORPORATION).
 * Official web store: VNGGames Shop Thailand https://shop.vnggames.com/th/game/dreamth (THB). The page embeds a public
 * storefront clientKey; the same anonymous VNG billing API the page calls (billing.vnggames.com getProducts, bonusInfo=true)
 * returns every package with live THB prices, Thai descriptions and the official webshop Gold bonus per payment method.
 * English names/descriptions for special packs come from the official Singapore storefront (dreamsg), matched by
 * sellingProductID (its SGD prices are ignored). The webshop has no USD storefront, so USD comes from the App Store
 * (app 6505037845) US, else KH / LA / MM, matched by the official product id (com.web… / com.webshop.th.parent.N ->
 * com.iap.sea.gold.N, com.dream.web.firstpay -> com.dream.iap.firstpay). No resellers, no FX conversion, no hardcoded prices.
 */
export const DLR_SLUG = 'dream-and-lethe-record'
export const DLR_NAME = 'Dream and Lethe Record'
export const DLR_APP_ID = 6505037845
export const DLR_SHOP_TH = 'https://shop.vnggames.com/th/game/dreamth'
export const DLR_SHOP_SG = 'https://shop.vnggames.com/sg/game/dreamsg'
export const DLR_PRODUCTS_API = LINW_PRODUCTS_API
export const DLR_APPSTORE_TH = `https://apps.apple.com/th/app/dream-and-lethe-record/id${DLR_APP_ID}`
export const DLR_USD_STOREFRONTS = ['us', 'kh', 'la', 'mm'] as const
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class DreamLetheUpstreamUnavailableError extends Error {
  constructor(message = 'Dream and Lethe Record upstream unavailable') { super(message); this.name = 'DreamLetheUpstreamUnavailableError' }
}
export class DreamLetheInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Dream and Lethe Record upstream response') { super(message); this.name = 'DreamLetheInvalidUpstreamResponseError' }
}

type Bonus = { bonusValue?: number; isEnable?: boolean; inGameCurrency?: string }
export type VngProduct = {
  enable?: number; hidden?: number; sellingProductID: string; productName: string; productGroup?: string; description?: string
  prices?: Record<string, { currency?: string; price?: number }>; image?: string; orderDisplay?: number
  sellFromDate?: number; sellToDate?: number; isSubscription?: number; isLimitedProduct?: number
  bonusByPaymentGroups?: Record<string, { paymentGroupID?: string; bonusByProviders?: Record<string, Bonus> }>
}

/** "6 Gold Giftpack" -> 6 */
export const dlrGoldTier = (name: string) => { const m = name.match(/^\s*(\d[\d,]*)\s+Gold\s+Gift\s*pack\s*$/i); return m ? Number(m[1].replace(/,/g, '')) : null }
export type DlrKind = 'gold' | 'gold-card' | 'monthly-card' | 'bundle'
export function dlrKind(p: VngProduct): DlrKind {
  if (p.productGroup === 'G2' || /monthly/i.test(p.sellingProductID)) return 'monthly-card'
  if (dlrGoldTier(p.productName) !== null) return p.productGroup === 'G3' || /^com\.card\./.test(p.sellingProductID) ? 'gold-card' : 'gold'
  return 'bundle'
}
/** Official webshop product id -> App Store offerName of the same product. */
export function dlrAppleOffer(p: VngProduct): string | null {
  const id = p.sellingProductID
  const tier = dlrGoldTier(p.productName)
  if (tier !== null) return `com.iap.sea.gold.${tier}`
  let m = id.match(/^com\.web\.sea\.monthly\.(\w+)$/)
  if (m) return `com.iap.sea.monthly.${m[1]}`
  m = id.match(/^com\.dream\.web\.(\w+)$/)
  return m ? `com.dream.iap.${m[1]}` : null
}
/** Bonus Gold per payment method: { bank_transfer: 6, truewallet: 6, zgoldmolpoints: 3, ... } */
export function dlrBonus(p: VngProduct): { max: number; min: number; byMethod: Record<string, number> } | null {
  const byMethod: Record<string, number> = {}
  for (const g of Object.values(p.bonusByPaymentGroups ?? {})) {
    for (const [prov, b] of Object.entries(g?.bonusByProviders ?? {})) {
      if (b?.isEnable === false || typeof b?.bonusValue !== 'number') continue
      byMethod[prov] = b.bonusValue
    }
  }
  const v = Object.values(byMethod)
  return v.length ? { max: Math.max(...v), min: Math.min(...v), byMethod } : null
}
export type DlrContent = { item: string; quantity: number }
/** "Receive: Avatar Frame: Clean City x1, Title x1, Jade x180" / "รับทันที: ส่องเงา-ซูซื่อ x1, กระดิ่งเหมียว x10" */
export function parseDlrContents(lines: string[]): DlrContent[] | null {
  const l = lines.find((x) => /^(?:Receive|รับทันที)\s*:/i.test(x))
  if (!l) return null
  const out: DlrContent[] = []
  for (const part of l.replace(/^[^:]*:\s*/, '').split(/,(?!\d{3}\b)/)) {
    const m = part.replace(/\u00a0/g, ' ').trim().match(/^(.+?)\s*[x×*]\s*(\d[\d,]*)$/i)
    if (m) out.push({ item: m[1].trim(), quantity: Number(m[2].replace(/,/g, '')) })
  }
  return out.length ? out : null
}
export const dlrLimit = (lines: string[]) => lines.find((x) => /^-?\s*(?:Purchase Limitation|จำกัดการซื้อ)\s*:/i.test(x))?.replace(/^-\s*/, '') ?? null
/** Keep the item lines; drop the purchase-limit / webpay notes (purchase limit is its own field). */
const dropLimit = (lines: string[]) => lines.filter((x) => !/^(?:-|Purchase Limitation|หมายเหตุ|Note\s*:)/i.test(x.trim()))

async function getText(url: string, signal?: AbortSignal) {
  let r: Response
  try { r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'text/html' } }) } catch (e) {
    throw new DreamLetheUpstreamUnavailableError(`VNGGames shop page ${url}: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!r.ok) throw new DreamLetheUpstreamUnavailableError(`VNGGames shop page ${url}: HTTP ${r.status}`)
  return r.text()
}
async function loadShop(pageUrl: string, lang: string, country: string, signal?: AbortSignal) {
  const shop = parseShopPage(await getText(pageUrl, signal))
  if (!shop) throw new DreamLetheInvalidUpstreamResponseError(`VNGGames shop page ${pageUrl}: storefront clientKey not found`)
  let r: Response
  try {
    r = await fetch(DLR_PRODUCTS_API, {
      method: 'POST', signal: signal ?? AbortSignal.timeout(20_000),
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Accept: 'application/json', Origin: 'https://shop.vnggames.com', Referer: pageUrl },
      body: new URLSearchParams({ lang, country, clientKey: shop.clientKey, bonusInfo: 'true' }).toString()
    })
  } catch (e) { throw new DreamLetheUpstreamUnavailableError(`VNG billing products API: ${e instanceof Error ? e.message : String(e)}`) }
  if (!r.ok) throw new DreamLetheUpstreamUnavailableError(`VNG billing products API HTTP ${r.status}`)
  let j: any
  try { j = await r.json() } catch { throw new DreamLetheInvalidUpstreamResponseError('VNG billing products API: not JSON') }
  if (j?.returnCode !== 1) throw new DreamLetheInvalidUpstreamResponseError(`VNG billing products API returnCode ${j?.returnCode} ${j?.returnMessage_ ?? ''}`.trim())
  const products = j?.data?.products
  if (!products || typeof products !== 'object') throw new DreamLetheInvalidUpstreamResponseError('VNG billing products API: bad shape (no data.products)')
  const now = Date.now()
  const live = (p: VngProduct) => p && typeof p.sellingProductID === 'string' && p.enable !== 0 && p.hidden !== 1 &&
    !(typeof p.sellFromDate === 'number' && p.sellFromDate > 0 && p.sellFromDate > now) && !(typeof p.sellToDate === 'number' && p.sellToDate > 0 && p.sellToDate < now)
  return (Object.values(products) as VngProduct[]).filter(live)
}

type List = { rows: AppStoreFullIapRow[]; cc: string } | { rows: null; cc: string; reason: string }
async function apple(cc: string, signal?: AbortSignal): Promise<List> {
  try { return { rows: await fetchAppStoreFullIap(cc, String(DLR_APP_ID), cc === 'th' ? null : 'en-US', signal), cc } } catch (e) {
    return { rows: null, cc, reason: e instanceof Error ? e.message : String(e) }
  }
}
async function appleUsd(signal?: AbortSignal): Promise<List> {
  const tried: string[] = []
  for (const cc of DLR_USD_STOREFRONTS) {
    const r = await apple(cc, signal)
    if (r.rows && r.rows.some((x) => x.currency === 'USD')) return r
    tried.push(`${cc.toUpperCase()}: ${'reason' in r ? r.reason : 'no USD rows'}`)
  }
  return { rows: null, cc: '', reason: 'App Store USD unavailable (' + tried.join('; ') + ')' }
}
const NO_TH_EN = 'The official VNGGames Shop gives this item an English name only (no separate Thai name)'

export async function fetchDreamAndLetheRecordPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const thList = await loadShop(DLR_SHOP_TH, 'th', 'TH', signal)
  if (!thList.length) throw new DreamLetheInvalidUpstreamResponseError('VNGGames Shop TH returned no products')
  let sgReason = ''
  const sg = await loadShop(DLR_SHOP_SG, 'en', 'SG', signal).catch((e) => { sgReason = e instanceof Error ? e.message : String(e); return null })
  const sgById = new Map((sg ?? []).map((p) => [p.sellingProductID, p]))
  const th = await apple('th', signal)
  const usd = await appleUsd(signal)
  const usdBy = new Map((usd.rows ?? []).filter((r) => r.offerName).map((r) => [r.offerName!, r]))
  const usdReason = 'reason' in usd ? usd.reason : ''

  const cats: Record<DlrKind | 'apple-pass', any[]> = { gold: [], 'gold-card': [], 'monthly-card': [], bundle: [], 'apple-pass': [] }
  for (const p of thList) {
    const thb = p.prices?.THB?.price
    if (typeof thb !== 'number' || !(thb > 0)) continue
    const kind = dlrKind(p)
    const tier = dlrGoldTier(p.productName)
    const thLines = cleanLines(p.description)
    const sgP = sgById.get(p.sellingProductID)
    const enLines = sgP ? cleanLines(sgP.description) : []
    const offer = dlrAppleOffer(p)
    const a = offer ? usdBy.get(offer) : undefined
    const priceUsd = a && a.currency === 'USD' ? a.price : null
    const isGold = kind === 'gold' || kind === 'gold-card'
    const thaiName = /[\u0E00-\u0E7F]/.test(p.productName)
    const nameEn = thaiName ? sgP?.productName ?? null : p.productName
    const pack: any = {
      id: 0, name: nameEn ?? p.productName, product_id: p.sellingProductID, kind, item_pack: !isGold, store: 'vnggames-shop-th',
      name_en: nameEn, name_th: thaiName ? p.productName : null,
      description_th: thLines.length ? dropLimit(thLines).join(' / ') : null,
      description_en: isGold ? p.productName : enLines.length ? dropLimit(enLines).filter((l) => !/^Note:/i.test(l)).join(' / ') : null,
      price_thb: thb, price_thb_source: 'vnggames-shop-th-official',
      price_usd: priceUsd, price_usd_source: priceUsd !== null ? `apple-app-store-${usd.cc} (offerName ${offer}, item ${a!.id})` : null,
      price: thb, currency: 'THB', image_url: p.image ?? null,
      appstore_th_price_thb: (offer && th.rows?.find((r) => r.offerName === offer && r.currency === 'THB')?.price) ?? null,
      purchase_limit: dlrLimit(enLines) ?? dlrLimit(thLines)
    }
    pack.description = pack.description_en ?? pack.description_th
    if (!nameEn) pack.name_en_null_reason = 'Official VNGGames Shop SG (English) not available: ' + (sgReason || 'product not listed there')
    if (!pack.name_th) pack.name_th_null_reason = NO_TH_EN
    if (!pack.description_en) pack.description_en_null_reason = 'No official English text: ' + (sgReason || 'product not on the official SG (English) storefront')
    if (priceUsd === null) pack.price_usd_null_reason = usdReason || (offer ? `Same product (${offer}) is not sold on App Store ${usd.cc.toUpperCase()}; the official webshop has no USD price` : 'No App Store counterpart; the official webshop has no USD price')
    if (isGold) {
      const b = dlrBonus(p)
      Object.assign(pack, {
        baseItemAmount: tier, bonusItemAmount: b ? b.max : 0, totalItemAmount: tier! + (b ? b.max : 0),
        bonus_breakdown: b ? { webshop_bonus_gold_max: b.max, webshop_bonus_gold_min: b.min, by_payment_method: b.byMethod } : null,
        bonus_source: b ? 'vnggames-shop-th-official (bonusByPaymentGroups)' : null, contents: [{ item: 'Gold', quantity: tier }]
      })
      if (b && b.min !== b.max) pack.bonus_note = `Webshop bonus is ${b.max} Gold for most payment methods; lower (${b.min}) for: ` + Object.entries(b.byMethod).filter(([, v]) => v !== b.max).map(([k]) => k).join(', ')
      if (!b) pack.bonus_note = kind === 'gold-card' ? 'VNGGames Card (prepaid card) tier: the official webshop lists no bonus for it' : 'The official webshop lists no bonus for this tier'
      if (kind === 'gold-card') pack.payment_method = 'VNGGames Card (official VNG prepaid card)'
    } else {
      const contents = parseDlrContents(enLines) ?? parseDlrContents(thLines)
      const contentsTh = parseDlrContents(thLines)
      Object.assign(pack, {
        baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, bonus_breakdown: null, bonus_source: null,
        base_null_reason: 'Item pack; gives the listed contents, not a Gold top-up amount', bonus_null_reason: 'Item pack; no Gold bonus',
        contents, contents_th: contentsTh
      })
      if (kind === 'monthly-card') {
        const ad = a?.description ?? th.rows?.find((r) => r.offerName === offer)?.description ?? null
        const days = ad?.match(/(\d+)-Day/i)
        Object.assign(pack, { pass_type: 'monthly-card', duration_days: days ? Number(days[1]) : null, appstore_description_en: ad })
        if (!days) pack.duration_days_null_reason = 'Duration not stated by an official source'
        if (!contents) pack.contents_null_reason = 'The official webshop and App Store only say "Activate the Monthly Card"; daily rewards are not itemised by an official store page'
      } else if (!contents) pack.contents_null_reason = 'Official description does not itemise this pack'
    }
    cats[kind].push(pack)
  }
  // Passes sold only in-app (Daily / Weekly Pack): App Store TH THB + USD by Apple item id.
  if (th.rows) {
    const usdById = new Map((usd.rows ?? []).map((r) => [r.id, r]))
    for (const r of th.rows) {
      if (r.currency !== 'THB' || !/^com\.dream\.iap\.(daily|weekly)/i.test(r.offerName ?? '')) continue
      const u = usdById.get(r.id)
      const c = parseDlrContents(['Receive: ' + (r.description ?? '').replace(/^Purchase to get\s*/i, '').replace(/(\d+)\s+([^,]+)/g, '$2 x$1')])
      const pack: any = {
        id: 0, name: r.name, product_id: r.offerName, kind: 'pass', pass_type: /daily/i.test(r.offerName!) ? 'daily-pack' : 'weekly-pack', item_pack: true, store: 'apple-app-store',
        name_en: r.name, name_th: null, name_th_null_reason: 'Apple App Store lists this in-app item in English only',
        description_en: r.description ?? null, description_th: null, description_th_null_reason: 'Apple App Store lists this in-app item in English only', description: r.description ?? r.name,
        contents: c, baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, bonus_breakdown: null, bonus_source: null,
        base_null_reason: 'Item pack; not a Gold top-up', bonus_null_reason: 'Item pack; no Gold bonus', purchase_limit: null,
        price_thb: r.price, price_thb_source: `apple-app-store-th (item ${r.id})`, price_usd: u && u.currency === 'USD' ? u.price : null,
        price_usd_source: u && u.currency === 'USD' ? `apple-app-store-${usd.cc} (item ${r.id})` : null, price: r.price, currency: 'THB', image_url: null
      }
      if (pack.price_usd === null) pack.price_usd_null_reason = usdReason || `Item ${r.id} not sold on App Store ${usd.cc.toUpperCase()}`
      if (!c) pack.contents_null_reason = 'App Store description does not itemise this pack'
      cats['apple-pass'].push(pack)
    }
  }
  for (const list of Object.values(cats)) for (const p of list) p.prices = { THB: p.price_thb, USD: p.price_usd }
  const byThb = (x: any, y: any) => x.price_thb - y.price_thb || String(x.product_id).localeCompare(String(y.product_id))
  const defs: [keyof typeof cats, string][] = [
    ['gold', 'Gold (Official VNGGames Shop TH top-up)'],
    ['gold-card', 'Gold via VNGGames Card (Official VNGGames Shop TH)'],
    ['monthly-card', 'Monthly Cards (Official VNGGames Shop TH)'],
    ['apple-pass', 'Daily / Weekly Packs (App Store in-app only)'],
    ['bundle', 'Special Packs (Official VNGGames Shop TH)']
  ]
  let n = 1
  const categories = defs.filter(([k]) => cats[k].length).map(([k, name]) => {
    cats[k].sort(byThb); cats[k].forEach((p) => (p.id = n++))
    return { name, status: 0, message: 'OK', packCount: cats[k].length, packs: cats[k] }
  })
  const notes = [
    'Publisher: VNGGames (VNG CORPORATION) publishes Dream and Lethe Record (developed by NetEase Games) in Thailand/SEA. Main: official VNGGames Shop TH https://shop.vnggames.com/th/game/dreamth (live VNG billing products API).',
    'THB = official VNGGames Shop TH price. base = Gold in the tier; bonus = official webshop bonus Gold (bonusByPaymentGroups; most payment methods give the max shown, some give less, see bonus_breakdown). No FX conversion, no resellers.',
    'English names/descriptions of special packs and monthly cards come from the official VNGGames Shop SG storefront (same product ids; SGD ignored). Thai text = official TH storefront.',
    'USD: the official webshop has no USD storefront; USD = same product on App Store (US, else KH / LA / MM). Webshop tiers with no App Store counterpart have USD null with a reason. The in-app THB price of the same product is shown as appstore_th_price_thb (it can differ from the webshop THB).',
    'Daily / Weekly Packs are sold only in-app: App Store TH THB + App Store USD by Apple item id. Rotating in-app gacha/limited offers ("Get exclusive offer") are not listed because Apple does not show whether they are currently sold.'
  ]
  if (!sg) notes.push('Official SG (English) storefront unavailable: ' + sgReason)
  notes.push(APPSTORE_FULL_IAP_NOTE)
  if (!th.rows) notes.push('App Store TH unavailable: ' + th.reason)
  if (!usd.rows) notes.push(usdReason)
  return ({
    game: { id: DLR_APP_ID, slug: DLR_SLUG, name: DLR_NAME, itemName: 'Gold', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: DLR_SHOP_TH,
    sources: {
      topup_page: DLR_SHOP_TH, products: DLR_PRODUCTS_API, english: DLR_SHOP_SG, thb: DLR_SHOP_TH,
      appstore_th: `${APPSTORE_IAP_API_BASE}/th/apps/${DLR_APP_ID}/top-in-apps`,
      appstore_usd: `${APPSTORE_IAP_API_BASE}/${usd.cc || 'us'}/apps/${DLR_APP_ID}/top-in-apps`, appstore_th_page: DLR_APPSTORE_TH
    },
    notes
  } as unknown) as RovPacksResponse
}

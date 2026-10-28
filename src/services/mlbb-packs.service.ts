import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'
import { matchApple } from './where-winds-meet-packs.service'

/**
 * Mobile Legends: Bang Bang (Moonton). Primary source = Moonton's official web store Mobapay
 * (www.mobapay.com/mlbb, api.mobapay.com app_id 100000, country TH), live THB list prices (price_local_show).
 * Mobapay has no USD storefront for MLBB (US / SG / KH / LA / MM ... answer "App is closed"), so USD comes from Apple:
 * App Store US, or a USD storefront (LA, then MM) when the SEA build (app 1160056295) is not sold in the US.
 * Mobapay items are linked to Apple only by offerName (Mobapay sku with its "_mt_th" channel tag removed, exact + unique)
 * or Apple item id; never by name. App Store TH is also the fallback (and the only source for Twilight Pass and other
 * in-app-only passes). No resellers (Codashop / SEAGM / UniPin ...), no FX conversion, no hardcoded prices.
 */
export const MLBB_SLUG = 'mobile-legends'
export const MLBB_NAME = 'Mobile Legends: Bang Bang'
export const MLBB_MOBAPAY_APP_ID = 100000
export const MLBB_APPSTORE_ID = 1160056295
export const MLBB_MOBAPAY_COUNTRY = 'TH'
export const MLBB_MOBAPAY_API = 'https://api.mobapay.com/api/app_shop'
export const MLBB_MOBAPAY_PAGE = 'https://www.mobapay.com/mlbb/?r=TH'
export const MLBB_USD_FALLBACK_STOREFRONTS = ['la', 'mm'] as const
export const mlbbMobapayUrl = (language: string, country = MLBB_MOBAPAY_COUNTRY) =>
  `${MLBB_MOBAPAY_API}?app_id=${MLBB_MOBAPAY_APP_ID}&game_user_key=&game_server_key=&country=${country}&language=${language}&network=&net=&coupon_id=&shop_id=`
export const mlbbCatalogUrl = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${MLBB_APPSTORE_ID}/top-in-apps`

export class MlbbUpstreamUnavailableError extends Error {
  constructor(message = 'Mobile Legends: Bang Bang upstream unavailable') { super(message); this.name = 'MlbbUpstreamUnavailableError' }
}
export class MlbbInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Mobile Legends: Bang Bang upstream response') { super(message); this.name = 'MlbbInvalidUpstreamResponseError' }
}

export type MobapayGood = { id: number; sku: string; title: string; description?: string; price_local_show: string; currency: string; goods_limit?: { game_limit?: boolean } }
export type MobapayShop = { goods: MobapayGood[]; firstRecharge: MobapayGood[]; firstRechargeTitle: string | null; firstRechargeDescription: string | null }

/** Strip HTML tags/entities from Mobapay rich-text descriptions. */
export function stripHtml(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/[\u200b]/g, '').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/"{2,}/g, '"').trim()
  return t || null
}

/** "286+29" -> {base 286, bonus 29}; null when the title is not base+bonus. */
export function parseBaseBonus(title: string): { base: number; bonus: number } | null {
  const m = title.match(/^\s*(\d[\d,]*)\s*\+\s*(\d[\d,]*)\s*$/)
  return m ? { base: Number(m[1].replace(/,/g, '')), bonus: Number(m[2].replace(/,/g, '')) } : null
}
/** Mobapay sku -> Apple offerName candidate: drop the Mobapay TH channel tag ("_mt_th"). */
export const mobapaySkuToOfferName = (sku: string) => sku.replace(/_mt_th(?=_|$)/, '')

export function parseMobapayShop(json: unknown): MobapayShop | null {
  const j = json as any
  if (!j || typeof j !== 'object' || j.code !== 0) return null
  const si = j.data?.shop_info
  if (!si || !Array.isArray(si.good_list)) return null
  const ok = (g: any): g is MobapayGood => g && typeof g.sku === 'string' && typeof g.title === 'string' && Number.isFinite(Number(g.price_local_show)) && typeof g.currency === 'string'
  const shelf = Array.isArray(si.shelf_location) ? si.shelf_location.find((s: any) => /first recharge|double|เติมครั้งแรก/i.test(String(s?.title ?? ''))) ?? null : null
  const goods = si.good_list.filter(ok)
  if (!goods.length) return null
  return {
    goods,
    firstRecharge: shelf && Array.isArray(shelf.goods) ? shelf.goods.filter(ok) : [],
    firstRechargeTitle: shelf?.title ?? null,
    firstRechargeDescription: shelf?.description ?? null
  }
}

type Mp = { shop: MobapayShop } | { shop: null; reason: string; invalid: boolean }
async function mobapay(language: string, signal?: AbortSignal): Promise<Mp> {
  let res: Response
  try {
    res = await fetch(mlbbMobapayUrl(language), { headers: { Accept: 'application/json', Origin: 'https://www.mobapay.com', Referer: 'https://www.mobapay.com/' }, signal })
  } catch (e) { return { shop: null, reason: `Mobapay fetch failed: ${e instanceof Error ? e.message : String(e)}`, invalid: false } }
  if (!res.ok) return { shop: null, reason: `Mobapay HTTP ${res.status}`, invalid: false }
  let j: any
  try { j = await res.json() } catch { return { shop: null, reason: 'Mobapay returned non-JSON', invalid: true } }
  const shop = parseMobapayShop(j)
  if (!shop) return { shop: null, reason: `Mobapay response not usable (code=${j?.code ?? 'n/a'}${j?.message ? `, ${j.message}` : ''})`, invalid: true }
  return { shop }
}

type List = { rows: AppStoreFullIapRow[] } | { rows: null; reason: string }
async function list(cc: string, l: string | null, signal?: AbortSignal, retryMs = 2500): Promise<List> {
  for (let attempt = 0; ; attempt++) {
    try { return { rows: await fetchAppStoreFullIap(cc, String(MLBB_APPSTORE_ID), l, signal) } } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      // One retry on Apple rate limiting (HTTP 429).
      if (attempt === 0 && /\b429\b/.test(reason) && !signal?.aborted) { await new Promise((r) => setTimeout(r, retryMs)); continue }
      return { rows: null, reason }
    }
  }
}
const notInUs = (x: List) => (/\b404\b/.test(reasonOf(x)) ? '; SEA build not sold in the US' : '')
const reasonOf = (x: List) => ('reason' in x ? x.reason : '')

export type MlbbAppleKind = 'currency' | 'pass' | 'other'
/** Apple plain Diamond tiers (offerName com.moonton.diamond_<N>[_new|_in], name "<N> Diamonds"); passes by name; everything else other. */
export function mlbbAppleKind(offerName: string | null | undefined, name: string): MlbbAppleKind {
  if (/^com\.moonton\.diamond_\d+(?:_new|_in)?$/.test(offerName ?? '') && /^\s*\d[\d,]*\s+diamonds\s*$/i.test(name)) return 'currency'
  if (/\bpass\b|twilight|starlight|subscription|growth fund/i.test(name)) return 'pass'
  return 'other'
}
export function mlbbPassType(name: string): string {
  if (/weekly diamond pass/i.test(name)) return 'weekly-diamond-pass'
  if (/twilight/i.test(name)) return 'twilight-pass'
  if (/starlight/i.test(name)) return 'starlight-membership'
  if (/season pass/i.test(name)) return 'season-pass'
  if (/subscription/i.test(name)) return /monthly/i.test(name) ? 'monthly-subscription' : 'weekly-subscription'
  if (/growth/i.test(name)) return 'growth-pass'
  return 'pass'
}
/** "50 Diamonds+5 Bonus Diamonds" -> 5 */
export function appleBonus(desc: string | null | undefined): number | null {
  const m = (desc ?? '').match(/(\d[\d,]*)\s*bonus\s+diamonds?/i)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

export async function fetchMlbbPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  // Sequential (Apple rate-limits bursts).
  const mpEn = await mobapay('en', signal)
  const mpTh = mpEn.shop ? await mobapay('th', signal) : null
  const thEn = await list('th', 'en-GB', signal)
  const thTh = thEn.rows ? await list('th', 'th', signal) : thEn
  if (!mpEn.shop && !thEn.rows) {
    const msg = `${'reason' in mpEn ? mpEn.reason : ''}; App Store TH: ${reasonOf(thEn)}`
    if ('invalid' in mpEn && mpEn.invalid) throw new MlbbInvalidUpstreamResponseError(msg)
    throw new MlbbUpstreamUnavailableError(msg)
  }
  const thRows = (thEn.rows ?? []).filter((r) => r.currency === 'THB')
  const us = await list('us', 'en-US', signal)
  const fallbackUsd: Record<string, List> = {}
  const usdFor = async (ref: { offerName?: string | null; id?: string | null }) => {
    const m = matchApple(us.rows, ref)
    if (m && m.row.currency === 'USD') return { m, cc: 'us' }
    for (const cc of MLBB_USD_FALLBACK_STOREFRONTS) {
      fallbackUsd[cc] ??= await list(cc, null, signal)
      const f = matchApple(fallbackUsd[cc].rows, ref)
      if (f && f.row.currency === 'USD') return { m: f, cc }
    }
    return null
  }
  const storefronts = () =>
    `App Store US${us.rows ? '' : ` (${reasonOf(us)}${notInUs(us)})`} or ` +
    MLBB_USD_FALLBACK_STOREFRONTS.map((c) => `${c.toUpperCase()}${fallbackUsd[c] && !fallbackUsd[c].rows ? ` (${reasonOf(fallbackUsd[c])})` : ''}`).join('/')

  const packs: any[] = []
  const usedApple = new Set<string>()

  // ---- Mobapay (official Moonton web store) ----
  if (mpEn.shop) {
    const shopTh = mpTh?.shop ?? null
    const thBySku = new Map<string, MobapayGood>()
    if (shopTh) for (const g of [...shopTh.goods, ...shopTh.firstRecharge]) thBySku.set(g.sku, g)
    const firstSkus = new Set(mpEn.shop.firstRecharge.map((g) => g.sku))
    const all = [...mpEn.shop.firstRecharge, ...mpEn.shop.goods.filter((g) => !firstSkus.has(g.sku))]
    for (const g of all) {
      if (g.currency !== 'THB') continue
      const first = firstSkus.has(g.sku)
      const bb = parseBaseBonus(g.title)
      const kind: 'currency' | 'first-recharge' | 'pass' | 'bundle' = first ? 'first-recharge' : bb ? 'currency' : /pass/i.test(g.title) ? 'pass' : 'bundle'
      const thG = thBySku.get(g.sku)
      const offerName = mobapaySkuToOfferName(g.sku)
      const ref = { offerName: offerName !== g.sku ? offerName : null }
      const appleTh = ref.offerName ? matchApple(thRows, ref) : null
      // Passes/bundles: the Apple row is the same item, so it is not listed twice. Diamond tiers stay listed (Apple tier contents differ).
      if (appleTh && !bb) usedApple.add(appleTh.row.id)
      const u = ref.offerName ? await usdFor(ref) : null
      const description_en = stripHtml(g.description)
      const description_th = stripHtml(thG?.description)
      const parts: string[] = []
      for (const s of [description_th, description_en]) if (s && !parts.includes(s)) parts.push(s)
      const thb = Number(g.price_local_show)
      const pack: any = {
        id: Number(g.id) || 0, name: g.title, product_id: g.sku, kind, store: 'mobapay',
        name_th: thG?.title ?? null, name_th_source: thG ? 'mobapay-th (language=th)' : null,
        description: parts.join(' / ') || null,
        description_th, description_th_source: description_th ? 'mobapay-th (language=th)' : null,
        description_en, description_en_source: description_en ? 'mobapay-th (language=en)' : null,
        purchase_limited: g.goods_limit?.game_limit === true,
        apple_item_id: appleTh?.row.id ?? u?.m.row.id ?? null,
        apple_offer_name: appleTh || u ? offerName : null,
        price_thb_appstore: appleTh?.row.price ?? null,
        ...(bb
          ? {
              baseItemAmount: bb.base, bonusItemAmount: bb.bonus, totalItemAmount: bb.base + bb.bonus, item_pack: false,
              ...(first ? { first_recharge: true, first_recharge_bonus: bb.bonus, bonus_note: 'Double Diamonds on first recharge of this tier only (bonus = base); later purchases give the base amount' } : {})
            }
          : {
              baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, item_pack: true,
              base_null_reason: (kind === 'pass' ? 'Pass' : 'Bundle') + ' item; not a plain Diamond amount (contents in description)',
              bonus_null_reason: 'Mobapay lists no bonus amount for pass/bundle items',
              total_null_reason: 'Pass/bundle contents are not a single Diamond amount',
              ...(kind === 'pass' ? { pass_type: mlbbPassType(g.title) } : {})
            }),
        price_thb: thb,
        price_thb_source: `mobapay-th (official Moonton store, app_id ${MLBB_MOBAPAY_APP_ID}, goods ${g.id}, price_local_show)`,
        price_usd: u ? u.m.row.price : null,
        price_usd_source: u ? `apple-app-store-${u.cc} (USD storefront, ${u.m.by}; Mobapay has no USD storefront)` : null,
        price: thb, currency: 'THB'
      }
      if (!thG) pack.name_th_null_reason = shopTh ? 'not in the Thai-language Mobapay list by sku' : `Thai-language Mobapay list unavailable (${mpTh && 'reason' in mpTh ? mpTh.reason : 'not fetched'})`
      if (!parts.length) pack.description_null_reason = 'Mobapay lists no description for this item'
      if (pack.price_thb_appstore === null) pack.price_thb_appstore_null_reason = ref.offerName ? `no App Store TH item with offerName ${offerName}` : 'Mobapay sku has no Apple offerName counterpart'
      if (!u) pack.price_usd_null_reason = `Mobapay has no USD storefront for MLBB (US/SG/KH/LA/MM: App is closed); no Apple item with offerName ${offerName} on ${storefronts()}`
      pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
      packs.push(pack)
    }
  }

  // ---- App Store TH (fallback, and the only source for in-app-only passes such as Twilight Pass) ----
  let appleOther = 0
  for (const row of thRows) {
    if (usedApple.has(row.id)) continue
    const kind = mlbbAppleKind(row.offerName, row.name)
    if (kind === 'other' && mpEn.shop) { appleOther++; continue }
    const ref = { offerName: row.offerName ?? null, id: row.id }
    const th = thTh.rows ? matchApple(thTh.rows, ref)?.row : undefined
    const u = await usdFor(ref)
    const base = kind === 'currency' ? Number(row.name.replace(/[^\d]/g, '')) : null
    const bonus = kind === 'currency' ? appleBonus(row.description) : null
    const description_en = row.description ?? null
    const description_th = th?.description ?? null
    const parts: string[] = []
    for (const s of [description_th, description_en]) if (s && !parts.includes(s)) parts.push(s)
    const pack: any = {
      id: Number(row.id) || 0, name: row.name, product_id: row.offerName ?? null, kind: kind === 'other' ? 'bundle' : kind, store: 'apple-app-store',
      name_th: th?.name ?? null, name_th_source: th ? 'apple-app-store-th (th)' : null,
      description: parts.join(' / ') || null,
      description_th, description_th_source: description_th ? 'apple-app-store-th (th)' : null,
      description_en, description_en_source: description_en ? 'apple-app-store-th (en-GB)' : null,
      apple_item_id: row.id,
      family_shareable: typeof row.familyShareable === 'boolean' ? row.familyShareable : null,
      ...(kind === 'currency'
        ? {
            baseItemAmount: base, bonusItemAmount: bonus, totalItemAmount: base !== null && bonus !== null ? base + bonus : null, item_pack: false,
            ...(bonus === null ? { bonus_null_reason: 'Apple description states no bonus Diamonds', total_null_reason: 'Bonus unknown, so total is not stated' } : {})
          }
        : {
            baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, item_pack: true,
            base_null_reason: (kind === 'pass' ? 'Pass' : 'Bundle') + ' item; not a plain Diamond amount (contents in name/description)',
            bonus_null_reason: 'App Store lists no bonus for pass/bundle items',
            total_null_reason: 'Pass/bundle contents are not a single Diamond amount',
            ...(kind === 'pass' ? { pass_type: mlbbPassType(row.name) } : {})
          }),
      price_thb: row.price,
      price_thb_source: `apple-app-store-th (item ${row.id}${row.offerName ? `, offerName=${row.offerName}` : ''})`,
      price_usd: u ? u.m.row.price : null,
      price_usd_source: u ? `apple-app-store-${u.cc} (USD storefront, ${u.m.by})` : null,
      price: row.price, currency: 'THB'
    }
    if (!th) pack.name_th_null_reason = thTh.rows ? 'not in the Thai-language App Store TH list by offerName/Apple item id' : `Thai-language App Store TH list unavailable (${reasonOf(thTh)})`
    if (!parts.length) pack.description_null_reason = 'Apple lists no description for this item'
    if (!u) pack.price_usd_null_reason = `not found on ${storefronts()} (USD storefronts) by offerName/Apple item id`
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    packs.push(pack)
  }

  const sortP = (a: any, b: any) => a.price_thb - b.price_thb || (a.baseItemAmount ?? 0) - (b.baseItemAmount ?? 0) || String(a.product_id).localeCompare(String(b.product_id))
  const msg = 'Live (no fallback catalog)'
  const of = (store: string, kinds: string[]) => packs.filter((p) => p.store === store && kinds.includes(p.kind)).sort(sortP)
  const cats = [
    { id: 1, name: 'Diamonds (Mobapay TH, base + bonus)', packs: of('mobapay', ['currency']), message: msg },
    { id: 2, name: 'Double Diamonds on First Recharge (Mobapay TH)', packs: of('mobapay', ['first-recharge']), message: msg },
    { id: 3, name: 'Passes & Bundles (Mobapay TH)', packs: of('mobapay', ['pass', 'bundle']), message: msg },
    { id: 4, name: 'Diamonds (App Store TH)', packs: of('apple-app-store', ['currency']), message: msg },
    { id: 5, name: 'Passes incl. Twilight Pass (App Store TH)', packs: of('apple-app-store', ['pass']), message: msg },
    { id: 6, name: 'Bundles (App Store TH)', packs: of('apple-app-store', ['bundle']), message: msg }
  ]
  const categories = cats.filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, packCount: c.packs.length }))
  const usdUsed = [...new Set(packs.map((p) => p.price_usd_source).filter(Boolean).map((s: string) => s.split(' ')[0].replace('apple-app-store-', '')))]
  const notes = [
    `Game: ${MLBB_NAME} (Moonton). Official web store: Mobapay ${MLBB_MOBAPAY_PAGE} (api.mobapay.com app_id ${MLBB_MOBAPAY_APP_ID}, country TH). App Store app ${MLBB_APPSTORE_ID}.`,
    'THB = Mobapay TH list price (price_local_show; payment-channel discounts such as "2% OFF" are not applied). Diamonds titles are base+bonus (total = base + bonus). First-recharge tiers (50/150/250/500) give double Diamonds on the first purchase of each tier only.',
    'Mobapay has no USD storefront for MLBB (US / SG / KH / LA / MM return "App is closed"), so USD = App Store US, or a USD storefront (LA, then MM) when the SEA build is not sold in the US, matched only by Apple offerName (Mobapay sku without "_mt_th") or Apple item id. No FX conversion.',
    'App Store TH is the fallback and the source for in-app-only passes (Twilight Pass, Starlight, Season Pass, subscriptions). Passes/bundles are item_pack:true. No resellers (Codashop / SEAGM / UniPin) are used.',
    `USD storefronts used: ${usdUsed.length ? usdUsed.map((c) => c.toUpperCase()).join(', ') : 'none'}`
  ]
  if (mpEn.shop && appleOther) notes.push(`App Store TH skin/event bundles and regional legacy items not listed (${appleOther} items); Mobapay covers the current bundles.`)
  notes.push(APPSTORE_FULL_IAP_NOTE)
  if (!mpEn.shop) notes.push('Mobapay TH unavailable, App Store TH fallback only: ' + ('reason' in mpEn ? mpEn.reason : ''))
  if (mpTh && 'reason' in mpTh) notes.push('Mobapay TH (Thai): ' + mpTh.reason)
  if (!thEn.rows) notes.push('App Store TH (en-GB): ' + reasonOf(thEn))
  else if (!thTh.rows) notes.push('App Store TH (Thai): ' + reasonOf(thTh))
  if (!us.rows) notes.push('App Store US: ' + reasonOf(us) + notInUs(us))
  return ({
    game: { id: MLBB_MOBAPAY_APP_ID, slug: MLBB_SLUG, name: MLBB_NAME, itemName: 'Diamonds', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: mpEn.shop ? mlbbMobapayUrl('en') : mlbbCatalogUrl('th'),
    sources: {
      thb: mlbbMobapayUrl('en'), mobapay_th: mlbbMobapayUrl('en'), mobapay_th_thai: mlbbMobapayUrl('th'), mobapay_page: MLBB_MOBAPAY_PAGE,
      appstore_th: mlbbCatalogUrl('th'), appstore_us: mlbbCatalogUrl('us'), appstore_usd_fallback: MLBB_USD_FALLBACK_STOREFRONTS.map(mlbbCatalogUrl)
    },
    notes
  } as unknown) as RovPacksResponse
}

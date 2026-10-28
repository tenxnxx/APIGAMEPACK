import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'
import { matchApple } from './where-winds-meet-packs.service'
import { stripHtml, parseBaseBonus, mobapaySkuToOfferName, parseMobapayShop, type MobapayGood, type MobapayShop } from './mlbb-packs.service'

/**
 * Magic Chess: Go Go (Moonton). Primary source = Moonton's official web store Mobapay
 * (www.mobapay.com/mcgg, api.mobapay.com app_id 124526 = api/app_list code "mcgg", country TH), live THB list prices
 * (price_local_show), Thai + English titles/descriptions (language=th / en).
 * USD: Mobapay's own USD storefront (country KH, currency USD) for the same Mobapay item (same goods id, or the same
 * sku with the "_mt_th_" channel tag replaced by "_mt_kh_"); otherwise Apple (App Store US, then the USD storefronts
 * LA / MM; the game is not sold on the US App Store) matched only by Apple offerName (Mobapay sku without "_mt_th")
 * or Apple item id, never by name. App Store TH is the fallback and lists the in-app items (Weekly Diamond Pass
 * Subscription, Promotion Fund, lottery packs ...). No resellers, no FX conversion, no hardcoded prices.
 */
export const MCGG_SLUG = 'magic-chess-go-go'
export const MCGG_NAME = 'Magic Chess: Go Go'
export const MCGG_MOBAPAY_APP_ID = 124526
export const MCGG_APPSTORE_ID = 6612014908
export const MCGG_MOBAPAY_COUNTRY = 'TH'
export const MCGG_MOBAPAY_USD_COUNTRY = 'KH'
export const MCGG_MOBAPAY_API = 'https://api.mobapay.com/api/app_shop'
export const MCGG_MOBAPAY_PAGE = 'https://www.mobapay.com/mcgg/?r=TH'
export const MCGG_USD_FALLBACK_STOREFRONTS = ['la', 'mm'] as const
export const mcggMobapayUrl = (language: string, country = MCGG_MOBAPAY_COUNTRY) =>
  `${MCGG_MOBAPAY_API}?app_id=${MCGG_MOBAPAY_APP_ID}&game_user_key=&game_server_key=&country=${country}&language=${language}&network=&net=&coupon_id=&shop_id=`
export const mcggCatalogUrl = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${MCGG_APPSTORE_ID}/top-in-apps`

export class MagicChessUpstreamUnavailableError extends Error {
  constructor(message = 'Magic Chess: Go Go upstream unavailable') { super(message); this.name = 'MagicChessUpstreamUnavailableError' }
}
export class MagicChessInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Magic Chess: Go Go upstream response') { super(message); this.name = 'MagicChessInvalidUpstreamResponseError' }
}

/** A Mobapay price that is actually stated (KH lists some tiers with an empty price_local_show). */
export const mobapayPrice = (g: MobapayGood | undefined): number | null => {
  const s = String(g?.price_local_show ?? '').trim()
  const n = Number(s)
  return s && Number.isFinite(n) && n > 0 ? n : null
}
/** Same Mobapay item on the USD (KH) storefront: same goods id, else the same sku with "_mt_th_" -> "_mt_kh_". */
export function matchMobapayUsd(usd: MobapayShop | null, g: MobapayGood): { g: MobapayGood; by: string } | null {
  if (!usd) return null
  const all = [...usd.goods, ...usd.firstRecharge].filter((x) => x.currency === 'USD' && mobapayPrice(x) !== null)
  const byId = all.find((x) => Number(x.id) === Number(g.id) && x.sku === g.sku)
  if (byId) return { g: byId, by: `goods id ${g.id}` }
  const khSku = g.sku.replace(/_mt_th(?=_|$)/, '_mt_kh')
  if (khSku === g.sku) return null
  const bySku = all.filter((x) => x.sku === khSku)
  return bySku.length === 1 ? { g: bySku[0], by: `sku ${khSku}` } : null
}

type Mp = { shop: MobapayShop } | { shop: null; reason: string; invalid: boolean }
async function mobapay(language: string, country: string, signal?: AbortSignal): Promise<Mp> {
  let res: Response
  try {
    res = await fetch(mcggMobapayUrl(language, country), { headers: { Accept: 'application/json', Origin: 'https://www.mobapay.com', Referer: 'https://www.mobapay.com/' }, signal })
  } catch (e) { return { shop: null, reason: `Mobapay ${country} fetch failed: ${e instanceof Error ? e.message : String(e)}`, invalid: false } }
  if (!res.ok) return { shop: null, reason: `Mobapay ${country} HTTP ${res.status}`, invalid: false }
  let j: any
  try { j = await res.json() } catch { return { shop: null, reason: `Mobapay ${country} returned non-JSON`, invalid: true } }
  const shop = parseMobapayShop(j)
  if (!shop) return { shop: null, reason: `Mobapay ${country} response not usable (code=${j?.code ?? 'n/a'}${j?.message ? `, ${j.message}` : ''})`, invalid: true }
  return { shop }
}

type List = { rows: AppStoreFullIapRow[] } | { rows: null; reason: string }
async function list(cc: string, l: string | null, signal?: AbortSignal, retryMs = 2500): Promise<List> {
  for (let attempt = 0; ; attempt++) {
    try { return { rows: await fetchAppStoreFullIap(cc, String(MCGG_APPSTORE_ID), l, signal) } } catch (e) {
      const reason = e instanceof Error ? e.message : String(e)
      // One retry on Apple rate limiting (HTTP 429).
      if (attempt === 0 && /\b429\b/.test(reason) && !signal?.aborted) { await new Promise((r) => setTimeout(r, retryMs)); continue }
      return { rows: null, reason }
    }
  }
}
const reasonOf = (x: List) => ('reason' in x ? x.reason : '')
const notInUs = (x: List) => (/\b404\b/.test(reasonOf(x)) ? '; not sold on the US App Store' : '')

export type McggKind = 'currency' | 'pass' | 'bundle'
/** Apple plain Diamond tiers (offerName com.moonton.diamond_<N>_mcgg, name "<N> diamonds"); passes by name; everything else bundle. */
export function mcggAppleKind(offerName: string | null | undefined, name: string): McggKind {
  if (/^com\.moonton\.diamond_\d+_mcgg$/.test(offerName ?? '') && /^\s*\d[\d,]*\s+diamonds?\s*$/i.test(name)) return 'currency'
  return mcggIsPass(name, offerName) ? 'pass' : 'bundle'
}
export const mcggIsPass = (name: string, sku?: string | null) =>
  /\bpass\b|weekly|subscription|fund|bounty/i.test(name) || /weekly|growthplan|promotionfund|_sub[._]/i.test(sku ?? '')
export function mcggPassType(name: string, sku?: string | null): string {
  if (/subscription/i.test(name)) return 'weekly-diamond-pass-subscription'
  if (/weekly card/i.test(name) || /weekly/i.test(sku ?? '')) return 'weekly-card'
  if (/bounty/i.test(name) || /growthplan/i.test(sku ?? '')) return 'battle-bounty'
  if (/fund/i.test(name) || /promotionfund/i.test(sku ?? '')) return 'promotion-fund'
  return 'pass'
}

export async function fetchMagicChessGoGoPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  // Sequential (Apple rate-limits bursts).
  const mpEn = await mobapay('en', MCGG_MOBAPAY_COUNTRY, signal)
  const mpTh = mpEn.shop ? await mobapay('th', MCGG_MOBAPAY_COUNTRY, signal) : null
  const mpUsd = mpEn.shop ? await mobapay('en', MCGG_MOBAPAY_USD_COUNTRY, signal) : null
  const usdShop = mpUsd?.shop && [...mpUsd.shop.goods, ...mpUsd.shop.firstRecharge].some((g) => g.currency === 'USD') ? mpUsd.shop : null
  const thEn = await list('th', 'en-GB', signal)
  const thTh = thEn.rows ? await list('th', 'th', signal) : thEn
  if (!mpEn.shop && !thEn.rows) {
    const msg = `${'reason' in mpEn ? mpEn.reason : ''}; App Store TH: ${reasonOf(thEn)}`
    if ('invalid' in mpEn && mpEn.invalid) throw new MagicChessInvalidUpstreamResponseError(msg)
    throw new MagicChessUpstreamUnavailableError(msg)
  }
  const thRows = (thEn.rows ?? []).filter((r) => r.currency === 'THB')
  const us = await list('us', 'en-US', signal)
  const fallbackUsd: Record<string, List> = {}
  const usdFor = async (ref: { offerName?: string | null; id?: string | null }) => {
    const m = matchApple(us.rows, ref)
    if (m && m.row.currency === 'USD') return { m, cc: 'us' }
    for (const cc of MCGG_USD_FALLBACK_STOREFRONTS) {
      fallbackUsd[cc] ??= await list(cc, null, signal)
      const f = matchApple(fallbackUsd[cc].rows, ref)
      if (f && f.row.currency === 'USD') return { m: f, cc }
    }
    return null
  }
  const storefronts = () =>
    `App Store US${us.rows ? '' : ` (${reasonOf(us)}${notInUs(us)})`} or ` +
    MCGG_USD_FALLBACK_STOREFRONTS.map((c) => `${c.toUpperCase()}${fallbackUsd[c] && !fallbackUsd[c].rows ? ` (${reasonOf(fallbackUsd[c])})` : ''}`).join('/')
  const mpUsdState = usdShop ? 'Mobapay KH (USD) has no item with this goods id / sku' : `Mobapay USD storefront unavailable (${mpUsd && 'reason' in mpUsd ? mpUsd.reason : 'KH not in USD'})`

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
      const thb = mobapayPrice(g)
      if (g.currency !== 'THB' || thb === null) continue
      const first = firstSkus.has(g.sku)
      const bb = parseBaseBonus(g.title)
      const kind: 'currency' | 'first-recharge' | 'pass' | 'bundle' = first ? 'first-recharge' : bb ? 'currency' : mcggIsPass(g.title, g.sku) ? 'pass' : 'bundle'
      const thG = thBySku.get(g.sku)
      const offerName = mobapaySkuToOfferName(g.sku)
      const ref = { offerName: offerName !== g.sku ? offerName : null }
      const appleTh = ref.offerName ? matchApple(thRows, ref) : null
      if (appleTh && !bb) usedApple.add(appleTh.row.id)
      const mu = matchMobapayUsd(usdShop, g)
      const u = !mu && ref.offerName ? await usdFor(ref) : null
      const description_en = stripHtml(g.description)
      const description_th = stripHtml(thG?.description)
      const parts: string[] = []
      for (const s of [description_th, description_en]) if (s && !parts.includes(s)) parts.push(s)
      const pack: any = {
        id: Number(g.id) || 0, name: g.title.trim(), product_id: g.sku, kind, store: 'mobapay',
        name_th: thG?.title?.trim() ?? null, name_th_source: thG ? 'mobapay-th (language=th)' : null,
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
              ...(kind === 'pass' ? { pass_type: mcggPassType(g.title, g.sku) } : {})
            }),
        price_thb: thb,
        price_thb_source: `mobapay-th (official Moonton store, app_id ${MCGG_MOBAPAY_APP_ID}, goods ${g.id}, price_local_show)`,
        price_usd: mu ? mobapayPrice(mu.g) : u ? u.m.row.price : null,
        price_usd_source: mu
          ? `mobapay-kh (official Moonton store, USD storefront, ${mu.by}, goods ${mu.g.id}, price_local_show)`
          : u ? `apple-app-store-${u.cc} (USD storefront, ${u.m.by})` : null,
        price: thb, currency: 'THB'
      }
      if (!thG) pack.name_th_null_reason = shopTh ? 'not in the Thai-language Mobapay list by sku' : `Thai-language Mobapay list unavailable (${mpTh && 'reason' in mpTh ? mpTh.reason : 'not fetched'})`
      if (!parts.length) pack.description_null_reason = 'Mobapay lists no description for this item'
      if (pack.price_thb_appstore === null) pack.price_thb_appstore_null_reason = ref.offerName ? `no App Store TH item with offerName ${offerName}` : 'Mobapay sku has no Apple offerName counterpart'
      if (pack.price_usd === null)
        pack.price_usd_null_reason = `${mpUsdState}; ${ref.offerName ? `no Apple item with offerName ${offerName} on ${storefronts()}` : 'Mobapay sku has no Apple offerName counterpart (no "_mt_th" tag)'}`
      pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
      packs.push(pack)
    }
  }

  // ---- App Store TH (fallback, and the source for in-app-only items) ----
  for (const row of thRows) {
    if (usedApple.has(row.id)) continue
    const kind = mcggAppleKind(row.offerName, row.name)
    const ref = { offerName: row.offerName ?? null, id: row.id }
    const th = thTh.rows ? matchApple(thTh.rows, ref)?.row : undefined
    const u = await usdFor(ref)
    const base = kind === 'currency' ? Number(row.name.replace(/[^\d]/g, '')) : null
    const description_en = row.description ?? null
    const description_th = th?.description ?? null
    const parts: string[] = []
    for (const s of [description_th, description_en]) if (s && !parts.includes(s)) parts.push(s)
    const pack: any = {
      id: Number(row.id) || 0, name: row.name, product_id: row.offerName ?? null, kind, store: 'apple-app-store',
      name_th: th?.name ?? null, name_th_source: th ? 'apple-app-store-th (th)' : null,
      description: parts.join(' / ') || null,
      description_th, description_th_source: description_th ? 'apple-app-store-th (th)' : null,
      description_en, description_en_source: description_en ? 'apple-app-store-th (en-GB)' : null,
      apple_item_id: row.id,
      family_shareable: typeof row.familyShareable === 'boolean' ? row.familyShareable : null,
      ...(kind === 'currency'
        ? {
            baseItemAmount: base, bonusItemAmount: null, totalItemAmount: null, item_pack: false,
            bonus_null_reason: 'App Store lists only the base Diamonds (no bonus stated)', total_null_reason: 'Bonus unknown, so total is not stated'
          }
        : {
            baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, item_pack: true,
            base_null_reason: (kind === 'pass' ? 'Pass' : 'Bundle') + ' item; not a plain Diamond amount (contents in name/description)',
            bonus_null_reason: 'App Store lists no bonus for pass/bundle items',
            total_null_reason: 'Pass/bundle contents are not a single Diamond amount',
            ...(kind === 'pass' ? { pass_type: mcggPassType(row.name, row.offerName) } : {})
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
    { id: 5, name: 'Passes incl. Weekly Diamond Pass Subscription (App Store TH)', packs: of('apple-app-store', ['pass']), message: msg },
    { id: 6, name: 'Bundles (App Store TH)', packs: of('apple-app-store', ['bundle']), message: msg }
  ]
  const categories = cats.filter((c) => c.packs.length).map((c) => ({ ...c, status: 0, packCount: c.packs.length }))
  const usdUsed = [...new Set(packs.map((p) => p.price_usd_source).filter(Boolean).map((s: string) => s.split(' ')[0]))]
  const notes = [
    `Game: ${MCGG_NAME} (Moonton). Official web store: Mobapay ${MCGG_MOBAPAY_PAGE} (api.mobapay.com app_id ${MCGG_MOBAPAY_APP_ID}, api/app_list code "mcgg", country TH). App Store app ${MCGG_APPSTORE_ID}.`,
    'THB = Mobapay TH list price (price_local_show; payment-channel discounts such as "3% OFF" are not applied). Diamonds titles are base+bonus (total = base + bonus). First-recharge tiers (50/150/250/500) give double Diamonds on the first purchase of each tier only.',
    'USD = Mobapay\'s own USD storefront (country KH) for the same item (same goods id, or sku with "_mt_th" -> "_mt_kh"); otherwise App Store US (not sold there), then the USD storefronts LA / MM, matched only by Apple offerName (Mobapay sku without "_mt_th") or Apple item id. Mobapay TH Diamond tiers (14+1 ... 15000+3300) are TH-only tiers with no KH or Apple counterpart, so their USD is null. No FX conversion.',
    'App Store TH is the fallback and lists the in-app items (Weekly Card, Weekly Diamond Pass Subscription, Promotion Fund, lottery/chain-gift packs). Passes/bundles are item_pack:true. No resellers (Codashop / SEAGM / UniPin) are used.',
    `USD sources used: ${usdUsed.length ? usdUsed.join(', ') : 'none'}`
  ]
  notes.push(APPSTORE_FULL_IAP_NOTE)
  if (!mpEn.shop) notes.push('Mobapay TH unavailable, App Store TH fallback only: ' + ('reason' in mpEn ? mpEn.reason : ''))
  if (mpTh && 'reason' in mpTh) notes.push('Mobapay TH (Thai): ' + mpTh.reason)
  if (mpEn.shop && !usdShop) notes.push(mpUsdState)
  if (!thEn.rows) notes.push('App Store TH (en-GB): ' + reasonOf(thEn))
  else if (!thTh.rows) notes.push('App Store TH (Thai): ' + reasonOf(thTh))
  if (!us.rows) notes.push('App Store US: ' + reasonOf(us) + notInUs(us))
  return ({
    game: { id: MCGG_MOBAPAY_APP_ID, slug: MCGG_SLUG, name: MCGG_NAME, itemName: 'Diamonds', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: mpEn.shop ? mcggMobapayUrl('en') : mcggCatalogUrl('th'),
    sources: {
      thb: mcggMobapayUrl('en'), mobapay_th: mcggMobapayUrl('en'), mobapay_th_thai: mcggMobapayUrl('th'), mobapay_usd: mcggMobapayUrl('en', MCGG_MOBAPAY_USD_COUNTRY),
      mobapay_page: MCGG_MOBAPAY_PAGE,
      appstore_th: mcggCatalogUrl('th'), appstore_us: mcggCatalogUrl('us'), appstore_usd_fallback: MCGG_USD_FALLBACK_STOREFRONTS.map(mcggCatalogUrl)
    },
    notes
  } as unknown) as RovPacksResponse
}

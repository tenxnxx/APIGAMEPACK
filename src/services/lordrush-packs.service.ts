import type { RovPacksResponse } from '../types/rov'
import {
  AppStoreGameInvalidUpstreamResponseError,
  AppStoreGameUpstreamUnavailableError,
  fetchAppStoreGamePacks,
  gameEnvelope,
  type AppStoreGameConfig,
  type AsClassified,
  type AsItemInput
} from './appstore-game-packs'
import { fetchPackagesPayload, type CenturyGameConfig } from './centurygames-packs.service'

/**
 * Lordrush, published by Century Games Innovation Pte. Ltd. (App Store id 6759788962, sold on the Thai App Store;
 * official site https://lordrush.centurygames.com/).
 *   1) Official Lordrush Store (https://store.centurygames.com/lordrush, Century Games vip-mall, game_id 20343):
 *      public pre-login packages_info list (no login / UID). It is requested with currency=THB (Thai) and currency=USD
 *      (English). A price is used only when the store labels it in that currency (currency_label ฿ / $); the store
 *      currently answers currency=THB with $ prices, so web-store THB is null with a reason (no FX).
 *      Base = main_number (Empire Stars), bonus = the store's extra items; item names come from the store's own item icons.
 *   2) Official Apple App Store TH full in-app list (THB) + App Store US -> KH/LA/MM (USD), via the shared builder.
 *      Refund packs are not normal purchases -> appstore_excluded. A web-store product id that Apple also sells
 *      (com.s01.lordrush.*) takes its missing THB from App Store TH for that same id and is not listed twice.
 * No FX, no resellers, no hardcoded prices or amounts.
 */

export const LORDRUSH_APP_ID = 6759788962
export const LORDRUSH_SLUG = 'lordrush'
export const LORDRUSH_STORE_GAME_ID = 20343
export const LORDRUSH_STORE_URL = 'https://store.centurygames.com/lordrush'
export const LORDRUSH_APPSTORE_TH_URL = 'https://apps.apple.com/th/app/id6759788962'
export const LORDRUSH_APPSTORE_US_URL = 'https://apps.apple.com/us/app/id6759788962'

const STORE_CFG: CenturyGameConfig = {
  gameId: LORDRUSH_STORE_GAME_ID,
  slug: LORDRUSH_SLUG,
  storePath: 'lordrush',
  defaultName: 'Lordrush',
  itemName: 'Empire Star',
  categoryName: 'Lordrush Official Store'
}

type CgItem = { icon?: string | null; item_number?: number | string | null; tips?: string | null }
export type CgPkg = {
  product_id?: string
  description?: string
  package_display_name?: string
  package_type?: number
  currency_label?: string
  final_amount?: string | number
  main_number?: number | string | null
  main_content?: string | null
  items?: CgItem[]
  purchase_limit_type?: number
  purchase_limit_cycle?: number
  remain_count?: number | null
  end_time?: number | null
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null)

/** Item name from the official store's own item icon file name. */
export function lordrushIconItem(icon: string | null | undefined): string | null {
  const f = String(icon ?? '').split('/').pop() ?? ''
  if (/empire_?stars?/i.test(f)) return 'Empire Star'
  if (/gems?\.(png|jpe?g|webp)$/i.test(f) || /_gems?[._]/i.test(f)) return 'Gem'
  return null
}

/** Currency the store actually labelled a price with. */
export function lordrushLabelCurrency(label: string | null | undefined): 'THB' | 'USD' | null {
  const l = String(label ?? '').trim()
  if (l === '฿' || /^thb$/i.test(l)) return 'THB'
  if (l === '$' || /^usd$/i.test(l) || l === 'US$') return 'USD'
  return null
}

type Side = { cur: 'THB' | 'USD'; byId: Map<string, CgPkg> }

async function storeSide(cur: 'THB' | 'USD', lang: string, signal?: AbortSignal): Promise<{ list: CgPkg[]; byId: Map<string, CgPkg> }> {
  let p: any
  try {
    p = await fetchPackagesPayload(STORE_CFG, cur, signal ?? AbortSignal.timeout(20_000), undefined, lang)
  } catch (e) {
    throw new AppStoreGameUpstreamUnavailableError(`Lordrush store (${cur}): ${e instanceof Error ? e.message : String(e)}`)
  }
  const list: CgPkg[] = p?.data?.package_list?.config_list
  if (p?.code !== 1 || !Array.isArray(list) || !list.length) throw new AppStoreGameInvalidUpstreamResponseError(`Lordrush store (${cur}) returned no packages${p?.msg ? ': ' + p.msg : ''}`)
  return { list, byId: new Map(list.filter((x) => x.product_id).map((x) => [x.product_id!, x])) }
}

function sidePrice(side: Side | null, pid: string, err: string | null) {
  if (!side) return { price: null, source: null, reason: `Official Lordrush store currency=${'?'} request failed (${err})` }
  const x = side.byId.get(pid)
  if (!x) return { price: null, source: null, reason: `Official Lordrush store (currency=${side.cur}) does not list ${pid}` }
  const got = lordrushLabelCurrency(x.currency_label)
  const price = num(x.final_amount)
  if (got !== side.cur || price == null)
    return {
      price: null,
      source: null,
      reason: `Official Lordrush store answered currency=${side.cur} with ${got ?? `"${x.currency_label ?? ''}"`} prices for ${pid}, not ${side.cur}; no FX conversion`
    }
  return { price, source: `lordrush-official-store (packages_info game_id ${LORDRUSH_STORE_GAME_ID}, currency=${side.cur}, ${pid})` }
}

export function buildLordrushStorePack(en: CgPkg, th: CgPkg | null, thbSide: Side | null, usdSide: Side | null, errs: { thb: string | null; usd: string | null }) {
  const pid = en.product_id ?? ''
  const mainItem = lordrushIconItem(en.main_content)
  const base = num(en.main_number)
  const extras = (en.items ?? []).map((i) => ({ item: lordrushIconItem(i.icon), amount: num(i.item_number) }))
  const same = extras.filter((x) => x.item && x.item === mainItem && x.amount != null)
  const other = extras.filter((x) => !(x.item && x.item === mainItem && x.amount != null))
  const unknownExtra = extras.some((x) => !x.item || x.amount == null)
  const bonus = unknownExtra && !same.length ? null : same.reduce((s, x) => s + (x.amount ?? 0), 0)
  const t = sidePrice(thbSide, pid, errs.thb)
  const u = sidePrice(usdSide, pid, errs.usd)
  const nameEn = (en.package_display_name ?? '').trim() || (base != null && mainItem ? `${base.toLocaleString('en-US')} ${mainItem}s` : null)
  const thName = (th?.package_display_name ?? '').trim()
  const nameTh = /[\u0E00-\u0E7F]/.test(thName) ? thName : null
  const special = en.package_type != null && en.package_type !== 1
  const contents = [
    ...(base != null ? [{ item: mainItem ?? 'Unknown store item (main)', amount: base }] : []),
    ...extras.map((x) => ({ item: `${x.item ?? 'Unknown store item'} (bonus)`, amount: x.amount }))
  ]
  const p: any = {
    id: 0,
    name: nameEn ?? pid,
    name_en: nameEn,
    name_th: nameTh,
    product_id: pid,
    kind: special ? 'bundle' : 'currency',
    item: mainItem,
    item_pack: special,
    store_package_type: en.package_type ?? null,
    baseItemAmount: base,
    bonusItemAmount: bonus,
    totalItemAmount: base != null && bonus != null ? base + bonus : null,
    bonus_available: extras.some((x) => (x.amount ?? 0) > 0),
    ...(other.length && other.every((x) => x.item && x.amount != null)
      ? { bonus_note: `The store's bonus for this pack is ${other.map((x) => `${x.amount} ${x.item}`).join(' + ')} (a different item from the main ${mainItem ?? 'item'}; listed in contents)` }
      : {}),
    purchase_limit_type: en.purchase_limit_type ?? null,
    purchase_limit_cycle: en.purchase_limit_cycle ?? null,
    price: t.price ?? u.price,
    currency: t.price != null ? 'THB' : 'USD',
    prices: { THB: t.price, USD: u.price },
    price_thb: t.price,
    price_thb_source: t.source,
    price_usd: u.price,
    price_usd_source: u.source,
    description_th: null,
    description_th_null_reason: 'The official Lordrush store package list has no descriptions',
    description_en: null,
    description_en_null_reason: 'The official Lordrush store package list has no descriptions',
    contents: contents.length ? contents : null,
    source: 'lordrush-official-store'
  }
  if (!contents.length) p.contents_null_reason = 'The official store gave no amounts for this package'
  if (t.price == null) p.price_thb_null_reason = t.reason
  if (u.price == null) p.price_usd_null_reason = u.reason
  if (!nameEn) p.name_en_null_reason = 'The official store gave no display name and no recognisable main item for this package'
  if (!nameTh)
    p.name_th_null_reason = thName
      ? `The Thai store view gives no Thai name for this package ("${thName}")`
      : 'The official store (Thai view) gives no display name for regular packages, only icons and amounts'
  if (!mainItem) p.item_null_reason = 'Main item icon not recognised; the store shows the item as an icon only'
  if (base == null) p.base_null_reason = 'The official store gave no main_number for this package'
  if (bonus == null) p.bonus_null_reason = 'The store lists bonus items it does not name (icon only), so the bonus in the main item is not stated; not assumed to be 0'
  if (p.totalItemAmount == null) p.total_null_reason = 'Base or bonus not stated by the official store'
  return p
}

export function lordrushAppStoreClassify(it: AsItemInput): AsClassified {
  const pid = it.productId ?? ''
  const d = (it.descEn ?? '').trim()
  const generic = `Apple's listing gives only the name and a one-line description ("${d || it.rawName}"); the items it contains are shown in-game only`
  if (/\.gem\d+$/.test(pid))
    return { kind: 'currency', item: 'Gem', baseItemAmount: null, contents: null, contents_null_reason: `Apple names this tier "${it.nameEn ?? it.rawName}" without a Gem amount; the amount is shown in-game only` }
  if (/\.token\d+$/.test(pid))
    return { kind: 'currency', item: 'Empire Star', baseItemAmount: null, contents: null, contents_null_reason: `Apple names this tier "${it.nameEn ?? it.rawName}" without an Empire Star amount; the amount is shown in-game only` }
  if (/\.(pass|deal)\d+$/.test(pid)) return { kind: 'pass', contents: null, contents_null_reason: generic }
  return { kind: 'bundle', contents: null, contents_null_reason: generic }
}

const APPSTORE_CFG: AppStoreGameConfig = {
  appId: LORDRUSH_APP_ID,
  slug: LORDRUSH_SLUG,
  name: 'LORD RUSH',
  officialTitle: 'Lordrush',
  publisher: 'Century Games Innovation Pte. Ltd.',
  itemName: 'Gem',
  thUrl: LORDRUSH_APPSTORE_TH_URL,
  usUrl: LORDRUSH_APPSTORE_US_URL,
  categoryNames: { currency: 'Gems & Empire Stars (App Store)', pass: 'Passes & Daily Deal Cards (App Store)', bundle: 'Packs & Offers (App Store)' },
  classify: lordrushAppStoreClassify,
  nameThNullReason: (raw) => `App Store TH (Thai locale) lists this item under its English name only ("${raw}")`,
  notes: []
}

const NOTES = [
  `Lordrush (App Store title "Lordrush"; written "LORD RUSH" by players) is published by Century Games Innovation Pte. Ltd. and is sold on the Thai App Store (id ${LORDRUSH_APP_ID}). Official site https://lordrush.centurygames.com/ links the official store ${LORDRUSH_STORE_URL}.`,
  'Official Lordrush Store: public pre-login package list (no login / UID). Requested with currency=THB (Thai view) and currency=USD (English view); a price is used only when the store labels it in that currency. Base = main_number (Empire Stars, which the store describes as cash equivalents), bonus = the extra items the store lists; Gem bonuses are a different item and are shown in contents and bonus_note.',
  'App Store: THB from App Store TH, USD from App Store US -> KH/LA/MM matched by offerName. Web-store packs the store prices in USD only get THB from the App Store TH price of the Apple item with the identical USD price (unique THB only), otherwise null with a reason; no FX. Gem / Empire Star tiers are named without amounts, so their amounts are null with a reason. Refund packs ("This is a refund pack, please follow the in-game rule") are not normal purchases and are listed under appstore_excluded.'
]

/**
 * Web-store packs whose THB the store does not label: THB from the App Store TH price of the Apple
 * item with the identical USD price (same Apple price point, like Last War / Palmon). Unique THB only;
 * otherwise null with a reason. No FX.
 */
export function lordrushFillThbByUsd(webPacks: any[], asPacks: any[] | null, appStoreError?: string | null) {
  const tiers = (asPacks ?? []).filter((t) => typeof t.price_usd === 'number' && typeof t.price_thb === 'number')
  const top = tiers.length ? Math.max(...tiers.map((t) => t.price_usd)) : null
  for (const p of webPacks) {
    const usd = p.price_usd
    if (p.price_thb != null || typeof usd !== 'number') continue
    const storeReason = p.price_thb_null_reason
    if (!asPacks) {
      p.price_thb_null_reason = `${storeReason}; the App Store tiers needed for a THB price were unavailable (${appStoreError ?? 'error'})`
      continue
    }
    if (!tiers.length) {
      p.price_thb_null_reason = `${storeReason}; the App Store list served has no items with both THB and USD prices (catalog API unavailable), so no exact USD match`
      continue
    }
    const hits = tiers.filter((t) => t.price_usd === usd)
    const vals = [...new Set(hits.map((t) => t.price_thb))]
    if (vals.length === 1) {
      const t = hits[0]
      p.price_thb_store_reason = storeReason
      delete p.price_thb_null_reason
      p.price_thb = vals[0]
      p.prices.THB = vals[0]
      p.price = vals[0]
      p.currency = 'THB'
      p.price_thb_source =
        `${t.price_thb_source ?? 'apple-app-store-th'} - Apple item ${t.product_id} ("${t.name_en ?? t.name}") has the identical USD ${usd} price as this official-store pack` +
        (hits.length > 1 ? ` (${hits.length} Apple items at USD ${usd}, all THB ${vals[0]})` : '')
      p.price_thb_match = { method: 'identical-usd-price-tier', store_usd: usd, apple_product_id: t.product_id, apple_name: t.name_en ?? t.name, apple_items_at_price: hits.length }
    } else {
      p.price_thb_null_reason = vals.length > 1
        ? `${hits.length} App Store items share USD ${usd} but have different THB prices (${vals.join(' / ')}); not guessing, no FX`
        : `No App Store item is priced USD ${usd}` + (top != null && usd > top ? ` (Apple items for this game top out at USD ${top})` : '') +
          `, so there is no official THB price for it; the store did not label a THB price (${storeReason}); no FX`
    }
  }
}

/** Whole App Store side (catalog API + product-page fallback) must finish inside the UI's 45 s fetch timeout. */
const APPSTORE_BUDGET_MS = 30_000

/** Live Lordrush packs: official Century Games store + App Store TH/US full in-app list. */
export async function fetchLordrushPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [thbR, usdR, asR] = await Promise.allSettled([storeSide('THB', 'TH', signal), storeSide('USD', 'EN', signal), fetchAppStoreGamePacks(APPSTORE_CFG, signal ?? AbortSignal.timeout(APPSTORE_BUDGET_MS))])
  const err = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : null)
  if (thbR.status === 'rejected' && usdR.status === 'rejected' && asR.status === 'rejected') {
    const e = asR.reason
    throw e instanceof AppStoreGameInvalidUpstreamResponseError || e instanceof AppStoreGameUpstreamUnavailableError
      ? e
      : new AppStoreGameUpstreamUnavailableError(e instanceof Error ? e.message : String(e))
  }
  const thb: Side | null = thbR.status === 'fulfilled' ? { cur: 'THB', byId: thbR.value.byId } : null
  const usd: Side | null = usdR.status === 'fulfilled' ? { cur: 'USD', byId: usdR.value.byId } : null
  const enList = usdR.status === 'fulfilled' ? usdR.value.list : thbR.status === 'fulfilled' ? thbR.value.list : []
  const errs = { thb: err(thbR), usd: err(usdR) }
  const webPacks = enList.filter((x) => x.product_id).map((x) => buildLordrushStorePack(x, thb?.byId.get(x.product_id!) ?? null, thb, usd, errs))

  const as: any = asR.status === 'fulfilled' ? asR.value : null
  const asPacks: any[] = as ? as.categories.flatMap((c: any) => c.packs) : []
  const asById = new Map(asPacks.filter((p) => p.product_id).map((p) => [p.product_id, p]))
  const merged = new Set<string>()
  for (const w of webPacks) {
    const a = asById.get(w.product_id)
    if (!a) {
      continue
    }
    merged.add(w.product_id)
    w.appstore_product = { name: a.name_en ?? a.name, description: a.description_en ?? null, apple_item_id: a.apple_item_id }
    if (w.price_thb == null && a.price_thb != null) {
      w.price_thb_store_reason = w.price_thb_null_reason
      delete w.price_thb_null_reason
      w.price_thb = a.price_thb
      w.price_thb_source = a.price_thb_source + ' (same product id)'
      w.prices.THB = a.price_thb
      w.price = a.price_thb
      w.currency = 'THB'
    }
    if (w.price_usd == null && a.price_usd != null) {
      w.price_usd_store_reason = w.price_usd_null_reason
      delete w.price_usd_null_reason
      w.price_usd = a.price_usd
      w.price_usd_source = a.price_usd_source + ' (same product id)'
      w.prices.USD = a.price_usd
    }
  }
  lordrushFillThbByUsd(webPacks, as ? asPacks : null, err(asR))
  webPacks.sort((a, b) => (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) || String(a.product_id).localeCompare(String(b.product_id)))

  const excluded: any[] = []
  const cats: any[] = []
  const web = { currency: webPacks.filter((p) => p.kind === 'currency'), bundle: webPacks.filter((p) => p.kind !== 'currency') }
  if (web.bundle.length) cats.push({ name: 'Special Packs (official Lordrush Store)', packs: web.bundle, status: 0, message: 'Live official store package list' })
  if (web.currency.length) cats.push({ name: 'Empire Stars (official Lordrush Store)', packs: web.currency, status: 0, message: 'Live official store package list' })
  if (as)
    for (const c of as.categories) {
      const packs = c.packs.filter((p: any) => {
        if (/\.refund\d+$/.test(p.product_id ?? '')) {
          excluded.push({ product_id: p.product_id, name: p.name, price_thb: p.price_thb, price_usd: p.price_usd, reason: 'Refund pack (Apple description: "This is a refund pack, please follow the in-game rule"), not a normal purchase' })
          return false
        }
        return !merged.has(p.product_id)
      })
      if (packs.length) cats.push({ ...c, packs })
    }
  let n = 0
  const categories = cats.map((c, i) => {
    for (const p of c.packs) p.id = ++n
    return { ...c, id: i + 1, packCount: c.packs.length }
  })
  const notes = [...NOTES, ...(as ? as.notes : [])]
  if (merged.size) notes.push(`Sold on both the web store and the App Store under the same product id (listed once, in the web-store category): ${[...merged].join(', ')}.`)
  if (thbR.status === 'rejected') notes.unshift(`Lordrush store currency=THB request failed (${errs.thb}).`)
  if (usdR.status === 'rejected') notes.unshift(`Lordrush store currency=USD request failed (${errs.usd}).`)
  if (!as) notes.unshift(`App Store unavailable (${err(asR)}); web store list only.`)
  const webOk = thbR.status === 'fulfilled' || usdR.status === 'fulfilled'
  const thbServed = thbR.status === 'fulfilled' ? lordrushLabelCurrency(thbR.value.list[0]?.currency_label) : null
  return gameEnvelope(
    APPSTORE_CFG,
    categories,
    {
      source: as?.source ?? LORDRUSH_STORE_URL,
      sources: { thb: LORDRUSH_APPSTORE_TH_URL, usd: LORDRUSH_APPSTORE_US_URL, webshop: LORDRUSH_STORE_URL },
      source_details: {
        webshop: LORDRUSH_STORE_URL,
        webshop_game_id: LORDRUSH_STORE_GAME_ID,
        webshop_currency_served_for_thb_request: thbServed,
        ...(errs.thb ? { webshop_thb_error: errs.thb } : {}),
        ...(errs.usd ? { webshop_usd_error: errs.usd } : {}),
        ...(as?.source_details ?? {}),
        ...(as ? {} : { appstore_error: err(asR) })
      },
      source_mode: webOk && as ? 'lordrush-store+appstore' : webOk ? 'lordrush-store' : as?.source_mode,
      appstore_excluded: excluded
    },
    notes
  )
}

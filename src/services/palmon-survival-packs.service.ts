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

/**
 * Palmon: Survival, published by Lilith Games (App Store seller LILITH TECHNOLOGY HONG KONG LIMITED). App Store id 6739345737,
 * sold on the Thai App Store.
 *   1) Official Lilith Store webshop (https://store.lilith.com/palmon/global): public pre-login product list
 *      (global-api.plutomall.com/webpay/product/guestProducts). The store picks the currency from the visitor's region;
 *      THB when the request comes from Thailand. Premium Voucher base + bonus are taken from the store's own fields.
 *   2) Official Apple App Store TH full in-app list (THB) + App Store US -> KH/LA/MM (USD), via the shared builder.
 * No FX, no resellers, no hardcoded prices or amounts. Any currency the webshop did not serve is null with a reason.
 */

export const PALMON_APP_ID = 6739345737
export const PALMON_SLUG = 'palmon-survival'
export const PALMON_APPSTORE_TH_URL = 'https://apps.apple.com/th/app/id6739345737'
export const PALMON_APPSTORE_US_URL = 'https://apps.apple.com/us/app/id6739345737'
export const PALMON_STORE_URL = 'https://store.lilith.com/palmon/global'
export const PALMON_STORE_API = 'https://global-api.plutomall.com/webpay/product/guestProducts'
export const PALMON_STORE_APP_ID = 100912
export const PALMON_STORE_MALL_ID = 36

export const palmonStoreUrl = (language: string) =>
  `${PALMON_STORE_API}?appId=${PALMON_STORE_APP_ID}&mallId=${PALMON_STORE_MALL_ID}&roleId=&appUid=0&useShoppingCart=false&osType=PC&language=${language}`

/** "THA(THB)" -> { region: 'THA', code: 'THB' } */
export function palmonCurrency(s: string | null | undefined): { region: string | null; code: string | null } {
  const m = (s ?? '').match(/^\s*([A-Z]{2,3})?\s*\(([A-Z]{3})\)\s*$/)
  if (m) return { region: m[1] ?? null, code: m[2] }
  const c = (s ?? '').match(/\b([A-Z]{3})\b/)
  return { region: null, code: c ? c[1] : null }
}

export const stripHtml = (h: string | null | undefined) =>
  (h ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n') || null

/** Leading amount of an official item line ("99 Premium Voucher" -> { amount: 99, item: 'Premium Voucher' }). */
export function palmonLine(line: string): { item: string; amount: number } | null {
  const m = line.trim().match(/^([\d,]+)\s+(.+)$/) ?? line.trim().match(/^(.+?)\s*[x×]\s*([\d,]+)$/)
  if (!m) return null
  return /^[\d,]+$/.test(m[1]) ? { amount: Number(m[1].replace(/,/g, '')), item: m[2].trim() } : { item: m[1].trim(), amount: Number(m[2].replace(/,/g, '')) }
}

/** Contents from the official "Pack Contains: ... / Special Gift: ..." description; gift lines are labelled. */
export function palmonContents(desc: string | null | undefined): { item: string; amount: number }[] {
  let gift = false
  const out: { item: string; amount: number }[] = []
  for (const raw of (desc ?? '').split('\n')) {
    const l = raw.trim()
    if (/:\s*$/.test(l)) {
      gift = /gift|bonus|ของขวัญ|โบนัส/i.test(l)
      continue
    }
    const x = palmonLine(l)
    if (x) out.push(gift ? { item: `${x.item} (Special Gift)`, amount: x.amount } : x)
  }
  return out
}

type StoreProduct = { productId: string; productType?: number; price: number; currency: string; bonusNum?: number | null; isLimit?: boolean; staticConfig?: string }
type StaticCfg = { name?: string; summary?: string; description?: string; category?: string }

async function fetchStore(language: string, signal?: AbortSignal): Promise<{ currency: string; products: StoreProduct[] }> {
  let res: Response
  try {
    res = await fetch(palmonStoreUrl(language), { signal: signal ?? AbortSignal.timeout(20_000), headers: { Accept: 'application/json' } })
  } catch (e) {
    throw new AppStoreGameUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!res.ok) throw new AppStoreGameUpstreamUnavailableError('Lilith Store HTTP ' + res.status)
  let j: any
  try {
    j = await res.json()
  } catch {
    throw new AppStoreGameInvalidUpstreamResponseError('Lilith Store returned non-JSON')
  }
  const list = j?.data?.productList
  if (j?.code !== 0 || !Array.isArray(list) || !list.length) throw new AppStoreGameInvalidUpstreamResponseError('Lilith Store returned no products')
  return { currency: String(j.data.currency ?? ''), products: list }
}

const parseCfg = (p: StoreProduct): StaticCfg => {
  try {
    return JSON.parse(p.staticConfig ?? '{}') ?? {}
  } catch {
    return {}
  }
}

export function buildStorePack(th: StoreProduct, en: StoreProduct | undefined) {
  const cth = parseCfg(th)
  const cen = en ? parseCfg(en) : {}
  const cur = palmonCurrency(th.currency)
  const descEn = stripHtml(cen.description)
  const descTh = stripHtml(cth.description)
  const nameEn = cen.name?.trim() || null
  const nameTh = cth.name?.trim() || null
  const voucher = (cen.category ?? cth.category) === 'voucher' || /premium voucher/i.test(nameEn ?? '')
  const base = palmonLine(nameEn ?? nameTh ?? '')
  const bonus = typeof th.bonusNum === 'number' ? th.bonusNum : null
  // contents straight from the official "Pack Contains / Special Gift" description lines
  const lines = palmonContents(descEn ?? descTh)
  const p: any = {
    id: 0,
    name: nameEn ?? nameTh ?? th.productId,
    name_en: nameEn,
    name_th: nameTh,
    product_id: th.productId,
    kind: voucher ? 'currency' : 'bundle',
    ...(voucher ? { item: 'Premium Voucher' } : {}),
    item_pack: !voucher,
    baseItemAmount: voucher ? base?.amount ?? null : null,
    bonusItemAmount: voucher ? bonus : null,
    totalItemAmount: voucher && base && bonus != null ? base.amount + bonus : null,
    bonus_available: voucher && bonus != null && bonus > 0,
    ...(voucher && (cen.summary || cth.summary) ? { bonus_note: `Official store label: "${cen.summary ?? cth.summary}" (web-store gift, may differ from in-app)` } : {}),
    price: th.price,
    currency: cur.code,
    prices: { THB: cur.code === 'THB' ? th.price : null, USD: cur.code === 'USD' ? th.price : null },
    price_thb: cur.code === 'THB' ? th.price : null,
    price_thb_source: cur.code === 'THB' ? `lilith-store (guestProducts, region ${cur.region ?? '?'}, product ${th.productId})` : null,
    price_usd: cur.code === 'USD' ? th.price : null,
    price_usd_source: cur.code === 'USD' ? `lilith-store (guestProducts, region ${cur.region ?? '?'}, product ${th.productId})` : null,
    description_th: descTh,
    description_en: descEn,
    contents: lines.length ? lines : voucher && base ? [{ item: 'Premium Voucher', amount: base.amount }] : null,
    source: 'lilith-store'
  }
  if (voucher && !base) p.base_null_reason = 'The official store name states no Premium Voucher amount'
  if (voucher && bonus == null) p.bonus_null_reason = 'The official store gave no bonusNum for this product; not assumed to be 0'
  if (voucher && p.totalItemAmount == null) p.total_null_reason = 'Base or bonus not stated by the official store'
  if (!voucher) {
    p.base_null_reason = 'Package / bundle item; not a plain currency amount'
    p.bonus_null_reason = 'No currency bonus on package items'
    p.total_null_reason = 'Not a plain currency amount'
  }
  if (!p.contents) p.contents_null_reason = 'The official store description does not itemise the contents'
  if (cur.code !== 'THB')
    p.price_thb_null_reason = `Lilith Store picks the currency from the visitor's region and served ${th.currency || 'an unknown currency'} for this request, not THB; no FX conversion (THB in-app prices are in the App Store categories)`
  if (cur.code !== 'USD')
    p.price_usd_null_reason =
      cur.code === 'THB'
        ? 'Lilith Store served THB for this request (Thai region); web-store vouchers have no App Store SKU to take a USD price from; no FX conversion'
        : `Lilith Store served ${th.currency || 'an unknown currency'} for this request; no FX conversion`
  if (!nameEn) p.name_en_null_reason = 'English store listing unavailable for this product'
  if (!nameTh) p.name_th_null_reason = 'Thai store listing gave no name for this product'
  if (!descEn) p.description_en_null_reason = 'English store listing gave no description'
  if (!descTh) p.description_th_null_reason = 'Thai store listing gave no description'
  return p
}

/** Live Lilith Store packs (Thai + English listings, matched by productId). */
export async function fetchPalmonStorePacks(signal?: AbortSignal) {
  const th = await fetchStore('th', signal)
  const en = await fetchStore('en', signal).catch(() => null)
  const enById = new Map((en?.products ?? []).map((p) => [p.productId, p]))
  const packs = th.products.map((p) => buildStorePack(p, enById.get(p.productId)))
  packs.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || String(a.product_id).localeCompare(String(b.product_id)))
  return { currency: th.currency, enCurrency: en?.currency ?? null, packs }
}

export function palmonAppStoreClassify(it: AsItemInput): AsClassified {
  return {
    kind: 'bundle',
    contents: null,
    contents_null_reason: `Apple lists this only as a generic price tier ("${it.nameEn ?? it.rawName}", description repeats the name); the in-game pack it unlocks is shown in-game only`
  }
}

const CONFIG: AppStoreGameConfig = {
  appId: PALMON_APP_ID,
  slug: PALMON_SLUG,
  name: 'Palmon: Survival',
  officialTitle: 'Palmon: Survival',
  publisher: 'Lilith Games (App Store seller: LILITH TECHNOLOGY HONG KONG LIMITED)',
  itemName: 'Premium Voucher',
  thUrl: PALMON_APPSTORE_TH_URL,
  usUrl: PALMON_APPSTORE_US_URL,
  categoryNames: { currency: 'Currency (App Store)', pass: 'Passes (App Store)', bundle: 'In-app packs / price tiers (App Store)' },
  classify: palmonAppStoreClassify,
  nameThNullReason: (raw) => `App Store TH (Thai locale) lists this item under its English price-tier name only ("${raw}")`,
  notes: []
}

const NOTES = [
  `Palmon: Survival is published by Lilith Games (App Store seller LILITH TECHNOLOGY HONG KONG LIMITED) and is sold on the Thai App Store. Official webshop: Lilith Store ${PALMON_STORE_URL}.`,
  'Lilith Store: public pre-login product list (no login / UID). The store picks the currency from the visitor region (THB for Thailand); the price is shown only in the currency it served, the other is null with a reason (no FX). Premium Voucher base = official name amount, bonus = the store bonusNum ("Special Gift"), total = base + bonus. The "Limited-Time Event" / "Daily Rewards" tabs need a game-account login and are not included.',
  'App Store: Lilith lists in-app purchases only as generic price tiers ("$4.99 Pack", product com.funfizz.palmon.package.tN); Apple does not itemise what each unlocks, so contents are null with a reason. THB from App Store TH, USD from App Store US -> KH/LA/MM matched by offerName.'
]

/** Live Palmon: Survival packs: Lilith Store (official webshop) + App Store TH/US full in-app list. */
export async function fetchPalmonSurvivalPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [storeR, asR] = await Promise.allSettled([fetchPalmonStorePacks(signal), fetchAppStoreGamePacks(CONFIG, signal)])
  if (storeR.status === 'rejected' && asR.status === 'rejected') {
    const e = asR.reason
    throw e instanceof AppStoreGameInvalidUpstreamResponseError || e instanceof AppStoreGameUpstreamUnavailableError
      ? e
      : new AppStoreGameUpstreamUnavailableError(e instanceof Error ? e.message : String(e))
  }
  const cats: any[] = []
  if (storeR.status === 'fulfilled') {
    const cur = palmonCurrency(storeR.value.currency)
    cats.push({ name: 'Premium Voucher (Lilith Store, official webshop)', packs: storeR.value.packs, status: 0, message: `Live Lilith Store public product list (currency served: ${storeR.value.currency || cur.code})` })
  }
  const as: any = asR.status === 'fulfilled' ? asR.value : null
  if (as) cats.push(...as.categories)
  let n = 0
  const categories = cats.map((c, i) => {
    for (const p of c.packs) p.id = ++n
    return { ...c, id: i + 1, packCount: c.packs.length }
  })
  const notes = [...NOTES, ...(as ? as.notes : [])]
  if (storeR.status === 'rejected') notes.unshift(`Lilith Store unavailable (${storeR.reason instanceof Error ? storeR.reason.message : storeR.reason}); App Store list only.`)
  if (!as) notes.unshift(`App Store unavailable (${asR.status === 'rejected' && asR.reason instanceof Error ? asR.reason.message : 'error'}); Lilith Store list only.`)
  const storeCur = storeR.status === 'fulfilled' ? storeR.value.currency : null
  return gameEnvelope(
    CONFIG,
    categories,
    {
      source: storeR.status === 'fulfilled' ? PALMON_STORE_URL : as?.source,
      sources: { thb: storeCur && palmonCurrency(storeCur).code === 'THB' ? PALMON_STORE_URL : PALMON_APPSTORE_TH_URL, usd: PALMON_APPSTORE_US_URL, webshop: PALMON_STORE_URL },
      source_details: {
        webshop: PALMON_STORE_URL,
        webshop_api: palmonStoreUrl('th'),
        webshop_currency_served: storeCur,
        ...(storeR.status === 'rejected' ? { webshop_error: storeR.reason instanceof Error ? storeR.reason.message : String(storeR.reason) } : {}),
        ...(as?.source_details ?? {}),
        ...(as ? {} : { appstore_error: asR.status === 'rejected' && asR.reason instanceof Error ? asR.reason.message : 'error' })
      },
      source_mode: storeR.status === 'fulfilled' && as ? 'lilith-store+appstore' : storeR.status === 'fulfilled' ? 'lilith-store' : as?.source_mode
    },
    notes
  )
}

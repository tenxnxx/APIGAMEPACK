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
 * Last Z: Survival Shooter, published by Omnilojo Pte Ltd (App Store id 6503272652, sold on the Thai App Store).
 *   1) Official Last Z Gold Bar web store (https://store.last-z.com/): public pre-login goods list (POST getitem.php).
 *      The store auto-selects the currency from the visitor region; for Thailand it serves USD (no THB), so THB is null
 *      with a reason there. Gold Bar base (pay_brick_num) and bonus (free_brick_num) are the store's own fields.
 *   2) Official Apple App Store TH full in-app list (THB) + App Store US -> KH/LA/MM (USD), via the shared builder.
 * No FX, no resellers, no hardcoded prices or amounts.
 */

export const LASTZ_APP_ID = 6503272652
export const LASTZ_SLUG = 'last-z-survival-shooter'
export const LASTZ_APPSTORE_TH_URL = 'https://apps.apple.com/th/app/id6503272652'
export const LASTZ_APPSTORE_US_URL = 'https://apps.apple.com/us/app/id6503272652'
export const LASTZ_STORE_URL = 'https://store.last-z.com/'
export const LASTZ_STORE_API = 'https://store.last-z.com/getitem.php'

type LzGoods = {
  goods_id: string
  amount: number
  currency?: string
  currency_symbol?: string
  pay_brick_num?: number | null
  free_brick_num?: number | null
  status?: number
  limit?: number | null
}

async function fetchLzStore(signal?: AbortSignal): Promise<{ defCurrency: string | null; goods: LzGoods[]; double: Record<string, number> }> {
  let res: Response
  try {
    res = await fetch(LASTZ_STORE_API, {
      method: 'POST',
      signal: signal ?? AbortSignal.timeout(20_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ lang: 'en-US', fromkoc: '' })
    })
  } catch (e) {
    throw new AppStoreGameUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!res.ok) throw new AppStoreGameUpstreamUnavailableError('Last Z store HTTP ' + res.status)
  let j: any
  try {
    j = await res.json()
  } catch {
    throw new AppStoreGameInvalidUpstreamResponseError('Last Z store returned non-JSON')
  }
  if (!Array.isArray(j?.goods) || !j.goods.length) throw new AppStoreGameInvalidUpstreamResponseError('Last Z store returned no goods')
  return { defCurrency: j.defCurrency ?? null, goods: j.goods, double: j.doubleGoodsList && typeof j.doubleGoodsList === 'object' ? j.doubleGoodsList : {} }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : null)

export function buildLzStorePack(g: LzGoods, defCurrency: string | null, double: Record<string, number>) {
  const cur = (g.currency || defCurrency || '').toUpperCase() || null
  const price = num(g.amount)
  const base = num(g.pay_brick_num)
  const bonus = num(g.free_brick_num)
  const dbl = double[g.goods_id]
  const src = `last-z-official-store (getitem.php, goods ${g.goods_id}, currency ${cur ?? '?'})`
  const p: any = {
    id: 0,
    name: base != null ? `${base.toLocaleString('en-US')} Gold Bars` : `Gold Bars (${g.goods_id})`,
    name_en: base != null ? `${base.toLocaleString('en-US')} Gold Bars` : null,
    name_th: null,
    name_th_null_reason: 'The official Last Z store gives no item names (only Gold Bar amounts) and has no Thai name for them',
    product_id: g.goods_id,
    kind: 'currency',
    item: 'Gold Bar',
    item_pack: false,
    baseItemAmount: base,
    bonusItemAmount: bonus,
    totalItemAmount: base != null && bonus != null ? base + bonus : null,
    bonus_available: bonus != null && bonus > 0,
    ...(dbl != null ? { web_store_double: dbl, bonus_note: `The official store flags this tier with its "double" promotion (doubleGoodsList value ${dbl}); its terms are shown on the store page, not in the goods list` } : {}),
    purchase_limit: num(g.limit),
    price,
    currency: cur,
    prices: { THB: cur === 'THB' ? price : null, USD: cur === 'USD' ? price : null },
    price_thb: cur === 'THB' ? price : null,
    price_thb_source: cur === 'THB' ? src : null,
    price_usd: cur === 'USD' ? price : null,
    price_usd_source: cur === 'USD' ? src : null,
    description_th: null,
    description_th_null_reason: 'The official store goods list has no descriptions',
    description_en: null,
    description_en_null_reason: 'The official store goods list has no descriptions',
    contents: [
      ...(base != null ? [{ item: 'Gold Bar', amount: base }] : []),
      ...(bonus != null && bonus > 0 ? [{ item: 'Gold Bar (bonus)', amount: bonus }] : [])
    ],
    source: 'last-z-official-store'
  }
  if (!p.contents.length) {
    p.contents = null
    p.contents_null_reason = 'The official store gave no Gold Bar amount for this goods id'
  }
  if (base == null) p.base_null_reason = 'The official store gave no pay_brick_num for this goods id'
  if (bonus == null) p.bonus_null_reason = 'The official store gave no free_brick_num for this goods id; not assumed to be 0'
  if (p.totalItemAmount == null) p.total_null_reason = 'Base or bonus not stated by the official store'
  if (!p.name_en) p.name_en_null_reason = 'No Gold Bar amount to name this goods id'
  if (cur !== 'THB')
    p.price_thb_null_reason = `The official Last Z store auto-selects the currency by visitor region and served ${cur ?? 'no currency'} (it serves USD to Thai visitors; no THB); no FX conversion (THB in-app prices are in the App Store category)`
  if (cur !== 'USD') p.price_usd_null_reason = `The official Last Z store served ${cur ?? 'no currency'} for this request, not USD; no FX conversion`
  return p
}

export async function fetchLastZStorePacks(signal?: AbortSignal) {
  const s = await fetchLzStore(signal)
  const packs = s.goods.filter((g) => g.status == null || g.status === 1).map((g) => buildLzStorePack(g, s.defCurrency, s.double))
  packs.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || String(a.product_id).localeCompare(String(b.product_id)))
  return { defCurrency: s.defCurrency, packs }
}

export function lastZAppStoreClassify(it: AsItemInput): AsClassified {
  return {
    kind: 'bundle',
    contents: null,
    contents_null_reason: `Apple lists this only as a generic price-tier SKU ("${it.nameEn ?? it.rawName}"; the description repeats the name); the in-game offer it unlocks is shown in-game only`
  }
}

const CONFIG: AppStoreGameConfig = {
  appId: LASTZ_APP_ID,
  slug: LASTZ_SLUG,
  name: 'Last Z: Survival Shooter',
  officialTitle: 'Last Z: Survival Shooter',
  publisher: 'Omnilojo Pte Ltd',
  itemName: 'Gold Bar',
  thUrl: LASTZ_APPSTORE_TH_URL,
  usUrl: LASTZ_APPSTORE_US_URL,
  categoryNames: { currency: 'Currency (App Store)', pass: 'Passes (App Store)', bundle: 'In-app offers / price tiers (App Store)' },
  classify: lastZAppStoreClassify,
  nameThNullReason: (raw) => `App Store TH (Thai locale) lists this item under its English SKU name only ("${raw}")`,
  notes: []
}

const NOTES = [
  `Last Z: Survival Shooter is published by Omnilojo Pte Ltd and is sold on the Thai App Store. Official Gold Bar web store: ${LASTZ_STORE_URL}.`,
  'Last Z web store: public pre-login goods list (no login / UID). It auto-selects the currency by visitor region and serves USD to Thailand, so web-store THB is null with a reason (no FX). Gold Bar base = pay_brick_num, bonus = free_brick_num, total = base + bonus, purchase_limit = the store limit.',
  'App Store: the in-app purchases are generic price-tier SKUs ("Resource Hot Sale N", offerName lmios_N) that the game maps to in-game offers; Apple does not itemise them, so contents are null with a reason. All listed SKUs are kept as Apple lists them (including one named "... test"). THB from App Store TH, USD from App Store US -> KH/LA/MM matched by offerName.'
]

/** Live Last Z packs: official Gold Bar web store + App Store TH/US full in-app list. */
export async function fetchLastZSurvivalShooterPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [storeR, asR] = await Promise.allSettled([fetchLastZStorePacks(signal), fetchAppStoreGamePacks(CONFIG, signal)])
  if (storeR.status === 'rejected' && asR.status === 'rejected') {
    const e = asR.reason
    throw e instanceof AppStoreGameInvalidUpstreamResponseError || e instanceof AppStoreGameUpstreamUnavailableError
      ? e
      : new AppStoreGameUpstreamUnavailableError(e instanceof Error ? e.message : String(e))
  }
  const cats: any[] = []
  if (storeR.status === 'fulfilled')
    cats.push({ name: 'Gold Bar (official Last Z web store)', packs: storeR.value.packs, status: 0, message: `Live official web store goods list (currency served: ${storeR.value.defCurrency ?? 'unknown'})` })
  const as: any = asR.status === 'fulfilled' ? asR.value : null
  if (as) cats.push(...as.categories)
  let n = 0
  const categories = cats.map((c, i) => {
    for (const p of c.packs) p.id = ++n
    return { ...c, id: i + 1, packCount: c.packs.length }
  })
  const notes = [...NOTES, ...(as ? as.notes : [])]
  const err = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : null)
  if (storeR.status === 'rejected') notes.unshift(`Last Z web store unavailable (${err(storeR)}); App Store list only.`)
  if (!as) notes.unshift(`App Store unavailable (${err(asR)}); web store list only.`)
  return gameEnvelope(
    CONFIG,
    categories,
    {
      source: as?.source ?? LASTZ_STORE_API,
      sources: { thb: LASTZ_APPSTORE_TH_URL, usd: LASTZ_APPSTORE_US_URL, webshop: LASTZ_STORE_URL },
      source_details: {
        webshop: LASTZ_STORE_URL,
        webshop_api: LASTZ_STORE_API,
        webshop_currency_served: storeR.status === 'fulfilled' ? storeR.value.defCurrency : null,
        ...(storeR.status === 'rejected' ? { webshop_error: err(storeR) } : {}),
        ...(as?.source_details ?? {}),
        ...(as ? {} : { appstore_error: err(asR) })
      },
      source_mode: storeR.status === 'fulfilled' && as ? 'lastz-store+appstore' : storeR.status === 'fulfilled' ? 'lastz-store' : as?.source_mode
    },
    notes
  )
}

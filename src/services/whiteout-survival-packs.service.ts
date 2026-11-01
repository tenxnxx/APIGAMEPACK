import {
  fetchCenturyGamesOfficialPacks,
  fetchPackagesPayload,
  requireConfigList,
  CenturyInvalidUpstreamResponseError,
  CenturyUpstreamUnavailableError,
  type CenturyGameConfig,
  type CenturyPackage,
  type CenturyPackagesPayload
} from './centurygames-packs.service'
import { fetchAppStoreFullIap, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPack, RovPacksResponse } from '../types/rov'

/**
 * Whiteout Survival (Century Games) - official sources only, no FX, no resellers, no hardcoded prices.
 *
 * 1) Official web store https://store.centurygames.com/wos (Frost Stars). Live packages_info
 *    (game_id 20121) is fetched with currency=THB and currency=USD (English) plus currency=THB in
 *    Thai (language_code=TH, for the official Thai pack names), merged by product_id.
 *    - base = main_number; bonus = Frost Star bonus items (icon froststar). Gem bonuses (icon gem)
 *      go to bonus_gems, never into the Frost Stars total.
 *    - package_type 4 ("Exclusive" bundles) -> item_pack: true with description_en/th + contents.
 *    - purchase limits: type 1 = lifetime (site string "Lifetime Limit"), type 2 + cycle 3 = monthly
 *      (reset_at is the 1st of the month); other cycles are reported raw with period null.
 *    - A price missing on one side is filled only from App Store TH / US for the same Apple product id
 *      (offerName com.gof.whiteoutsurvival.*); web-only ids (thirdpayment.*) never match the App Store.
 * 2) App Store TH full in-app list (passes, cards, daily deals, packs) for products NOT sold on the web
 *    store: THB from App Store TH, USD from App Store US (else KH / LA / MM, USD storefronts) matched by
 *    offerName. All are item_pack: true; Apple gives only a name + one-line description (no Thai, no
 *    contents), so name_th / description_th / contents are null with reasons.
 *    Refund packs and offer-code items are not normal purchases -> appstore_excluded with reasons.
 * Keep the whiteout-survival-24buym provider separate; do not replace it.
 */
export const WHITEOUT_SURVIVAL_STORE_SOURCE = 'https://store.centurygames.com/wos'
export const WHITEOUT_SURVIVAL_PACKAGES_API = 'https://cg-vip-mall-wos.centurygame.com/api/activity/packages_info'

export const WHITEOUT_SURVIVAL_APPSTORE_APP_ID = 6443575749
const appStoreUrl = (cc: string) => `https://apps.apple.com/${cc}/app/id${WHITEOUT_SURVIVAL_APPSTORE_APP_ID}`
export const WHITEOUT_SURVIVAL_APPSTORE_TH = appStoreUrl('th')
export const WHITEOUT_SURVIVAL_APPSTORE_US = appStoreUrl('us')
/** Product ids shared with the App Store build (Apple offerName). */
const APPLE_PRODUCT_ID = /^com\.gof\.whiteoutsurvival\./
const USD_FALLBACK_CC = ['kh', 'la', 'mm'] as const

export {
  CenturyInvalidUpstreamResponseError as WhiteoutSurvivalInvalidUpstreamResponseError,
  CenturyUpstreamUnavailableError as WhiteoutSurvivalUpstreamUnavailableError
}

const WOS_CONFIG: CenturyGameConfig = {
  gameId: 20121,
  slug: 'whiteout-survival',
  storePath: 'wos',
  defaultName: 'Whiteout Survival',
  itemName: 'Frost Stars',
  categoryName: 'Official Store Frost Stars'
}

type WosPackage = CenturyPackage & {
  icon?: string | null
  custom_tag?: string | null
  package_type?: number | string | null
  purchase_limit_type?: number | string | null
  purchase_limit_cycle?: number | string | null
  purchase_count?: number | string | null
  remain_count?: number | string | null
  reset_at?: number | string | null
  items?: Array<{ item_number?: number; icon?: string | null }>
}

export type WosItemKind = 'frost-stars' | 'gems' | 'other'

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const fmt = (n: number) => n.toLocaleString('en-US')
const utc7 = (sec: number) =>
  new Date(sec * 1000 + 7 * 3600_000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC+7'

/** Bonus item kind from the official item icon file name (the API sends no item name). */
export function wosItemKind(icon: string | null | undefined): WosItemKind {
  if (!icon) return 'frost-stars' // legacy shape without icons: main currency
  const file = icon.split('/').pop() ?? ''
  if (/froststar/i.test(file)) return 'frost-stars'
  if (/gem/i.test(file)) return 'gems'
  return 'other'
}

export function wosBonus(pack: WosPackage): { frostStars: number; gems: number; other: number } {
  const out = { frostStars: 0, gems: 0, other: 0 }
  for (const item of pack.items ?? []) {
    const n = Number(item.item_number ?? 0)
    if (!Number.isFinite(n)) continue
    const kind = wosItemKind(item.icon)
    if (kind === 'frost-stars') out.frostStars += n
    else if (kind === 'gems') out.gems += n
    else out.other += 1
  }
  return out
}

type PriceSide = { price: number | null; source: string | null; reason?: string }

/** Purchase limit from the official store fields; labels are the store's own strings (EN / TH). */
export function wosPurchaseLimit(pack: WosPackage): Record<string, unknown> | undefined {
  const type = num(pack.purchase_limit_type)
  if (type === null || type <= 0) return undefined
  const cycle = num(pack.purchase_limit_cycle)
  const count = num(pack.purchase_count)
  const resetAt = num(pack.reset_at)
  let period: 'lifetime' | 'month' | null = null
  if (type === 1 && !resetAt) period = 'lifetime'
  else if (type === 2 && cycle === 3) period = 'month'
  const label =
    period === 'lifetime'
      ? { en: `Lifetime Limit: ${count ?? '?'}`, th: `จำกัดตลอดชีพ: ${count ?? '?'}` }
      : period === 'month'
        ? { en: `Monthly Limit: ${count ?? '?'}`, th: `จำกัดรายเดือน: ${count ?? '?'}` }
        : { en: `Limit: ${count ?? '?'}`, th: `จำกัด: ${count ?? '?'}` }
  return {
    type,
    cycle,
    period,
    ...(period ? {} : { period_null_reason: `Unrecognised purchase_limit_type ${type} / cycle ${cycle ?? 'null'}` }),
    count,
    remaining: num(pack.remain_count),
    resets_at: resetAt ? new Date(resetAt * 1000).toISOString() : null,
    resets_at_utc7: resetAt ? utc7(resetAt) : null,
    label_en: label.en,
    label_th: label.th
  }
}

/** Build one web-store RovPack (THB first, then USD). */
export function mapWosPack(
  pack: WosPackage,
  id: number,
  thb: PriceSide,
  usd: PriceSide,
  thName?: string | null,
  apple?: AppStoreFullIapRow
): RovPack & Record<string, unknown> {
  const base = Number(pack.main_number ?? 0)
  const bonus = wosBonus(pack)
  const total = base + bonus.frostStars
  const isBundle = num(pack.package_type) === 4
  const limit = wosPurchaseLimit(pack)
  const display = (pack.package_display_name ?? '').trim()
  let name = display || (base > 0 ? `${WOS_CONFIG.itemName} ${base}` : pack.product_id || `Pack ${id}`)
  if (!display && bonus.gems > 0) name += ' + Gems Bonus'
  if (!display && limit) name += ' (Limited)'
  const th = (thName ?? '').trim() || null
  const bonusPercent = base > 0 && bonus.frostStars > 0 ? Math.round((bonus.frostStars / base) * 100) : null

  const out: RovPack & Record<string, unknown> = {
    id,
    name,
    baseItemAmount: base,
    bonusItemAmount: bonus.frostStars,
    totalItemAmount: total,
    price: thb.price ?? usd.price ?? 0,
    currency: thb.price !== null ? 'THB' : 'USD',
    price_thb: thb.price as number,
    price_usd: usd.price,
    prices: { THB: thb.price, USD: usd.price },
    price_thb_source: thb.source ?? undefined,
    price_usd_source: usd.source ?? (null as unknown as undefined),
    price_thb_null_reason: thb.price === null ? thb.reason : undefined,
    price_usd_null_reason: usd.price === null ? usd.reason : undefined,
    bonus_gems: bonus.gems > 0 ? bonus.gems : undefined,
    purchase_limit: limit,
    image: pack.icon || undefined
  }
  if (bonusPercent !== null && (limit || isBundle)) out.bonus_percent = bonusPercent
  if (isBundle) {
    out.product_id = pack.product_id
    out.name_th = th
    if (!th) out.name_th_null_reason = 'Official store (language_code=TH) returned no Thai name for this product'
  }

  const desc: string[] = []
  if (bonus.gems > 0) desc.push(`Bonus ${fmt(bonus.gems)} Gems (in-game Gems, not Frost Stars)`)
  if (bonus.other > 0) desc.push(`${bonus.other} other bonus item(s)`)
  if (limit) desc.push(String(limit.label_en) + (limit.resets_at_utc7 ? `, resets ${limit.resets_at_utc7}` : ''))
  if (desc.length) out.description = desc.join(' | ')

  if (isBundle) {
    const contents: Array<Record<string, unknown>> = [
      { name_en: 'Frost Stars', name_th: 'Frost Stars', amount: base, kind: 'base', source: 'official store main_number' }
    ]
    if (bonus.frostStars) contents.push({ name_en: 'Frost Stars (bonus)', name_th: 'Frost Stars (โบนัส)', amount: bonus.frostStars, kind: 'bonus', source: 'official store bonus items' })
    if (bonus.gems) contents.push({ name_en: 'Gems', name_th: 'Gems', amount: bonus.gems, kind: 'bonus', source: 'official store bonus items' })
    contents.push({
      name_en: null,
      name_th: null,
      amount: null,
      kind: 'in-game item',
      image: pack.icon ?? null,
      null_reason:
        'The official store shows the extra in-game item only in the pack image (no item name or amount as text); the official pack name describes it.'
    })
    const limEn = limit ? `, ${limit.label_en}` : ''
    const limTh = limit ? `, ${limit.label_th}` : ''
    out.item_pack = true
    out.contents = contents
    out.description_en =
      `${name}: ${fmt(base)} Frost Stars` +
      (bonus.frostStars ? ` + ${fmt(bonus.frostStars)} bonus Frost Stars (${fmt(total)} total)` : '') +
      ` plus the in-game item shown on the official store${limEn}.`
    out.description_th = th
      ? `${th}: Frost Stars ${fmt(base)}` +
        (bonus.frostStars ? ` + โบนัส ${fmt(bonus.frostStars)} (รวม ${fmt(total)})` : '') +
        ` พร้อมไอเท็มในเกมตามที่แสดงในร้านค้าทางการ${limTh}`
      : null
    if (!th) out.description_th_null_reason = 'No official Thai pack name from the store'
    out.description_source = 'composed from the official store package name (EN / TH), Frost Star amounts and purchase limit'
    if (apple) out.appstore_product = { name: apple.name, description: apple.description ?? null }
  }
  return out
}

type AppleSide = { rows: Map<string, AppStoreFullIapRow[]> | null; list: AppStoreFullIapRow[]; error?: string }

async function loadApple(cc: string, signal: AbortSignal, fixture?: AppStoreFullIapRow[]): Promise<AppleSide> {
  try {
    const list = fixture ?? (await fetchAppStoreFullIap(cc, String(WHITEOUT_SURVIVAL_APPSTORE_APP_ID), cc === 'th' ? 'en-GB' : 'en-US', signal))
    const map = new Map<string, AppStoreFullIapRow[]>()
    for (const r of list) {
      if (!r.offerName) continue
      map.set(r.offerName, [...(map.get(r.offerName) ?? []), r])
    }
    return { rows: map, list }
  } catch (e) {
    return { rows: null, list: [], error: e instanceof Error ? e.message : String(e) }
  }
}

function applePrice(side: AppleSide, productId: string, cc: string, currency: 'THB' | 'USD'): PriceSide {
  const label = `App Store ${cc.toUpperCase()}`
  if (!side.rows) return { price: null, source: null, reason: `${label} full IAP list unavailable (${side.error ?? 'error'})` }
  const hits = (side.rows.get(productId) ?? []).filter((h) => h.currency === currency)
  const prices = [...new Set(hits.map((h) => h.price))]
  if (prices.length === 1) return { price: prices[0], source: `appstore-${cc}` }
  if (prices.length > 1) return { price: null, source: null, reason: `${label} has several ${currency} prices for offerName ${productId}` }
  return { price: null, source: null, reason: `${label} has no ${currency} in-app purchase with offerName ${productId}` }
}

function priceMap(list: WosPackage[]): Map<string, number | 'ambiguous'> {
  const m = new Map<string, number | 'ambiguous'>()
  for (const p of list) {
    const pid = (p.product_id ?? '').trim()
    const amount = num(p.final_amount)
    if (!pid || amount === null) continue
    const prev = m.get(pid)
    m.set(pid, prev === undefined || prev === amount ? amount : 'ambiguous')
  }
  return m
}

/** App Store group from Apple's own one-line description. */
export function wosAppStoreGroup(row: AppStoreFullIapRow): { key: string; name: string; excluded?: string } {
  const d = (row.description ?? '').toLowerCase()
  const n = row.name.toLowerCase()
  const pid = row.offerName ?? ''
  if (/^offercode\./.test(pid)) return { key: 'x', name: '', excluded: 'Offer-code item (redeemed with an Apple offer code), not a normal purchase' }
  if (/refund pack/.test(n) || /refund pack/.test(d)) return { key: 'x', name: '', excluded: 'Refund pack (repayment for refunded purchases), not a normal purchase' }
  if (/battle pass/.test(d)) return { key: 'passes', name: 'Passes (App Store)' }
  if (/weekly card|monthly card/.test(d)) return { key: 'cards', name: 'Weekly / Monthly Cards (App Store)' }
  if (/^daily deal/.test(d)) return { key: 'daily', name: 'Daily Deals (App Store)' }
  if (/chief privileges/.test(d)) return { key: 'chief', name: 'Chief Privileges (App Store)' }
  if (/gems now/.test(d)) return { key: 'gems', name: 'Gem Packs (App Store)' }
  if (/frost star/.test(d)) return { key: 'frost', name: 'Frost Star Supply (App Store)' }
  if (/more items/.test(d)) return { key: 'items', name: 'Item Packs (App Store)' }
  return { key: 'other', name: 'Other Packs (App Store)' }
}

const appstoreCountPending = (g: Map<string, { packs: RovPack[] }>) => [...g.values()].some((x) => x.packs.length > 0)

const APPSTORE_GROUP_ORDER = ['passes', 'cards', 'daily', 'chief', 'frost', 'gems', 'items', 'other']

export async function fetchWhiteoutSurvivalDualPacks(options?: {
  signal?: AbortSignal
  packagesPayloadUsd?: unknown
  packagesPayloadThb?: unknown
  /** Thai-language THB payload (official Thai names). */
  packagesPayloadThbTh?: unknown
  /** App Store fixtures for tests (rows with offerName). */
  appStoreTh?: AppStoreFullIapRow[]
  appStoreUs?: AppStoreFullIapRow[]
  appStoreUsdFallback?: Partial<Record<'kh' | 'la' | 'mm', AppStoreFullIapRow[]>>
}): Promise<RovPacksResponse & Record<string, unknown>> {
  const signal = options?.signal ?? AbortSignal.timeout(40_000)
  const storeUrl = WHITEOUT_SURVIVAL_STORE_SOURCE
  const warnings: string[] = []
  const [usdPayload, thbPayload, thbThPayload] = await Promise.all([
    fetchPackagesPayload(WOS_CONFIG, 'USD', signal, options?.packagesPayloadUsd as CenturyPackagesPayload | undefined),
    fetchPackagesPayload(WOS_CONFIG, 'THB', signal, options?.packagesPayloadThb as CenturyPackagesPayload | undefined),
    options?.packagesPayloadThbTh === undefined && (options?.packagesPayloadUsd || options?.packagesPayloadThb)
      ? Promise.resolve(null)
      : fetchPackagesPayload(WOS_CONFIG, 'THB', signal, options?.packagesPayloadThbTh as CenturyPackagesPayload | undefined, 'TH').catch(() => null)
  ])
  const usdList = requireConfigList(usdPayload, 'USD') as WosPackage[]
  const thbList = requireConfigList(thbPayload, 'THB') as WosPackage[]
  const thNames = new Map<string, string>()
  const thList = thbThPayload?.code === 1 ? (thbThPayload.data?.package_list?.config_list ?? []) : []
  for (const p of thList as WosPackage[]) {
    const pid = (p.product_id ?? '').trim()
    const n = (p.package_display_name ?? '').trim()
    if (pid && n) thNames.set(pid, n)
  }
  if (!thList.length) warnings.push('Official store Thai list (language_code=TH) unavailable; Thai bundle names are null')
  const thbBy = priceMap(thbList)
  const usdBy = priceMap(usdList)

  // Union of products in USD order, then THB-only ones.
  const seen = new Set<string>()
  const ordered: WosPackage[] = []
  for (const p of [...usdList, ...thbList]) {
    const pid = (p.product_id ?? '').trim()
    if (!pid || seen.has(pid)) continue
    seen.add(pid)
    ordered.push(p)
  }

  // App Store lists are loaded once (web-store fallback + App Store-only items).
  const appleTh = await loadApple('th', signal, options?.appStoreTh)
  const appleUs = await loadApple('us', signal, options?.appStoreUs)
  const usdFallback: Partial<Record<string, AppleSide>> = {}
  const loadFallback = async (cc: (typeof USD_FALLBACK_CC)[number]) =>
    (usdFallback[cc] ??= await loadApple(cc, signal, options?.appStoreUsdFallback?.[cc] ?? (options?.appStoreUs ? [] : undefined)))
  const appleUsd = async (pid: string): Promise<PriceSide> => {
    const reasons: string[] = []
    const us = applePrice(appleUs, pid, 'us', 'USD')
    if (us.price !== null) return us
    reasons.push(us.reason!)
    for (const cc of USD_FALLBACK_CC) {
      const r = applePrice(await loadFallback(cc), pid, cc, 'USD')
      if (r.price !== null) return r
      reasons.push(r.reason!)
    }
    return { price: null, source: null, reason: reasons.join('; ') }
  }

  const coins: RovPack[] = []
  const bundles: RovPack[] = []
  const unmatched: Array<Record<string, unknown>> = []
  const webIds = new Set<string>()
  let appleUsed = false
  let nextId = 1

  for (const p of ordered) {
    const pid = (p.product_id ?? '').trim()
    webIds.add(pid)
    const t = thbBy.get(pid)
    const u = usdBy.get(pid)
    let thb: PriceSide =
      typeof t === 'number'
        ? { price: t, source: 'official-store' }
        : { price: null, source: null, reason: t === 'ambiguous' ? `Official store THB list has several prices for ${pid}` : `Official store THB list (currency=THB) has no product ${pid}` }
    let usd: PriceSide =
      typeof u === 'number'
        ? { price: u, source: 'official-store' }
        : { price: null, source: null, reason: u === 'ambiguous' ? `Official store USD list has several prices for ${pid}` : `Official store USD list (currency=USD) has no product ${pid}` }

    if (APPLE_PRODUCT_ID.test(pid)) {
      if (thb.price === null) {
        const a = applePrice(appleTh, pid, 'th', 'THB')
        thb = a.price !== null ? a : { ...thb, reason: `${thb.reason}; ${a.reason}` }
        if (a.price !== null) appleUsed = true
      }
      if (usd.price === null) {
        const a = await appleUsd(pid)
        usd = a.price !== null ? a : { ...usd, reason: `${usd.reason}; ${a.reason}` }
        if (a.price !== null) appleUsed = true
      }
    } else {
      if (thb.price === null) thb.reason += '; web-only product id (no App Store counterpart)'
      if (usd.price === null) usd.reason += '; web-only product id (no App Store counterpart; no FX conversion)'
    }

    const apple = APPLE_PRODUCT_ID.test(pid) ? appleTh.rows?.get(pid)?.[0] : undefined
    if (thb.price === null) {
      // No THB from any official source: keep it out of the THB pack list, report it.
      const m = mapWosPack(p, 0, thb, usd)
      unmatched.push({
        product_id: pid,
        name: m.name,
        baseItemAmount: m.baseItemAmount,
        bonusItemAmount: m.bonusItemAmount,
        totalItemAmount: m.totalItemAmount,
        price_thb: null,
        price_thb_null_reason: thb.reason,
        price_usd: usd.price,
        price_usd_source: usd.source,
        price_usd_null_reason: usd.price === null ? usd.reason : undefined
      })
      continue
    }
    const pack = mapWosPack(p, nextId++, thb, usd, thNames.get(pid) ?? null, apple)
    ;(pack.item_pack ? bundles : coins).push(pack)
  }

  // App Store-only products (passes, cards, deals, packs).
  const groups = new Map<string, { name: string; packs: RovPack[] }>()
  const excluded: Array<Record<string, unknown>> = []
  if (appleTh.rows) {
    const done = new Set<string>()
    for (const row of appleTh.list) {
      const pid = row.offerName ?? ''
      if (!pid || done.has(pid) || webIds.has(pid) || row.currency !== 'THB') continue
      done.add(pid)
      const g = wosAppStoreGroup(row)
      if (g.excluded) {
        excluded.push({ product_id: pid, name: row.name, price_thb: row.price, reason: g.excluded })
        continue
      }
      const thb = applePrice(appleTh, pid, 'th', 'THB')
      if (thb.price === null) {
        excluded.push({ product_id: pid, name: row.name, price_thb: null, reason: thb.reason })
        continue
      }
      const usd = await appleUsd(pid)
      const pack: RovPack & Record<string, unknown> = {
        id: nextId++,
        name: row.name,
        product_id: pid,
        appstore_id: row.id,
        name_th: null,
        name_th_null_reason: 'App Store has no Thai localisation for this app (Thai storefront returns the English name)',
        item_pack: true,
        baseItemAmount: null as unknown as number,
        bonusItemAmount: null as unknown as number,
        totalItemAmount: null as unknown as number,
        base_null_reason: 'App Store item pack / pass; Apple does not list its contents or a currency amount',
        bonus_null_reason: 'App Store does not show bonuses',
        total_null_reason: 'Item pack; not a plain currency amount',
        price: thb.price,
        currency: 'THB',
        price_thb: thb.price,
        price_usd: usd.price,
        prices: { THB: thb.price, USD: usd.price },
        price_thb_source: thb.source!,
        price_usd_source: usd.source,
        price_usd_null_reason: usd.price === null ? usd.reason : undefined,
        description_en: row.description ? `${row.name}: ${row.description}` : null,
        description_en_null_reason: row.description ? undefined : 'App Store gives no description for this item',
        description_th: null,
        description_th_null_reason: 'App Store has no Thai localisation for this app; no other official Thai text for this item',
        description_source: 'App Store TH in-app purchase name + description (Apple catalog)',
        contents: null,
        contents_null_reason: 'Apple lists only the item name and a one-line description; contents are shown only inside the game',
        source_url: WHITEOUT_SURVIVAL_APPSTORE_TH
      }
      const bucket = groups.get(g.key) ?? { name: g.name, packs: [] }
      bucket.packs.push(pack)
      groups.set(g.key, bucket)
    }
  } else {
    warnings.push(`App Store TH in-app list unavailable (${appleTh.error ?? 'error'}); App Store-only passes/packs omitted`)
  }

  if (!appleUs.rows && appstoreCountPending(groups)) warnings.push(`App Store US in-app list unavailable (${appleUs.error ?? 'error'}); USD tried on KH / LA / MM, else null with a reason`)

  if (coins.length + bundles.length === 0) {
    throw new CenturyInvalidUpstreamResponseError('No Whiteout Survival packs with an official THB price')
  }

  const categories: Array<Record<string, unknown>> = []
  const cat = (id: number, name: string, message: string, packs: RovPack[]) =>
    packs.length && categories.push({ id, name, status: 0, message, packCount: packs.length, packs })
  cat(WOS_CONFIG.gameId, 'Frost Stars (Official Store)', 'Official Century Games store, THB + USD merged by product_id; base + bonus = total Frost Stars', coins)
  cat(WOS_CONFIG.gameId + 1, 'Exclusive Bundles (Official Store)', 'Official store Exclusive bundles (item_pack) with EN / TH names', bundles)
  let gid = WOS_CONFIG.gameId + 10
  for (const key of APPSTORE_GROUP_ORDER) {
    const g = groups.get(key)
    if (g) g.packs.sort((a, b) => a.price - b.price)
    if (g) cat(gid++, g.name, 'App Store TH (THB) + App Store US (USD, else KH/LA/MM) matched by Apple product id; not sold on the web store', g.packs)
  }
  // Sequential ids in display order.
  let seq = 1
  for (const c of categories) for (const p of c.packs as RovPack[]) p.id = seq++
  const packCount = categories.reduce((s, c) => s + Number(c.packCount), 0)
  const appstoreOnly = [...groups.values()].reduce((s, g) => s + g.packs.length, 0)

  return {
    game: {
      id: WOS_CONFIG.gameId,
      slug: WOS_CONFIG.slug,
      name: thbPayload.data?.game_name || usdPayload.data?.game_name || WOS_CONFIG.defaultName,
      itemName: WOS_CONFIG.itemName,
      itemIcon: thbList[0]?.main_content ?? ''
    },
    categories: categories as never,
    summary: { categoryCount: categories.length, packCount },
    fetchedAt: new Date().toISOString(),
    source: storeUrl,
    sources: { thb: storeUrl, usd: storeUrl },
    appstore_sources:
      appleUsed || appstoreOnly
        ? { thb: WHITEOUT_SURVIVAL_APPSTORE_TH, usd: WHITEOUT_SURVIVAL_APPSTORE_US, usd_fallback: USD_FALLBACK_CC.map(appStoreUrl) }
        : undefined,
    unmatched_packs: unmatched.length ? unmatched : undefined,
    appstore_excluded: excluded.length ? excluded : undefined,
    warnings: warnings.length ? warnings : undefined,
    notes: [
      'THB + USD from the live official Century Games store (packages_info currency=THB / USD, Thai names from language_code=TH), merged by product_id. No FX, no resellers, no hardcoded prices.',
      'bonusItemAmount counts Frost Stars only; Gem bonuses are reported separately (bonus_gems).',
      'Exclusive bundles (package_type 4) and every App Store-only pass / pack are item_pack: true.',
      'App Store-only items: THB from App Store TH, USD from App Store US (else KH / LA / MM) by the same Apple product id; Apple has no Thai text or contents, so those are null with reasons.',
      'A web-store price missing on one side is filled only from the App Store price of the same Apple product id, else null with a reason; packs with no THB anywhere are listed in unmatched_packs.'
    ]
  }
}

/**
 * Official Whiteout Survival packs.
 * - Default (API route /games/whiteout-survival|wos/packs/): THB + USD (fetchWhiteoutSurvivalDualPacks).
 * - options.currency set (24buym secondary USD lookup): single-currency shape (unchanged).
 */
export async function fetchWhiteoutSurvivalOfficialPacks(options?: {
  signal?: AbortSignal
  currency?: string
  /** Single-currency fixture (when currency is set). */
  packagesPayload?: unknown
  packagesPayloadUsd?: unknown
  packagesPayloadThb?: unknown
  packagesPayloadThbTh?: unknown
  appStoreTh?: AppStoreFullIapRow[]
  appStoreUs?: AppStoreFullIapRow[]
  appStoreUsdFallback?: Partial<Record<'kh' | 'la' | 'mm', AppStoreFullIapRow[]>>
}) {
  if (options?.currency) {
    return fetchCenturyGamesOfficialPacks(WOS_CONFIG, {
      signal: options?.signal,
      currency: options.currency,
      packagesPayload: options.packagesPayload as never
    })
  }
  return fetchWhiteoutSurvivalDualPacks(options)
}

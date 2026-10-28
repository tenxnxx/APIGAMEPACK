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
 * Whiteout Survival (Century Games) - official web store https://store.centurygames.com/wos.
 * Currency sold there: Frost Stars. Live packages_info (game_id 20121) is fetched twice,
 * currency=THB and currency=USD, and merged by product_id (no FX, no hardcoded prices).
 *
 * - bonusItemAmount counts only Frost Stars bonus items. Some tiers carry a Gems bonus
 *   ("💎 BONUS" tag, gem icon): those Gems are reported in bonus_gems / description, never
 *   added to the Frost Stars total.
 * - package_type 4 ("Exclusive" bundles with in-game items) -> item_pack: true.
 * - Fallback for a price missing on one side: only for product ids that are Apple product ids
 *   (com.gof.whiteoutsurvival.*), the official App Store TH (THB) / US (USD) price of the SAME
 *   product, matched exactly by Apple offerName from the full App Store IAP list.
 *   Web-only ids (thirdpayment.*) have no App Store counterpart -> listed in unmatched_packs
 *   with *_null_reason.
 * Keep whiteout-survival-24buym provider separate; do not replace it.
 */
export const WHITEOUT_SURVIVAL_STORE_SOURCE =
  'https://store.centurygames.com/wos'

export const WHITEOUT_SURVIVAL_PACKAGES_API =
  'https://cg-vip-mall-wos.centurygame.com/api/activity/packages_info'

export const WHITEOUT_SURVIVAL_APPSTORE_APP_ID = 6443575749
export const WHITEOUT_SURVIVAL_APPSTORE_TH = `https://apps.apple.com/th/app/id${WHITEOUT_SURVIVAL_APPSTORE_APP_ID}`
export const WHITEOUT_SURVIVAL_APPSTORE_US = `https://apps.apple.com/us/app/id${WHITEOUT_SURVIVAL_APPSTORE_APP_ID}`
/** Product ids shared with the App Store build (Apple offerName). */
const APPLE_PRODUCT_ID = /^com\.gof\.whiteoutsurvival\./

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
  package_type?: number | string | null
  purchase_limit_type?: number | string | null
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

const fmt = (n: number) => n.toLocaleString('en-US')

type PriceSide = { price: number | null; source: string | null; reason?: string }

/** Build one RovPack; extra fields are left undefined when not applicable. */
export function mapWosPack(pack: WosPackage, id: number, thb: PriceSide, usd: PriceSide): RovPack & Record<string, unknown> {
  const base = Number(pack.main_number ?? 0)
  const bonus = wosBonus(pack)
  const isBundle = num(pack.package_type) === 4
  const limitType = num(pack.purchase_limit_type)
  const limited = limitType !== null && limitType > 0
  const display = (pack.package_display_name ?? '').trim()
  let name = display || (base > 0 ? `${WOS_CONFIG.itemName} ${base}` : pack.product_id || `Pack ${id}`)
  if (!display && bonus.gems > 0) name += ' + Gems Bonus'
  if (!display && limited) name += ' (Limited)'

  const desc: string[] = []
  if (isBundle) {
    desc.push(
      `Exclusive bundle: ${fmt(base)}${bonus.frostStars ? ` + ${fmt(bonus.frostStars)}` : ''} Frost Stars plus in-game items (item list shown on the official store page)`
    )
  }
  if (bonus.gems > 0) desc.push(`Bonus ${fmt(bonus.gems)} Gems (in-game Gems, not Frost Stars)`)
  if (bonus.other > 0) desc.push(`${bonus.other} other bonus item(s)`)
  let purchaseLimit: Record<string, unknown> | undefined
  if (limited) {
    const resetAt = num(pack.reset_at)
    purchaseLimit = {
      type: limitType,
      count: num(pack.purchase_count),
      remaining: num(pack.remain_count),
      resets_at: resetAt ? new Date(resetAt * 1000).toISOString() : null
    }
    desc.push(
      `Limited: ${num(pack.purchase_count) ?? '?'} purchase(s)` +
        (resetAt ? `, resets ${new Date(resetAt * 1000).toISOString()}` : '')
    )
  }

  const price = thb.price ?? usd.price ?? 0
  return {
    id,
    name,
    baseItemAmount: base,
    bonusItemAmount: bonus.frostStars,
    totalItemAmount: base + bonus.frostStars,
    price,
    currency: thb.price !== null ? 'THB' : 'USD',
    price_thb: thb.price as number,
    price_usd: usd.price,
    prices: { THB: thb.price, USD: usd.price },
    price_thb_source: thb.source ?? undefined,
    price_usd_source: usd.source ?? (null as unknown as undefined),
    price_thb_null_reason: thb.price === null ? thb.reason : undefined,
    price_usd_null_reason: usd.price === null ? usd.reason : undefined,
    item_pack: isBundle ? true : undefined,
    bonus_gems: bonus.gems > 0 ? bonus.gems : undefined,
    purchase_limit: purchaseLimit,
    description: desc.length ? desc.join(' | ') : undefined
  }
}

type AppleSide = { rows: Map<string, AppStoreFullIapRow[]> | null; error?: string }

async function loadApple(cc: 'th' | 'us', signal: AbortSignal, fixture?: AppStoreFullIapRow[]): Promise<AppleSide> {
  try {
    const rows = fixture ?? (await fetchAppStoreFullIap(cc, String(WHITEOUT_SURVIVAL_APPSTORE_APP_ID), cc === 'th' ? 'en-GB' : 'en-US', signal))
    const map = new Map<string, AppStoreFullIapRow[]>()
    for (const r of rows) {
      if (!r.offerName) continue
      map.set(r.offerName, [...(map.get(r.offerName) ?? []), r])
    }
    return { rows: map }
  } catch (e) {
    return { rows: null, error: e instanceof Error ? e.message : String(e) }
  }
}

function applePrice(side: AppleSide, productId: string, cc: 'th' | 'us'): PriceSide {
  const label = cc === 'th' ? 'App Store TH' : 'App Store US'
  if (!side.rows) return { price: null, source: null, reason: `${label} full IAP list unavailable (${side.error ?? 'error'})` }
  const hits = side.rows.get(productId) ?? []
  const prices = [...new Set(hits.map((h) => h.price))]
  if (prices.length === 1) return { price: prices[0], source: cc === 'th' ? 'appstore-th' : 'appstore-us' }
  if (prices.length > 1) return { price: null, source: null, reason: `${label} has several prices for offerName ${productId}` }
  return { price: null, source: null, reason: `${label} has no in-app purchase with offerName ${productId}` }
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

export async function fetchWhiteoutSurvivalDualPacks(options?: {
  signal?: AbortSignal
  packagesPayloadUsd?: unknown
  packagesPayloadThb?: unknown
  /** App Store fixtures for tests (rows with offerName). */
  appStoreTh?: AppStoreFullIapRow[]
  appStoreUs?: AppStoreFullIapRow[]
}): Promise<RovPacksResponse & Record<string, unknown>> {
  const signal = options?.signal ?? AbortSignal.timeout(25_000)
  const storeUrl = WHITEOUT_SURVIVAL_STORE_SOURCE
  const [usdPayload, thbPayload] = await Promise.all([
    fetchPackagesPayload(WOS_CONFIG, 'USD', signal, options?.packagesPayloadUsd as CenturyPackagesPayload | undefined),
    fetchPackagesPayload(WOS_CONFIG, 'THB', signal, options?.packagesPayloadThb as CenturyPackagesPayload | undefined)
  ])
  const usdList = requireConfigList(usdPayload, 'USD') as WosPackage[]
  const thbList = requireConfigList(thbPayload, 'THB') as WosPackage[]
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

  let appleTh: AppleSide | undefined
  let appleUs: AppleSide | undefined
  const packs: RovPack[] = []
  const unmatched: Array<Record<string, unknown>> = []
  let appleUsed = false

  for (const p of ordered) {
    const pid = (p.product_id ?? '').trim()
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
        appleTh ??= await loadApple('th', signal, options?.appStoreTh)
        const a = applePrice(appleTh, pid, 'th')
        thb = a.price !== null ? a : { ...thb, reason: `${thb.reason}; ${a.reason}` }
        if (a.price !== null) appleUsed = true
      }
      if (usd.price === null) {
        appleUs ??= await loadApple('us', signal, options?.appStoreUs)
        const a = applePrice(appleUs, pid, 'us')
        usd = a.price !== null ? a : { ...usd, reason: `${usd.reason}; ${a.reason}` }
        if (a.price !== null) appleUsed = true
      }
    } else {
      if (thb.price === null) thb.reason += '; web-only product id (no App Store counterpart)'
      if (usd.price === null) usd.reason += '; web-only product id (no App Store counterpart)'
    }

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
    packs.push(mapWosPack(p, packs.length + 1, thb, usd))
  }

  if (packs.length === 0) {
    throw new CenturyInvalidUpstreamResponseError('No Whiteout Survival packs with an official THB price')
  }

  const itemPacks = packs.filter((p) => (p as Record<string, unknown>).item_pack === true).length
  return {
    game: {
      id: WOS_CONFIG.gameId,
      slug: WOS_CONFIG.slug,
      name: usdPayload.data?.game_name || WOS_CONFIG.defaultName,
      itemName: WOS_CONFIG.itemName,
      itemIcon: usdList[0]?.main_content ?? ''
    },
    categories: [
      {
        id: WOS_CONFIG.gameId,
        name: WOS_CONFIG.categoryName,
        status: 0,
        message: `Official store THB + USD ${WOS_CONFIG.itemName} (merged by product_id)` + (itemPacks ? `; ${itemPacks} exclusive bundle(s) as item packs` : ''),
        packCount: packs.length,
        packs
      }
    ],
    summary: { categoryCount: 1, packCount: packs.length },
    fetchedAt: new Date().toISOString(),
    source: storeUrl,
    sources: { thb: storeUrl, usd: storeUrl },
    appstore_sources: appleUsed ? { thb: WHITEOUT_SURVIVAL_APPSTORE_TH, usd: WHITEOUT_SURVIVAL_APPSTORE_US } : undefined,
    unmatched_packs: unmatched.length ? unmatched : undefined,
    notes: [
      'THB + USD from live Century Games packages_info (currency=THB and currency=USD), merged by product_id. No FX, no resellers.',
      'bonusItemAmount counts Frost Stars only; Gems bonuses are reported separately (bonus_gems).',
      'Exclusive bundles (package_type 4) are item_pack: true.',
      'A price missing on one side is filled only from the App Store TH/US price of the same Apple product id (offerName), else null with a reason; packs with no THB anywhere are listed in unmatched_packs.'
    ]
  }
}

/**
 * Official Whiteout Survival packs.
 * - Default (API route /games/whiteout-survival|wos/packs/): dual THB+USD (fetchWhiteoutSurvivalDualPacks).
 * - options.currency set (24buym secondary USD lookup): single-currency shape (unchanged).
 */
export async function fetchWhiteoutSurvivalOfficialPacks(options?: {
  signal?: AbortSignal
  currency?: string
  /** Single-currency fixture (when currency is set). */
  packagesPayload?: unknown
  /** Dual-currency USD fixture. */
  packagesPayloadUsd?: unknown
  /** Dual-currency THB fixture. */
  packagesPayloadThb?: unknown
  appStoreTh?: AppStoreFullIapRow[]
  appStoreUs?: AppStoreFullIapRow[]
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
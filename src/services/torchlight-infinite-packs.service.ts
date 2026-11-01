import type { RovPacksResponse } from '../types/rov'
import { fetchAppStoreGamePacks, type AppStoreGameConfig, type AsClassified, type AsItemInput } from './appstore-game-packs'

/**
 * Torchlight: Infinite (XD Entertainment Pte Ltd, App Store id 1593130084).
 * XD's official webshop (pay-torchlight.xd.com, XD appId 1003002) prices in USD only — its product API returns USD
 * even for region=TH — so it has no THB list. Per the source rule (official webshop only if it sells in THB):
 *   THB = official Apple App Store TH full in-app purchase list (Thai locale),
 *   USD = App Store US, per-item fallback KH / LA / MM, matched by Apple item id / offerName (XD product id global.*).
 * No FX, no resellers, no hardcoded prices or amounts.
 */

export const TORCHLIGHT_APP_ID = 1593130084
export const TORCHLIGHT_SLUG = 'torchlight-infinite'
export const TORCHLIGHT_APPSTORE_TH_URL = 'https://apps.apple.com/th/app/torchlight-infinite/id1593130084'
export const TORCHLIGHT_APPSTORE_US_URL = 'https://apps.apple.com/us/app/torchlight-infinite/id1593130084'
export const TORCHLIGHT_XD_WEBSHOP_URL = 'https://pay-torchlight.xd.com/'

/** Primocryst amount from the XD product id (global.recharge.primocrystN) or the official name ("N Primocryst" / "N คริสตัล"). */
export function tlPrimocryst(productId: string | null, name: string | null | undefined): number | null {
  const pid = productId ?? ''
  const m = pid.match(/\.recharge\.primocryst(\d+)$/i)
  if (m) return Number(m[1])
  if (pid) return null
  const n = (name ?? '').match(/^\s*([\d,]+)\s*(?:primocrysts?|คริสตัล)\s*$/i)
  return n ? Number(n[1].replace(/,/g, '')) : null
}

export function tlKind(productId: string | null, name: string): AsClassified['kind'] {
  if (tlPrimocryst(productId, name) != null) return 'currency'
  const pid = productId ?? ''
  if (/\.(?:monthcard|handbook|bookupgrade|growthfund|servantsubscription)\./i.test(pid)) return 'pass'
  if (!pid && /\b(?:pass|fund|qualification|monthly)\b|บัตรรายเดือน|คู่มือ|กองทุน/i.test(name)) return 'pass'
  return 'bundle'
}

export function tlClassify(it: AsItemInput): AsClassified {
  const name = it.nameEn ?? it.rawName
  const kind = tlKind(it.productId, name)
  if (kind === 'currency') {
    const amount = tlPrimocryst(it.productId, it.nameEn) ?? tlPrimocryst(it.productId, it.rawName)
    return { kind, item: 'Primocryst', baseItemAmount: amount }
  }
  return {
    kind,
    contents: null,
    contents_null_reason:
      'Apple official description only repeats the item name; XD itemises pass / bundle contents in-game only'
  }
}

const CONFIG: AppStoreGameConfig = {
  appId: TORCHLIGHT_APP_ID,
  slug: TORCHLIGHT_SLUG,
  name: 'Torchlight: Infinite',
  officialTitle: 'Torchlight: Infinite',
  publisher: 'XD Entertainment Pte Ltd',
  itemName: 'Primocryst',
  thUrl: TORCHLIGHT_APPSTORE_TH_URL,
  usUrl: TORCHLIGHT_APPSTORE_US_URL,
  categoryNames: {
    currency: 'Primocryst (App Store)',
    pass: 'Monthly Pass, Passes & Funds (App Store)',
    bundle: 'Packs & Bundles (App Store)'
  },
  classify: tlClassify,
  sourceDetails: { xd_webshop: TORCHLIGHT_XD_WEBSHOP_URL, xd_webshop_currency: 'USD only (no THB)' },
  notes: [
    `XD's official Torchlight: Infinite webshop (${TORCHLIGHT_XD_WEBSHOP_URL}) prices in USD only (no THB for Thailand), so THB comes from the official App Store TH list.`,
    'Primocryst: base amount from the official item name / XD product id (e.g. "6480 Primocryst", global.recharge.primocryst6480). Apple publishes no bonus, so bonus and total are null with a reason (not 0); first-recharge bonuses are shown in-game only.',
    'Monthly Pass, Season Pass (handbook / bookupgrade), Hunter\'s Fund, Pactspirit Rally and reward boxes are item_pack:true. Their Apple descriptions only repeat the name, so contents are null with a reason.'
  ]
}

/** Live Torchlight: Infinite packs (App Store TH THB + US/KH/LA/MM USD). */
export async function fetchTorchlightInfinitePacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  return fetchAppStoreGamePacks(CONFIG, options?.signal)
}

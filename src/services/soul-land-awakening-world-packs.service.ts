import type { RovPacksResponse } from '../types/rov'
import { fetchAppStoreGamePacks, type AppStoreGameConfig, type AsClassified, type AsItemInput } from './appstore-game-packs'

/**
 * Soul Land: Awakening World, published by 37GAMES (App Store seller G-LI NETWORK TECHNOLOGY CO. LIMITED; official site
 * https://gevents.37games.com/official_slmsea/). App Store id 6762107883, sold on the Thai App Store.
 * The 37games web store (pay.37games.com) needs a 37games account login before it shows any item, so it is not used:
 *   THB = official Apple App Store TH full in-app purchase list (Thai locale),
 *   USD = App Store US, per-item fallback KH / LA / MM, matched by Apple item id / offerName (slmmo.global.*).
 * No FX, no resellers, no hardcoded prices or amounts.
 */

export const SLAW_APP_ID = 6762107883
export const SLAW_SLUG = 'soul-land-awakening-world'
export const SLAW_APPSTORE_TH_URL = 'https://apps.apple.com/th/app/id6762107883'
export const SLAW_APPSTORE_US_URL = 'https://apps.apple.com/us/app/id6762107883'
export const SLAW_OFFICIAL_SITE = 'https://gevents.37games.com/official_slmsea/'
export const SLAW_WEBSTORE_URL = 'https://pay.37games.com/platform/webStore.html'

/** Trident Coin amount from the official name ("Trident Coin*68" / "เหรียญเทพสมุทร*68"). */
export function slawTridentCoin(text: string | null | undefined): number | null {
  const m = (text ?? '').match(/(?:Trident\s*Coins?|เหรียญเทพสมุทร)\s*[*x×]\s*([\d,]+)/i)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

export function slawKind(productId: string | null, name: string): AsClassified['kind'] {
  if (/\.currency_[\d.]+$/.test(productId ?? '')) return 'currency'
  if (!productId && slawTridentCoin(name) != null) return 'currency'
  if (/\b(?:monthly\s*card|pass)\b|บัตรรายเดือน/i.test(name)) return 'pass'
  return 'bundle'
}

export function slawClassify(it: AsItemInput): AsClassified {
  const amount = slawTridentCoin(it.nameEn) ?? slawTridentCoin(it.nameTh) ?? slawTridentCoin(it.rawName)
  const kind = slawKind(it.productId, it.nameEn ?? it.rawName)
  if (kind === 'currency' && amount != null) return { kind, item: 'Trident Coin', baseItemAmount: amount }
  if (kind === 'currency') return { kind: 'bundle', contents: null, contents_null_reason: 'Official name / description gives no Trident Coin amount' }
  return {
    kind,
    contents: null,
    contents_null_reason:
      'Apple lists this as a generic direct-purchase tier ("Deluxe Pack N" / "แพ็กซื้อตรง N", description only "Purchase to get ..."); the actual pack contents are shown in-game only'
  }
}

const CONFIG: AppStoreGameConfig = {
  appId: SLAW_APP_ID,
  slug: SLAW_SLUG,
  name: 'Soul Land: Awakening World',
  officialTitle: 'Soul Land: Awakening World',
  publisher: '37GAMES (App Store seller: G-LI NETWORK TECHNOLOGY CO. LIMITED)',
  itemName: 'Trident Coin',
  thUrl: SLAW_APPSTORE_TH_URL,
  usUrl: SLAW_APPSTORE_US_URL,
  categoryNames: {
    currency: 'Trident Coin (App Store)',
    pass: 'Passes & Cards (App Store)',
    bundle: 'Deluxe Packs / direct-purchase tiers (App Store)'
  },
  classify: slawClassify,
  sourceDetails: {
    official_site: SLAW_OFFICIAL_SITE,
    official_webshop: null,
    official_webshop_null_reason: `The official 37games web store (${SLAW_WEBSTORE_URL}) redirects to a 37games account login before showing any item or price; no public price list, so it is not used (no login / UID).`
  },
  notes: [
    `Soul Land: Awakening World is published by 37GAMES (official site ${SLAW_OFFICIAL_SITE}; App Store seller G-LI NETWORK TECHNOLOGY CO. LIMITED) and is sold on the Thai App Store. The 37games web store requires a login before showing prices, so THB comes from the official App Store TH list.`,
    'Trident Coin (เหรียญเทพสมุทร): amount from the official item name ("Trident Coin*68"). Apple publishes no bonus split, so bonus and total are null with a reason (not 0).',
    '"Deluxe Pack N" (แพ็กซื้อตรง N, offerName slmmo.global.package_*) are generic direct-purchase price tiers used by the in-game shop; Apple does not itemise their contents, so contents are null with a reason. All are item_pack:true.'
  ]
}

/** Live Soul Land: Awakening World packs (App Store TH THB + US/KH/LA/MM USD). */
export async function fetchSoulLandAwakeningWorldPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  return fetchAppStoreGamePacks(CONFIG, options?.signal)
}

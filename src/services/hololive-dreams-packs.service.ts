import type { RovPacksResponse } from '../types/rov'
import { fetchAppStoreGamePacks, type AppStoreGameConfig, type AsClassified, type AsContent, type AsItemInput } from './appstore-game-packs'

/**
 * hololive Dreams (ホロライブドリームス), published by QualiArts, Inc.; developed / operated by COVER Corporation and
 * QualiArts, Inc. (COVER press release 2026-07-23, https://cover-corp.com/en/news/detail/20260723-01). App Store id 6756641249,
 * sold on the Thai App Store. There is no official top-up webshop, so:
 *   THB = official Apple App Store TH full in-app purchase list (Thai locale),
 *   USD = App Store US, per-item fallback KH / LA / MM, matched by Apple item id / offerName (hololive.dreams.com.*).
 * No FX, no resellers, no hardcoded prices or amounts.
 */

export const HOLODREAMS_APP_ID = 6756641249
export const HOLODREAMS_SLUG = 'hololive-dreams'
export const HOLODREAMS_APPSTORE_TH_URL = 'https://apps.apple.com/th/app/id6756641249'
export const HOLODREAMS_APPSTORE_US_URL = 'https://apps.apple.com/us/app/id6756641249'
export const HOLODREAMS_PRESS_URL = 'https://cover-corp.com/en/news/detail/20260723-01'

/** Blue Diamond amount from the official name / description ("Blue Diamond x8200", "Great-Value Blue Diamond x720"). */
export function hdBlueDiamond(text: string | null | undefined): { amount: number; greatValue: boolean } | null {
  const m = (text ?? '').match(/\b(Great-Value\s+)?Blue\s+Diamonds?\s*[x×]\s*([\d,]+)/i)
  return m ? { amount: Number(m[2].replace(/,/g, '')), greatValue: !!m[1] } : null
}

export function hdKind(productId: string | null, name: string): AsClassified['kind'] {
  const pid = productId ?? ''
  if (/\.con\.[12]\d{5}$/.test(pid) || (!pid && hdBlueDiamond(name))) return 'currency'
  if (/\.sub\.\d+$/.test(pid) || /\.con\.3\d{5}$/.test(pid)) return 'pass'
  if (!pid && /\b(?:pass(?:port)?|membership)\b/i.test(name)) return 'pass'
  return 'bundle'
}

/** What the official Apple description says the purchase gives ("This gets you a holo Passport." / "...a Membership for Tokino Sora."). */
export function hdContents(desc: string | null | undefined): AsContent[] | null {
  const d = (desc ?? '').trim()
  const mem = d.match(/gets you an? Membership for (.+?)\.?$/i)
  if (mem) return [{ item: `Membership: ${mem[1].trim()}`, amount: 1 }]
  const one = d.match(/gets you an? (.+?)\.?$/i)
  if (one && !hdBlueDiamond(one[1])) return [{ item: one[1].trim(), amount: 1 }]
  return null
}

export function hdClassify(it: AsItemInput): AsClassified {
  const name = it.nameEn ?? it.rawName
  const bd = hdBlueDiamond(name) ?? hdBlueDiamond(it.descEn) ?? hdBlueDiamond(it.rawName)
  const kind = hdKind(it.productId, name)
  if (kind === 'currency' && bd) {
    return {
      kind,
      item: 'Blue Diamond',
      baseItemAmount: bd.amount,
      ...(bd.greatValue
        ? { bonus_note: 'Great-Value Blue Diamond (separate discounted / purchase-limited SKU per official name); Apple does not state a base/bonus split' }
        : {})
    }
  }
  if (kind === 'currency') return { kind: 'bundle', contents: null, contents_null_reason: 'Official name / description gives no Blue Diamond amount' }
  const contents = hdContents(it.descEn)
  const sub = /\.sub\.\d+$/.test(it.productId ?? '')
  return contents
    ? { kind, contents }
    : {
        kind,
        contents: null,
        contents_null_reason: sub
          ? 'Apple description does not itemise the subscription perks (shown in-game only)'
          : 'Apple description does not itemise the contents (shown in-game only)'
      }
}

const CONFIG: AppStoreGameConfig = {
  appId: HOLODREAMS_APP_ID,
  slug: HOLODREAMS_SLUG,
  name: 'hololive Dreams',
  officialTitle: 'hololive Dreams',
  publisher: 'QualiArts, Inc. (development / operation: COVER Corporation / QualiArts, Inc.)',
  itemName: 'Blue Diamond',
  thUrl: HOLODREAMS_APPSTORE_TH_URL,
  usUrl: HOLODREAMS_APPSTORE_US_URL,
  categoryNames: {
    currency: 'Blue Diamond (App Store)',
    pass: 'holo Passport, Premium Mission Pass & Talent Memberships (App Store)',
    bundle: 'Other Packs (App Store)'
  },
  classify: hdClassify,
  nameThNullReason: (raw) => `App Store TH (Thai locale) lists this item under its English name only ("${raw}"); the game has no Thai localisation of item names`,
  sourceDetails: { press_release: HOLODREAMS_PRESS_URL, official_webshop: null, official_webshop_null_reason: 'No official top-up webshop for hololive Dreams' },
  notes: [
    `hololive Dreams is published by QualiArts, Inc. and developed / operated by COVER Corporation and QualiArts, Inc. (COVER press release, ${HOLODREAMS_PRESS_URL}); it is sold on the Thai App Store. There is no official top-up webshop, so THB comes from the official App Store TH list.`,
    'Blue Diamond: amount from the official item name / description (e.g. "Blue Diamond x8200"). Apple publishes no bonus split, so bonus and total are null with a reason (not 0). "Great-Value Blue Diamond" SKUs are separate offers; Apple lists each tier under two product ids (con.20000x), both kept as listed.',
    'holo Passport and the Talent Memberships are auto-renewing subscriptions (product ids *.sub.*); Premium Mission Pass appears under several product ids (con.30000x, one per pass season). All are item_pack:true; contents come from the official Apple description ("This gets you ..."). Perk details are in-game only.',
    'Apple returns English names and descriptions even in the Thai locale, so name_th / description_th are null with a reason.'
  ]
}

/** Live hololive Dreams packs (App Store TH THB + US/KH/LA/MM USD). */
export async function fetchHololiveDreamsPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  return fetchAppStoreGamePacks(CONFIG, options?.signal)
}

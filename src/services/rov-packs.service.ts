import { getGameBySlug } from '../games/registry'
import {
  buildTermgamePacksSource,
  fetchTermgamePacks,
  InvalidUpstreamResponseError,
  UpstreamUnavailableError,
  type FetchTermgamePacksOptions
} from './termgame-packs.service'

export { InvalidUpstreamResponseError, UpstreamUnavailableError }

const game = getGameBySlug('rov')!

export const ROV_PACKS_SOURCE = buildTermgamePacksSource(game.appId)

/**
 * Garena RoV is TH-only on the App Store (US 404).
 * USD enrichment therefore relies on:
 *  - App Store TH IAP amounts/tiers (no direct USD storefront)
 *  - Optional cross-check is not used; price_usd stays null unless a
 *    future USD storefront / termgame USD region appears.
 * App Store TH coupons are still appended when TH HTML parses, but without
 * US pairs they won't form a dual category (name merge needs both sides).
 */
export const ROV_APPSTORE_TH_URL =
  'https://apps.apple.com/th/app/garena-rov-ace-of-destiny/id1150337432'

/**
 * Arena of Valor (global cousin) US IAP — used only as a live Apple price-tier
 * oracle when offer THB from RoV TH uniquely matches a Free Fire / shared
 * tier map. We do NOT merge AOV voucher amounts onto RoV coupons (different
 * item amounts). For RoV, appStoreUsUrl is omitted; see freefire for dual IAP.
 *
 * Practical RoV USD path: reuse Free Fire App Store TH+US as a live Apple
 * price-tier oracle (same App Store price matrix), applied by THB price only.
 */
export const ROV_PRICE_TIER_ORACLE_TH_URL =
  'https://apps.apple.com/th/app/free-fire/id1300146617'
export const ROV_PRICE_TIER_ORACLE_US_URL =
  'https://apps.apple.com/us/app/free-fire/id1300146617'

export async function fetchRovPacks(
  options?: Omit<FetchTermgamePacksOptions, 'appId' | 'slug' | 'usdEnrichment'>
) {
  return fetchTermgamePacks({
    appId: game.appId,
    slug: game.slug,
    ...options,
    usdEnrichment: {
      // Use Free Fire App Store TH+US as live Apple THB↔USD tier oracle.
      // RoV itself has no US App Store page; termgame has no USD region for 100055.
      appStoreThUrl: ROV_PRICE_TIER_ORACLE_TH_URL,
      appStoreUsUrl: ROV_PRICE_TIER_ORACLE_US_URL,
      appendAppStoreCategory: false
    }
  })
}

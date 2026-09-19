import { getGameBySlug } from '../games/registry'
import {
  buildTermgamePacksSource,
  fetchTermgamePacks,
  InvalidUpstreamResponseError,
  UpstreamUnavailableError,
  type FetchTermgamePacksOptions
} from './termgame-packs.service'

export { InvalidUpstreamResponseError, UpstreamUnavailableError }

const game = getGameBySlug('cod-mobile')!

export const COD_MOBILE_PACKS_SOURCE = buildTermgamePacksSource(game.appId)

/** Call of Duty: Mobile - Garena (TH storefront). Garena US page 404. */
export const COD_MOBILE_APPSTORE_TH_URL =
  'https://apps.apple.com/th/app/call-of-duty-mobile-garena/id1465688043'

/**
 * Free Fire App Store TH+US as live Apple THB↔USD price-tier oracle.
 * Activision global COD Mobile US IAP names ("COD Points - Medium Pack") do not
 * merge onto Garena CP SKUs; termgame has no region=US USD rows for 100082.
 */
export const COD_MOBILE_PRICE_TIER_ORACLE_TH_URL =
  'https://apps.apple.com/th/app/free-fire/id1300146617'
export const COD_MOBILE_PRICE_TIER_ORACLE_US_URL =
  'https://apps.apple.com/us/app/free-fire/id1300146617'

export async function fetchCodMobilePacks(
  options?: Omit<FetchTermgamePacksOptions, 'appId' | 'slug' | 'usdEnrichment'>
) {
  return fetchTermgamePacks({
    appId: game.appId,
    slug: game.slug,
    ...options,
    usdEnrichment: {
      appStoreThUrl: COD_MOBILE_PRICE_TIER_ORACLE_TH_URL,
      appStoreUsUrl: COD_MOBILE_PRICE_TIER_ORACLE_US_URL,
      appendAppStoreCategory: false
    }
  })
}

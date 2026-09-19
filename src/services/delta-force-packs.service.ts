import { getGameBySlug } from '../games/registry'
import {
  buildTermgamePacksSource,
  fetchTermgamePacks,
  InvalidUpstreamResponseError,
  UpstreamUnavailableError,
  type FetchTermgamePacksOptions
} from './termgame-packs.service'

export { InvalidUpstreamResponseError, UpstreamUnavailableError }

const game = getGameBySlug('delta-force')!

export const DELTA_FORCE_PACKS_SOURCE = buildTermgamePacksSource(game.appId)

/** Garena Delta Force (TH storefront — publishes Delta Coin IAP in ฿). */
export const DELTA_FORCE_APPSTORE_TH_URL =
  'https://apps.apple.com/th/app/garena-delta-force/id6670604287'

/**
 * Global / Proxima Delta Force (US storefront). Different publisher bundle, but
 * live Delta Coin SKUs share amounts (60/300/680/1280/…) so USD attaches by
 * amount (and name when identical). No invented FX.
 */
export const DELTA_FORCE_APPSTORE_US_URL =
  'https://apps.apple.com/us/app/delta-force-2nd-anniversary/id6451399876'

export async function fetchDeltaForcePacks(
  options?: Omit<FetchTermgamePacksOptions, 'appId' | 'slug' | 'usdEnrichment'>
) {
  return fetchTermgamePacks({
    appId: game.appId,
    slug: game.slug,
    ...options,
    usdEnrichment: {
      appStoreThUrl: DELTA_FORCE_APPSTORE_TH_URL,
      appStoreUsUrl: DELTA_FORCE_APPSTORE_US_URL,
      appendAppStoreCategory: true,
      appStoreCategoryName: 'App Store Delta Coin Bundles',
      appStoreCategoryId: 900151
    }
  })
}

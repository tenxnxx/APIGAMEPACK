import { getGameBySlug } from '../games/registry'
import {
  buildTermgamePacksSource,
  fetchTermgamePacks,
  InvalidUpstreamResponseError,
  UpstreamUnavailableError,
  type FetchTermgamePacksOptions
} from './termgame-packs.service'

export { InvalidUpstreamResponseError, UpstreamUnavailableError }

const game = getGameBySlug('fc-online-m')!

export const FC_ONLINE_M_PACKS_SOURCE = buildTermgamePacksSource(game.appId)

/** FC Online M by EA SPORTS FC — TH-only App Store (US 404). */
export const FC_ONLINE_M_APPSTORE_TH_URL =
  'https://apps.apple.com/th/app/fc-online-m-by-ea-sports-fc/id1427128108'

/**
 * Free Fire App Store TH+US used as live Apple THB↔USD price-tier oracle.
 * FC Online M has no US storefront and no termgame region=US USD rows.
 */
export const FC_ONLINE_M_PRICE_TIER_ORACLE_TH_URL =
  'https://apps.apple.com/th/app/free-fire/id1300146617'
export const FC_ONLINE_M_PRICE_TIER_ORACLE_US_URL =
  'https://apps.apple.com/us/app/free-fire/id1300146617'

export async function fetchFcOnlineMPacks(
  options?: Omit<FetchTermgamePacksOptions, 'appId' | 'slug' | 'usdEnrichment'>
) {
  return fetchTermgamePacks({
    appId: game.appId,
    slug: game.slug,
    ...options,
    usdEnrichment: {
      appStoreThUrl: FC_ONLINE_M_PRICE_TIER_ORACLE_TH_URL,
      appStoreUsUrl: FC_ONLINE_M_PRICE_TIER_ORACLE_US_URL,
      appendAppStoreCategory: false
    }
  })
}

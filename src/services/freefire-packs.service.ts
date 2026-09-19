import { getGameBySlug } from '../games/registry'
import {
  buildTermgamePacksSource,
  fetchTermgamePacks,
  InvalidUpstreamResponseError,
  UpstreamUnavailableError,
  type FetchTermgamePacksOptions
} from './termgame-packs.service'

export { InvalidUpstreamResponseError, UpstreamUnavailableError }

const game = getGameBySlug('freefire')!

export const FREEFIRE_PACKS_SOURCE = buildTermgamePacksSource(game.appId)

/** Garena Free Fire on App Store (TH + US storefronts both publish IAP). */
export const FREEFIRE_APPSTORE_TH_URL =
  'https://apps.apple.com/th/app/free-fire/id1300146617'
export const FREEFIRE_APPSTORE_US_URL =
  'https://apps.apple.com/us/app/free-fire/id1300146617'

export async function fetchFreefirePacks(
  options?: Omit<FetchTermgamePacksOptions, 'appId' | 'slug' | 'usdEnrichment'>
) {
  return fetchTermgamePacks({
    appId: game.appId,
    slug: game.slug,
    ...options,
    usdEnrichment: {
      appStoreThUrl: FREEFIRE_APPSTORE_TH_URL,
      appStoreUsUrl: FREEFIRE_APPSTORE_US_URL,
      termgameUsdRegion: 'US',
      termgameUsdLanguage: 'en',
      appendAppStoreCategory: true,
      appStoreCategoryName: 'App Store Diamond Bundles',
      appStoreCategoryId: 900067
    }
  })
}

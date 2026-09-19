import {
  fetchCenturyGamesOfficialPacks,
  fetchCenturyGamesDualCurrencyPacks,
  CenturyInvalidUpstreamResponseError,
  CenturyUpstreamUnavailableError,
  type CenturyGameConfig
} from './centurygames-packs.service'

export const WHITEOUT_SURVIVAL_STORE_SOURCE =
  'https://store.centurygames.com/wos'

export const WHITEOUT_SURVIVAL_PACKAGES_API =
  'https://cg-vip-mall-wos.centurygame.com/api/activity/packages_info'

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

/**
 * Official Whiteout Survival packs.
 * - Default (API route /games/whiteout-survival|wos/packs/): dual THB+USD
 *   from Century packages_info (currency=THB returns live ฿ amounts).
 * - options.currency set (24buym secondary USD lookup): single-currency shape.
 * Keep whiteout-survival-24buym provider separate; do not replace it.
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
}) {
  if (options?.currency) {
    return fetchCenturyGamesOfficialPacks(WOS_CONFIG, {
      signal: options?.signal,
      currency: options.currency,
      packagesPayload: options.packagesPayload as never
    })
  }

  return fetchCenturyGamesDualCurrencyPacks(WOS_CONFIG, {
    signal: options?.signal,
    packagesPayloadUsd: options?.packagesPayloadUsd as never,
    packagesPayloadThb: options?.packagesPayloadThb as never
  })
}

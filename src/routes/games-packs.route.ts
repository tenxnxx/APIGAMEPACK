import { Elysia } from 'elysia'

import { getGameBySlug } from '../games/registry'



import {
  ClashOfCrittersUpstreamUnavailableError,
  fetchClashOfCrittersOfficialPacks
} from '../services/clash-of-critters-packs.service'

import {
  fetchCodMobilePacks
} from '../services/cod-mobile-packs.service'

import {
  CookieRunClassic24buymUpstreamUnavailableError,
  fetchCookieRunClassic24buymPacks
} from '../services/cookierun-classic-24buym-packs.service'

import {
  CookieRunClassicAppStoreUpstreamUnavailableError,
  fetchCookieRunClassicAppStorePacks
} from '../services/cookierun-classic-appstore-packs.service'

import {
  fetchDeltaForcePacks
} from '../services/delta-force-packs.service'

import {
  EfootballUpstreamUnavailableError,
  fetchEfootballIosPacks
} from '../services/efootball-packs.service'

import {
  fetchFcOnlineMPacks
} from '../services/fc-online-m-packs.service'

import {
  fetchFreefirePacks
} from '../services/freefire-packs.service'

import {
  fetchHeartopiaXdPacks,
  HeartopiaXdUpstreamUnavailableError
} from '../services/heartopia-xd-packs.service'

import {
  fetchKingshotOfficialPacks,
  KingshotUpstreamUnavailableError
} from '../services/kingshot-packs.service'

import {
  fetchLastWar24buymPacks,
  LastWar24buymUpstreamUnavailableError
} from '../services/lastwar-24buym-packs.service'

import {
  fetchLastWarOfficialPacks,
  LastWarUpstreamUnavailableError
} from '../services/lastwar-packs.service'

import {
  fetchMlbbCodashopPacks,
  MlbbUpstreamUnavailableError
} from '../services/mlbb-packs.service'

import {
  fetchPubgMobileMidasbuyPacks,
  PubgmUpstreamUnavailableError
} from '../services/pubgm-packs.service'

import {
  fetchRagnarokTheNewWorldPacks,
  listRagnarokTheNewWorldRegions,
  RagnarokTnwUpstreamUnavailableError,
  resolveRagnarokTnwRegionFromSlug
} from '../services/ragnarok-the-new-world-packs.service'

import {
  fetchRobloxPacks,
  RobloxUpstreamUnavailableError
} from '../services/roblox-packs.service'

import {
  fetchRovPacks
} from '../services/rov-packs.service'

import {
  fetchTermgamePacks,
  InvalidUpstreamResponseError,
  UpstreamUnavailableError
} from '../services/termgame-packs.service'

import {
  fetchWhiteoutSurvival24buymPacks,
  WhiteoutSurvival24buymUpstreamUnavailableError
} from '../services/whiteout-survival-24buym-packs.service'

import {
  fetchWhiteoutSurvivalOfficialPacks
} from '../services/whiteout-survival-packs.service'

import {
  fetchWutheringWavesMidasbuyPacks,
  WuwaUpstreamUnavailableError
} from '../services/wuwa-packs.service'

import {
  fetchYulgangWPacks,
  YulgangWUpstreamUnavailableError
} from '../services/yulgang-w-packs.service'

import {
  fetchRagnarokTheNewWorldPacks,
  listRagnarokTheNewWorldRegions,
  resolveRagnarokTnwRegionFromSlug,
  RagnarokTnwUpstreamUnavailableError,
  RagnarokTnwInvalidUpstreamResponseError
} from '../services/ragnarok-the-new-world-packs.service'


import {
  fetchRovPacks
} from '../services/rov-packs.service'
import {
  fetchFreefirePacks
} from '../services/freefire-packs.service'

import {
  fetchDeltaForcePacks
} from '../services/delta-force-packs.service'
import {
  fetchFcOnlineMPacks
} from '../services/fc-online-m-packs.service'
import {
  fetchCodMobilePacks
} from '../services/cod-mobile-packs.service'

export const gamesPacksRoutes = new Elysia().get(
  '/games/:slug/packs/',
  async ({ params: { slug }, status }) => {
    const game = getGameBySlug(slug)
    if (!game) {
      return status(404, { error: 'Unknown game' })
    }

    if (game.provider === 'lastwar-official') {
      try {
        return await fetchLastWarOfficialPacks()
      } catch (error) {
        if (error instanceof LastWarUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof LastWarInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'pubgm-midasbuy') {
      try {
        return await fetchPubgMobileMidasbuyPacks()
      } catch (error) {
        if (error instanceof PubgmUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof PubgmInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'efootball-codashop-ios') {
      try {
        return await fetchEfootballIosPacks()
      } catch (error) {
        if (error instanceof EfootballUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof EfootballInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'clash-of-critters-farlight') {
      try {
        return await fetchClashOfCrittersOfficialPacks()
      } catch (error) {
        if (error instanceof ClashOfCrittersUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof ClashOfCrittersInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'mlbb-codashop') {
      try {
        return await fetchMlbbCodashopPacks()
      } catch (error) {
        if (error instanceof MlbbUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof MlbbInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    
    if (game.provider === 'roblox-premiumfeatures') {
      try {
        return await fetchRobloxPacks()
      } catch (error) {
        if (error instanceof RobloxUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof RobloxInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }


    if (game.provider === 'yulgang-w-appstore') {
      try {
        return await fetchYulgangWPacks()
      } catch (error) {
        if (error instanceof YulgangWUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof YulgangWInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'wuwa-midasbuy') {
      try {
        return await fetchWutheringWavesMidasbuyPacks()
      } catch (error) {
        if (error instanceof WuwaUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof WuwaInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }
    if (game.provider === 'heartopia-xd') {
      try {
        return await fetchHeartopiaXdPacks()
      } catch (error) {
        if (error instanceof HeartopiaXdUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof HeartopiaXdInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'kingshot-official') {
      try {
        return await fetchKingshotOfficialPacks()
      } catch (error) {
        if (error instanceof KingshotUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof KingshotInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'cookierun-classic-appstore') {
      try {
        return await fetchCookieRunClassicAppStorePacks()
      } catch (error) {
        if (error instanceof CookieRunClassicAppStoreUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof CookieRunClassicAppStoreInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }
    if (game.provider === 'cookierun-classic-24buym') {
      try {
        return await fetchCookieRunClassic24buymPacks()
      } catch (error) {
        if (error instanceof CookieRunClassic24buymUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof CookieRunClassic24buymInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }
    if (game.provider === 'lastwar-24buym') {
      try {
        return await fetchLastWar24buymPacks()
      } catch (error) {
        if (error instanceof LastWar24buymUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof LastWar24buymInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }
    if (game.provider === 'whiteout-survival-24buym') {
      try {
        return await fetchWhiteoutSurvival24buymPacks()
      } catch (error) {
        if (error instanceof WhiteoutSurvival24buymUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof WhiteoutSurvival24buymInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'whiteout-survival-official') {
      try {
        return await fetchWhiteoutSurvivalOfficialPacks()
      } catch (error) {
        if (error instanceof WhiteoutSurvivalUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof WhiteoutSurvivalInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.slug === 'rov') {
      try {
        return await fetchRovPacks()
      } catch (error) {
        if (error instanceof UpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof InvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.slug === 'freefire') {
      try {
        return await fetchFreefirePacks()
      } catch (error) {
        if (error instanceof UpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof InvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.slug === 'delta-force') {
      try {
        return await fetchDeltaForcePacks()
      } catch (error) {
        if (error instanceof UpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof InvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.slug === 'fc-online-m') {
      try {
        return await fetchFcOnlineMPacks()
      } catch (error) {
        if (error instanceof UpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof InvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.slug === 'cod-mobile') {
      try {
        return await fetchCodMobilePacks()
      } catch (error) {
        if (error instanceof UpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof InvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }
    if (
      game.provider === 'rtnw-oneone' ||
      game.provider === 'rtnw-oneone-my' ||
      game.provider === 'rtnw-oneone-id' ||
      game.provider === 'rtnw-oneone-ph' ||
      game.provider === 'rtnw-oneone-sg'
    ) {
      try {
        const region = resolveRagnarokTnwRegionFromSlug(slug).code
        return await fetchRagnarokTheNewWorldPacks({ region })
      } catch (error) {
        if (error instanceof RagnarokTnwUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof RagnarokTnwInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    } 

    try {
      return await fetchTermgamePacks({
        appId: game.appId,
        slug: game.slug
      })
    } catch (error) {
      if (error instanceof UpstreamUnavailableError) {
        return status(502, { error: 'Upstream service unavailable' })
      }
      if (error instanceof InvalidUpstreamResponseError) {
        return status(502, { error: 'Invalid upstream response' })
      }
      throw error
    }
  }
)
  .get(
  '/games/:slug/regions/',
  async ({ params: { slug }, status }) => {
    const s = String(slug).toLowerCase()
    const isRtnw =
      s === 'ragnarok-the-new-world' ||
      s.startsWith('ragnarok-the-new-world') ||
      s === 'rtnw' ||
      s.startsWith('rtnw-') ||
      s.startsWith('ragnarok-tnw')
    if (!isRtnw) {
      return status(404, { error: 'Unknown game or no regions list' })
    }
    return listRagnarokTheNewWorldRegions()
  }
)


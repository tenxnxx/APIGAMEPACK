import {
  TsubasaInvalidUpstreamResponseError,
  TsubasaUpstreamUnavailableError,
  fetchTsubasaPacks
} from '../services/tsubasa-packs.service'
import { Elysia } from 'elysia'
import { getGameBySlug } from '../games/registry'
import {
  CabalInvalidUpstreamResponseError,
  CabalUpstreamUnavailableError,
  fetchCabalPacks
} from '../services/cabal-packs.service'
import {
  AceRacerInvalidUpstreamResponseError,
  AceRacerUpstreamUnavailableError,
  fetchAceRacerPacks
} from '../services/aceracer-packs.service'
import {
  ArchitectInvalidUpstreamResponseError,
  ArchitectUpstreamUnavailableError,
  fetchArchitectPacks
} from '../services/architect-packs.service'
import {
  BleachInvalidUpstreamResponseError,
  BleachUpstreamUnavailableError,
  fetchBleachPacks
} from '../services/bleach-packs.service'
import {
  AniimoInvalidUpstreamResponseError,
  AniimoUpstreamUnavailableError,
  fetchAniimoPacks
} from '../services/aniimo-packs.service'
import {
  DeltaForceGarenaInvalidUpstreamResponseError,
  DeltaForceGarenaUpstreamUnavailableError,
  fetchDeltaForceGarenaPacks
} from '../services/delta-force-garena-packs.service'
import {
  BloodStrikeInvalidUpstreamResponseError,
  BloodStrikeUpstreamUnavailableError,
  fetchBloodStrikePacks
} from '../services/bloodstrike-packs.service'
import {
  ClashOfCrittersInvalidUpstreamResponseError,
  ClashOfCrittersUpstreamUnavailableError,
  fetchClashOfCrittersOfficialPacks
} from '../services/clash-of-critters-packs.service'
import {
  fetchCodMobilePacks
} from '../services/cod-mobile-packs.service'
import {
  CookieRunClassic24buymInvalidUpstreamResponseError,
  CookieRunClassic24buymUpstreamUnavailableError,
  fetchCookieRunClassic24buymPacks
} from '../services/cookierun-classic-24buym-packs.service'
import {
  CookieRunClassicAppStoreInvalidUpstreamResponseError,
  CookieRunClassicAppStoreUpstreamUnavailableError,
  fetchCookieRunClassicAppStorePacks
} from '../services/cookierun-classic-appstore-packs.service'
import {
  fetchDeltaForcePacks
} from '../services/delta-force-packs.service'
import {
  EfootballInvalidUpstreamResponseError,
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
  HeartopiaXdInvalidUpstreamResponseError,
  HeartopiaXdUpstreamUnavailableError,
  fetchHeartopiaXdPacks
} from '../services/heartopia-xd-packs.service'
import {
  KingshotInvalidUpstreamResponseError,
  KingshotUpstreamUnavailableError,
  fetchKingshotOfficialPacks
} from '../services/kingshot-packs.service'
import {
  LastWar24buymInvalidUpstreamResponseError,
  LastWar24buymUpstreamUnavailableError,
  fetchLastWar24buymPacks
} from '../services/lastwar-24buym-packs.service'
import {
  LastWarInvalidUpstreamResponseError,
  LastWarUpstreamUnavailableError,
  fetchLastWarOfficialPacks
} from '../services/lastwar-packs.service'
import {
  MlbbInvalidUpstreamResponseError,
  MlbbUpstreamUnavailableError,
  fetchMlbbCodashopPacks
} from '../services/mlbb-packs.service'
import {
  PubgmInvalidUpstreamResponseError,
  PubgmUpstreamUnavailableError,
  fetchPubgMobileMidasbuyPacks
} from '../services/pubgm-packs.service'
import {
  RagnarokTnwInvalidUpstreamResponseError,
  RagnarokTnwUpstreamUnavailableError,
  fetchRagnarokTheNewWorldPacks,
  listRagnarokTheNewWorldRegions,
  resolveRagnarokTnwRegionFromSlug
} from '../services/ragnarok-the-new-world-packs.service'
import {
  RobloxInvalidUpstreamResponseError,
  RobloxUpstreamUnavailableError,
  fetchRobloxPacks
} from '../services/roblox-packs.service'
import {
  fetchRovPacks
} from '../services/rov-packs.service'
import {
  InvalidUpstreamResponseError,
  UpstreamUnavailableError,
  fetchTermgamePacks
} from '../services/termgame-packs.service'
import {
  WhiteoutSurvival24buymInvalidUpstreamResponseError,
  WhiteoutSurvival24buymUpstreamUnavailableError,
  fetchWhiteoutSurvival24buymPacks
} from '../services/whiteout-survival-24buym-packs.service'
import {
  WhiteoutSurvivalInvalidUpstreamResponseError,
  WhiteoutSurvivalUpstreamUnavailableError,
  fetchWhiteoutSurvivalOfficialPacks
} from '../services/whiteout-survival-packs.service'
import {
  WuwaInvalidUpstreamResponseError,
  WuwaUpstreamUnavailableError,
  fetchWutheringWavesMidasbuyPacks
} from '../services/wuwa-packs.service'
import {
  YulgangWInvalidUpstreamResponseError,
  YulgangWUpstreamUnavailableError,
  fetchYulgangWPacks
} from '../services/yulgang-w-packs.service'

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

    if (game.provider === 'tsubasa-klab') {
      try {
        return await fetchTsubasaPacks()
      } catch (error) {
        if (error instanceof TsubasaUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof TsubasaInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'cabal-combo') {
      try {
        return await fetchCabalPacks()
      } catch (error) {
        if (error instanceof CabalUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof CabalInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'aceracer-netease') {
      try {
        return await fetchAceRacerPacks()
      } catch (error) {
        if (error instanceof AceRacerUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof AceRacerInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'bleach-appstore') {
      try {
        return await fetchBleachPacks(game.slug)
      } catch (error) {
        if (error instanceof BleachUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof BleachInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'architect-drimage') {
      try {
        return await fetchArchitectPacks()
      } catch (error) {
        if (error instanceof ArchitectUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof ArchitectInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'aniimo-official') {
      try {
        return await fetchAniimoPacks()
      } catch (error) {
        if (error instanceof AniimoUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof AniimoInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'delta-force-garena') {
      try {
        return await fetchDeltaForceGarenaPacks()
      } catch (error) {
        if (error instanceof DeltaForceGarenaUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof DeltaForceGarenaInvalidUpstreamResponseError) {
          return status(502, { error: 'Invalid upstream response' })
        }
        throw error
      }
    }

    if (game.provider === 'bloodstrike-netease') {
      try {
        return await fetchBloodStrikePacks()
      } catch (error) {
        if (error instanceof BloodStrikeUpstreamUnavailableError) {
          return status(502, { error: 'Upstream service unavailable' })
        }
        if (error instanceof BloodStrikeInvalidUpstreamResponseError) {
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


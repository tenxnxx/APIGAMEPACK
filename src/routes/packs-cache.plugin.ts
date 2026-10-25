import { Elysia } from 'elysia'
import {
  getPacksCache,
  matchPacksPath,
  setPacksCache
} from '../lib/packs-cache'
import { gamesPacksRoutes } from './games-packs.route'

/**
 * Wraps pack routes with a short in-memory cache so repeat views
 * (and game switching back) do not re-hit slow upstreams every time.
 */
export const cachedGamesPacksRoutes = new Elysia()
  .onBeforeHandle(({ request, set }) => {
    if (request.method !== 'GET') return
    const matched = matchPacksPath(new URL(request.url).pathname)
    if (!matched) return

    const hit = getPacksCache(matched.slug)
    if (!hit) {
      set.headers['x-packs-cache'] = 'MISS'
      return
    }

    set.headers['x-packs-cache'] = 'HIT'
    set.status = hit.status
    return hit.body
  })
  .onAfterHandle(({ request, set, response }) => {
    if (request.method !== 'GET') return
    if (set.headers['x-packs-cache'] === 'HIT') return

    const matched = matchPacksPath(new URL(request.url).pathname)
    if (!matched) return

    const status =
      typeof set.status === 'number'
        ? set.status
        : typeof set.status === 'string'
          ? Number(set.status) || 200
          : 200

    if (status === 200 && response !== undefined && response !== null) {
      setPacksCache(matched.slug, status, response)
      set.headers['x-packs-cache'] = 'STORE'
    }
  })
  .use(gamesPacksRoutes)

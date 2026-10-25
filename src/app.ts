import { Elysia } from 'elysia'
import { gamesListRoutes } from './routes/games-list.route'
import { healthRoutes } from './routes/health.route'
import { cachedGamesPacksRoutes } from './routes/packs-cache.plugin'
import { staticRoutes } from './routes/static.route'

export const app = new Elysia()
  .use(healthRoutes)
  .use(gamesListRoutes)
  .use(cachedGamesPacksRoutes)
  .use(staticRoutes)

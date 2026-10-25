import { Elysia } from 'elysia'
import { gamesListRoutes } from './routes/games-list.route'
import { gamesPacksRoutes } from './routes/games-packs.route'
import { healthRoutes } from './routes/health.route'
import { staticRoutes } from './routes/static.route'

export const app = new Elysia()
  .use(healthRoutes)
  .use(gamesListRoutes)
  .use(gamesPacksRoutes)
  .use(staticRoutes)

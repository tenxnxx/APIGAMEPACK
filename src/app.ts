import { Elysia } from 'elysia'
import { gamesPacksRoutes } from './routes/games-packs.route'
import { healthRoutes } from './routes/health.route'

export const app = new Elysia()
  .use(healthRoutes)
  .use(gamesPacksRoutes)
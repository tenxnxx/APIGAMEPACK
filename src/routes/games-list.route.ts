import { Elysia } from 'elysia'
import { listCanonicalGames } from '../games/registry'

export const gamesListRoutes = new Elysia().get('/games/', () => {
  const games = listCanonicalGames()
  return { games, count: games.length }
})

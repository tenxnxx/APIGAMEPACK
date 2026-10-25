export { app } from './app'

import { app } from './app'

if (import.meta.main) {
  const port = Number(process.env.PORT) || 8000
  app.listen({
    port,
    hostname: '0.0.0.0'
  })
  console.log(
    `Elysia is running at http://${app.server?.hostname}:${app.server?.port}`
  )
}

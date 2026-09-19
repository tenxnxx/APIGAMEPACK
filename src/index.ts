export { app } from './app'

import { app } from './app'

if (import.meta.main) {
  app.listen(8000)
  console.log(`Elysia is running at http://${app.server?.hostname}:${app.server?.port}`)
}

import { Elysia } from 'elysia'
import { join } from 'node:path'

const publicDir = join(import.meta.dir, '../../public')

function publicFile(name: string) {
  return Bun.file(join(publicDir, name))
}

export const staticRoutes = new Elysia()
  .get('/', ({ set }) => {
    // Always revalidate HTML so deploys show the latest shell.
    set.headers['Cache-Control'] = 'no-cache'
    return publicFile('index.html')
  })
  .get('/styles.css', ({ set }) => {
    set.headers['Cache-Control'] = 'public, max-age=3600'
    return publicFile('styles.css')
  })
  .get('/app.js', ({ set }) => {
    set.headers['Cache-Control'] = 'public, max-age=3600'
    return publicFile('app.js')
  })

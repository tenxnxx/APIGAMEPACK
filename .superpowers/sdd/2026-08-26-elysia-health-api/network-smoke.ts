import { app } from '../../../src/index'

const server = app.listen({ hostname: '127.0.0.1', port: 43009 })

try {
  const response = await fetch('http://127.0.0.1:43009/health')
  const body = await response.json()

  if (response.status !== 200 || JSON.stringify(body) !== JSON.stringify({ status: 'ok' })) {
    throw new Error(`Unexpected response: ${response.status} ${JSON.stringify(body)}`)
  }

  console.log(JSON.stringify({ status: response.status, body }))
} finally {
  server.stop()
}

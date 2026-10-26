import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'cabal-infinite-combo') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
const TH = 'https://core-api.combo-interactive.com/topup/games/6eaad7c6-bfc8-48ce-a616-061a2cef8f41/products?currency='
const SEA = 'https://core-api.combo-interactive.com/topup/games/5f0740de-8045-42d4-8460-b03f340f01a6/products?currency='
const prod = (op: number, pt: number, price: number, currency: string) => ({ id: `${op}-${currency}`, name: 'วอลเล็ตพอยท์', original_point: op, point: pt, price, currency, position: 1, description: null, is_enabled: true, start_at: null, end_at: null, thumbnail: null })
const page = (data: unknown[]) => Response.json({ current_page: 1, data, total: data.length })
function mock(map: Record<string, () => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f()
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}

describe('cabal infinite combo', () => {
  it('THB + USD from official per-currency lists, base+bonus(total), no conversion', async () => {
    mock({
      [TH + 'THB']: () => page([prod(1000, 1000, 100, 'THB'), prod(200, 200, 20, 'THB')]),
      [TH + 'USD']: () => page([]),
      [SEA + 'THB']: () => page([prod(5000, 5800, 1850, 'THB')]),
      [SEA + 'USD']: () => page([prod(5000, 5800, 50, 'USD')])
    })
    const res = await get('cabal')
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game.slug).toBe('cabal-infinite-combo')
    const th = body.categories[0].packs
    expect(th[0]).toMatchObject({ baseItemAmount: 200, bonusItemAmount: 0, totalItemAmount: 200, price_thb: 20, price_usd: null })
    expect(th[0].price_usd_null_reason).toContain('THB only')
    expect(body.categories[1].packs[0]).toMatchObject({ baseItemAmount: 5000, bonusItemAmount: 800, totalItemAmount: 5800, price_thb: 1850, price_usd: 50 })
  })
  it('502 when official API is down or malformed', async () => {
    mock({ 'https://core-api.combo-interactive.com/': () => new Response('x', { status: 503 }) })
    expect((await get()).status).toBe(502)
    mock({ 'https://core-api.combo-interactive.com/': () => Response.json({ message: 'err' }) })
    expect((await get()).status).toBe(502)
  })
})
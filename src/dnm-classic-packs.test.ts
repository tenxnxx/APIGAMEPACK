import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = () => (clearPacksCache(), app.handle(new Request('http://localhost/games/dragon-nest-m-classic/packs/')))
const g = (title: string, price: string, sku: string) => ({ id: 1, sku, title, currency: 'THB', price_local_show: price, label: { title: '' }, pay_channel_sub: [] })
const shop = { code: 0, data: { shop_info: { shelf_location: [{ title: 'Dragon Cash', goods: [g('3000+130', '175.00', 'lzg.4.99'), g('600+26', '35.00', 'lzg.0.99')] }] } } }
function mock(shopRes: () => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input)
    if (u.startsWith('https://api.mobapay.com/api/app_shop')) return shopRes()
    if (u.startsWith('https://apps.apple.com/us/app/id6743824718')) return new Response('nf', { status: 404 })
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}

describe('dragon nest m classic', () => {
  it('THB + base/bonus from official Mobapay shop, USD null with reason (no FX)', async () => {
    mock(() => Response.json(shop))
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game.slug).toBe('dragon-nest-m-classic')
    const ps = body.categories[0].packs
    expect(ps[0]).toMatchObject({ name: '600+26 Cash', price_thb: 35, price_usd: null, baseItemAmount: 600, bonusItemAmount: 26, totalItemAmount: 626 })
    expect(ps[1]).toMatchObject({ price_thb: 175, baseItemAmount: 3000, bonusItemAmount: 130, totalItemAmount: 3130 })
    expect(ps[0].price_usd_null_reason).toContain('404')
  })
  it('502 when shop down or bad code', async () => {
    mock(() => new Response('x', { status: 503 }))
    expect((await get()).status).toBe(502)
    mock(() => Response.json({ code: 130101, message: 'x' }))
    expect((await get()).status).toBe(502)
  })
})

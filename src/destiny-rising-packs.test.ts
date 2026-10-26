import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const iap = (n: string, p: string) => `<div class="text-pair svelte-x"><span>${n}</span> <span>${p}</span> </div>`
const get = () => (clearPacksCache(), app.handle(new Request('http://localhost/games/destiny-rising/packs/')))
function mock(map: Record<string, () => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f()
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const prod = (goodsid: string, info: string, price: string, coins: number) =>
  ({ goodsid, goodsinfo: info, currency: 'USD', price, pay_yuanbao: coins, free_yuanbao: 0, status: 1, expired_time: null, extra: {} })
const products = { code: '0000', data: [
  prod('g108na.silver2', '300 Sliver', '4.9900', 300),
  prod('g108na.silver1', '60 Silver', '0.9900', 60),
  prod('g108na.silver1', '60 Silver', '0.9900', 60)
] }
const P = 'https://pay.neteasegames.com/gameclub/products/destinyrising?'
const A = 'https://pay.neteasegames.com/gameclub/products/destinyrising/activitys'

describe('destiny rising', () => {
  it('USD+base+bonus from NetEase official, THB from App Store TH by Silver amount, no conversion', async () => {
    mock({
      [P]: () => Response.json(products),
      [A]: () => Response.json({ code: '0000', data: { list: [{ goodsid: 'g108na.silver2', marketing_free_amount: 30 }] } }),
      'https://apps.apple.com/th/app/id1593326563': () => new Response(iap('300Silver', '\u0E3F199.00') + iap('Founder Bundle', '\u0E3F699.00')),
      'https://apps.apple.com/us/app/id1593326563': () => new Response(iap('Founder Bundle', '$19.99'))
    })
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game.slug).toBe('destiny-rising')
    const ps = body.categories[0].packs
    expect(ps).toHaveLength(2)
    expect(ps[0]).toMatchObject({ name: '60 Silver', price_usd: 0.99, price_thb: null, baseItemAmount: 60, bonusItemAmount: 0, totalItemAmount: 60 })
    expect(ps[0].price_thb_null_reason).toContain('THB')
    expect(ps[1]).toMatchObject({ name: '300 Sliver', price_usd: 4.99, price_thb: 199, baseItemAmount: 300, bonusItemAmount: 30, totalItemAmount: 330 })
    expect(body.categories[1].packs[0]).toMatchObject({ price_thb: 699, price_usd: 19.99, item_pack: true })
  })
  it('502 when products API down or bad code', async () => {
    mock({ [P]: () => new Response('x', { status: 503 }) })
    expect((await get()).status).toBe(502)
    mock({ [P]: () => Response.json({ code: '0300', msg: 'x', data: null }) })
    expect((await get()).status).toBe(502)
  })
})

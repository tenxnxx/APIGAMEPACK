import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const iap = (n: string, p: string) => `<div class="text-pair svelte-x"><span>${n}</span> <span>${p}</span> </div>`
const get = () => (clearPacksCache(), app.handle(new Request('http://localhost/games/ace-racer/packs/')))
function mock(map: Record<string, () => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f()
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const prod = (goodsid: string, info: string, cur: string, price: string, coins: number, extra: object = {}) =>
  ({ goodsid, goodsinfo: info, currency: cur, price, pay_yuanbao: coins, free_yuanbao: 0, status: 1, expired_time: null, extra, ...extra })
const products = { code: '0000', data: [
  prod('arna.jnb68.usd', '680 Tokens', 'USD', '9.9900', 680),
  prod('arna.jnb6.usd', '60 Tokens', 'USD', '0.9900', 60),
  prod('arna.jnb6.usd', '60 Tokens', 'USD', '0.9900', 60),
  prod('arna.xljh118new.usd', 'Private Training', 'USD', '17.9900', 0),
  prod('arna.jnbsc6.usd', '60 Tokens', 'USD', '0.9900', 60, { expired_time: 1692892800 }),
  prod('arna.jnb6.jpy', '60記念メダル', 'JPY', '140.0000', 60)
] }
const P = 'https://pay.neteasegames.com/gameclub/products/aceracer?'
const A = 'https://pay.neteasegames.com/gameclub/products/aceracer/activitys'

describe('ace racer', () => {
  it('USD+base+bonus from NetEase official, THB from App Store TH by name, no conversion', async () => {
    mock({
      [P]: () => Response.json(products),
      [A]: () => Response.json({ code: '0000', data: { list: [{ goodsid: 'arna.jnb68.usd', marketing_free_amount: 60 }, { goodsid: 'arna.jnb6.usd', marketing_free_amount: 5 }] } }),
      'https://apps.apple.com/th/app/id1593356371': () => new Response(iap('60 Tokens', '\u0E3F29.00') + iap('Monthly Pass', '\u0E3F149.00')),
      'https://apps.apple.com/us/app/id1593356371': () => new Response(iap('Monthly Pass', '$4.99'))
    })
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game.slug).toBe('ace-racer')
    const ps = body.categories[0].packs
    expect(ps).toHaveLength(3)
    expect(ps[0]).toMatchObject({ name: '60 Tokens', price_usd: 0.99, price_thb: 29, baseItemAmount: 60, bonusItemAmount: 5, totalItemAmount: 65, item_pack: false })
    expect(ps[1]).toMatchObject({ name: '680 Tokens', price_usd: 9.99, price_thb: null, baseItemAmount: 680, bonusItemAmount: 60, totalItemAmount: 740 })
    expect(ps[1].price_thb_null_reason).toContain('THB')
    expect(ps[2]).toMatchObject({ name: 'Private Training', item_pack: true, baseItemAmount: null, bonusItemAmount: null, price_usd: 17.99 })
    expect(body.categories[1].packs[0]).toMatchObject({ name: 'Monthly Pass', price_thb: 149, price_usd: 4.99, item_pack: true })
  })
  it('bonus null with reason when activitys fails', async () => {
    mock({ [P]: () => Response.json(products), [A]: () => new Response('x', { status: 500 }) })
    const body = (await (await get()).json()) as any
    expect(body.categories[0].packs[0]).toMatchObject({ bonusItemAmount: null, bonus_available: false, totalItemAmount: 60 })
    expect(body.categories[0].packs[0].bonus_null_reason).toBeTruthy()
  })
  it('502 when products API down or bad code', async () => {
    mock({ [P]: () => new Response('x', { status: 503 }) })
    expect((await get()).status).toBe(502)
    mock({ [P]: () => Response.json({ code: '0300', msg: 'x', data: null }) })
    expect((await get()).status).toBe(502)
  })
})
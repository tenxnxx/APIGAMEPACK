import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'arena-breakout') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
const promo = (q: number) => ({ promotion_list: [{ activity_tag_list_v2: [{ i18n_tag: 'First Bonus' }], gift_list: [{ name: 'bond', quantity: q, product_type: 'GameCoins' }] }] })
const th = { shelf: { products: [
  { product_type: 'GameCoins', product_id: 'p.499', name: '310Bonds', game_coins_num: 310, prices: [{ amount: '166', display_amount: '0', currency: 'THB' }, { amount: '233', currency: 'THB', payment_channel_id: 'RAZER' }], base_group: promo(310) },
  { product_type: 'GameCoins', product_id: 'p.99', name: '60Bonds', game_coins_num: 60, prices: [{ amount: '33', display_amount: '0', currency: 'THB' }], base_group: promo(60) },
  { product_type: 'GameCoins', product_id: 'dcb.th.30', name: '50 bonds', game_coins_num: 50, prices: [], collapsed_prices: [{ amount: '30', currency: 'THB', payment_channel_id: 'DTAC_DCB' }] }
] } }
const us = { shelf: { products: [
  { product_type: 'GameCoins', product_id: 'p.99', name: '60Bonds', game_coins_num: 60, prices: [{ amount: '0.99', display_amount: '0', currency: 'USD' }], base_group: promo(60) },
  { product_type: 'GameCoins', product_id: 'p.499', name: '310Bonds', game_coins_num: 310, prices: [{ amount: '4.99', display_amount: '0', currency: 'USD' }], base_group: promo(310) }
] } }
function mock(thRes: () => Response, usRes: () => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('/shelves/query')) {
      const b = JSON.parse(String(init?.body))
      expect(b.app_id).toBe('1460000360')
      return b.region === 'TH' ? thRes() : usRes()
    }
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}

describe('arena breakout mobile', () => {
  it('THB from Midasbuy TH, USD from Midasbuy US by product_id, base+bonus', async () => {
    mock(() => Response.json(th), () => Response.json(us))
    const res = await get()
    expect(res.status).toBe(200)
    const ps = ((await res.json()) as any).categories[0].packs
    expect(ps.map((p: any) => p.product_id)).toEqual(['dcb.th.30', 'p.99', 'p.499'])
    expect(ps[1]).toMatchObject({ price_thb: 33, price_usd: 0.99, baseItemAmount: 60, bonusItemAmount: 60, totalItemAmount: 120 })
    expect(ps[2]).toMatchObject({ price_thb: 166, price_usd: 4.99, totalItemAmount: 620 })
    expect(ps[0]).toMatchObject({ price_thb: 30, price_usd: null, bonusItemAmount: 0, totalItemAmount: 50 })
    expect(ps[0].price_usd_null_reason).toContain('DTAC_DCB')
  })
  it('keeps THB and nulls USD when US fails; 502 when TH fails', async () => {
    mock(() => Response.json(th), () => new Response('x', { status: 500 }))
    const ps = ((await (await get('arena-breakout-mobile')).json()) as any).categories[0].packs
    expect(ps[1].price_usd).toBeNull()
    expect(ps[1].price_usd_null_reason).toContain('US fetch failed')
    mock(() => new Response('x', { status: 503 }), () => Response.json(us))
    expect((await get()).status).toBe(502)
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = () => (clearPacksCache(), app.handle(new Request('http://localhost/games/crossfire-legends/packs/')))
const prod = (id: string, coins: number, prices: object[], extra: object = {}) => ({ product_id: id, name: coins + 'CrossfireCoin', product_type: 'GameCoins', game_coins_num: coins, prices, collapsed_prices: [], ...extra })
const firstBonus = (q: number) => ({ base_group: { promotion_list: [{ activity_tag_list_v2: [{ tag_id: 'first_activity', i18n_tag: 'First Bonus' }], gift_list: [{ name: 'CrossfireCoin', product_type: 'GameCoins', quantity: q }] }] } })
const TH = { shelf: { products: [
  prod('c60', 60, [{ currency: 'THB', amount: '35', display_amount: '38', payment_channel_id: '' }, { currency: 'THB', amount: '38', display_amount: '0', payment_channel_id: 'RAZER_GOLD_WALLET' }], firstBonus(60)),
  prod('c90', 90, [], { collapsed_prices: [{ currency: 'THB', amount: '50', display_amount: '0', payment_channel_id: 'TRUEMOVE_DCB' }] }),
  prod('c10', 10, [{ currency: 'THB', amount: '5', display_amount: '6', payment_channel_id: '' }])
] } }
const KH = { shelf: { products: [prod('c60', 60, [{ currency: 'USD', amount: '0.99', display_amount: '1.09', payment_channel_id: '' }]), prod('c10', 10, [{ currency: 'USD', amount: '0.15', display_amount: '0.17', payment_channel_id: '' }])] } }
function mock(th: () => Response, kh: () => Response) {
  globalThis.fetch = (async (_i: RequestInfo | URL, init?: RequestInit) => {
    const region = JSON.parse(String(init?.body ?? '{}')).region
    return region === 'TH' ? th() : region === 'KH' ? kh() : new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}

describe('crossfire legends', () => {
  it('THB from Midasbuy TH, USD from Midasbuy KH by product_id, base+bonus, no conversion', async () => {
    mock(() => Response.json(TH), () => Response.json(KH))
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game.slug).toBe('crossfire-legends')
    const ps = body.categories[0].packs
    expect(ps.map((p: any) => p.name)).toEqual(['10CrossfireCoin', '60CrossfireCoin', '90CrossfireCoin'])
    expect(ps[1]).toMatchObject({ price_thb: 38, price_thb_sale: 35, price_usd: 1.09, price_usd_sale: 0.99, baseItemAmount: 60, bonusItemAmount: 60, totalItemAmount: 120 })
    expect(ps[0]).toMatchObject({ price_thb: 6, price_usd: 0.17, bonusItemAmount: 0, totalItemAmount: 10 })
    expect(ps[2]).toMatchObject({ price_thb: 50, price_usd: null })
    expect(ps[2].price_usd_null_reason).toContain('KH')
  })
  it('USD null with reason when KH fails; 502 when TH fails', async () => {
    mock(() => Response.json(TH), () => new Response('x', { status: 500 }))
    const body = (await (await get()).json()) as any
    expect(body.categories[0].packs[0].price_usd).toBeNull()
    expect(body.categories[0].packs[0].price_usd_null_reason).toContain('fetch failed')
    mock(() => new Response('x', { status: 503 }), () => Response.json(KH))
    expect((await get()).status).toBe(502)
    mock(() => Response.json({ shelf: { products: [] } }), () => Response.json(KH))
    expect((await get()).status).toBe(502)
  })
})

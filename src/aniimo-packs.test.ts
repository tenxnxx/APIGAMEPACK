import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => {
  globalThis.fetch = originalFetch
  clearPacksCache()
})

const crystal = (id: string, coin: number, price: number, bonus?: number) => ({
  package_id: id, product_id: 'com.x.aniimos.' + id, product_type: 1, coin, currency: 'THB',
  description: `${coin}辉晶`, original_price: price, price, final_price: price,
  benefit: [
    ...(bonus === undefined ? [] : [{ act_type: 'level_normal_rebate', benefit_type: 'rebate', coin: bonus }]),
    { act_type: 'level_first_rebate', benefit_type: 'rebate', coin },
    { act_type: 'month_first_discount', benefit_type: 'discount', discount_price: Math.round(price * 0.92) }
  ]
})
const payload = {
  code: 0,
  data: {
    get_ip_currency: { code: 0, data: { country: 'TH', currency: 'THB' } },
    game_products: {
      code: 0,
      data: [
        crystal('290001', 60, 29, 6),
        crystal('290002', 300, 199),
        { package_id: '290008', product_type: 2, coin: 0, currency: 'THB', description: '月度之证', original_price: 199, price: 199, benefit: [] }
      ]
    }
  }
}
function mock(res: () => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === 'https://worldx-store-coin.kingsgroupgames.com/api/store/init') return res()
    throw new Error('unexpected fetch: ' + url)
  }) as unknown as typeof fetch
}
const get = () => (clearPacksCache(), app.handle(new Request('http://localhost/games/aniimo/packs/')))

describe('aniimo official shop', () => {
  it('maps base/bonus/total and THB prices', async () => {
    mock(() => Response.json(payload))
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game.name).toBe('Aniimo')
    const [c1, c2] = body.categories
    expect(c1.packs[0]).toMatchObject({ name: '60 Lumin Crystals', baseItemAmount: 60, bonusItemAmount: 6, totalItemAmount: 66, price_thb: 29, bonus_available: true, first_purchase_bonus: 60 })
    expect(c1.packs[1]).toMatchObject({ baseItemAmount: 300, bonusItemAmount: null, bonus_available: false, totalItemAmount: 300 })
    expect(c2.packs[0]).toMatchObject({ name: 'Monthly Pass', price_thb: 199, bonusItemAmount: 0 })
  })
  it('fills THB+USD from App Store TH/US when shop returns another currency (SGD)', async () => {
    const sgd = JSON.parse(JSON.stringify(payload))
    for (const p of sgd.data.game_products.data) { p.currency = 'SGD'; p.original_price = 1.28 }
    const row = (n: string, pr: string) => `<div class="text-pair svelte-x"><span>${n}</span> <span>${pr}</span> </div>`
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('kingsgroupgames.com')) return Response.json(sgd)
      if (url.includes('/th/app/')) return new Response(row('Aniimo: 60 Lumin Crystals', '\u0E3F29.00') + row('Aniimo: Monthly Pass', '\u0E3F199.00'))
      if (url.includes('/us/app/')) return new Response(row('Aniimo: 60 Lumin Crystals', '$0.99') + row('Aniimo: 300 Lumin Crystals', '$4.99'))
      throw new Error('unexpected fetch: ' + url)
    }) as unknown as typeof fetch
    const body = (await (await get()).json()) as any
    const [c1, c2] = body.categories
    expect(c1.packs[0]).toMatchObject({ price_thb: 29, price_usd: 0.99, currency: 'THB', price: 29, store_currency: 'SGD', store_price: 1.28, price_thb_source: 'apple-app-store-th', price_usd_source: 'apple-app-store-us', bonusItemAmount: 6 })
    expect(c1.packs[1]).toMatchObject({ price_thb: null, price_usd: 4.99, currency: 'USD' })
    expect(typeof c1.packs[1].price_thb_null_reason).toBe('string')
    expect(c2.packs[0]).toMatchObject({ price_thb: 199, price_usd: null })
  })
  it('returns 502 on upstream HTTP error', async () => {
    mock(() => new Response('x', { status: 503 }))
    expect((await get()).status).toBe(502)
  })
  it('returns 502 on invalid payload', async () => {
    mock(() => Response.json({ code: 1 }))
    expect((await get()).status).toBe(502)
  })
})

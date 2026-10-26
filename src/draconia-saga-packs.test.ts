import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = () => (clearPacksCache(), app.handle(new Request('http://localhost/games/draconia-saga/packs/')))
const g = (n: number, price: number, ext: object = {}) => ({ goods_name: n + 'Credit', goods_price: price, goods_number: n, goods_id: 'lzgwy.sugarfun.sea.voucher.1', status: 0, type: 3, goodsExtInfo: { rewardMoney: null, ...ext } })
const TH = { code: 0, data: { country: 'TH', discount: 1, goodsList: [g(5, 199), g(1, 35, { rewardMoney: 2 })] } }
const US = { code: 0, data: { country: 'US', discount: 1, goodsList: [g(1, 0.99)] } }
function mock(th: () => Response, us: () => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!String(input).startsWith('https://sea-pay.sugarfungame.com/pay-service/webpay/do')) return new Response('nf', { status: 404 })
    const ip = new Headers(init?.headers).get('X-Forwarded-For')
    return ip === '8.8.8.8' ? us() : th()
  }) as unknown as typeof fetch
}

describe('draconia saga', () => {
  it('THB from TH, USD from US official store, base+bonus, no conversion', async () => {
    mock(() => Response.json(TH), () => Response.json(US))
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game.slug).toBe('draconia-saga')
    const ps = body.categories[0].packs
    expect(ps[0]).toMatchObject({ name: '1Credit', price_thb: 35, price_usd: 0.99, baseItemAmount: 1, bonusItemAmount: 2, totalItemAmount: 3 })
    expect(ps[1]).toMatchObject({ name: '5Credit', price_thb: 199, price_usd: null, baseItemAmount: 5, bonusItemAmount: 0, totalItemAmount: 5 })
    expect(ps[1].price_usd_null_reason).toBeTruthy()
  })
  it('USD null with reason when US answer is the wrong country', async () => {
    mock(() => Response.json(TH), () => Response.json({ ...US, data: { ...US.data, country: 'TH' } }))
    const ps = ((await (await get()).json()) as any).categories[0].packs
    expect(ps[0].price_usd).toBeNull()
    expect(ps[0].price_usd_null_reason).toContain('country')
  })
  it('502 when TH fails or bad code', async () => {
    mock(() => new Response('x', { status: 503 }), () => Response.json(US))
    expect((await get()).status).toBe(502)
    mock(() => Response.json({ code: 403, msg: 'x' }), () => Response.json(US))
    expect((await get()).status).toBe(502)
  })
})

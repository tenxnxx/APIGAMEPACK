import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { buildLzStorePack } from './services/last-z-survival-shooter-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'last-z-survival-shooter') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
function mock(map: Record<string, (url: string) => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f(url)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const STORE = 'https://store.last-z.com/getitem.php'
const g = (id: string, amount: number, cur: string, pay: number, free: number) => ({ goods_id: id, amount, currency: cur, currency_symbol: '$', pay_brick_num: pay, free_brick_num: free, status: 1, limit: 99 })
const store = (cur: string) => () => Response.json({ defCurrency: cur, goods: [g('goods_1', cur === 'THB' ? 350 : 9.99, cur, 1000, 50), g('goods_7', cur === 'THB' ? 35000 : 999.99, cur, 100000, 5000)], doubleGoodsList: { goods_1: 210 } })
const row = (id: string, offer: string, name: string, price: number, cur: 'THB' | 'USD') => ({
  id, type: 'in-apps', attributes: { name, offerName: offer, description: { standard: name }, offers: [{ currencyCode: cur, price, priceFormatted: String(price) }] }
})
const TH = [row('1', 'lmios_10', 'Resource Hot Sale 10', 35, 'THB'), row('2', 'lmios_11', 'Resource Hot Sale 11', 3650, 'THB')]
const US = [row('1', 'lmios_10', 'Resource Hot Sale 10', 0.99, 'USD')]
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
const apple = { [API + 'th/']: page(TH), [API + 'us/']: page(US), [API + 'kh/']: page([]), [API + 'la/']: page([]), [API + 'mm/']: page([]) }
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const by = (b: any, id: string) => all(b).find((p: any) => p.product_id === id)

describe('Last Z: Survival Shooter (official web store + App Store)', () => {
  it('builds a Gold Bar pack from store fields without FX', () => {
    const p = buildLzStorePack(g('goods_2', 19.99, 'USD', 2000, 100) as any, 'USD', {})
    expect(p).toMatchObject({ baseItemAmount: 2000, bonusItemAmount: 100, totalItemAmount: 2100, price_usd: 19.99, price_thb: null, item_pack: false })
    expect(p.price_thb_null_reason).toMatch(/no FX/)
    const q = buildLzStorePack({ goods_id: 'x', amount: 1, currency: 'USD' } as any, 'USD', {})
    expect(q.bonusItemAmount).toBeNull()
    expect(q.bonus_null_reason).toMatch(/not assumed to be 0/)
  })

  it('USD web store + App Store TH/US; aliases resolve', async () => {
    mock({ [STORE]: store('USD'), ...apple })
    for (const slug of ['last-z-survival-shooter', 'lastz', 'last-z']) {
      const res = await get(slug)
      expect(res.status).toBe(200)
      const b: any = await res.json()
      expect(b.game.slug).toBe('last-z-survival-shooter')
      expect(b.summary.packCount).toBe(4)
    }
    const b: any = await (await get()).json()
    expect(b.source_mode).toBe('lastz-store+appstore')
    expect(b.categories.map((c: any) => c.packCount)).toEqual([2, 2])
    const v = by(b, 'goods_1')
    expect(v).toMatchObject({ item: 'Gold Bar', price_usd: 9.99, price_thb: null, baseItemAmount: 1000, bonusItemAmount: 50, totalItemAmount: 1050, web_store_double: 210 })
    expect(v.price_thb_null_reason).toMatch(/region/)
    expect(by(b, 'lmios_10')).toMatchObject({ kind: 'bundle', item_pack: true, price_thb: 35, price_usd: 0.99, contents: null })
    expect(by(b, 'lmios_11').price_usd_null_reason).toMatch(/no FX conversion/)
  })

  it('THB from the store if it ever serves THB', async () => {
    mock({ [STORE]: store('THB'), ...apple })
    const v = by(await (await get()).json(), 'goods_7')
    expect(v).toMatchObject({ price_thb: 35000, price_usd: null, totalItemAmount: 105000 })
  })

  it('store down -> App Store only; everything down -> 502', async () => {
    mock({ ...apple })
    const res = await get()
    expect(res.status).toBe(200)
    const b: any = await res.json()
    expect(b.summary.packCount).toBe(2)
    expect(b.source_details.webshop_error).toBeTruthy()
    mock({})
    expect((await get()).status).toBe(502)
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'destiny-rising') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
function mock(map: Record<string, (url: string) => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f(url)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const NOW = 1793172664
const prod = (goodsid: string, info: string, price: string, coins: number, platform: string, extra: any = {}) => ({
  goodsid, goodsinfo: info, currency: 'USD', price, pay_yuanbao: coins, free_yuanbao: 0, status: 1, platform, expired_time: null,
  extra: { local_price: JSON.stringify({ TW: { default: { price: 750, currency: 'TWD' } } }) },
  multi_language: { default: { default: { goodsinfo: info, image_info: { normal: 'img' }, product_free_amount_activity_list: null } } },
  ...extra
})
const products = { code: '0000', data: [
  prod('g108na.silver4', '1500 Silver', '24.9900', 1500, 'ios'),
  prod('g108na.silver1', '60 Silver', '0.9900', 60, 'ios'),
  prod('g108na.silver1', '60 Silver', '0.9900', 60, 'ad'),
  prod('g108na.silver2', '300 Sliver', '4.9900', 300, 'pc'),
  prod('g108na.old', '9 Silver', '0.1900', 9, 'pc', { expired_time: NOW - 1 })
] }
const acts = { code: '0000', data: { server_ts: NOW, list: [
  { goodsid: 'g108na.silver1', activity_type: '0', alpha2: 'all', marketing_free_amount: 6, effective_time: 1, expired_time: 2147483647 },
  { goodsid: 'g108na.silver4', activity_type: '27', alpha2: 'TH', marketing_free_amount: 0, effective_time: 1, expired_time: NOW + 3600, after_discount_price_map: { THB: '899', USD: '22.99' } }
] } }
const row = (id: string, offerName: string, name: string, price: number, cur: 'THB' | 'USD') => ({
  id, type: 'in-apps',
  attributes: { name, offerName, offers: [{ currencyCode: cur, price, priceFormatted: (cur === 'THB' ? '\u0E3F' : '$') + price.toFixed(2) }] }
})
const TH = [
  row('1', 'g108na.silver1', '60silver', 29, 'THB'), row('4', 'g108na.silver4', '1500silver', 999, 'THB'),
  row('20', 'g108na.battlepass1', 'premuim battle pass', 199, 'THB'), row('21', 'g108na.battlepass2', 'premuim pass plus', 399, 'THB'),
  row('22', 'g108na.battlepass3', 'premuim pass plus', 199, 'THB'), row('30', 'g108na.founderbundle', 'founder bundle', 699, 'THB'),
  row('31', 'g108na.weekcard', "pandora's deals", 99, 'THB')
]
const US = [
  row('22', 'g108na.battlepass3', 'premuim pass plus', 5, 'USD'), row('21', 'g108na.battlepass2', 'premuim pass plus', 9.99, 'USD'),
  row('20', 'g108na.battlepass1', 'premuim battle pass', 4.99, 'USD'), row('30', 'g108na.founderbundle', 'founder bundle', 19.99, 'USD'),
  row('31', 'g108na.weekcard', "pandora's deals", 2.99, 'USD'), row('4', 'g108na.silver4', '1500silver', 24.99, 'USD')
]
const P = 'https://pay.neteasegames.com/gameclub/products/destinyrising?'
const A = 'https://pay.neteasegames.com/gameclub/products/destinyrising/activitys'
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const page = (rows: any[]) => (url: string) => (/offset=0\b/.test(url) ? Response.json({ data: rows }) : new Response('nf', { status: 404 }))
const iap = (n: string, p: string) => `<div class="text-pair svelte-x"><span>${n}</span> <span>${p}</span> </div>`

describe('destiny rising', () => {
  it('official USD/base/bonus/discount; THB = App Store TH of the same product (offerName); passes/bundles from App Store as item packs', async () => {
    mock({ [P]: () => Response.json(products), [A]: () => Response.json(acts), [API + 'th/']: page(TH), [API + 'us/']: page(US) })
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game).toMatchObject({ slug: 'destiny-rising', itemName: 'Silver' })
    const [silver, pass, bundle] = body.categories
    expect(silver.packs.map((p: any) => p.product_id)).toEqual(['g108na.silver1', 'g108na.silver2', 'g108na.silver4'])
    expect(silver.packs[0]).toMatchObject({ price_thb: 29, price_usd: 0.99, baseItemAmount: 60, bonusItemAmount: 6, totalItemAmount: 66, item_pack: false, discount_price_thb: null })
    expect(silver.packs[0].discount_null_reason).toContain('No active official GameClub discount')
    expect(silver.packs[1]).toMatchObject({ name: '300 Sliver', price_thb: null, price_usd: 4.99, bonusItemAmount: 0, totalItemAmount: 300 })
    expect(silver.packs[1].price_thb_null_reason).toContain('full App Store IAP list checked')
    expect(silver.packs[2]).toMatchObject({ price_thb: 999, price_usd: 24.99, price_usd_source: 'netease-gameclub-official', discount_price_thb: 899, discount_price_usd: 22.99, discount_until: new Date((NOW + 3600) * 1000).toISOString() })
    expect(silver.packs[2].price_thb_source).toContain('offerName=g108na.silver4')
    expect(pass.packs.map((p: any) => [p.product_id, p.price_thb, p.price_usd])).toEqual([
      ['g108na.weekcard', 99, 2.99], ['g108na.battlepass1', 199, 4.99], ['g108na.battlepass3', 199, 5], ['g108na.battlepass2', 399, 9.99]
    ])
    expect(pass.packs[1]).toMatchObject({ item_pack: true, baseItemAmount: null, pass_type: 'battle-pass', discount_price_thb: null })
    expect(pass.packs[0].pass_type).toBe('weekly-card')
    expect(bundle.packs).toHaveLength(1)
    expect(bundle.packs[0]).toMatchObject({ name: 'founder bundle', item_pack: true, price_thb: 699, price_usd: 19.99 })
  })
  it('App Store API down -> top-10 page: Silver by amount, same-name different-price items null (no guessing); empty activitys -> bonus 0', async () => {
    const thPage = iap('1500silver', '\u0E3F999.00') + iap('premuim pass plus', '\u0E3F399.00') + iap('premuim pass plus', '\u0E3F199.00') + iap('founder bundle', '\u0E3F699.00')
    mock({
      [P]: () => Response.json(products), [A]: () => Response.json({ code: '0000', data: { list: [], server_ts: NOW } }),
      [API]: () => new Response('x', { status: 500 }),
      'https://apps.apple.com/th/app/id1593326563': () => new Response(thPage),
      'https://apps.apple.com/us/app/id1593326563': () => new Response(iap('founder bundle', '$19.99'))
    })
    const body = (await (await get('destinyrising')).json()) as any
    const [silver, pass, bundle] = body.categories
    expect(silver.packs[2]).toMatchObject({ price_thb: 999, bonusItemAmount: 0, totalItemAmount: 1500 })
    expect(silver.packs[2].price_thb_source).toContain('silver amount')
    expect(silver.packs[0].price_thb).toBeNull()
    expect(silver.packs[0].price_thb_null_reason).toContain('top 10')
    expect(pass.packs).toHaveLength(1)
    expect(pass.packs[0]).toMatchObject({ name: 'premuim pass plus', price_thb: null, price_usd: null })
    expect(pass.packs[0].price_thb_null_reason).toContain('several prices')
    expect(bundle.packs[0]).toMatchObject({ price_thb: 699, price_usd: 19.99 })
  })
  it('502 when products API down or bad code', async () => {
    mock({ [P]: () => new Response('x', { status: 503 }) })
    expect((await get()).status).toBe(502)
    mock({ [P]: () => Response.json({ code: '0300', msg: 'x', data: null }) })
    expect((await get()).status).toBe(502)
  })
})

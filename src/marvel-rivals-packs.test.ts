import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchMarvelRivalsPacks, mrKind, parseMrActivitys, parseMrProducts, psCache, psPs5Prefix, psProductPrice,
  MarvelRivalsInvalidUpstreamResponseError, MarvelRivalsUpstreamUnavailableError
} from './services/marvel-rivals-packs.service'

const NOW = 1793178039
const FOREVER = 2147483647
const PREFIX = 'UB0335-PPSA21669_00'
const lp = JSON.stringify({ EU: { default: { price: 0.99, currency: 'EUR' } }, JP: { default: { price: 150, currency: 'JPY' } } })
const prod = (goodsid: string, name: string, usd: string, pay: number, free: number, ps5: string | null, extra: Record<string, unknown> = {}) => ({
  goodsid, sub_item: '', goodsinfo: name, currency: 'USD', status: 1, price: usd, pay_yuanbao: pay, free_yuanbao: free, platform: 'pc',
  extra: { unipay: 'true', local_price: lp, ...(ps5 ? { ps5_product_id: ps5 } : {}), epic_offerid: 'e' + goodsid },
  icon: { default: { default: { normal: 'https://img/' + goodsid } } },
  effective_time: 1700000000, expired_time: FOREVER,
  multi_language: { default: { default: { goodsinfo: name, goods_detail: name.includes('Bundle') ? 'Includes a costume for Venom!' : '' } } },
  ...extra
})
const products = {
  code: '0000',
  data: [
    prod('x20.jg100.cn', '100 Lattices', '0.9900', 96, 4, '1000000000000007', { sub_item: 'S7BONUS.jg5', expired_time: NOW - 10 }),
    prod('x20.jg100.cn', '100 Lattices', '0.9900', 96, 4, '1000000000000007'),
    prod('x20.jg100.cn', '100 Lattices', '0.9900', 96, 4, '1000000000000007', { platform: 'ad' }),
    prod('x20.jg2180.cn', '2180 Lattices', '19.9900', 2048, 132, '1000000000000010'),
    prod('x20.jg11680.cn', '11680 Lattices', '99.9900', 10368, 1312, null),
    prod('x20.pb1.cn', 'Pick-Up Bundle', '2.9900', 0, 0, '3000000000000000'),
    prod('x20.future.cn', 'Future Bundle', '9.9900', 0, 0, null, { effective_time: NOW + 100 }),
    prod('x20.jg500.cn', 'TWD row', '150', 480, 20, null, { currency: 'TWD' })
  ]
}
const activitys = { code: '0000', data: { list: [
  { goodsid: 'x20.jg2180.cn', activity_type: 0, marketing_free_amount: 100, alpha2: 'TH', effective_time: NOW - 10, expired_time: NOW + 3600, activityid: 'a1' },
  { goodsid: 'x20.jg100.cn', activity_type: 0, marketing_free_amount: 50, alpha2: 'JP', effective_time: NOW - 10, expired_time: NOW + 3600 }
] } }
const envScript = (cache: Record<string, unknown>) => `<script id="env:1" type="application/json">${JSON.stringify({ cache })}</script>`
const conceptHtml = envScript({ [`Product:${PREFIX}-0320312678245089`]: {}, 'Product:UB1229-CUSA55048_00-0731814509669742': {} })
const psHtml = (id: string, satang: number, desc: string) => envScript({
  [`Product:${PREFIX}-${id}`]: { descriptions: [{ type: 'LONG', value: desc + '<br/>' }] },
  [`GameCTA:ADD_TO_CART:ADD_TO_CART:${PREFIX}-${id}-H001:OUTRIGHT`]: { local: { telemetryMeta: { skuDetail: { skuId: `${PREFIX}-${id}-H001`, skuPriceDetail: [{ originalPriceValue: satang, discountPriceValue: satang, priceCurrencyCode: 'THB' }] } } } }
})
const psPages: Record<string, string> = {
  '1000000000000007': psHtml('1000000000000007', 3700, "Upon purchase, you'll get 100 Lattice"),
  '1000000000000010': psHtml('1000000000000010', 73800, "Upon purchase, you'll get 2180 Lattice"),
  '3000000000000000': psHtml('3000000000000000', 11000, 'Includes a costume for Venom! (PS)')
}

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
function mock(over: Partial<Record<'products' | 'activitys' | 'concept', () => Response>> = {}) {
  globalThis.fetch = (async (input: any) => {
    const u = String(input)
    if (u.includes('/activitys')) return over.activitys ? over.activitys() : Response.json(activitys)
    if (u.includes('/gameclub/products/marvelrivals')) return over.products ? over.products() : Response.json(products)
    if (u.includes('/concept/10010451')) return over.concept ? over.concept() : new Response(conceptHtml)
    const m = u.match(/\/product\/UB0335-PPSA21669_00-(\d{16})$/)
    if (m && psPages[m[1]]) return new Response(psPages[m[1]])
    return new Response('nf', { status: 404 })
  }) as typeof fetch
}

describe('marvel rivals parsers', () => {
  it('classifies, parses products/activitys and PS Store pages', () => {
    expect(mrKind('x20.jg100.cn', '100 Lattices')).toBe('currency')
    expect(mrKind('x20.pb1.cn', 'Pick-Up Bundle')).toBe('bundle')
    expect(mrKind('x20.lbp.cn', 'Luxury Battle Pass')).toBe('pass')
    const r = parseMrProducts(products, NOW)
    expect(r.products.map((p) => p.key)).toEqual(['x20.jg100.cn', 'x20.jg2180.cn', 'x20.jg11680.cn', 'x20.pb1.cn'])
    expect(r.expired[0]).toContain('100 Lattices (S7BONUS.jg5)')
    expect(r.upcoming[0]).toContain('Future Bundle')
    expect(r.products[1]).toMatchObject({ pay: 2048, free: 132, usd: 19.99, ps5_product_id: '1000000000000010', local_price_regions: ['EU', 'JP'] })
    expect(() => parseMrProducts({ code: '0300', msg: 'x' }, NOW)).toThrow(MarvelRivalsInvalidUpstreamResponseError)
    const a = parseMrActivitys(activitys, NOW)!
    expect(a.bonus.get('x20.jg2180.cn')?.amount).toBe(100)
    expect(a.bonus.has('x20.jg100.cn')).toBe(false)
    expect(psPs5Prefix(psCache(conceptHtml))).toBe(PREFIX)
    expect(psProductPrice(psCache(psPages['1000000000000010']), `${PREFIX}-1000000000000010`)).toMatchObject({ thb: 738, thb_discount: 738 })
  })
})

describe('fetchMarvelRivalsPacks', () => {
  it('builds Lattice + bundles with GamesClub USD and PS Store TH THB by ps5_product_id', async () => {
    mock()
    const r: any = await fetchMarvelRivalsPacks({ now: NOW })
    expect(r.game.slug).toBe('marvel-rivals')
    const all = r.categories.flatMap((c: any) => c.packs)
    expect(r.summary.packCount).toBe(4)
    const p2180 = all.find((p: any) => p.product_id === 'x20.jg2180.cn')
    expect(p2180).toMatchObject({ price_thb: 738, price_usd: 19.99, baseItemAmount: 2048, bonusItemAmount: 232, totalItemAmount: 2280, item_pack: false, currency: 'THB' })
    expect(p2180.prices).toEqual({ THB: 738, USD: 19.99 })
    const p100 = all.find((p: any) => p.product_id === 'x20.jg100.cn')
    expect(p100).toMatchObject({ price_thb: 37, price_usd: 0.99, totalItemAmount: 100, description: "Upon purchase, you'll get 100 Lattice" })
    const p11680 = all.find((p: any) => p.product_id === 'x20.jg11680.cn')
    expect(p11680.price_thb).toBeNull()
    expect(p11680.price_thb_null_reason).toContain('no ps5_product_id')
    const pb = all.find((p: any) => p.product_id === 'x20.pb1.cn')
    expect(pb).toMatchObject({ item_pack: true, price_thb: 110, price_usd: 2.99, baseItemAmount: null, description: 'Includes a costume for Venom!' })
    expect(pb.base_null_reason).toBeTruthy()
    expect(r.notes.join(' ')).toContain('Luxury Battle Pass')
  })

  it('keeps USD and gives THB null reasons when the PS Store is down', async () => {
    mock({ concept: () => new Response('down', { status: 503 }), activitys: () => new Response('x', { status: 500 }) })
    const r: any = await fetchMarvelRivalsPacks({ now: NOW })
    const all = r.categories.flatMap((c: any) => c.packs)
    expect(all.every((p: any) => p.price_thb === null && p.price_usd > 0)).toBe(true)
    expect(all[0].price_thb_null_reason).toContain('PS Store TH concept page unavailable (HTTP 503)')
    expect(all.find((p: any) => p.product_id === 'x20.jg2180.cn')).toMatchObject({ bonusItemAmount: 132, gameclub_bonus_null_reason: expect.stringContaining('unavailable') })
  })

  it('maps GamesClub failures to upstream errors', async () => {
    mock({ products: () => new Response('x', { status: 502 }) })
    await expect(fetchMarvelRivalsPacks({ now: NOW })).rejects.toBeInstanceOf(MarvelRivalsUpstreamUnavailableError)
    mock({ products: () => new Response('not json') })
    await expect(fetchMarvelRivalsPacks({ now: NOW })).rejects.toBeInstanceOf(MarvelRivalsInvalidUpstreamResponseError)
    mock({ products: () => Response.json({ code: '0300', msg: 'game not existed', data: null }) })
    await expect(fetchMarvelRivalsPacks({ now: NOW })).rejects.toBeInstanceOf(MarvelRivalsInvalidUpstreamResponseError)
  })
})

import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchRacingMasterPacks, parseRmActivitys, parseRmProducts, rmKind, rmKey,
  RacingMasterInvalidUpstreamResponseError, RacingMasterUpstreamUnavailableError
} from './services/racing-master-packs.service'

const NOW = 1793175827
const FOREVER = 2147483647
const lp = (thb: number) => JSON.stringify({ TH: { default: { currency: 'THB', price: String(thb) } }, SG: { default: { currency: 'SGD', price: '1.38' } } })
const prod = (goodsid: string, name: string, usd: string, thb: number | null, extra: Record<string, unknown> = {}) => {
  const gem = goodsid.match(/gem(\d+)$/)
  const asia = /^g112seaasia\./.test(goodsid)
  return {
    goodsid, sub_item: '', currency: 'USD', status: 1, price: usd, pay_yuanbao: gem ? Number(gem[1]) : 0, free_yuanbao: 0,
    effective_time: 1700000000, expired_time: FOREVER,
    extra: thb === null ? {} : { local_price: lp(thb) },
    product_activity_type: { dedicated_server_tag: asia ? 'asia' : '', block_dedicated_server_tag: '', first_charge: false },
    multi_language: {
      default: { default: { goodsinfo: name, goods_detail: `${name}`, image_info: { normal: 'https://img/x.png' }, product_free_amount_activity_list: null } },
      ...(asia ? {} : { TH: { default: { goodsinfo: '\u0e2d\u0e31\u0e0d\u0e21\u0e13\u0e35 ' + name, goods_detail: '\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14' } } })
    },
    ...extra
  }
}
const products = {
  code: '0000',
  data: [
    prod('g112sea.online.gem70', '70 Gems', '0.99', 30, { platform: 'ad' }),
    prod('g112sea.online.gem70', '70 Gems', '0.99', 30, { platform: 'ios' }),
    prod('g112sea.online.gem3400', '3400 Gems', '46.99', 1590),
    prod('g112sea.online.monthlypack', 'Monthly Card', '2.29', 75, { pay_yuanbao: 350 }),
    prod('g112sea.online.bp9', 'Legend Car Pack', '14.49', 479, { expired_time: 1790000000 }),
    prod('g112sea.online.bp9', 'Legend Car Pack (Alfa Romeo 33 Stradale)', '14.49', 479, { sub_item: 'bpcar1255_caronly' }),
    prod('g112sea.online.bp9', 'Legend Car Pack (McLaren Artura)', '14.49', 479, { sub_item: 'bpcar1340_caronly' }),
    prod('g112sea.online.bp1', 'Deluxe MP', '4.99', 159, { platform: 'pc', expired_time: 1790000000 }),
    prod('g112sea.online.bp1', 'Deluxe MP', '4.99', 159),
    prod('g112seaasia.online.gem70', '70 Gems', '0.99', null),
    prod('g112sea.future', 'Future Pack', '9.99', 335, { effective_time: NOW + 1000 }),
    prod('g112sea.online.gem140', 'TWD row', '60', 60, { currency: 'TWD' })
  ]
}
const actEmpty = { code: '0000', data: { list: [], server_ts: NOW } }
const actLive = {
  code: '0000',
  data: {
    server_ts: NOW,
    list: [
      { goodsid: 'g112sea.online.gem3400', activity_type: '0', marketing_free_amount: 170, alpha2: 'all', activityid: 'a_add_1', effective_time: NOW - 10, expired_time: NOW + 86400 },
      { goodsid: 'g112sea.online.gem70', activity_type: '0', marketing_free_amount: 99, alpha2: 'US' },
      { goodsid: 'g112sea.online.gem70', activity_type: '0', marketing_free_amount: 77, alpha2: 'all', expired_time: NOW - 5 },
      { goodsid: 'g112sea.online.bp9_bpcar1340_caronly', activity_type: '12', marketing_free_amount: 50, alpha2: 'all', activityid: 'ev_add', expired_time: NOW + 3600 },
      { goodsid: 'g112sea.online.monthlypack', activity_type: '27', after_discount_price_map: { THB: '59', USD: '1.79' }, alpha2: 'all', expired_time: NOW + 7200 },
      { goodsid: 'g112sea.online.gem70', activity_type: '104', marketing_free_amount: 0, alpha2: 'all' }
    ]
  }
}
const item = (id: string, name: string, price: number, cur: string, offerName: string, desc?: string) => ({
  id, attributes: { name, offerName, isFamilyShareable: false, ...(desc ? { description: { standard: desc } } : {}), offers: [{ price, priceFormatted: String(price), currencyCode: cur }] }
})
const appleTh = [
  item('1', '70 Gems', 30, 'THB', 'g112sea.online.gem70', '70 Gems desc'),
  item('2', '70 Gems', 29, 'THB', 'g112seaasia.online.gem70'),
  item('3', 'Fortune Pack', 159, 'THB', 'g112sea.fortune.700'),
  item('4', '3400 Gems', 1590, 'THB', 'g112sea.online.gem3400')
]
const appleThTh = [item('1', '70 \u0e2d\u0e31\u0e0d\u0e21\u0e13\u0e35', 30, 'THB', 'g112sea.online.gem70'), item('3', '\u0e41\u0e1e\u0e47\u0e01', 159, 'THB', 'g112sea.fortune.700')]
const appleKh = [item('1', '70 Gems', 0.99, 'USD', 'g112sea.online.gem70'), item('3', 'Fortune Pack', 4.99, 'USD', 'g112sea.fortune.700')]

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
function mock(opts: { act?: any; prodStatus?: number; prodBody?: any } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: any) => {
    const url = String(input); calls.push(url)
    const j = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    if (url.includes('/activitys')) return j(opts.act ?? actEmpty)
    if (url.includes('/gameclub/products/racingmastersea')) return j(opts.prodBody ?? products, opts.prodStatus ?? 200)
    if (url.includes('/us/apps/')) return new Response('nf', { status: 404 })
    if (url.includes('/th/apps/')) return j({ data: url.includes('l=th') ? appleThTh : appleTh })
    if (url.includes('/kh/apps/')) return j({ data: appleKh })
    return new Response('nf', { status: 404 })
  }) as any
  return calls
}
const allPacks = (r: any) => r.categories.flatMap((c: any) => c.packs)

describe('racing master parsers', () => {
  it('classifies gems, passes and bundles', () => {
    expect(rmKind('g112sea.online.gem70', '70 Gems')).toBe('currency')
    expect(rmKind('g112seaasia.online.gem6600', '6600 Gems')).toBe('currency')
    expect(rmKind('g112sea.online.bp1', 'Deluxe MP')).toBe('pass')
    expect(rmKind('g112sea.online.monthlypack', 'Monthly Card')).toBe('pass')
    expect(rmKind('g112sea.online.bp9', 'Legend Car Pack (McLaren Artura)')).toBe('bundle')
    expect(rmKind('g112sea.online.bp7', 'MP Combo Pack (McLaren Artura)')).toBe('pass')
    expect(rmKind('g112sea.icebreakgift', 'Ice Breaker Gift')).toBe('bundle')
    expect(rmKey('g112sea.online.bp9', 'bpcar1255_caronly')).toBe('g112sea.online.bp9_bpcar1255_caronly')
  })
  it('parses products: USD only, dedupe by goodsid+sub_item, window, TH names, server tag', () => {
    const r = parseRmProducts(products, NOW)
    expect(r.products.map((p) => p.key)).toEqual([
      'g112sea.online.gem70', 'g112sea.online.gem3400', 'g112sea.online.monthlypack',
      'g112sea.online.bp9_bpcar1255_caronly', 'g112sea.online.bp9_bpcar1340_caronly', 'g112sea.online.bp1', 'g112seaasia.online.gem70'
    ])
    expect(r.expired).toEqual(['Legend Car Pack'])
    expect(r.upcoming).toEqual(['Future Pack'])
    const g = r.products[0]
    expect(g.thb).toBe(30); expect(g.usd).toBe(0.99); expect(g.base).toBe(70); expect(g.server_tag).toBe('default')
    expect(g.name_th).toBe('\u0e2d\u0e31\u0e0d\u0e21\u0e13\u0e35 70 Gems')
    const a = r.products[6]
    expect(a.server_tag).toBe('asia'); expect(a.thb).toBeNull(); expect(a.name_th).toBeNull()
    expect(() => parseRmProducts({ code: '9999' }, NOW)).toThrow(RacingMasterInvalidUpstreamResponseError)
  })
  it('parses activitys: types 0/12 bonus with end date, 27 discount, coupons counted, region/window filtered', () => {
    const a = parseRmActivitys(actLive, NOW)!
    expect(a.bonus.get('g112sea.online.gem3400')!.amount).toBe(170)
    expect(a.bonus.get('g112sea.online.gem3400')!.until).toBe(new Date((NOW + 86400) * 1000).toISOString())
    expect(a.bonus.has('g112sea.online.gem70')).toBe(false)
    expect(a.bonus.get('g112sea.online.bp9_bpcar1340_caronly')!.amount).toBe(50)
    expect(a.discounts.get('g112sea.online.monthlypack')).toEqual({ THB: 59, USD: 1.79, until: new Date((NOW + 7200) * 1000).toISOString() })
    expect(a.coupons).toBe(1)
    expect(parseRmActivitys({ code: '1' }, NOW)).toBeNull()
  })
})

describe('fetchRacingMasterPacks', () => {
  it('builds official + Apple-only packs with sources and null reasons', async () => {
    const calls = mock({ act: actLive })
    const r: any = await fetchRacingMasterPacks()
    expect(r.game.slug).toBe('racing-master')
    expect(calls.some((u) => u.includes('alpha2=TH'))).toBe(true)
    const p = allPacks(r)
    const g70 = p.find((x: any) => x.product_id === 'g112sea.online.gem70')
    expect(g70.prices).toEqual({ THB: 30, USD: 0.99 })
    expect(g70.price_thb_source).toContain('local_price TH')
    expect(g70.price_usd_source).toBe('netease-gameclub-official')
    expect(g70.baseItemAmount).toBe(70); expect(g70.bonusItemAmount).toBe(0); expect(g70.totalItemAmount).toBe(70)
    expect(g70.item_pack).toBe(false)
    expect(g70.description_en).toBe('70 Gems desc')
    const g3400 = p.find((x: any) => x.product_id === 'g112sea.online.gem3400')
    expect(g3400.bonusItemAmount).toBe(170); expect(g3400.totalItemAmount).toBe(3570)
    expect(g3400.bonus_breakdown.gameclub_bonus_until).toBe(new Date((NOW + 86400) * 1000).toISOString())
    const mc = p.find((x: any) => x.product_id === 'g112sea.online.monthlypack')
    expect(mc.item_pack).toBe(true); expect(mc.pass_type).toBe('monthly-pass')
    expect(mc.baseItemAmount).toBeNull(); expect(mc.base_null_reason).toBeTruthy()
    expect(mc.discount_price_thb).toBe(59); expect(mc.discount_price_usd).toBe(1.79); expect(mc.discount_until).toBeTruthy()
    const car = p.filter((x: any) => x.product_id === 'g112sea.online.bp9')
    expect(car.length).toBe(2)
    const mcl = car.find((x: any) => x.sub_item === 'bpcar1340_caronly')
    expect(mcl.item_pack).toBe(true); expect(mcl.bonusItemAmount).toBe(50)
    expect(car.find((x: any) => x.sub_item === 'bpcar1255_caronly').bonus_null_reason).toBeTruthy()
    const asia = p.find((x: any) => x.product_id === 'g112seaasia.online.gem70')
    expect(asia.server_tag).toBe('asia')
    expect(asia.prices).toEqual({ THB: 29, USD: 0.99 })
    expect(asia.price_thb_source).toContain('apple-app-store-th')
    expect(asia.name_th_null_reason).toBeTruthy()
    const only = p.find((x: any) => x.product_id === 'g112sea.fortune.700')
    expect(only.store).toBe('apple-app-store')
    expect(only.prices).toEqual({ THB: 159, USD: 4.99 })
    expect(only.price_usd_source).toContain('apple-app-store-kh')
    expect(only.name_th).toBe('\u0e41\u0e1e\u0e47\u0e01')
    expect(only.base_null_reason).toBeTruthy()
    expect(only.total_null_reason).toBeTruthy()
    expect(r.categories.map((c: any) => c.id)).toEqual([1, 2, 3, 4, 7])
    expect(r.notes.join(' ')).toContain('App Store US')
  })
  it('keeps official packs when activitys fails, with reasons', async () => {
    mock({ act: { code: '5000', msg: 'busy' } })
    const r: any = await fetchRacingMasterPacks()
    const g = allPacks(r).find((x: any) => x.product_id === 'g112sea.online.gem70')
    expect(g.bonusItemAmount).toBeNull(); expect(g.bonus_null_reason).toContain('activitys')
    expect(g.prices).toEqual({ THB: 30, USD: 0.99 })
  })
  it('maps upstream errors', async () => {
    mock({ prodStatus: 503 })
    await expect(fetchRacingMasterPacks()).rejects.toBeInstanceOf(RacingMasterUpstreamUnavailableError)
    mock({ prodBody: { code: '0000', data: [] } })
    await expect(fetchRacingMasterPacks()).rejects.toBeInstanceOf(RacingMasterInvalidUpstreamResponseError)
  })
})

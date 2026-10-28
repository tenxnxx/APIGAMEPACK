import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchWhereWindsMeetPacks, matchApple, parseWwmActivitys, parseWwmProducts, wwmKind,
  WhereWindsMeetInvalidUpstreamResponseError, WhereWindsMeetUpstreamUnavailableError
} from './services/where-winds-meet-packs.service'

const NOW = 1793174697
const lp = (thb: number) => JSON.stringify({ TH: { default: { currency: 'THB', price: String(thb) } } })
const prod = (goodsid: string, name: string, usd: string, thb: number | null, extra: Record<string, unknown> = {}) => ({
  goodsid, currency: 'USD', status: 1, price: usd, pay_yuanbao: /cmz/.test(goodsid) ? Number(goodsid.match(/(\d+)cmz/)![1]) : 0, free_yuanbao: 0,
  extra: thb === null ? {} : { local_price: lp(thb) },
  multi_language: { default: { default: { goodsinfo: name, goods_detail: `<p>${name} detail</p>`, image_info: { normal: 'https://img/x.png' }, product_free_amount_activity_list: [] } } },
  ...extra
})
const products = {
  code: '0000',
  data: [
    prod('yysls.60cmz.oversea', '60 Echo Beads', '0.99', 35, { platform: 'ad' }),
    prod('yysls.60cmz.oversea', '60 Echo Beads', '0.99', 35, { platform: 'ios' }),
    prod('yysls.6000cmz.oversea', '6000 Echo Beads', '99.99', null),
    prod('yysls.monthlycard.oversea', 'Monthly Pass', '4.99', 169, { purchase_limit: { perorder: 1 } }),
    prod('yysls.DLC01.gamesclub', 'Cicada Requiem Pack', '33.99', 1135, { time_limit: 1, effective_time: 1790438400, expired_time: 1791648000 }),
    prod('yysls.DLC02.gamesclub', 'Future Pack', '9.99', 335, { effective_time: NOW + 1000, expired_time: NOW + 9000 })
  ]
}
const actEmpty = { code: '0000', data: { list: [], server_ts: NOW } }
const actLive = {
  code: '0000',
  data: {
    server_ts: NOW,
    list: [
      { goodsid: 'yysls.60cmz.oversea', activity_type: '0', marketing_free_amount: 6, alpha2: 'TH', effective_time: NOW - 10, expired_time: NOW + 86400 },
      { goodsid: 'yysls.60cmz.oversea', activity_type: '0', marketing_free_amount: 99, alpha2: 'US' },
      { goodsid: 'yysls.monthlycard.oversea', activity_type: '27', after_discount_price_map: { THB: '99', USD: '2.99' }, alpha2: 'all', expired_time: NOW + 3600 }
    ]
  }
}
const item = (id: string, name: string, price: number, cur: string, offerName: string, desc?: string) => ({
  id, attributes: { name, offerName, isFamilyShareable: false, ...(desc ? { description: { standard: desc } } : {}), offers: [{ price, priceFormatted: String(price), currencyCode: cur }] }
})
const thEn = [
  item('6754626619', '60 Echo Beads', 35, 'THB', 'yysls.60cmz.oversea', '60 Echo Beads EN'),
  item('6754596268', '6000 Echo Beads', 3350, 'THB', 'yysls.6000cmz.oversea'),
  item('6754629474', 'Monthly Fund', 169, 'THB', 'yysls.monthlycard.oversea', 'Monthly EN'),
  item('6821225069', "Journey's Boon", 35, 'THB', 'yysls.newbieweeklycard.oversea', 'Boon EN'),
  item('6000000001', 'Same Name Trap', 9, 'THB', 'yysls.thonly.oversea')
]
const thTh = thEn.map((x) => ({ ...x, attributes: { ...x.attributes, name: x.attributes.name + ' TH', description: { standard: x.attributes.name + ' TH desc' } } }))
const us = [
  item('6754626619', '60 Echo Beads', 0.99, 'USD', 'yysls.60cmz.oversea'),
  item('6821225069', "Journey's Boon", 0.99, 'USD', 'yysls.newbieweeklycard.oversea'),
  item('6754582348', 'BattlePass Upgrade', 10, 'USD', 'yysls.battlepassextra.oversea'),
  item('6999999999', 'Same Name Trap', 0.29, 'USD', 'yysls.other.oversea')
]
const kh = [item('6000000001', 'Same Name Trap', 0.29, 'USD', 'yysls.thonly.oversea')]

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
function mock(opts: { act?: any; actStatus?: number; prodStatus?: number; appleDown?: boolean } = {}) {
  globalThis.fetch = (async (input: any) => {
    const u = String(input)
    const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    if (u.includes('/activitys')) return j(opts.act ?? actEmpty, opts.actStatus ?? 200)
    if (u.includes('/gameclub/products/wherewindsmeet')) return j(products, opts.prodStatus ?? 200)
    if (u.includes('apps.apple.com/api')) {
      if (opts.appleDown) return j({}, 503)
      if (u.includes('offset=') && !u.includes('offset=0')) return j({ data: [] })
      if (u.includes('/catalog/th/')) return j({ data: u.includes('l=th') ? thTh : thEn })
      if (u.includes('/catalog/us/')) return j({ data: us })
      if (u.includes('/catalog/kh/')) return j({ data: kh })
    }
    return j({}, 404)
  }) as typeof fetch
}
const allPacks = (b: any) => b.categories.flatMap((c: any) => c.packs)
const byPid = (b: any, pid: string) => allPacks(b).find((p: any) => p.product_id === pid)

describe('Where Winds Meet parsers', () => {
  it('classifies goodsids', () => {
    expect(wwmKind('yysls.300cmz.oversea')).toBe('currency')
    expect(wwmKind('yysls.battlepasspro.oversea')).toBe('pass')
    expect(wwmKind('yysls.monthlycard.oversea')).toBe('pass')
    expect(wwmKind('yysls.DLC01.gamesclub')).toBe('bundle')
  })
  it('dedupes platforms, drops expired / upcoming, reads official TH local_price', () => {
    const r = parseWwmProducts(products, NOW)
    expect(r.products.map((p) => p.goodsid)).toEqual(['yysls.60cmz.oversea', 'yysls.6000cmz.oversea', 'yysls.monthlycard.oversea'])
    expect(r.products[0]).toMatchObject({ thb: 35, usd: 0.99, base: 60 })
    expect(r.products[1].thb).toBeNull()
    expect(r.expired).toEqual(['Cicada Requiem Pack'])
    expect(r.upcoming).toEqual(['Future Pack'])
  })
  it('throws on bad products', () => {
    expect(() => parseWwmProducts({ code: '0300' }, NOW)).toThrow(WhereWindsMeetInvalidUpstreamResponseError)
  })
  it('activitys: TH/all only, with end dates', () => {
    const a = parseWwmActivitys(actLive, NOW)!
    expect(a.bonus.get('yysls.60cmz.oversea')).toEqual({ amount: 6, until: new Date((NOW + 86400) * 1000).toISOString() })
    expect(a.discounts.get('yysls.monthlycard.oversea')).toEqual({ THB: 99, USD: 2.99, until: new Date((NOW + 3600) * 1000).toISOString() })
    expect(parseWwmActivitys({ code: '0300' }, NOW)).toBeNull()
  })
  it('matchApple uses offerName or item id, never name', () => {
    const rows = [{ id: '1', name: 'X', price: 1, priceFormatted: '1', currency: 'USD', offerName: 'a' }]
    expect(matchApple(rows, { offerName: 'a' })?.row.id).toBe('1')
    expect(matchApple(rows, { id: '1' })?.by).toBe('item 1')
    expect(matchApple(rows, { offerName: 'zzz' })).toBeNull()
  })
})

describe('fetchWhereWindsMeetPacks', () => {
  it('official THB/USD, base+bonus(total), Apple descriptions + Thai names', async () => {
    mock()
    const b: any = await fetchWhereWindsMeetPacks()
    const p = byPid(b, 'yysls.60cmz.oversea')
    expect(p).toMatchObject({
      price_thb: 35, price_usd: 0.99, baseItemAmount: 60, bonusItemAmount: 0, totalItemAmount: 60, item_pack: false, bonus_available: true,
      name_th: '60 Echo Beads TH', description_th: '60 Echo Beads TH desc', description_en: '60 Echo Beads EN', apple_item_id: '6754626619'
    })
    expect(p.description).toBe('60 Echo Beads TH desc / 60 Echo Beads EN / 60 Echo Beads detail')
    expect(p.price_thb_source).toContain('official')
    expect(allPacks(b).some((x: any) => x.name === 'Cicada Requiem Pack')).toBe(false)
    expect(b.categories.find((c: any) => c.id === 2)).toBeTruthy()
  })
  it('THB falls back to App Store TH by offerName when the official store has none', async () => {
    mock()
    const p = byPid(await fetchWhereWindsMeetPacks(), 'yysls.6000cmz.oversea')
    expect(p.price_thb).toBe(3350)
    expect(p.price_thb_source).toContain('offerName=yysls.6000cmz.oversea')
    expect(p.price_usd).toBe(99.99)
    expect(p.description_en).toBeNull()
    expect(typeof p.description_en_null_reason).toBe('string')
  })
  it('passes are item packs; live bonus + discount with end dates', async () => {
    mock({ act: actLive })
    const b: any = await fetchWhereWindsMeetPacks()
    expect(byPid(b, 'yysls.60cmz.oversea')).toMatchObject({ bonusItemAmount: 6, totalItemAmount: 66 })
    expect(byPid(b, 'yysls.monthlycard.oversea')).toMatchObject({
      item_pack: true, baseItemAmount: null, totalItemAmount: null, pass_type: 'monthly-pass', discount_price_thb: 99, discount_price_usd: 2.99,
      name_th: 'Monthly Fund TH'
    })
    expect(byPid(b, 'yysls.monthlycard.oversea').discount_until).toBeTruthy()
  })
  it('App Store-only items: THB from TH, USD from US else KH, by offerName (same name does not match)', async () => {
    mock()
    const b: any = await fetchWhereWindsMeetPacks()
    expect(byPid(b, 'yysls.newbieweeklycard.oversea')).toMatchObject({ price_thb: 35, price_usd: 0.99, item_pack: true, store: 'apple-app-store', description_en: 'Boon EN' })
    const trap = byPid(b, 'yysls.thonly.oversea')
    expect(trap).toMatchObject({ price_thb: 9, price_usd: 0.29 })
    expect(trap.price_usd_source).toContain('kh')
    const usOnly = byPid(b, 'yysls.battlepassextra.oversea')
    expect(usOnly).toMatchObject({ price_thb: null, price_usd: 10 })
    expect(typeof usOnly.price_thb_null_reason).toBe('string')
    expect(byPid(b, 'yysls.other.oversea').price_thb).toBeNull()
  })
  it('activitys down -> bonus null with reason; Apple down -> official packs still served', async () => {
    mock({ actStatus: 500, appleDown: true })
    const b: any = await fetchWhereWindsMeetPacks()
    const p = byPid(b, 'yysls.60cmz.oversea')
    expect(p).toMatchObject({ bonusItemAmount: null, price_thb: 35, price_usd: 0.99, name_th: null, description_th: null })
    expect(typeof p.bonus_null_reason).toBe('string')
    expect(typeof p.description_th_null_reason).toBe('string')
    const p2 = byPid(b, 'yysls.6000cmz.oversea')
    expect(p2.price_thb).toBeNull()
    expect(p2.price_thb_null_reason).toContain('unavailable')
  })
  it('products down -> upstream error', async () => {
    mock({ prodStatus: 503 })
    await expect(fetchWhereWindsMeetPacks()).rejects.toThrow(WhereWindsMeetUpstreamUnavailableError)
  })
})

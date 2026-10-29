import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchIdentityVPacks, idvTier, parseIdvActivitys, parseIdvProducts,
  IdentityVInvalidUpstreamResponseError, IdentityVUpstreamUnavailableError
} from './services/identity-v-packs.service'

const NOW = 1793270410
const FOREVER = 2147483647
const lp = (thb: number) => JSON.stringify({ TH: { 'NetEase Pay': { price: 0.99, currency: 'USD' }, default: { price: thb, currency: 'THB', symbol: '\u0e3f' } } })
const echo = (goodsid: string, currency: string, price: string, pay: number, free: number, extra: Record<string, unknown> = {}, more: Record<string, unknown> = {}) => ({
  goodsid, sub_item: '', currency, price, status: 1, pay_yuanbao: pay, free_yuanbao: free, platform: 'ad', goodsinfo: `${pay} Echoes`,
  extra: { unipay: 'true', ...extra }, product_activity_type: { fixed_point: 18 },
  multi_language: { default: { default: { goodsinfo: `${pay} Echoes` } } }, ...more
})
const TH = { country: 'TH', is_pass_currency: 'TRUE', region: 'Thailand' }
const pack = (goodsid: string, usd: string, thb: number | null, name: string, more: Record<string, unknown> = {}) => ({
  goodsid, sub_item: '', currency: 'USD', price: usd, status: 1, pay_yuanbao: 0, free_yuanbao: 0, platform: 'ios', goodsinfo: '\u6bcf\u6708\u7075\u611f\u793c\u5305',
  extra: { unipay: 'true', ...(thb === null ? {} : { local_price: lp(thb) }) }, product_activity_type: { fixed_point: 90 },
  multi_language: {
    default: { default: { goodsinfo: name, goods_detail: 'Includes: Clues x 88' } },
    TH: { default: { goodsinfo: '\u0e41\u0e1e\u0e04\u0e40\u0e01\u0e08', goods_detail: '\u0e21\u0e35: \u0e40\u0e1a\u0e32\u0e30\u0e41\u0e2a x88', image_info: { normal: 'https://img/th.png' } } }
  },
  ...more
})
const products = {
  code: '0000',
  data: [
    echo('h55na.mol.th.60echoes', 'THB', '35.0000', 60, 3, TH),
    echo('h55na.mol.th.60echoes', 'THB', '35.0000', 60, 3, TH, { platform: 'ios' }),
    echo('h55na.mol.th.180echoes', 'THB', '99.0000', 185, 9, TH),
    echo('h55na.mol.th.6480echoes', 'THB', '3500.0000', 6590, 324, TH),
    echo('h55na.mol.th.prepaid.60echoes', 'THB', '20.0000', 60, 0, { ...TH, mol_channel_id: '605', is_pass_currency: 'FALSE' }),
    echo('h55na.mol.my.60echoes', 'MYR', '3.9000', 60, 3, { country: 'MY', is_pass_currency: 'TRUE' }),
    echo('h55na.codashoop.60echoes', 'USD', '0.9900', 60, 0),
    echo('h55na.codashoop.180echoes', 'USD', '2.9900', 185, 9),
    pack('h55na.webshop.pack.1', '0.9900', 35, 'Inspirations Package'),
    pack('h55na.webshop.pack.9', '1.9900', null, 'USD only pack'),
    pack('h55na.680echoes.limit.2026anni', '9.9900', 349, '8th Anniversary Special Package', { effective_time: 1782957600, expired_time: 1785513600 }),
    pack('h55na.future.pack', '4.9900', 175, 'Future Pack', { effective_time: NOW + 100, expired_time: FOREVER })
  ]
}
const actLive = {
  code: '0000',
  data: {
    server_ts: NOW,
    list: [
      { goodsid: 'h55na.mol.th.60echoes', activity_type: '0', marketing_free_amount: 3, alpha2: 'all', activityid: 'a0', effective_time: 31536001, expired_time: FOREVER },
      { goodsid: 'h55na.mol.th.180echoes', activity_type: '0', marketing_free_amount: 9, alpha2: 'all', activityid: 'a0', effective_time: 31536001, expired_time: FOREVER },
      { goodsid: 'h55na.mol.th.180echoes', activity_type: '0', marketing_free_amount: 500, alpha2: 'US' },
      { goodsid: 'h55na.mol.th.6480echoes', activity_type: '0', marketing_free_amount: 335, alpha2: 'all', expired_time: NOW - 1 },
      { goodsid: 'h55na.codashoop.60echoes', activity_type: '0', marketing_free_amount: 6, alpha2: 'all' },
      { goodsid: 'h55na.webshop.pack.1', activity_type: '10', marketing_free_amount: 0, alpha2: 'all' },
      { goodsid: 'all', activity_type: '204', marketing_free_amount: 0, alpha2: 'all' }
    ]
  }
}
const item = (id: string, name: string, price: number, cur: string, offerName: string, desc?: string) => ({
  id, attributes: { name, offerName, isFamilyShareable: false, ...(desc ? { description: { standard: desc } } : {}), offers: [{ price, priceFormatted: String(price), currencyCode: cur }] }
})
const appleTh = [
  item('1376490509', '60Echoes', 35, 'THB', 'h55na.60echoes', 'Cost $1.19 to buy 60Echoes'),
  item('6445303226', '1308 Echoes', 729, 'THB', 'h55na.1280echoes', 'Buy 1308 Echoes'),
  item('6784121121', '8th Anniversary Special Package', 349, 'THB', 'h55na.680echoes.limit.2026anni', 'Contains 956 Echoes and 5 [S43 Essence 1]')
]
const appleThTh = [
  item('1376490509', '60Echoes', 35, 'THB', 'h55na.60echoes'),
  item('6445303226', '1308 \u0e40\u0e2a\u0e35\u0e22\u0e07\u0e2a\u0e30\u0e17\u0e49\u0e2d\u0e19', 729, 'THB', 'h55na.1280echoes', '\u0e0b\u0e37\u0e49\u0e2d'),
  item('6784121121', '8th Anniversary Special Package', 349, 'THB', 'h55na.680echoes.limit.2026anni')
]
const appleUs = [item('1376490509', '60Echoes', 0.99, 'USD', 'h55na.60echoes'), item('6445303226', '1308 Echoes', 19.99, 'USD', 'h55na.1280echoes')]
const appleLa = [item('6784121121', '8th Anniversary Special Package', 9.99, 'USD', 'h55na.680echoes.limit.2026anni')]

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
function mock(opts: { act?: any; prodStatus?: number; prodBody?: any } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: any) => {
    const url = String(input); calls.push(url)
    const j = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    const page0 = !/offset=[1-9]/.test(url)
    if (url.includes('/activitys')) return j(opts.act ?? actLive)
    if (url.includes('/gameclub/products/identityv')) return j(opts.prodBody ?? products, opts.prodStatus ?? 200)
    if (url.includes('/th/apps/')) return j({ data: page0 ? (url.includes('l=th') ? appleThTh : appleTh) : [] })
    if (url.includes('/us/apps/')) return j({ data: page0 ? appleUs : [] })
    if (url.includes('/la/apps/')) return j({ data: page0 ? appleLa : [] })
    return new Response('nf', { status: 404 })
  }) as any
  return calls
}
const allPacks = (r: any) => r.categories.flatMap((c: any) => c.packs)

describe('identity v parsers', () => {
  it('reads Echoes tiers from goodsids', () => {
    expect(idvTier('h55na.mol.th.180echoes')).toBe(180)
    expect(idvTier('h55na.codashoop.6480echoes')).toBe(6480)
    expect(idvTier('h55na.60echoes')).toBe(60)
    expect(idvTier('h55na.mol.th.prepaid.60echoes')).toBeNull()
    expect(idvTier('h55na.680echoes.limit.2026anni')).toBeNull()
    expect(idvTier('h55na.webshop.pack.1')).toBeNull()
  })
  it('parses products: TH THB Echoes, USD tiers, packs, prepaid/expired/upcoming excluded', () => {
    const r = parseIdvProducts(products, NOW)
    expect(r.thEchoes.map((e) => e.goodsid)).toEqual(['h55na.mol.th.60echoes', 'h55na.mol.th.180echoes', 'h55na.mol.th.6480echoes'])
    expect(r.thEchoes[1]).toMatchObject({ tier: 180, price: 99, pay: 185, free: 9, points: 18 })
    expect(r.usdEchoes.get(180)!.price).toBe(2.99)
    expect(r.prepaidExcluded).toBe(1)
    expect(r.packs.map((p) => p.goodsid)).toEqual(['h55na.webshop.pack.1', 'h55na.webshop.pack.9'])
    expect(r.packs[0].thb).toBe(35); expect(r.packs[0].name_th).toBe('\u0e41\u0e1e\u0e04\u0e40\u0e01\u0e08')
    expect(r.expired.join()).toContain('h55na.680echoes.limit.2026anni')
    expect(r.upcoming.join()).toContain('h55na.future.pack')
    expect(() => parseIdvProducts({ code: '9999' }, NOW)).toThrow(IdentityVInvalidUpstreamResponseError)
  })
  it('parses activitys: type 0 bonus, region and window filtered, coupons counted', () => {
    const a = parseIdvActivitys(actLive, NOW)!
    expect(a.bonus.get('h55na.mol.th.180echoes')!.amount).toBe(9)
    expect(a.bonus.has('h55na.mol.th.6480echoes')).toBe(false)
    expect(a.coupons).toBe(1)
    expect(parseIdvActivitys({ code: '1' }, NOW)).toBeNull()
  })
})

describe('fetchIdentityVPacks', () => {
  it('builds official TH Echoes/packs + App Store-only items with sources and null reasons', async () => {
    const calls = mock()
    const r: any = await fetchIdentityVPacks()
    expect(r.game.slug).toBe('identity-v'); expect(r.game.itemName).toBe('Echoes')
    expect(calls.some((u) => u.includes('alpha2=TH'))).toBe(true)
    expect(calls.every((u) => !/codashop\.com|seagm|unipin/i.test(u))).toBe(true)
    const p = allPacks(r)
    const e185 = p.find((x: any) => x.product_id === 'h55na.mol.th.180echoes')
    expect(e185.prices).toEqual({ THB: 99, USD: 2.99 })
    expect(e185.baseItemAmount).toBe(185); expect(e185.bonusItemAmount).toBe(18); expect(e185.totalItemAmount).toBe(203)
    expect(e185.item_pack).toBe(false)
    expect(e185.price_usd_source).toContain('h55na.codashoop.180echoes')
    const e60 = p.find((x: any) => x.product_id === 'h55na.mol.th.60echoes')
    expect(e60.bonusItemAmount).toBe(6); expect(e60.apple_item_id).toBe('1376490509')
    expect(e60.description_en).toContain('60Echoes')
    expect(e60.name_th).toBeNull(); expect(e60.name_th_null_reason).toContain('not in Thai')
    expect(e60.usd_store_bonus).toBe(6)
    const e6590 = p.find((x: any) => x.product_id === 'h55na.mol.th.6480echoes')
    expect(e6590.price_usd).toBeNull(); expect(e6590.price_usd_null_reason).toBeTruthy()
    expect(e6590.bonusItemAmount).toBe(324)
    const mp = p.find((x: any) => x.product_id === 'h55na.webshop.pack.1')
    expect(mp.prices).toEqual({ THB: 35, USD: 0.99 }); expect(mp.item_pack).toBe(true); expect(mp.pack_type).toBe('monthly-pack')
    expect(mp.description_th).toContain('x88'); expect(mp.base_null_reason).toBeTruthy(); expect(mp.total_null_reason).toBeTruthy()
    expect(p.some((x: any) => x.product_id === 'h55na.webshop.pack.9')).toBe(false)
    expect(p.some((x: any) => String(x.product_id).includes('prepaid'))).toBe(false)
    const a1308 = p.find((x: any) => x.product_id === 'h55na.1280echoes')
    expect(a1308.store).toBe('apple-app-store'); expect(a1308.prices).toEqual({ THB: 729, USD: 19.99 })
    expect(a1308.baseItemAmount).toBe(1308); expect(a1308.name_th).toContain('\u0e40\u0e2a\u0e35\u0e22\u0e07')
    const anni = p.find((x: any) => x.product_id === 'h55na.680echoes.limit.2026anni')
    expect(anni.item_pack).toBe(true); expect(anni.prices).toEqual({ THB: 349, USD: 9.99 })
    expect(anni.price_usd_source).toContain('apple-app-store-la')
    expect(anni.availability_note).toContain('ended')
    expect(anni.description_en).toContain('Essence')
    expect(r.categories.map((c: any) => c.id)).toEqual([1, 2, 3, 4])
    expect(r.summary.packCount).toBe(p.length)
    for (const x of p) for (const k of ['THB', 'USD']) if (x.prices[k] === null) expect(x[`price_${k.toLowerCase()}_null_reason`]).toBeTruthy()
    expect(r.notes.join(' ')).toContain('no battle/season pass')
  })
  it('keeps official packs when activitys fails, with reasons', async () => {
    mock({ act: { code: '5000', msg: 'busy' } })
    const r: any = await fetchIdentityVPacks()
    const e = allPacks(r).find((x: any) => x.product_id === 'h55na.mol.th.180echoes')
    expect(e.bonusItemAmount).toBeNull(); expect(e.totalItemAmount).toBeNull(); expect(e.bonus_null_reason).toContain('activitys')
    expect(e.prices).toEqual({ THB: 99, USD: 2.99 })
  })
  it('maps upstream errors', async () => {
    mock({ prodStatus: 503 })
    await expect(fetchIdentityVPacks()).rejects.toBeInstanceOf(IdentityVUpstreamUnavailableError)
    mock({ prodBody: { code: '0000', data: [] } })
    await expect(fetchIdentityVPacks()).rejects.toBeInstanceOf(IdentityVInvalidUpstreamResponseError)
  })
})

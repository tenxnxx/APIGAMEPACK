import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchMagicChessGoGoPacks, mcggAppleKind, mcggPassType, matchMobapayUsd, mobapayPrice,
  MagicChessInvalidUpstreamResponseError, MagicChessUpstreamUnavailableError, MCGG_MOBAPAY_APP_ID
} from './services/magic-chess-go-go-packs.service'
import { parseMobapayShop } from './services/mlbb-packs.service'

const good = (id: number, sku: string, title: string, price: string, currency = 'THB', description = '', limited = false) => ({
  id, sku, title, description, price_local_show: price, currency, goods_limit: { game_limit: limited }, pay_channel_sub: []
})
const shopTh = (th: boolean) => ({
  code: 0, message: 'OK',
  data: {
    shop_info: {
      good_list: [
        good(126136, 'one_time_weekly_diamond_mt_id_mc2', 'Weekly Card', '70.00', 'THB', th ? '<p>\u0e04\u0e39\u0e48\u0e21\u0e37\u0e2d\u0e01\u0e32\u0e23\u0e0b\u0e37\u0e49\u0e2d</p>' : '<p>Weekly Card guide</p>'),
        good(129753, 'redenvelops_diamond_mt_ph_3rdpayment_mcgg_skindraw_1', th ? '\u0e28\u0e36\u0e01\u0e19\u0e35\u0e49\u0e21\u0e35\u0e42\u0e1b\u0e23' : 'Battle for Discounts ', '31.68', 'THB', '<p>1. Lv.5</p>', true),
        good(125584, 'com.moonton.diamond_mt_th_mc2_14', '14+1', '9.93'),
        good(131327, 'com.moonton.diamond_mt_gl_10000_mcgg', '10000 +2100 ', '6847.65')
      ],
      shelf_location: [{
        index: 3, title: 'Double Diamonds on First Recharge', description: 'first purchase',
        goods: [good(127414, 'com.moonton.diamond_mt_th_50_mcgg_web', '50+50', '33.90'), good(127417, 'com.moonton.diamond_mt_th_500_mcgg_web', '500+500', '342.06')]
      }]
    }
  }
})
const shopKh = {
  code: 0, message: 'OK',
  data: {
    shop_info: {
      good_list: [
        good(126136, 'one_time_weekly_diamond_mt_id_mc2', 'Weekly Card', '1.99', 'USD'),
        good(129753, 'redenvelops_diamond_mt_ph_3rdpayment_mcgg_skindraw_1', 'Battle for Discounts', '0.99', 'USD'),
        good(126466, 'com.moonton.diamond_mt_kh_mc2_1', '51+5', '', 'USD')
      ],
      shelf_location: [{ index: 3, title: 'Double Diamonds on First Recharge', goods: [good(127418, 'com.moonton.diamond_mt_kh_50_mcgg_web', '50+50', '0.99', 'USD')] }]
    }
  }
}
const item = (id: string, name: string, price: number, cur: string, offerName: string, desc?: string) => ({
  id, attributes: { name, offerName, isFamilyShareable: false, ...(desc ? { description: { standard: desc } } : {}), offers: [{ price, priceFormatted: String(price), currencyCode: cur }] }
})
const appleTh = [
  item('6698878224', '50 diamonds', 35, 'THB', 'com.moonton.diamond_50_mcgg', '50 diamonds'),
  item('6795451417', 'Weekly Diamond Pass Subscription', 70, 'THB', 'com.moonton.diamond_mc2_sub.weekly', 'Discount on First Weekly Diamond Pass Subscription'),
  item('6752491813', 'Promotion Fund_1', 35, 'THB', 'com.moonton.diamond_promotionfund_mc_1', 'Promotion Fund_1'),
  item('6737851613', 'Premium Lottery Pack', 105, 'THB', 'com.moonton.diamond_mc2_skindraw_2', 'Premium Lottery Pack')
]
const appleThTh = [item('6795451417', '\u0e1e\u0e32\u0e2a\u0e23\u0e32\u0e22\u0e2a\u0e31\u0e1b\u0e14\u0e32\u0e2b\u0e4c', 70, 'THB', 'com.moonton.diamond_mc2_sub.weekly', '\u0e2a\u0e48\u0e27\u0e19\u0e25\u0e14')]
const appleLa = [
  item('6698878224', '50 diamonds', 0.99, 'USD', 'com.moonton.diamond_50_mcgg'),
  item('6795451417', 'Weekly Diamond Pass Subscription', 1.99, 'USD', 'com.moonton.diamond_mc2_sub.weekly'),
  item('6737851613', 'Premium Lottery Pack', 2.99, 'USD', 'com.moonton.diamond_mc2_skindraw_2')
]

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
function mock(opts: { mobapay?: 'ok' | 'closed' | 'throw'; kh?: 'ok' | 'closed'; apple?: 'ok' | 'down' } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: any) => {
    const url = String(input); calls.push(url)
    const j = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    if (url.includes('api.mobapay.com')) {
      if (opts.mobapay === 'throw') throw new Error('network down')
      if (opts.mobapay === 'closed') return j({ code: 130101, message: 'App is closed' })
      if (url.includes('country=KH')) return opts.kh === 'closed' ? j({ code: 130201, message: 'Shop is closed' }) : j(shopKh)
      return j(shopTh(url.includes('language=th')))
    }
    if (opts.apple === 'down') return new Response('x', { status: 500 })
    if (url.includes('/th/apps/')) return j({ data: url.includes('l=th') ? appleThTh : appleTh })
    if (url.includes('/la/apps/')) return j({ data: appleLa })
    if (url.includes('/us/apps/')) return j({ errors: [{ status: '404' }] }, 404)
    return j({ data: [] })
  }) as any
  return calls
}
const allPacks = (r: any) => r.categories.flatMap((c: any) => c.packs)

describe('magic chess parsers', () => {
  it('classifies Apple items, reads Mobapay prices and links KH USD items by goods id / sku only', () => {
    expect(mcggAppleKind('com.moonton.diamond_50_mcgg', '50 diamonds')).toBe('currency')
    expect(mcggAppleKind('com.moonton.diamond_mc2_sub.weekly', 'Weekly Diamond Pass Subscription')).toBe('pass')
    expect(mcggAppleKind('com.moonton.diamond_mc2_skindraw_2', 'Premium Lottery Pack')).toBe('bundle')
    expect(mcggPassType('Weekly Diamond Pass Subscription')).toBe('weekly-diamond-pass-subscription')
    expect(mcggPassType('Weekly Card', 'one_time_weekly_diamond_mt_id_mc2')).toBe('weekly-card')
    expect(mcggPassType("Lukas's Battle Bounty", 'growthplan_mc_diamond_mt_andweb_1')).toBe('battle-bounty')
    expect(mcggPassType('Promotion Fund_2')).toBe('promotion-fund')
    expect(mobapayPrice(good(1, 'a', 'x', '') as any)).toBeNull()
    expect(mobapayPrice(good(1, 'a', 'x', '9.93') as any)).toBe(9.93)
    const kh = parseMobapayShop(shopKh)
    expect(matchMobapayUsd(kh, good(127414, 'com.moonton.diamond_mt_th_50_mcgg_web', '50+50', '33.90') as any)?.g.price_local_show).toBe('0.99')
    expect(matchMobapayUsd(kh, good(126136, 'one_time_weekly_diamond_mt_id_mc2', 'Weekly Card', '70') as any)?.by).toBe('goods id 126136')
    // a KH tier with an empty price is never used
    expect(matchMobapayUsd(kh, good(126466, 'com.moonton.diamond_mt_kh_mc2_1', '51+5', '35') as any)).toBeNull()
    expect(matchMobapayUsd(kh, good(125584, 'com.moonton.diamond_mt_th_mc2_14', '14+1', '9.93') as any)).toBeNull()
  })
})

describe('fetchMagicChessGoGoPacks', () => {
  it('builds Mobapay TH packs with Mobapay KH / Apple USD and App Store TH items', async () => {
    const calls = mock()
    const r: any = await fetchMagicChessGoGoPacks()
    expect(r.game.slug).toBe('magic-chess-go-go'); expect(r.game.id).toBe(MCGG_MOBAPAY_APP_ID)
    const p = allPacks(r)
    const by = (id: string) => p.find((x: any) => x.product_id === id)
    const d14 = by('com.moonton.diamond_mt_th_mc2_14')
    expect(d14.prices).toEqual({ THB: 9.93, USD: null })
    expect([d14.baseItemAmount, d14.bonusItemAmount, d14.totalItemAmount]).toEqual([14, 1, 15])
    expect(d14.price_usd_null_reason).toContain('com.moonton.diamond_mc2_14')
    const d10k = by('com.moonton.diamond_mt_gl_10000_mcgg')
    expect(d10k.totalItemAmount).toBe(12100); expect(d10k.price_usd_null_reason).toContain('no Apple offerName counterpart')
    const fr = by('com.moonton.diamond_mt_th_50_mcgg_web')
    expect(fr.kind).toBe('first-recharge'); expect(fr.first_recharge).toBe(true); expect(fr.totalItemAmount).toBe(100)
    expect(fr.prices).toEqual({ THB: 33.9, USD: 0.99 }); expect(fr.price_usd_source).toContain('mobapay-kh')
    expect(by('com.moonton.diamond_mt_th_500_mcgg_web').price_usd).toBeNull()
    const wc = by('one_time_weekly_diamond_mt_id_mc2')
    expect(wc.item_pack).toBe(true); expect(wc.pass_type).toBe('weekly-card'); expect(wc.prices).toEqual({ THB: 70, USD: 1.99 })
    expect(wc.description_en).toBe('Weekly Card guide'); expect(wc.description_th).toContain('\u0e04\u0e39\u0e48\u0e21\u0e37\u0e2d')
    const bfd = by('redenvelops_diamond_mt_ph_3rdpayment_mcgg_skindraw_1')
    expect(bfd.kind).toBe('bundle'); expect(bfd.item_pack).toBe(true); expect(bfd.purchase_limited).toBe(true)
    expect(bfd.name).toBe('Battle for Discounts'); expect(bfd.name_th).toBe('\u0e28\u0e36\u0e01\u0e19\u0e35\u0e49\u0e21\u0e35\u0e42\u0e1b\u0e23'); expect(bfd.prices.USD).toBe(0.99)
    const sub = by('com.moonton.diamond_mc2_sub.weekly')
    expect(sub.store).toBe('apple-app-store'); expect(sub.pass_type).toBe('weekly-diamond-pass-subscription')
    expect(sub.prices).toEqual({ THB: 70, USD: 1.99 }); expect(sub.price_usd_source).toContain('apple-app-store-la'); expect(sub.name_th).toBeTruthy()
    const a50 = by('com.moonton.diamond_50_mcgg')
    expect(a50.baseItemAmount).toBe(50); expect(a50.bonusItemAmount).toBeNull(); expect(a50.bonus_null_reason).toBeTruthy()
    expect(by('com.moonton.diamond_promotionfund_mc_1').price_usd_null_reason).toContain('not sold on the US App Store')
    expect(by('com.moonton.diamond_mc2_skindraw_2').item_pack).toBe(true)
    expect(calls.some((u) => /codashop|seagm|unipin/i.test(u))).toBe(false)
    for (const x of p) expect(Object.keys(x.prices)).toEqual(['THB', 'USD'])
  })
  it('falls back to Apple USD when Mobapay KH is closed, and to App Store TH when Mobapay is closed', async () => {
    mock({ kh: 'closed' })
    let p = allPacks(await fetchMagicChessGoGoPacks())
    const wc = p.find((x: any) => x.product_id === 'one_time_weekly_diamond_mt_id_mc2')
    expect(wc.price_usd).toBeNull(); expect(wc.price_usd_null_reason).toContain('Shop is closed')
    mock({ mobapay: 'closed' })
    const r: any = await fetchMagicChessGoGoPacks()
    p = allPacks(r)
    expect(p.every((x: any) => x.store === 'apple-app-store')).toBe(true)
    expect(r.notes.join(' ')).toContain('App Store TH fallback only')
  })
  it('maps upstream failures to the existing error classes', async () => {
    mock({ mobapay: 'closed', apple: 'down' })
    await expect(fetchMagicChessGoGoPacks()).rejects.toBeInstanceOf(MagicChessInvalidUpstreamResponseError)
    mock({ mobapay: 'throw', apple: 'down' })
    await expect(fetchMagicChessGoGoPacks()).rejects.toBeInstanceOf(MagicChessUpstreamUnavailableError)
  })
})

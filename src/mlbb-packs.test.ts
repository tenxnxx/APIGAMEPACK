import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchMlbbPacks, parseBaseBonus, mobapaySkuToOfferName, stripHtml, mlbbAppleKind, mlbbPassType, appleBonus, parseMobapayShop,
  MlbbInvalidUpstreamResponseError, MlbbUpstreamUnavailableError
} from './services/mlbb-packs.service'

const good = (id: number, sku: string, title: string, price: string, description = '', limited = false) => ({
  id, sku, title, description, price_local_show: price, currency: 'THB', goods_limit: { game_limit: limited }, pay_channel_sub: []
})
const shop = (th: boolean) => ({
  code: 0, message: 'success',
  data: {
    shop_info: {
      good_list: [
        good(125732, 'com.moonton.diamond_mt_th_one_time_weekly_diamond', 'Weekly Diamond Pass', '70.00', '<p><span>1. Lv.5 &#x27;required&#x27;</span></p>'),
        good(131213, 'com.moonton.skin_69_mt_th', th ? '\u0e41\u0e1e\u0e47\u0e01 Elite' : 'Weekly Elite Bundle', '35.00', th ? '\u0e08\u0e48\u0e32\u0e22\u0e14\u0e49\u0e27\u0e22\u0e40\u0e1e\u0e0a\u0e23 x55' : 'purchase Diamond x55', true),
        good(125719, 'com.moonton.diamond_mt_th_14', '14+1', '10.00'),
        good(125731, 'com.moonton.diamond_mt_th_5004', '5004+1001', '3500.00')
      ],
      shelf_location: [{
        index: 2, title: th ? '\u0e40\u0e15\u0e34\u0e21\u0e04\u0e23\u0e31\u0e49\u0e07\u0e41\u0e23\u0e01' : 'Double Diamonds on First Recharge', description: 'first purchase',
        goods: [good(126317, 'com.moonton.diamond_mt_th_50', '50+50', '35.00', '<p>50 base Diamonds + 50 bonus Diamonds</p>', true), good(126320, 'com.moonton.diamond_mt_th_500', '500+500', '350.00', '500+500', true)]
      }]
    }
  }
})
const item = (id: string, name: string, price: number, cur: string, offerName: string, desc?: string) => ({
  id, attributes: { name, offerName, isFamilyShareable: false, ...(desc ? { description: { standard: desc } } : {}), offers: [{ price, priceFormatted: String(price), currencyCode: cur }] }
})
const appleTh = [
  item('1649170999', 'Weekly Diamond Pass', 70, 'THB', 'com.moonton.diamond_one_time_weekly_diamond', 'Weekly Diamond Pass'),
  item('1487957324', 'Elite Bundle', 35, 'THB', 'com.moonton.skin_69', 'Elite Bundle'),
  item('1187778149', '50 Diamonds', 35, 'THB', 'com.moonton.diamond_50_new', '50 Diamonds+5 Bonus Diamonds'),
  item('1427277774', 'Twilight Pass', 359, 'THB', 'com.moonton.diamond_growthplan_5', 'Twilight Pass'),
  item('1160092766', '500 Diamonds', 359, 'THB', 'com.moonton.diamond_500', '500 Diamonds + 65 Bonus Diamonds'),
  item('1179872158', 'Starlight Member', 399, 'THB', 'com.moonton.diamond_star'),
  item('1363003901', 'Black Rose Bundle', 199, 'THB', 'com.moonton.skin_6', 'Black Rose package')
]
const appleThTh = [item('1427277774', 'Twilight Pass TH', 359, 'THB', 'com.moonton.diamond_growthplan_5', '\u0e1e\u0e32\u0e2a')]
const appleLa = [
  item('1649170999', 'Weekly Diamond Pass', 1.99, 'USD', 'com.moonton.diamond_one_time_weekly_diamond'),
  item('1427277774', 'Twilight Pass', 9.99, 'USD', 'com.moonton.diamond_growthplan_5'),
  item('1187778149', '50 Diamonds', 0.99, 'USD', 'com.moonton.diamond_50_new'),
  item('1160092766', '500 Diamonds', 9.99, 'USD', 'com.moonton.diamond_500')
]
const appleMm = [item('1487957324', 'Elite Bundle', 0.99, 'USD', 'com.moonton.skin_69')]

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
function mock(opts: { mobapay?: 'ok' | 'closed' | 'throw'; apple?: 'ok' | 'down' } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: any) => {
    const url = String(input); calls.push(url)
    const j = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    if (url.includes('api.mobapay.com')) {
      if (opts.mobapay === 'throw') throw new Error('network down')
      if (opts.mobapay === 'closed') return j({ code: 130101, message: 'App is closed' })
      return j(shop(url.includes('language=th')))
    }
    if (opts.apple === 'down') return new Response('x', { status: 500 })
    if (url.includes('/th/apps/')) return j({ data: url.includes('l=th') ? appleThTh : appleTh })
    if (url.includes('/la/apps/')) return j({ data: appleLa })
    if (url.includes('/mm/apps/')) return j({ data: appleMm })
    return new Response('nf', { status: 404 })
  }) as any
  return calls
}
const allPacks = (r: any) => r.categories.flatMap((c: any) => c.packs)

describe('mlbb parsers', () => {
  it('parses base+bonus titles, sku->offerName, html and Apple kinds', () => {
    expect(parseBaseBonus('286+29')).toEqual({ base: 286, bonus: 29 })
    expect(parseBaseBonus('Weekly Diamond Pass')).toBeNull()
    expect(mobapaySkuToOfferName('com.moonton.skin_69_mt_th')).toBe('com.moonton.skin_69')
    expect(mobapaySkuToOfferName('com.moonton.diamond_mt_th_one_time_weekly_diamond')).toBe('com.moonton.diamond_one_time_weekly_diamond')
    expect(stripHtml('<p>a &quot;b&quot;</p><p>c</p>')).toBe('a "b"\nc')
    expect(mlbbAppleKind('com.moonton.diamond_500', '500 Diamonds')).toBe('currency')
    expect(mlbbAppleKind('com.moonton.diamond_ph_ios_20', '19 Diamonds')).toBe('other')
    expect(mlbbAppleKind('com.moonton.diamond_growthplan_5', 'Twilight Pass')).toBe('pass')
    expect(mlbbPassType('Basic Twilight Pass')).toBe('twilight-pass')
    expect(mlbbPassType('Ticket Monthly Subscription')).toBe('monthly-subscription')
    expect(appleBonus('1,000 Diamonds + 155 Bonus Diamonds')).toBe(155)
    expect(parseMobapayShop({ code: 130101 })).toBeNull()
    expect(parseMobapayShop({ errorCode: 10 })).toBeNull()
  })
})

describe('fetchMlbbPacks', () => {
  it('builds Mobapay TH packs (base+bonus, first recharge, passes) with Apple USD and App Store TH passes', async () => {
    const calls = mock()
    const r: any = await fetchMlbbPacks()
    expect(r.game.slug).toBe('mobile-legends')
    const p = allPacks(r)
    const by = (id: string) => p.find((x: any) => x.product_id === id)
    const d14 = by('com.moonton.diamond_mt_th_14')
    expect(d14.store).toBe('mobapay'); expect(d14.prices.THB).toBe(10)
    expect([d14.baseItemAmount, d14.bonusItemAmount, d14.totalItemAmount]).toEqual([14, 1, 15])
    expect(d14.price_usd).toBeNull(); expect(d14.price_usd_null_reason).toContain('App is closed')
    expect(by('com.moonton.diamond_mt_th_5004').totalItemAmount).toBe(6005)
    const fr = by('com.moonton.diamond_mt_th_50')
    expect(fr.kind).toBe('first-recharge'); expect(fr.first_recharge).toBe(true); expect(fr.totalItemAmount).toBe(100)
    expect(fr.description_en).toBe('50 base Diamonds + 50 bonus Diamonds')
    const wdp = by('com.moonton.diamond_mt_th_one_time_weekly_diamond')
    expect(wdp.item_pack).toBe(true); expect(wdp.pass_type).toBe('weekly-diamond-pass')
    expect(wdp.prices).toEqual({ THB: 70, USD: 1.99 }); expect(wdp.price_usd_source).toContain('apple-app-store-la')
    expect(wdp.price_thb_appstore).toBe(70); expect(wdp.apple_item_id).toBe('1649170999')
    expect(wdp.description_en).toContain("Lv.5 'required'")
    const elite = by('com.moonton.skin_69_mt_th')
    expect(elite.item_pack).toBe(true); expect(elite.kind).toBe('bundle'); expect(elite.purchase_limited).toBe(true)
    expect(elite.price_usd_source).toContain('apple-app-store-mm'); expect(elite.name_th).toBe('\u0e41\u0e1e\u0e47\u0e01 Elite')
    // Apple rows already linked to Mobapay items are not duplicated
    expect(p.filter((x: any) => x.product_id === 'com.moonton.skin_69').length).toBe(0)
    const tw = by('com.moonton.diamond_growthplan_5')
    expect(tw.store).toBe('apple-app-store'); expect(tw.pass_type).toBe('twilight-pass'); expect(tw.prices).toEqual({ THB: 359, USD: 9.99 })
    expect(tw.name_th).toBe('Twilight Pass TH')
    const d50 = by('com.moonton.diamond_50_new')
    expect([d50.baseItemAmount, d50.bonusItemAmount, d50.totalItemAmount]).toEqual([50, 5, 55])
    const star = by('com.moonton.diamond_star')
    expect(star.price_usd).toBeNull(); expect(star.price_usd_null_reason).toContain('USD storefronts'); expect(star.description_null_reason).toBeTruthy()
    expect(by('com.moonton.skin_6')).toBeUndefined()
    // Diamond tier with a matching Apple offerName: USD from Apple, Apple tier still listed on its own
    const fr500 = by('com.moonton.diamond_mt_th_500')
    expect(fr500.prices).toEqual({ THB: 350, USD: 9.99 }); expect(fr500.price_thb_appstore).toBe(359)
    expect(by('com.moonton.diamond_500').totalItemAmount).toBe(565)
    expect(fr.price_usd).toBeNull()
    expect(calls.some((u) => u.includes('/us/apps/'))).toBe(true)
    expect(calls.some((u) => /codashop|seagm|unipin/i.test(u))).toBe(false)
    for (const x of p) expect(Object.keys(x.prices)).toEqual(['THB', 'USD'])
  })
  it('falls back to App Store TH when Mobapay is closed', async () => {
    mock({ mobapay: 'closed' })
    const r: any = await fetchMlbbPacks()
    const p = allPacks(r)
    expect(p.every((x: any) => x.store === 'apple-app-store')).toBe(true)
    expect(p.find((x: any) => x.product_id === 'com.moonton.skin_6')).toBeTruthy()
    expect(r.notes.join(' ')).toContain('App Store TH fallback only')
  })
  it('maps upstream failures to the existing error classes', async () => {
    mock({ mobapay: 'closed', apple: 'down' })
    await expect(fetchMlbbPacks()).rejects.toBeInstanceOf(MlbbInvalidUpstreamResponseError)
    mock({ mobapay: 'throw', apple: 'down' })
    await expect(fetchMlbbPacks()).rejects.toBeInstanceOf(MlbbUpstreamUnavailableError)
  })
})

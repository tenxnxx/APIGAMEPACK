import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { dcdKey, dcdKind, parseDcdContents } from './services/dunk-city-dynasty-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'dunk-city-dynasty') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
const NOW = 1793348422
const lp = (thb: number | null) => JSON.stringify({ PH: { default: { price: 1, currency: 'PHP' } }, ...(thb === null ? {} : { TH: { default: { price: thb, currency: 'THB', symbol: '\u0E3F' } } }) })
const prod = (id: string, info: string, detail: string, usd: string, tok: number, free: number, thb: number | null, platform = 'ios', more: any = {}) => ({
  goodsid: 'L33naxx2gb.3rd.' + id, goodsinfo: info, currency: 'USD', price: usd, pay_yuanbao: tok, free_yuanbao: free, platform, status: 1,
  extra: { local_price: lp(thb) }, purchase_limit: {},
  multi_language: { default: { default: { goodsinfo: info, goods_detail: detail, image_info: { normal: 'img-' + id } } } }, ...more
})
const PRODUCTS = { code: '0000', data: [
  prod('300dq', '300 Tokens, 30 free.', 'Purchase to receive 300 Tokens + 30 bonus Tokens (330 total).', '4.9900', 300, 30, 199),
  prod('300dq', '300 Tokens, 30 free.', 'Purchase to receive 300 Tokens + 30 bonus Tokens (330 total).', '4.9900', 300, 30, 199, 'ad'),
  prod('300dqbonusa', '300 Tokens + 300 Bonus Diamonds', '300 Tokens + 300 Bonus Diamonds', '4.9900', 300, 30, 199, 'ios', { effective_time: NOW - 10, expired_time: 2147483647 }),
  prod('30yueka', 'Party Membership', 'Purchase to receive 300 Tokens and activate Party Membership for 30 days. Daily login grants 150 Diamonds.', '4.9900', 300, 0, 199),
  prod('bplow', 'Premium Pass', 'Purchase to activate the Premium Pass in-game to unlock exclusive level rewards.', '5.9900', 0, 0, 199),
  prod('68texunlb', 'Superstar Training Pack', 'Purchase to receive Superstar Voucher x8, Gold Coin x5,000, and Uncommon Talent Material x50.', '9.9900', 0, 0, 399, 'ios', { purchase_limit: { perorder: 1 } }),
  prod('nothb', 'Fashion Pack', 'Purchase to receive Diamond*800,Fashion Voucher*3', '9.9900', 0, 0, null),
  prod('old', 'Old Pack', 'x', '1.9900', 0, 0, 79, 'ios', { expired_time: NOW - 1 }),
  prod('soon', 'Soon Pack', 'x', '1.9900', 0, 0, 79, 'ios', { effective_time: NOW + 3600 })
] }
const ACTS = { code: '0000', data: { server_ts: NOW, list: [
  { goodsid: 'L33naxx2gb.3rd.300dq', activity_type: '0', alpha2: 'TH', marketing_free_amount: 15, effective_time: 1, expired_time: 2147483647 },
  { goodsid: 'L33naxx2gb.3rd.68texunlb', activity_type: '27', alpha2: 'all', marketing_free_amount: 0, effective_time: 1, expired_time: NOW + 7200, after_discount_price_map: { THB: '299', USD: '7.99' } },
  { goodsid: 'L33naxx2gb.3rd.bplow', activity_type: '27', alpha2: 'all', marketing_free_amount: 0, effective_time: 1, expired_time: 2147483647, after_discount_price_map: null }
] } }
const row = (id: string, offer: string, name: string, price: number, cur: 'THB' | 'USD', desc = name) => ({
  id, type: 'in-apps', attributes: { name, offerName: 'com.netease.dunkcd.' + offer, description: { standard: desc }, offers: [{ currencyCode: cur, price, priceFormatted: String(price) }] }
})
const TH = [row('1', 'bplow', 'Premium Pass', 199, 'THB'), row('2', 'nothb', 'Fashion Pack', 399, 'THB'), row('3', 'duoweekbplow', 'Dual Premium pass', 99, 'THB'),
  row('4', 'ussubscription1.99', 'Basic Player Subscription', 79, 'THB', 'Get a 7 Days Basic Player Subscription.'), row('5', 'us6gift1', 'Superstar Lucky Pack', 29, 'THB')]
const US = [row('1', 'bplow', 'Premium Pass', 5.99, 'USD'), row('3', 'duoweekbplow', 'Dual Premium pass', 2.99, 'USD')]
const KH = [row('3', 'duoweekbplow', 'Dual Premium pass', 3.49, 'USD'), row('4', 'ussubscription1.99', 'Basic Player Subscription', 1.99, 'USD')]
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
function mock(o: { products?: number; acts?: number; th?: number; us?: number; kh?: number } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input); calls.push(url)
    if (url.startsWith('https://pay.neteasegames.com/gameclub/products/dunkcitydynasty/activitys')) return o.acts ? json({}, o.acts) : json(ACTS)
    if (url.startsWith('https://pay.neteasegames.com/gameclub/products/dunkcitydynasty?')) return o.products ? json({}, o.products) : json(PRODUCTS)
    const m = url.match(/catalog\/([a-z]{2})\/apps\/1555216030\/top-in-apps.*offset=(\d+)/)
    if (m) {
      if (m[2] !== '0') return json({ data: [] })
      const st = (o as any)[m[1]]
      if (st) return json({}, st)
      return json({ data: m[1] === 'th' ? TH : m[1] === 'us' ? US : m[1] === 'kh' ? KH : [] })
    }
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
  return calls
}
const packs = (b: any) => b.categories.flatMap((c: any) => c.packs)
const by = (b: any, id: string) => packs(b).find((p: any) => p.product_id === id)

describe('dunk city dynasty helpers', () => {
  it('maps ids, kinds and official contents', () => {
    expect(dcdKey('L33naxx2gb.3rd.300dq')).toBe('300dq'); expect(dcdKey('com.netease.dunkcd.300dq')).toBe('300dq'); expect(dcdKey('com.netease.dunckcd.x')).toBe('x')
    expect(dcdKind('L33naxx2gb.3rd.980dq', '980 Tokens')).toBe('tokens'); expect(dcdKind('L33naxx2gb.3rd.980dqbonusa', '')).toBe('first-topup')
    expect(dcdKind('L33naxx2gb.3rd.98zsk', 'Party Permanent Vip')).toBe('pass'); expect(dcdKind('L33naxx2gb.3rd.rookiegift', 'Rookie Gift Pack')).toBe('bundle')
    expect(parseDcdContents('Purchase to receive Superstar Voucher x8, Gold Coin x5,000, and Uncommon Talent Material x50.', 0)).toEqual([
      { item: 'Superstar Voucher', quantity: 8 }, { item: 'Gold Coin', quantity: 5000 }, { item: 'Uncommon Talent Material', quantity: 50 }])
    expect(parseDcdContents('Purchase to receive Diamond*100,SuperStar Voucher*1', 0)).toEqual([{ item: 'Diamond', quantity: 100 }, { item: 'SuperStar Voucher', quantity: 1 }])
    expect(parseDcdContents('Purchase to obtain [Gentleman] Set and a Star Player Choice Chest (you can choose one player from Capela, Williamson, or Paul).', 0)).toEqual([
      { item: '[Gentleman] Set', quantity: 1 }, { item: 'Star Player Choice Chest', quantity: 1, choices: ['Capela', 'Williamson', 'Paul'] }])
    expect(parseDcdContents('Open to choose one of the following players:DeRozan,Capela, and Westbrook.', 0)[0]).toEqual({ item: 'Star Player (choose 1)', quantity: 1, choices: ['DeRozan', 'Capela', 'Westbrook'] })
    expect(parseDcdContents('60 Tokens + 60 Bonus Diamonds', 60)).toEqual([{ item: 'Tokens', quantity: 60 }, { item: 'Bonus Diamonds', quantity: 60 }])
  })
})

describe('GET /games/dunk-city-dynasty/packs/', () => {
  it('official GamesClub THB+USD, bonus, contents, passes and App Store-only passes', async () => {
    const calls = mock()
    const res = await get(); expect(res.status).toBe(200)
    const b: any = await res.json()
    expect(b.game).toMatchObject({ id: 1555216030, slug: 'dunk-city-dynasty', name: 'Dunk City Dynasty', itemName: 'Tokens' })
    expect(b.categories.map((c: any) => c.name)).toEqual([
      'Tokens (Official NetEase GamesClub top-up)', 'Tokens + Bonus Diamonds (Official NetEase GamesClub top-up)', 'Passes & Memberships (Official NetEase GamesClub top-up)',
      'Passes (App Store in-app only)', 'Packs & Bundles (Official NetEase GamesClub top-up)'])
    expect(b.summary.packCount).toBe(8)
    expect(by(b, 'L33naxx2gb.3rd.300dq')).toMatchObject({ kind: 'tokens', item_pack: false, price_thb: 199, price_usd: 4.99, currency: 'THB', baseItemAmount: 300, bonusItemAmount: 45, totalItemAmount: 345,
      bonus_breakdown: { in_game_bonus_tokens: 30, gameclub_bonus_tokens: 15, bonus_diamonds: 0 }, price_thb_source: 'netease-gameclub-official (local_price TH)', description_th: null })
    const fb = by(b, 'L33naxx2gb.3rd.300dqbonusa')
    expect(fb).toMatchObject({ kind: 'first-topup', baseItemAmount: 300, bonusItemAmount: 0, totalItemAmount: 300, bonus_breakdown: { bonus_diamonds: 300 } })
    const mem = by(b, 'L33naxx2gb.3rd.30yueka')
    expect(mem).toMatchObject({ kind: 'pass', pass_type: 'membership', item_pack: true, baseItemAmount: 300, contents: [{ item: 'Tokens', quantity: 300 }], price_thb: 199, price_usd: 4.99 })
    expect(mem.benefits[1]).toBe('Daily login grants 150 Diamonds.'); expect(mem.description_th_null_reason).toMatch(/English only/)
    const bp = by(b, 'L33naxx2gb.3rd.bplow')
    expect(bp).toMatchObject({ pass_type: 'battle-pass', price_thb: 199, price_usd: 5.99, contents: null, baseItemAmount: null, discount_price_thb: null })
    expect(bp.contents_null_reason).toMatch(/benefits/); expect(bp.base_null_reason).toBeTruthy()
    const tp = by(b, 'L33naxx2gb.3rd.68texunlb')
    expect(tp).toMatchObject({ kind: 'bundle', item_pack: true, purchase_limit: '1 per order', discount_price_thb: 299, discount_price_usd: 7.99, price_thb: 399 })
    expect(tp.contents).toContainEqual({ item: 'Gold Coin', quantity: 5000 })
    const fp = by(b, 'L33naxx2gb.3rd.nothb')
    expect(fp).toMatchObject({ price_thb: 399, price_usd: 9.99 }); expect(fp.price_thb_source).toMatch(/apple-app-store-th \(offerName com\.netease\.dunkcd\.nothb, item 2\)/)
    const dual = by(b, 'com.netease.dunkcd.duoweekbplow')
    expect(dual).toMatchObject({ store: 'apple-app-store', kind: 'pass', item_pack: true, price_thb: 99, price_usd: 2.99, contents: null, description_en: null })
    expect(dual.price_usd_source).toBe('apple-app-store-us (item 3)'); expect(dual.contents_null_reason).toBeTruthy()
    const sub = by(b, 'com.netease.dunkcd.ussubscription1.99')
    expect(sub).toMatchObject({ price_thb: 79, price_usd: null, description_en: 'Get a 7 Days Basic Player Subscription.' }); expect(sub.price_usd_null_reason).toMatch(/not in App Store US/)
    expect(by(b, 'com.netease.dunkcd.us6gift1')).toBeUndefined(); expect(by(b, 'com.netease.dunkcd.bplow')).toBeUndefined()
    expect(by(b, 'L33naxx2gb.3rd.old')).toBeUndefined(); expect(by(b, 'L33naxx2gb.3rd.soon')).toBeUndefined()
    for (const p of packs(b)) { expect(p.prices).toEqual({ THB: p.price_thb, USD: p.price_usd }); if (p.price_usd === null) expect(p.price_usd_null_reason).toBeTruthy() }
    expect(calls.every((u) => !/codashop|seagm|unipin|razer|lapak|joytify/i.test(u))).toBe(true)
  })
  it('USD falls back to KH when App Store US is down; activitys down -> bonus null with reason', async () => {
    mock({ us: 503, acts: 500 })
    const b: any = await (await get('dcd')).json()
    expect(by(b, 'com.netease.dunkcd.duoweekbplow')).toMatchObject({ price_usd: 3.49, price_usd_source: 'apple-app-store-kh (item 3)' })
    const t = by(b, 'L33naxx2gb.3rd.300dq')
    expect(t.bonusItemAmount).toBe(30); expect(t.bonus_null_reason).toMatch(/activitys endpoint unavailable/)
  })
  it('App Store down: official packs still served, no-THB product gets a null reason', async () => {
    mock({ th: 503, us: 503, kh: 503 })
    const b: any = await (await get('dunkcitydynasty')).json()
    expect(packs(b).some((p: any) => p.store === 'apple-app-store')).toBe(false)
    const fp = by(b, 'L33naxx2gb.3rd.nothb')
    expect(fp.price_thb).toBeNull(); expect(fp.currency).toBe('USD'); expect(fp.price_thb_null_reason).toMatch(/App Store TH unavailable/)
  })
  it('502 when the official GamesClub products API is down', async () => {
    mock({ products: 503 })
    const res = await get(); expect(res.status).toBe(502)
  })
})

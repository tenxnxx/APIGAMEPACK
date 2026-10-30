import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import {
  fetchDreamAndLetheRecordPacks, dlrGoldTier, dlrKind, dlrAppleOffer, dlrBonus, parseDlrContents, dlrLimit,
  DreamLetheUpstreamUnavailableError, DreamLetheInvalidUpstreamResponseError
} from './services/dream-and-lethe-record-packs.service'

const page = (ck: string) => `<html><script>self.__next_f.push([1,"{\\"clientKey\\":\\"${ck}\\",\\"display\\":{\\"productGroup\\":{\\"G1\\":\\"Gold Giftpack\\",\\"G4\\":\\"Special Package\\"}}}"])</script></html>`
const CK_TH = 'eyJhbGciOiJIUzI1NiJ9.eyJjIjoiMTAxMDE2In0.dlrthkeydlrthkey'
const CK_SG = 'eyJhbGciOiJIUzI1NiJ9.eyJjIjoiMTAxMDE3In0.dlrsgkeydlrsgkey'
const bonus = (v: number, mol: number) => ({
  bank: { paymentGroupID: 'bank', bonusByProviders: { kasikorn: { bonusValue: v, isEnable: true, inGameCurrency: 'Gold' }, scb: { bonusValue: v, isEnable: true } } },
  wallet: { paymentGroupID: 'wallet', bonusByProviders: { truewallet: { bonusValue: v, isEnable: true }, zgoldmolpoints: { bonusValue: mol, isEnable: true }, off: { bonusValue: 999, isEnable: false } } }
})
const prod = (id: string, g: string, name: string, desc: string, cur: string, price: number, more: any = {}) => ({
  enable: 1, hidden: 0, sellingProductID: id, productName: name, productGroup: g, description: desc, productType: 'PACKAGE',
  prices: { [cur]: { currency: cur, price, convertionRate: 0 } }, inGameCurrency: 'Gem', sellFromDate: -1, sellToDate: -1, image: 'img-' + id, ...more
})
const TH_NOTE = '<p><span style="color:red"><strong>หมายเหตุ:</strong></span><br>-จำกัดการซื้อ: 1 ครั้ง<br>-ท่านทูตโปรดออนไลน์ในเกม</p>'
const thProducts = {
  a: prod('com.web.gold.6', 'G1', '6 Gold Giftpack', 'แพ็กทอง 6 ชิ้น', 'THB', 35, { bonusByPaymentGroups: bonus(1, 1) }),
  b: prod('com.webshop.th.parent.30', 'G1', '30 Gold Giftpack', 'แพ็กทอง 30 ชิ้น', 'THB', 175, { bonusByPaymentGroups: bonus(6, 3) }),
  c: prod('com.webshop.th.parent.90', 'G1', '90 Gold Giftpack', 'แพ็กทอง 90 ชิ้น', 'THB', 525, { bonusByPaymentGroups: bonus(18, 9) }),
  h: prod('com.web10.gold.30', 'G1', '30 Gold Giftpack', 'แพ็กทอง 30 ชิ้น', 'THB', 175, { hidden: 1 }),
  e: prod('com.webshop.th.parent.12', 'G1', '12 Gold Giftpack', 'x', 'THB', 70, { sellToDate: 1000 }),
  d: prod('com.card.th.gold.18', 'G3', '18 Gold Giftpack', 'แพ็กทอง 18 ชิ้น', 'THB', 100),
  m: prod('com.web.sea.monthly.classic', 'G2', 'Classic Monthly Card', 'ใช้งานบัตรรายเดือนแบบทั่วไป', 'THB', 175),
  f: prod('com.dream.web.firstpay', 'G4', 'กบฏขุนศึก', '<p><span>รับทันที: กรอบโปรไฟล์-งานเลี้ยงชิงตู x1, ฉายา x1, หยก x180</span></p>' + TH_NOTE, 'THB', 35),
  s: prod('com.dream.web.special2', 'G4', 'ภูตเหมียวตามหาวีรชน I', '<p>รับทันที: ตุ๊กตาภูตเหมียว x4, ตำรามรรคาสวรรค์ x3</p>' + TH_NOTE, 'THB', 175)
}
const sgProducts = {
  m: prod('com.web.sea.monthly.classic', 'G2', 'Activate Classic Monthly Card', 'Activate Classic Monthly Card', 'SGD', 6.5),
  f: prod('com.dream.web.firstpay', 'G4', 'Envoy’s Rebellion', '<table><tbody><tr><td class="xl85" rowspan="4">Purchase Limitation: 1 time<br>Receive: Avatar Frame: Clean City x1, Title x1, Jade x180<br>Note: If you exceed the purchase limitation...</td></tr></tbody></table>', 'SGD', 1.48),
  s: prod('com.dream.web.special2', 'G4', 'Nekomancy I', '<p>Purchase Limitation: 1 time</p><p>Receive: Celestial Tome of Great Dao x3, Meow Doll x4</p>', 'SGD', 7)
}
const row = (id: string, offer: string, name: string, price: number, cur: string, desc = name) => ({ id, attributes: { name, offerName: offer, description: { standard: desc }, offers: [{ price, priceFormatted: String(price), currencyCode: cur }] } })
const AS_TH = [row('11', 'com.iap.sea.gold.6', '6 Gold Pack', 35, 'THB'), row('12', 'com.iap.sea.gold.30', '30 Gold Pack', 179, 'THB'),
  row('13', 'com.iap.sea.monthly.classic', 'Classic Monthly Card', 219, 'THB', 'Activate 30-Day Monthly Card'), row('14', 'com.dream.iap.firstpay', 'Envoy’s Rebellion', 35, 'THB'),
  row('15', 'com.dream.iap.daily.pack', 'Daily Pack', 35, 'THB', 'Purchase to get 110 Jade, 1 Fairy Meow Pack'), row('16', 'com.dream.iap.weekly1.pack', 'Weekly Pack', 69, 'THB', 'Purchase to get 1 Meow Doll,1 Universal Token'),
  row('17', 'com.iap.gacha1', 'Dream of Xi Shi', 35, 'THB', 'Get exclusive offer')]
const AS_USD = [row('11', 'com.iap.sea.gold.6', '6 Gold Pack', 0.99, 'USD'), row('12', 'com.iap.sea.gold.30', '30 Gold Pack', 4.99, 'USD'),
  row('13', 'com.iap.sea.monthly.classic', 'Classic Monthly Card', 6.99, 'USD', 'Activate 30-Day Monthly Card'), row('14', 'com.dream.iap.firstpay', 'Envoy’s Rebellion', 0.99, 'USD'),
  row('15', 'com.dream.iap.daily.pack', 'Daily Pack', 0.99, 'USD')]

const realFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = realFetch; clearPacksCache() })
function mock(o: { shop?: 'ok' | 'down' | 'bad' | 'nokey'; sg?: 'down'; usd?: 'us' | 'kh' | 'none'; th?: 'down' } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input); calls.push(url)
    const j = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    if (url.startsWith('https://shop.vnggames.com/th/game/dreamth')) return o.shop === 'down' ? new Response('x', { status: 503 }) : new Response(page(o.shop === 'nokey' ? '' : CK_TH))
    if (url.startsWith('https://shop.vnggames.com/sg/game/dreamsg')) return o.sg === 'down' ? new Response('x', { status: 500 }) : new Response(page(CK_SG))
    if (url.startsWith('https://billing.vnggames.com/')) {
      const b = new URLSearchParams(String(init?.body ?? ''))
      expect(b.get('bonusInfo')).toBe('true')
      if (b.get('clientKey') === CK_TH) return o.shop === 'bad' ? j({ returnCode: 1, data: {} }) : j({ returnCode: 1, data: { products: thProducts } })
      if (b.get('clientKey') === CK_SG) return j({ returnCode: 1, data: { products: sgProducts } })
      return j({ returnCode: -1 })
    }
    const m = url.match(/catalog\/([a-z]{2})\/apps\/6505037845\/top-in-apps/)
    if (m) {
      if (!/[?&]offset=0(&|$)/.test(url)) return j({ data: [] })
      if (m[1] === 'th') return o.th === 'down' ? j({}, 503) : j({ data: AS_TH })
      if (m[1] === (o.usd ?? 'kh')) return j({ data: AS_USD })
      return j({ errors: [{ title: 'No related resources' }] }, 404)
    }
    return new Response('unexpected', { status: 599 })
  }) as any
  return calls
}
const all = (r: any) => r.categories.flatMap((c: any) => c.packs)
const by = (r: any, id: string) => all(r).find((p: any) => p.product_id === id)

describe('dream and lethe record parsers', () => {
  it('parses tiers, kinds, Apple ids, bonus, contents', () => {
    expect(dlrGoldTier('600 Gold Giftpack')).toBe(600); expect(dlrGoldTier('Classic Monthly Card')).toBeNull()
    expect(dlrKind(thProducts.a as any)).toBe('gold'); expect(dlrKind(thProducts.d as any)).toBe('gold-card')
    expect(dlrKind(thProducts.m as any)).toBe('monthly-card'); expect(dlrKind(thProducts.f as any)).toBe('bundle')
    expect(dlrAppleOffer(thProducts.b as any)).toBe('com.iap.sea.gold.30'); expect(dlrAppleOffer(thProducts.m as any)).toBe('com.iap.sea.monthly.classic')
    expect(dlrAppleOffer(thProducts.f as any)).toBe('com.dream.iap.firstpay')
    expect(dlrBonus(thProducts.b as any)).toEqual({ max: 6, min: 3, byMethod: { kasikorn: 6, scb: 6, truewallet: 6, zgoldmolpoints: 3 } })
    expect(dlrBonus(thProducts.d as any)).toBeNull()
    expect(parseDlrContents(['Purchase Limitation: 1 time', 'Receive: Avatar Frame: Clean City x1, Gold Coin x5,000, Jade\u00a0 x360'])).toEqual([
      { item: 'Avatar Frame: Clean City', quantity: 1 }, { item: 'Gold Coin', quantity: 5000 }, { item: 'Jade', quantity: 360 }])
    expect(parseDlrContents(['รับทันที: ส่องเงา-ซูซื่อ x1, กระดิ่งเหมียว x10'])).toEqual([{ item: 'ส่องเงา-ซูซื่อ', quantity: 1 }, { item: 'กระดิ่งเหมียว', quantity: 10 }])
    expect(dlrLimit(['-จำกัดการซื้อ: 1 ครั้ง'])).toBe('จำกัดการซื้อ: 1 ครั้ง')
  })
})

describe('fetchDreamAndLetheRecordPacks', () => {
  it('official VNGGames Shop TH THB + bonus, SG English, App Store USD (US down -> KH), passes', async () => {
    const calls = mock()
    const r: any = await fetchDreamAndLetheRecordPacks()
    expect(r.game).toMatchObject({ id: 6505037845, slug: 'dream-and-lethe-record', name: 'Dream and Lethe Record', itemName: 'Gold' })
    expect(r.categories.map((c: any) => c.name)).toEqual(['Gold (Official VNGGames Shop TH top-up)', 'Gold via VNGGames Card (Official VNGGames Shop TH)',
      'Monthly Cards (Official VNGGames Shop TH)', 'Daily / Weekly Packs (App Store in-app only)', 'Special Packs (Official VNGGames Shop TH)'])
    expect(r.summary.packCount).toBe(9)
    expect(by(r, 'com.web10.gold.30')).toBeUndefined(); expect(by(r, 'com.webshop.th.parent.12')).toBeUndefined(); expect(by(r, 'com.iap.gacha1')).toBeUndefined()
    expect(by(r, 'com.webshop.th.parent.30')).toMatchObject({ kind: 'gold', item_pack: false, price_thb: 175, price_usd: 4.99, currency: 'THB', baseItemAmount: 30, bonusItemAmount: 6, totalItemAmount: 36,
      price_thb_source: 'vnggames-shop-th-official', price_usd_source: 'apple-app-store-kh (offerName com.iap.sea.gold.30, item 12)', appstore_th_price_thb: 179,
      description_th: 'แพ็กทอง 30 ชิ้น', description_en: '30 Gold Giftpack', bonus_breakdown: { webshop_bonus_gold_max: 6, webshop_bonus_gold_min: 3 } })
    expect(by(r, 'com.webshop.th.parent.30').bonus_note).toMatch(/zgoldmolpoints/)
    const g90 = by(r, 'com.webshop.th.parent.90')
    expect(g90.price_usd).toBeNull(); expect(g90.price_usd_null_reason).toMatch(/com\.iap\.sea\.gold\.90.*not sold on App Store KH/)
    expect(by(r, 'com.card.th.gold.18')).toMatchObject({ kind: 'gold-card', price_thb: 100, baseItemAmount: 18, bonusItemAmount: 0, totalItemAmount: 18, payment_method: expect.stringMatching(/VNGGames Card/) })
    expect(by(r, 'com.web.sea.monthly.classic')).toMatchObject({ kind: 'monthly-card', item_pack: true, name: 'Classic Monthly Card', description_th: 'ใช้งานบัตรรายเดือนแบบทั่วไป',
      description_en: 'Activate Classic Monthly Card', price_thb: 175, price_usd: 6.99, duration_days: 30, contents: null })
    expect(by(r, 'com.web.sea.monthly.classic').contents_null_reason).toBeTruthy()
    const f = by(r, 'com.dream.web.firstpay')
    expect(f).toMatchObject({ kind: 'bundle', item_pack: true, name: 'Envoy’s Rebellion', name_th: 'กบฏขุนศึก', price_thb: 35, price_usd: 0.99, purchase_limit: 'Purchase Limitation: 1 time',
      description_en: 'Receive: Avatar Frame: Clean City x1, Title x1, Jade x180', description_th: 'รับทันที: กรอบโปรไฟล์-งานเลี้ยงชิงตู x1, ฉายา x1, หยก x180',
      contents: [{ item: 'Avatar Frame: Clean City', quantity: 1 }, { item: 'Title', quantity: 1 }, { item: 'Jade', quantity: 180 }] })
    expect(f.contents_th[2]).toEqual({ item: 'หยก', quantity: 180 })
    expect(by(r, 'com.dream.web.special2')).toMatchObject({ price_thb: 175, price_usd: null, contents: [{ item: 'Celestial Tome of Great Dao', quantity: 3 }, { item: 'Meow Doll', quantity: 4 }] })
    expect(by(r, 'com.dream.iap.daily.pack')).toMatchObject({ store: 'apple-app-store', kind: 'pass', item_pack: true, price_thb: 35, price_usd: 0.99,
      contents: [{ item: 'Jade', quantity: 110 }, { item: 'Fairy Meow Pack', quantity: 1 }], description_th: null })
    const w = by(r, 'com.dream.iap.weekly1.pack')
    expect(w).toMatchObject({ price_thb: 69, price_usd: null, contents: [{ item: 'Meow Doll', quantity: 1 }, { item: 'Universal Token', quantity: 1 }] }); expect(w.price_usd_null_reason).toMatch(/not sold on App Store KH/)
    for (const p of all(r)) { expect(p.prices).toEqual({ THB: p.price_thb, USD: p.price_usd }); expect(p.price_thb).toBeGreaterThan(0); if (p.price_usd === null) expect(p.price_usd_null_reason).toBeTruthy() }
    expect(all(r).map((p: any) => p.id)).toEqual(all(r).map((_: any, i: number) => i + 1))
    expect(calls.some((u) => u.includes('/us/apps/6505037845'))).toBe(true)
    expect(calls.every((u) => !/codashop|seagm|unipin|lapak|joytify|24buy|supersix/i.test(u))).toBe(true)
  })
  it('SG down -> Thai-only special packs keep Thai text, English null with reason; no USD anywhere -> null+reason', async () => {
    mock({ sg: 'down', usd: 'none' })
    const r: any = await fetchDreamAndLetheRecordPacks()
    const s = by(r, 'com.dream.web.special2')
    expect(s.name_en).toBeNull(); expect(s.name_en_null_reason).toMatch(/SG/); expect(s.description_en).toBeNull(); expect(s.contents[0]).toEqual({ item: 'ตุ๊กตาภูตเหมียว', quantity: 4 })
    expect(by(r, 'com.web.gold.6').price_usd_null_reason).toMatch(/App Store USD unavailable/)
    expect(r.notes.join(' ')).toMatch(/SG \(English\) storefront unavailable/)
  })
  it('throws on official shop failures', async () => {
    mock({ shop: 'down' }); await expect(fetchDreamAndLetheRecordPacks()).rejects.toBeInstanceOf(DreamLetheUpstreamUnavailableError)
    mock({ shop: 'nokey' }); await expect(fetchDreamAndLetheRecordPacks()).rejects.toBeInstanceOf(DreamLetheInvalidUpstreamResponseError)
    mock({ shop: 'bad' }); await expect(fetchDreamAndLetheRecordPacks()).rejects.toBeInstanceOf(DreamLetheInvalidUpstreamResponseError)
  })
  it('route: aliases work and upstream failure -> 502', async () => {
    mock({ usd: 'us' })
    for (const slug of ['dream-and-lethe-record', 'dlr']) {
      clearPacksCache()
      const res = await app.handle(new Request(`http://localhost/games/${slug}/packs/`)); expect(res.status).toBe(200)
      const b: any = await res.json(); expect(by(b, 'com.web.gold.6').price_usd_source).toMatch(/apple-app-store-us/)
    }
    mock({ shop: 'down' }); clearPacksCache()
    expect((await app.handle(new Request('http://localhost/games/dream-and-lethe-record/packs/'))).status).toBe(502)
  })
})

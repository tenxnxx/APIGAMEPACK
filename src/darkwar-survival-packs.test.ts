import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { getGameBySlug, listCanonicalGames } from './games/registry'
import { parseDwsAmount, parseDwsLocale } from './services/darkwar-survival-webshop-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'dark-war-survival') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
function mock(map: Record<string, (url: string, init?: RequestInit) => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f(url, init)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}

const SHOP = 'https://pay.darkwar-survival.com/'
const HTML = '<html><head><script type="module" crossorigin src="./assets_x/index-AbC1.js"></script></head></html>'
const MAIN = [
  'const Wh={200036:"Wisdom Medal",210874:"1m Coins","222003":"100VIP Points",270007:"Gear"},Zh={170411:"Tech Advancement",170412:"Speed",9:"Ignore"},',
  'oh="Dawn Badges",Jh={title:"Value Pass",freePass:"Free Pass",rules:{rule1:"1.Unlock",rule2:"2.Buy"},purchaseTierOnly:"Purchase grants only the selected tier\'s rewards."};',
  'const msgs={en:{ad:Hh,items:Wh,giftItem:Zh,goldBricks:oh,passport:Jh}};',
  'const loaders={th:async()=>{const[e,t]=await Promise.all([Ec(()=>import("./th-T1.js"),[],import.meta.url),Ec(()=>import("./th-T2.js"),[],import.meta.url)]);return e}};'
].join('')
const TH1 = 'const a={200036:"ตราปัญญา",210874:"1m เหรียญทอง","222003":"แต้ม VIP100",270007:"เฟือง"},b={170411:"เลื่อนขั้นเทคโนโลยี"},c="ตราแสงอรุณ",d={title:"พาสสุดคุ้ม",purchaseTierOnly:"ซื้อแล้วรับเฉพาะรางวัลระดับที่เลือก"};export default{items:a,giftItem:b,goldBricks:c,passport:d};'
const TH2 = 'const u={ok:"ตกลง"};export default{ui:u};'
const goods = (cur: 'THB' | 'USD', p: number[]) => [
  { amount: p[0], pay_brick_num: 500, free_brick_num: 25, goods_id: 'goods_499', currency: cur, currency_symbol: cur === 'THB' ? '฿' : 'US$', status: 1, limit: 2000 },
  { amount: p[1], pay_brick_num: 1000, free_brick_num: 50, goods_id: 'goods_1', currency: cur, currency_symbol: '', status: 1, limit: 1000 },
  { amount: p[2], pay_brick_num: 2000, free_brick_num: 100, goods_id: 'goods_2', currency: cur, currency_symbol: '', status: 1, limit: 500 },
  { amount: p[3], pay_brick_num: 5000, free_brick_num: 250, goods_id: 'goods_4', currency: cur, currency_symbol: '', status: 1, limit: 200 }
]
const PRODUCT = {
  mfinishtime: 1796090400, wfinishtime: 1793584800, time: 1793584800,
  wdata: [
    { id: 326000016, nameid: 170411, nameid2: null, rate: '6250%', goods_id: 'goods_1', vipscore: 1000, count: 1, type: 'week', goods: [{ id: '200036', num: '2K' }, { id: '210874', num: '20' }] },
    { id: 326000099, nameid: 170412, nameid2: null, rate: '900%', goods_id: 'goods_4', vipscore: 5000, count: 5, type: 'week', goods: [{ id: '999999', num: '1.5K' }] }
  ],
  mdata: [{ id: 326000010, nameid: 555, rate: '8370%', goods_id: 'goods_1', vipscore: 1000, count: 1, type: 'month', goods: [{ id: '270007', num: '100' }] }],
  ldata: []
}
const PASS = {
  code: 0, finishtime: 1794535200,
  advGoodsId: { nameid: 550504, goodsId: 'goods_2', id: '326000021', goodsList: ['222003_20'], vipscore: 2000 },
  supGoodsId: { nameid: 550505, goodsId: 'goods_4', id: '326000022', goodsList: ['222003_50'], vipscore: 5000 },
  reward: [
    { day: 1, free: { goods: [] }, adv: { goods: [{ id: '270007', num: '10' }] }, sup: { goods: [{ id: '270007', num: '25' }] } },
    { day: 2, free: { goods: [] }, adv: { goods: [{ id: '270007', num: '1K' }, { id: '200036', num: '5' }] }, sup: { goods: [{ id: '270007', num: '2K' }] } }
  ]
}
function shop(cur: 'THB' | 'USD', opts: { noProduct?: boolean } = {}) {
  const prices = cur === 'THB' ? [175, 375, 699, 1800] : [4.99, 9.99, 19.99, 49.99]
  const api: Record<string, unknown> = {
    getindex: { clientCountry: cur === 'THB' ? 'TH' : 'US' },
    getitem: { defCurrency: cur, goods: goods(cur, prices), doubleGoodsList: { goods_1: 210 } },
    getproduct: PRODUCT,
    getwarpass: PASS
  }
  return {
    [SHOP + 'assets_x/index-AbC1.js']: () => new Response(MAIN),
    [SHOP + 'assets_x/th-T1.js']: () => new Response(TH1),
    [SHOP + 'assets_x/th-T2.js']: () => new Response(TH2),
    [SHOP + 'get']: (url: string, init?: RequestInit) => {
      const name = url.slice(SHOP.length).replace('.php', '')
      if (init?.method !== 'POST') return new Response('bad', { status: 405 })
      if (opts.noProduct && name === 'getproduct') return new Response('down', { status: 500 })
      return name in api ? Response.json(api[name]) : new Response('nf', { status: 404 })
    },
    [SHOP]: () => new Response(HTML)
  }
}
const git_aliases = (): Record<string, string> => ({
  'cookierun-crumble': 'cookierun-crumble', 'cookie-run-crumble': 'cookierun-crumble', crumble: 'cookierun-crumble',
  'cookie-run-classic': 'cookierun-classic', 'clash-of-critters': 'clash-of-critters'
})
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const pid = (b: any, id: string) => all(b).find((p: any) => p.product_id === id)

describe('dark war survival (official webshop)', () => {
  it('parses amounts and locale tables', () => {
    expect(parseDwsAmount('2K')).toBe(2000)
    expect(parseDwsAmount('1.5K')).toBe(1500)
    expect(parseDwsAmount('1M')).toBe(1000000)
    expect(parseDwsAmount('20')).toBe(20)
    expect(parseDwsAmount('abc')).toBeNull()
    const d = parseDwsLocale(MAIN)
    expect(d.items['200036']).toBe('Wisdom Medal')
    expect(d.items['222003']).toBe('100VIP Points')
    expect(d.giftItem['170411']).toBe('Tech Advancement')
    expect(d.strings.goldBricks).toBe('Dawn Badges')
    expect(d.strings['passport.title']).toBe('Value Pass')
    expect(d.strings['passport.rules.rule2']).toBe('2.Buy')
  })

  it('THB webshop: Dawn Badges base+bonus(total), packs priced by goods_id tier, Thai/English names, passes; USD null with reason; aliases', async () => {
    mock(shop('THB'))
    const r = await get()
    expect(r.status).toBe(200)
    const b: any = await r.json()
    expect(b.source_mode).toBe('official-webshop')
    expect(b.official_title).toBe('Dark War: Survival')
    expect(b.game.slug).toBe('dark-war-survival')
    expect(b.source_details.client_country).toBe('TH')
    expect(b.categories.map((c: any) => c.name)).toEqual([
      'Dawn Badges (Official Webshop)', 'Value Pass (Official Webshop)', 'Weekly Packs (Official Webshop)', 'Monthly Packs (Official Webshop)'
    ])
    expect(b.summary.packCount).toBe(4 + 2 + 2 + 1)
    const g499 = pid(b, 'goods_499')
    expect(g499).toMatchObject({
      kind: 'currency', item: 'Dawn Badges', item_th: 'ตราแสงอรุณ', item_pack: false, name: '500 Dawn Badges', name_th: 'ตราแสงอรุณ 500',
      baseItemAmount: 500, bonusItemAmount: 25, totalItemAmount: 525, double_bonus_active: false,
      price: 175, currency: 'THB', prices: { THB: 175, USD: null }, price_thb: 175, price_usd: null, purchase_limit: 2000
    })
    expect(g499.price_usd_null_reason).toContain('No FX')
    expect(g499.price_usd_null_reason).toContain('login')
    // Double! promo -> bonus = base + 2 * free, as shown on the webshop
    expect(pid(b, 'goods_1')).toMatchObject({ baseItemAmount: 1000, bonusItemAmount: 1100, totalItemAmount: 2100, standard_bonus: 50, double_bonus_active: true, bonus_label: 'Double! 210%' })
    const tech = pid(b, '326000016')
    expect(tech).toMatchObject({
      kind: 'bundle', item_pack: true, name: 'Tech Advancement', name_th: 'เลื่อนขั้นเทคโนโลยี', price_tier: 'goods_1',
      price_thb: 375, price_usd: null, value_rate: '6250%', vip_points: 1000, purchase_limit: 1, purchase_limit_period: 'week',
      period_ends_at: new Date(1793584800 * 1000).toISOString()
    })
    expect(tech.contents).toEqual([
      { item_id: '200036', item: 'Wisdom Medal', item_en: 'Wisdom Medal', item_th: 'ตราปัญญา', amount: 2000, amount_text: '2K' },
      { item_id: '210874', item: '1m Coins', item_en: '1m Coins', item_th: '1m เหรียญทอง', amount: 20, amount_text: '20' }
    ])
    expect(tech.description_en).toBe('Weekly pack (limit 1): Wisdom Medal x2K, 1m Coins x20')
    expect(tech.description_th).toBe('แพ็กรายสัปดาห์ (จำกัด 1 ครั้ง): ตราปัญญา x2K, 1m เหรียญทอง x20')
    // pack whose name has no Thai text / unknown item -> nulls with reasons, price still from tier
    const speed = pid(b, '326000099')
    expect(speed).toMatchObject({ name: 'Speed', name_th: null, price_thb: 1800 })
    expect(typeof speed.name_th_null_reason).toBe('string')
    expect(speed.contents[0]).toMatchObject({ item_id: '999999', item: null, amount: 1500 })
    const month = pid(b, '326000010')
    expect(month).toMatchObject({ name: null, name_en: null, price_thb: 375, purchase_limit_period: 'month' })
    expect(typeof month.name_en_null_reason).toBe('string')
    const adv = pid(b, '326000021')
    expect(adv).toMatchObject({ kind: 'pass', item_pack: true, pass_tier: 'adv', name: 'Value Pass (paid tier 1)', name_th: 'พาสสุดคุ้ม (ระดับเสียเงิน 1)', price_thb: 699, price_usd: null, vip_points: 2000 })
    expect(adv.contents).toEqual([
      { item_id: '222003', item: '100VIP Points', item_en: '100VIP Points', item_th: 'แต้ม VIP100', amount: 20, amount_text: '20' },
      { item_id: '270007', item: 'Gear', item_en: 'Gear', item_th: 'เฟือง', amount: 1010, amount_text: '1010' },
      { item_id: '200036', item: 'Wisdom Medal', item_en: 'Wisdom Medal', item_th: 'ตราปัญญา', amount: 5, amount_text: '5' }
    ])
    expect(adv.description_en).toContain("Purchase grants only the selected tier's rewards.")
    expect(adv.description_th).toContain('พาสสุดคุ้ม')
    expect(adv.rewards_by_day).toHaveLength(2)
    expect(pid(b, '326000022')).toMatchObject({ pass_tier: 'sup', price_thb: 1800 })
    expect(pid(b, '326000022').contents.find((c: any) => c.item_id === '270007').amount).toBe(2025)
    expect(all(b).map((p: any) => p.id)).toEqual(all(b).map((_: any, i: number) => i + 1))
    for (const slug of ['darkwar-survival', 'darkwar', 'dark-war', 'dws']) {
      const a: any = await (await get(slug)).json()
      expect(a.game.slug).toBe('dark-war-survival')
      expect(a.summary.packCount).toBe(9)
    }
  })

  it('existing aliases unchanged; new aliases registered', () => {
    const before = git_aliases()
    for (const [slug, gameSlug] of Object.entries(before)) expect(getGameBySlug(slug)?.slug).toBe(gameSlug)
    for (const slug of ['dark-war-survival', 'darkwar-survival', 'darkwar', 'dark-war', 'dws'])
      expect(getGameBySlug(slug)).toMatchObject({ slug: 'dark-war-survival', provider: 'darkwar-survival-webshop', appId: 6670441558 })
    expect(listCanonicalGames().some((g: any) => g.slug === 'dark-war-survival')).toBe(true)
  })

  it('webshop served USD (host outside Thailand): USD from the webshop, THB null with reason', async () => {
    mock(shop('USD'))
    const b: any = await (await get()).json()
    const g = pid(b, 'goods_499')
    expect(g).toMatchObject({ price: 4.99, currency: 'USD', price_usd: 4.99, price_thb: null, totalItemAmount: 525 })
    expect(g.price_thb_null_reason).toContain('No FX')
    expect(pid(b, '326000016')).toMatchObject({ price_usd: 9.99, price_thb: null })
    expect(b.sources).toEqual({ thb: null, usd: SHOP })
  })

  it('pack list down -> Dawn Badges still listed with a warning', async () => {
    mock(shop('THB', { noProduct: true }))
    const b: any = await (await get()).json()
    expect(b.source_mode).toBe('official-webshop')
    expect(all(b).filter((p: any) => p.kind === 'bundle')).toHaveLength(0)
    expect(b.warnings[0]).toContain('getproduct.php')
  })

  it('webshop down -> App Store TH product page fallback (THB), USD null with reason', async () => {
    const html = `<html><script type="application/json">${JSON.stringify({ data: [{ shelfMapping: { information: { items: [{ title: 'In-App Purchases', items: [{ textPairs: [['Resource Hot Sale 1', '\u0E3F35.00'], ['Resource Hot Sale 2', '\u0E3F179.00']] }] }] } } }] })}</script></html>`
    mock({ 'https://apps.apple.com/th/': () => new Response(html), [SHOP]: () => new Response('down', { status: 503 }) })
    const b: any = await (await get()).json()
    expect(b.source_mode).toBe('appstore-product-page')
    expect(all(b)).toHaveLength(2)
    expect(all(b)[0]).toMatchObject({ name: 'Resource Hot Sale 1', price_thb: 35, price_usd: null, item_pack: true })
    expect(typeof all(b)[0].price_usd_null_reason).toBe('string')
    expect(b.webshop_error).toContain('HTTP 503')
  })

  it('502 when everything is down; 502 invalid when nothing parseable', async () => {
    globalThis.fetch = (async () => { throw new Error('network') }) as unknown as typeof fetch
    let r = await get()
    expect(r.status).toBe(502)
    expect(await r.json()).toEqual({ error: 'Upstream service unavailable' })
    globalThis.fetch = (async () => new Response('{"goods":[]}', { status: 200 })) as unknown as typeof fetch
    r = await get()
    expect(r.status).toBe(502)
    expect(await r.json()).toEqual({ error: 'Invalid upstream response' })
  })
})

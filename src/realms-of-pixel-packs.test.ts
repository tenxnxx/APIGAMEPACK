import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchRealmsOfPixelPacks, matchRopApple, parseRopWebProducts,
  RealmsOfPixelInvalidUpstreamResponseError, RealmsOfPixelUpstreamUnavailableError
} from './services/realms-of-pixel-packs.service'

const NOW = 1793174697
const wp = (n: number, pid: string, usd: number, base: number, bonus: number, extra: Record<string, unknown> = {}) => ({
  id: n, game_code: 'pixelrealms', amount: usd, currency: 'USD', product_id: pid, product_title: 'Token', product_num: base,
  sub_product_title: '+ Token', sub_product_num: bonus, status: '1', free: 0, buy_limit: 1, open_time: 1738339200, close_time: 2147483647,
  country_price: { amount: usd, symbol: '$', currency: 'USD', country_code_short: 'DEFAULT' }, product_logo: 'https://img/t.png', ...extra
})
const web = {
  gameCode: 'pixelrealms',
  products: [
    wp(1, 'com.realmsofpixel.ng.web.1', 4.99, 499, 25, { close_time: 1888070400 }),
    wp(1, 'com.realmsofpixel.ng.web.1', 4.99, 499, 25),
    wp(2, 'com.realmsofpixel.ng.web.2', 14.99, 1499, 75),
    wp(3, 'com.realmsofpixel.ng.web.3', 1, 1, 0, { free: 1 }),
    wp(4, 'com.realmsofpixel.ng.web.4', 9, 9, 0, { close_time: NOW - 10 }),
    wp(5, 'com.realmsofpixel.ng.web.5', 9, 9, 0, { status: '0' })
  ]
}
const item = (id: string, name: string, price: number, cur: string, offerName: string, desc?: string) => ({
  id, attributes: { name, offerName, isFamilyShareable: false, ...(desc ? { description: { standard: desc } } : {}), offers: [{ price, priceFormatted: String(price), currencyCode: cur }] }
})
const thEn = [
  item('6748904475', 'US$ 0.99 Value Pack', 29, 'THB', 'com.realmsofpixel.ng.sea.60', 'Recharge to get US$ 0.99 Value Pack'),
  item('6748907097', 'US$ 8.99 Value Pack', 269, 'THB', 'com.realmsofpixel.ng.sea.600', 'Recharge to get US$ 8.99 Value Pack'),
  item('6000000001', 'Name Trap', 35, 'THB', 'com.realmsofpixel.ng.sea.thonly')
]
const thTh = [
  item('6748904475', 'US$ 0.99 TH', 29, 'THB', 'com.realmsofpixel.ng.sea.60', 'TH desc 0.99'),
  item('6748907097', 'US$ 8.99 TH', 269, 'THB', 'com.realmsofpixel.ng.sea.600')
]
const kh = [
  item('6748904475', 'US$ 0.99 Value Pack', 0.99, 'USD', 'com.realmsofpixel.ng.sea.60'),
  item('6748907097', 'US$ 8.99 Value Pack', 9.99, 'USD', 'com.realmsofpixel.ng.sea.600'),
  item('6999999999', 'Name Trap', 0.29, 'USD', 'com.realmsofpixel.ng.sea.other')
]

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
const seen: string[] = []
function mock(o: { webStatus?: number; webBody?: unknown; appleDown?: boolean; usSold?: boolean } = {}) {
  seen.length = 0
  globalThis.fetch = (async (input: any, init?: any) => {
    const u = String(input); seen.push(u)
    const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    if (u.includes('pay-pixelrealms.novasonicgames.com/api/pixelrealms/product/list')) {
      const ci = JSON.parse(new Headers(init?.headers).get('client-info') ?? '{}')
      if (ci.gameCode !== 'pixelrealms') return j({ products: [] })
      return j(o.webBody ?? web, o.webStatus ?? 200)
    }
    if (u.includes('apps.apple.com/api')) {
      if (o.appleDown) return j({}, 503)
      if (!u.includes('offset=0')) return j({ data: [] })
      if (u.includes('/catalog/th/')) return j({ data: u.includes('l=th') ? thTh : thEn })
      if (u.includes('/catalog/us/')) return o.usSold ? j({ data: kh.map((x) => ({ ...x, id: x.id })) }) : j({ errors: [{ status: '404' }] }, 404)
      if (u.includes('/catalog/kh/')) return j({ data: kh })
    }
    return j({}, 404)
  }) as typeof fetch
}
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const pid = (b: any, id: string) => all(b).find((p: any) => p.product_id === id)

describe('Realms of Pixel parsers', () => {
  it('web products: active paid only, deduped, USD only (THB null)', () => {
    const r = parseRopWebProducts(web, NOW)
    expect(r.map((p) => p.product_id)).toEqual(['com.realmsofpixel.ng.web.1', 'com.realmsofpixel.ng.web.2'])
    expect(r[0]).toMatchObject({ base: 499, bonus: 25, usd: 4.99, thb: null, available_until: new Date(1888070400 * 1000).toISOString() })
    expect(r[1].available_until).toBeNull()
  })
  it('web products: THB only when the official country price is THB', () => {
    const r = parseRopWebProducts({ products: [wp(1, 'x', 4.99, 1, 0, { country_price: { amount: 149, currency: 'THB' } })] }, NOW)
    expect(r[0]).toMatchObject({ thb: 149, usd: 4.99 })
  })
  it('bad shape throws', () => {
    expect(() => parseRopWebProducts({ code: 0 }, NOW)).toThrow(RealmsOfPixelInvalidUpstreamResponseError)
  })
  it('matchRopApple uses offerName or item id, never name', () => {
    const rows = [{ id: '1', name: 'Same', price: 1, priceFormatted: '1', currency: 'USD', offerName: 'a' }]
    expect(matchRopApple(rows, { offerName: 'a' })?.row.id).toBe('1')
    expect(matchRopApple(rows, { offerName: 'b', id: '1' })?.by).toBe('item 1')
    expect(matchRopApple(rows, { offerName: 'zz' })).toBeNull()
  })
})

describe('fetchRealmsOfPixelPacks', () => {
  it('web Token packs: base + bonus (total), USD official, THB null with reason', async () => {
    mock()
    const b: any = await fetchRealmsOfPixelPacks({ now: NOW })
    const p = pid(b, 'com.realmsofpixel.ng.web.1')
    expect(p).toMatchObject({ baseItemAmount: 499, bonusItemAmount: 25, totalItemAmount: 524, price_usd: 4.99, price_thb: null, item_pack: false, currency: 'USD' })
    expect(p.price_thb_null_reason).toContain('USD only')
    expect(typeof p.description_en_null_reason).toBe('string')
    expect(seen.some((u) => u.includes('/catalog/us/'))).toBe(true)
  })
  it('App Store Value Packs: THB TH, USD KH when US not sold, Thai name/desc, item_pack', async () => {
    mock()
    const b: any = await fetchRealmsOfPixelPacks({ now: NOW })
    const p = pid(b, 'com.realmsofpixel.ng.sea.60')
    expect(p).toMatchObject({
      price_thb: 29, price_usd: 0.99, item_pack: true, baseItemAmount: null, name_th: 'US$ 0.99 TH', description_th: 'TH desc 0.99',
      description_en: 'Recharge to get US$ 0.99 Value Pack', apple_item_id: '6748904475'
    })
    expect(p.description).toBe('TH desc 0.99 / Recharge to get US$ 0.99 Value Pack')
    expect(p.price_usd_source).toContain('apple-app-store-kh')
    const p2 = pid(b, 'com.realmsofpixel.ng.sea.600')
    expect(p2.price_usd).toBe(9.99)
    expect(p2.description_th).toBeNull()
    expect(typeof p2.description_th_null_reason).toBe('string')
    const trap = pid(b, 'com.realmsofpixel.ng.sea.thonly')
    expect(trap.price_usd).toBeNull()
    expect(typeof trap.price_usd_null_reason).toBe('string')
  })
  it('uses App Store US first when the app is sold there', async () => {
    mock({ usSold: true })
    const b: any = await fetchRealmsOfPixelPacks({ now: NOW })
    expect(pid(b, 'com.realmsofpixel.ng.sea.60').price_usd_source).toContain('apple-app-store-us')
    expect(seen.some((u) => u.includes('/catalog/kh/'))).toBe(false)
  })
  it('Apple down -> official web packs still served', async () => {
    mock({ appleDown: true })
    const b: any = await fetchRealmsOfPixelPacks({ now: NOW })
    expect(all(b).length).toBe(2)
    expect(b.notes.join(' ')).toContain('App Store TH')
  })
  it('web down -> App Store packs still served', async () => {
    mock({ webStatus: 503 })
    const b: any = await fetchRealmsOfPixelPacks({ now: NOW })
    expect(pid(b, 'com.realmsofpixel.ng.sea.60').price_thb).toBe(29)
    expect(b.notes.join(' ')).toContain('Official web store')
  })
  it('both down -> upstream error', async () => {
    mock({ webStatus: 503, appleDown: true })
    await expect(fetchRealmsOfPixelPacks({ now: NOW })).rejects.toThrow(RealmsOfPixelUpstreamUnavailableError)
  })
  it('both bad -> invalid response error', async () => {
    mock({ webBody: { nope: 1 }, appleDown: true })
    await expect(fetchRealmsOfPixelPacks({ now: NOW })).rejects.toThrow(RealmsOfPixelInvalidUpstreamResponseError)
  })
})

import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchGhostSoulMPacks, parseGhostSoulMProducts, ghostSoulMCurrency, ghostSoulMText, GHOSTSOULM_PASS_RE,
  GhostSoulMInvalidUpstreamResponseError, GhostSoulMUpstreamUnavailableError
} from './services/ghost-soul-m-packs.service'

const NOW = Date.parse('2026-10-29T10:00:00Z')
const cat = (id: string, name: string) => ({ _id: id, name })
const C = { anni: cat('a1', 'โปรโมชั่นครบรอบ 1 ปี'), value: cat('v1', 'แพ็กสุดคุ้ม [ใหม่]'), ruby: cat('r1', 'เพชรแดง'), gold: cat('g1', 'เหรียญทอง') }
const pr = (code: string, name: string, price: number, category: any, description: string, more: Record<string, unknown> = {}) => ({
  _id: 'id_' + code, countryCode: 'TH', productCode: `com.rgsonline.ghostsoulm.web_${code}`, productName: name, sellPrice: price, basePrice: price,
  currencyCode: 'THB', thumbnailUrl: `https://cdn/${code}.png`, description, eventText: '', category, availableFrom: '2026-01-01T00:00:00.000Z', availableTo: null,
  limitType: 'NONE', limitValue: 0, frequency: 'NONE', productType: 'NORMAL', isHot: false, ...more
})
const products = () => [
  pr('0011', 'เพชรแดง 1,000 +100', 499, C.ruby, '<p>เพชรแดง 1,000 รับเพิ่ม 100</p>', { eventText: '<p>ราคาเต็ม ฿549</p>' }),
  pr('0008', 'เพชรแดง 150 +15', 79, C.ruby, '<p>เพชรแดง 150 รับเพิ่ม 15</p>'),
  pr('11141', '1stAnni RedDiamond XXL', 2499, C.anni, '<p>เพชรแดง 5,000+5,000 เม็ด</p>', { limitType: 'ACCOUNT', limitValue: 1, availableTo: '2026-11-02T17:00:00.000Z' }),
  pr('0004', 'ทอง 120,000', 39, C.gold, '<p>ทอง 120,000</p>'),
  pr('11097', 'แพ็กเกจตั๋วพรีเมี่ยม 7 วัน', 149, C.value, '<p>ตั๋วพรีเมี่ยม 7 วัน x1<br>เพชรแดง x100</p>'),
  pr('11098', 'แพ็กเกจตั๋วซูเปอร์พรีเมี่ยม 30 วัน', 499, C.value, '<p>ตั๋วซูเปอร์พรีเมี่ยม 30 วัน x1</p><p>เพชรแดง x500</p>', { limitType: 'ACCOUNT', limitValue: 1, frequency: 'MONTHLY' }),
  pr('11022', 'ตั๋วย้ายฝ่าย', 399, C.value, '<p>ตั๋วย้ายฝ่าย x1</p>'),
  pr('11080', 'คัมภีร์เติบโต [120+]', 299, C.value, '<p>คัมภีร์เติบโต x1</p>'),
  pr('9001', 'Ended pack', 99, C.value, '<p>x</p>', { availableTo: '2026-10-01T00:00:00.000Z' }),
  pr('9002', 'Future pack', 99, C.value, '<p>x</p>', { availableFrom: '2026-12-01T00:00:00.000Z' }),
  pr('9003', 'USD pack', 1.99, C.value, '<p>x</p>', { currencyCode: 'USD' })
]
const ok = (data: any[]) => ({ status: true, error_code: 0, error_message: 'Success', data })
const ai = (id: string, name: string, price: number, offer: string, desc = name) => ({
  id, attributes: { name, offerName: offer, isFamilyShareable: false, description: { standard: desc }, offers: [{ price, priceFormatted: String(price), currencyCode: 'THB' }] }
})
const appleTh = [
  ai('1', 'เพชรแดง 1000', 499, 'com.rgsonline.ghostsoulm.ruby_3004'), ai('2', 'เพชรแดง 5000', 2490, 'com.rgsonline.ghostsoulm.ruby_3006'),
  ai('3', 'แพ็กเกจตลาดซื้อขาย', 129, 'com.rgsonline.ghostsoulm.market_ticket', 'บัตรผ่านสำหรับเข้าตลาดซื้อขายถาวร'),
  ai('4', 'แพ็กเกจพิเศษรายวัน', 79, 'com.rgsonline.ghostsoulm.package_10029')
]

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
function mock(o: { shop?: number; body?: any; th?: number; cats?: number } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: any) => {
    const url = String(input); calls.push(url)
    const j = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    if (url.includes('webshop-api.rgsgame.com') && url.includes('/products/category')) return o.cats ? j({}, o.cats) : j(ok([{ ...C.ruby, displayOrder: 3 }, { ...C.value, displayOrder: 2 }]))
    if (url.includes('webshop-api.rgsgame.com')) return o.shop ? j({}, o.shop) : j(o.body ?? ok(url.includes('countryCode=TH') ? products() : []))
    if (url.includes('/th/apps/')) return o.th ? j({}, o.th) : j({ data: /offset=[1-9]/.test(url) ? [] : appleTh })
    return j({}, 404)
  }) as any
  return calls
}
const all = (r: any) => r.categories.flatMap((c: any) => c.packs)
const by = (r: any, code: string) => all(r).find((p: any) => String(p.product_id).endsWith(code))

describe('ghost soul m parsers', () => {
  it('parses currency names and descriptions', () => {
    expect(ghostSoulMCurrency('เพชรแดง 1,000 +100', [])).toMatchObject({ item: 'Red Diamonds', base: 1000, bonus: 100, from: 'name' })
    expect(ghostSoulMCurrency('1stAnni RedDiamond L', ['เพชรแดง 1,000+1,000 เม็ด'])).toMatchObject({ base: 1000, bonus: 1000, from: 'description' })
    expect(ghostSoulMCurrency('ทอง 2,400,000', [])).toMatchObject({ item: 'Gold', base: 2400000, bonus: 0 })
    expect(ghostSoulMCurrency('แพ็กเกจทหาร', ['กล่อง ×1', 'เพชรแดง ×2,000'])).toBeNull()
    expect(ghostSoulMText('<p>a&nbsp;b<br/>c</p><p>d</p>')).toEqual(['a b', 'c', 'd'])
  })
  it('keeps on-sale THB products only', () => {
    const r = parseGhostSoulMProducts(ok(products()), NOW)
    expect(r.products.length).toBe(8)
    expect(r.skipped.join()).toContain('Ended pack (ended)')
    expect(r.skipped.join()).toContain('Future pack (not yet on sale)')
    expect(r.skipped.join()).toContain('USD pack (USD)')
    expect(() => parseGhostSoulMProducts({ status: false })).toThrow(GhostSoulMInvalidUpstreamResponseError)
  })
  it('matches pass names', () => {
    for (const n of ['แพ็กเกจตั๋วพรีเมี่ยม 7 วัน', 'แพ็กเกจตั๋วอัลตร้าพรีเมี่ยม 30 วัน', 'บัตรผ่านสำหรับเข้าตลาด', 'com.x.market_ticket']) expect(GHOSTSOULM_PASS_RE.test(n)).toBe(true)
    expect(GHOSTSOULM_PASS_RE.test('ตั๋วย้ายฝ่าย')).toBe(false)
  })
})

describe('fetchGhostSoulMPacks', () => {
  it('builds THB packs from the official RGS webshop, USD null with reason', async () => {
    const calls = mock()
    const r: any = await fetchGhostSoulMPacks({ now: NOW })
    expect(calls.some((u) => u.includes('webshop-api.rgsgame.com/v1/webshop/payment/products?clientId=6c37-54fd-4e53-eef8&countryCode=TH'))).toBe(true)
    expect(calls.some((u) => /codashop|seagm|unipin/i.test(u))).toBe(false)
    expect(r.game.slug).toBe('ghost-soul-m')
    expect(r.summary.packCount).toBe(9)
    expect(r.categories.map((c: any) => c.name)).toEqual([
      'Red Diamonds (เพชรแดง; Official RGS Webshop TH)', 'Gold (ทอง; Official RGS Webshop TH)',
      'Passes (Premium tickets; Official RGS Webshop TH + App Store TH)', 'แพ็กสุดคุ้ม [ใหม่] (Item Packs; Official RGS Webshop TH)'
    ])
    const rd = by(r, 'web_0011')
    expect(rd).toMatchObject({ kind: 'currency', item_pack: false, baseItemAmount: 1000, bonusItemAmount: 100, totalItemAmount: 1100, price_thb: 499, price_usd: null, original_price_thb: 549, appstore_th_price_thb: 499 })
    expect(Object.keys(rd.prices)).toEqual(['THB', 'USD'])
    expect(rd.price_usd_null_reason).toContain('HTTP 404')
    const anni = by(r, 'web_11141')
    expect(anni).toMatchObject({ baseItemAmount: 5000, bonusItemAmount: 5000, totalItemAmount: 10000, price_thb: 2499, purchase_limit: '1 per account', limited_time: true, appstore_th_price_thb: null })
    expect(by(r, 'web_0004')).toMatchObject({ item_name: 'Gold', baseItemAmount: 120000, bonusItemAmount: 0, totalItemAmount: 120000, price_thb: 39 })
    expect(by(r, 'web_11097')).toMatchObject({ kind: 'pass', item_pack: true, pack_type: 'weekly-pass', description: 'ตั๋วพรีเมี่ยม 7 วัน x1 / เพชรแดง x100' })
    expect(by(r, 'web_11098')).toMatchObject({ pack_type: 'monthly-pass', purchase_limit: '1 per account (monthly)' })
    expect(by(r, 'market_ticket')).toMatchObject({ kind: 'pass', item_pack: true, store: 'apple-app-store', price_thb: 129, price_usd: null, pack_type: 'marketplace-pass' })
    expect(by(r, 'package_10029')).toBeUndefined()
    expect(by(r, 'web_11080')).toMatchObject({ kind: 'bundle', item_pack: true, pack_type: 'growth-scroll', description: 'คัมภีร์เติบโต x1' })
    for (const p of all(r)) {
      for (const k of ['thb', 'usd']) if (p[`price_${k}`] === null) expect(p[`price_${k}_null_reason`]).toBeTruthy()
      if (p.item_pack) expect(p.description).toBeTruthy()
    }
  })
  it('works without App Store data or categories', async () => {
    mock({ th: 503, cats: 503 })
    const r: any = await fetchGhostSoulMPacks({ now: NOW })
    expect(r.summary.packCount).toBe(8)
    expect(by(r, 'web_0011').appstore_th_price_thb).toBeNull()
    expect(r.notes.join()).toContain('App Store TH (Thai)')
  })
  it('throws on upstream failures', async () => {
    mock({ shop: 503 })
    await expect(fetchGhostSoulMPacks({ now: NOW })).rejects.toBeInstanceOf(GhostSoulMUpstreamUnavailableError)
    mock({ body: ok([]) })
    await expect(fetchGhostSoulMPacks({ now: NOW })).rejects.toBeInstanceOf(GhostSoulMInvalidUpstreamResponseError)
    mock({ body: '<html>' as any })
    await expect(fetchGhostSoulMPacks({ now: NOW })).rejects.toBeInstanceOf(GhostSoulMInvalidUpstreamResponseError)
  })
})

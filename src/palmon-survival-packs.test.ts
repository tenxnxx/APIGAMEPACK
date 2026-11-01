import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { palmonContents, palmonCurrency, palmonFillOtherCurrency, palmonLine, stripHtml } from './services/palmon-survival-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'palmon-survival') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
function mock(map: Record<string, (url: string) => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f(url)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const STORE = 'https://global-api.plutomall.com/webpay/product/guestProducts'
const sp = (id: string, price: number, cur: string, base: number, bonus: number, th: boolean) => ({
  productId: id, productType: 1, isLimit: false, currency: cur, price, bonusNum: bonus,
  staticConfig: JSON.stringify(th
    ? { category: 'voucher', name: `${base} บัตรกำนัลพรีเมียม`, summary: `Bonus บัตรกำนัลพรีเมียม x${bonus}`, description: `<p><b>สิ่งที่อยู่ในแพ็ก:</b><br><br>${base} บัตรกำนัลพรีเมียม<br><br><b>ของขวัญพิเศษ:</b><br><br>${bonus} บัตรกำนัลพรีเมียม</p>` }
    : { category: 'voucher', name: `${base} Premium Voucher`, summary: `Bonus Premium Voucher × ${bonus}`, description: `<p><b>Pack Contains:</b><br><br>${base} Premium Voucher<br><br><b>Special Gift:</b><br><br>${bonus} Premium Voucher</p>` })
})
const store = (cur: string, prices: [number, number]) => (url: string) => {
  const th = /language=th/.test(url)
  return Response.json({ code: 0, data: { currency: cur, productList: [sp('webstore.package.t1', prices[0], cur, 99, 5, th), sp('webstore.package.t1000', prices[1], cur, 99999, 5000, th)] } })
}
const P = 'com.funfizz.palmon.package.'
const row = (id: string, offer: string, name: string, price: number, cur: 'THB' | 'USD') => ({
  id, type: 'in-apps', attributes: { name, offerName: P + offer, description: { standard: name }, offers: [{ currencyCode: cur, price, priceFormatted: String(price) }] }
})
const TH = [row('11', 't1', '$0.99 Pack', 35, 'THB'), row('12', 't150', '$149.99 Pack', 4990, 'THB')]
const US = [row('11', 't1', '$0.99 Pack', 0.99, 'USD')]
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
const apple = { [API + 'th/']: page(TH), [API + 'us/']: page(US), [API + 'kh/']: page([]), [API + 'la/']: page([]), [API + 'mm/']: page([]) }
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const by = (b: any, id: string) => all(b).find((p: any) => p.product_id === id)

describe('Palmon: Survival (Lilith Store + App Store official)', () => {
  it('parses the official store fields', () => {
    expect(palmonCurrency('THA(THB)')).toEqual({ region: 'THA', code: 'THB' })
    expect(palmonCurrency('USA(USD)')).toEqual({ region: 'USA', code: 'USD' })
    expect(palmonLine('9999 Premium Voucher')).toEqual({ amount: 9999, item: 'Premium Voucher' })
    expect(palmonContents(stripHtml('<p><b>Pack Contains:</b><br><br>99 Premium Voucher<br><br><b>Special Gift:</b><br><br>5 Premium Voucher</p>'))).toEqual([
      { amount: 99, item: 'Premium Voucher' },
      { item: 'Premium Voucher (Special Gift)', amount: 5 }
    ])
  })

  it('THB from the Lilith Store (Thai region) with base+bonus, plus the App Store list; aliases resolve', async () => {
    mock({ [STORE]: store('THA(THB)', [35, 34900]), ...apple })
    for (const slug of ['palmon-survival', 'palmon', 'palmonsurvival']) {
      const res = await get(slug)
      expect(res.status).toBe(200)
      const b: any = await res.json()
      expect(b.game.slug).toBe('palmon-survival')
      expect(b.summary.packCount).toBe(4)
    }
    const b: any = await (await get()).json()
    expect(b.source_mode).toBe('lilith-store+appstore')
    expect(b.categories.map((c: any) => c.packCount)).toEqual([2, 2])
    const v = by(b, 'webstore.package.t1000')
    expect(v).toMatchObject({ kind: 'currency', item_pack: false, item: 'Premium Voucher', name_en: '99999 Premium Voucher', name_th: '99999 บัตรกำนัลพรีเมียม', price_thb: 34900, price_usd: null, baseItemAmount: 99999, bonusItemAmount: 5000, totalItemAmount: 104999 })
    expect(v.price_usd_null_reason).toMatch(/top out at THB 4990/)
    expect(v.price_usd_null_reason).toMatch(/no FX conversion/)
    expect(v.description_th).toContain('ของขวัญพิเศษ')
    // THB 35 voucher = App Store TH tier t1 (THB 35) -> same Apple item on App Store US = USD 0.99
    const t1 = by(b, 'webstore.package.t1')
    expect(t1).toMatchObject({ price_thb: 35, price_usd: 0.99, prices: { THB: 35, USD: 0.99 } })
    expect(t1.price_usd_null_reason).toBeUndefined()
    expect(t1.price_thb_source).toContain('lilith-store')
    expect(t1.price_usd_source).toContain('apple-app-store-us (item 11)')
    expect(t1.price_usd_match).toMatchObject({ method: 'identical-store-currency-price', store_currency: 'THB', store_price: 35, apple_product_id: P + 't1' })
    expect(Object.keys(t1).indexOf('price_thb')).toBeLessThan(Object.keys(t1).indexOf('price_usd'))
    expect(by(b, P + 't1')).toMatchObject({ kind: 'bundle', item_pack: true, price_thb: 35, price_usd: 0.99, contents: null, name_th: null })
    expect(by(b, P + 't150').price_usd_null_reason).toMatch(/no FX conversion/)
  })

  it('store serving USD (non-Thai region): USD kept, THB from the App Store TH tier with the identical USD price', async () => {
    mock({ [STORE]: store('USA(USD)', [0.99, 999.99]), ...apple })
    const b: any = await (await get()).json()
    const v = by(b, 'webstore.package.t1')
    expect(v).toMatchObject({ price_thb: 35, price_usd: 0.99, prices: { THB: 35, USD: 0.99 }, baseItemAmount: 99, bonusItemAmount: 5, totalItemAmount: 104 })
    expect(v.price_thb_source).toContain('apple-app-store-th')
    expect(v.price_usd_source).toContain('lilith-store')
    expect(v.price_thb_null_reason).toBeUndefined()
    const big = by(b, 'webstore.package.t1000')
    expect(big).toMatchObject({ price_thb: null, price_usd: 999.99 })
    expect(big.price_thb_null_reason).toMatch(/No App Store tier is priced USD 999.99/)
  })

  it('no exact tier / ambiguous tiers / App Store down -> null with reason (no FX)', () => {
    const sp2 = (price: number): any => ({ product_id: 'w', price, price_thb: price, price_usd: null, prices: { THB: price, USD: null }, price_usd_null_reason: 'x' })
    const tier = (id: string, thb: number, usd: number | null) => ({ product_id: id, apple_item_id: id, name: id, price_thb: thb, price_usd: usd, price_usd_source: 'apple-app-store-us (item ' + id + ')' })
    const a = sp2(349), b = sp2(99), c = sp2(35), d = sp2(35)
    palmonFillOtherCurrency([a, b, c], [tier('t1', 35, 0.99), tier('t3', 99, 2.99), tier('t3b', 99, 3.49), tier('t10', 399, 9.99)], 'THA(THB)')
    expect(a.price_usd).toBeNull()
    expect(a.price_usd_null_reason).toMatch(/No App Store tier is priced THB 349.*differs from every Apple tier/)
    expect(b.price_usd).toBeNull()
    expect(b.price_usd_null_reason).toMatch(/2 App Store tiers share THB 99 but have different USD prices/)
    expect(c.price_usd).toBe(0.99)
    palmonFillOtherCurrency([d], null, 'THA(THB)', 'HTTP 503')
    expect(d.price_usd).toBeNull()
    expect(d.price_usd_null_reason).toMatch(/unavailable \(HTTP 503\)/)
  })

  it('store down -> App Store only; everything down -> 502', async () => {
    mock({ ...apple })
    const res = await get()
    expect(res.status).toBe(200)
    const b: any = await res.json()
    expect(b.summary.packCount).toBe(2)
    expect(b.source_details.webshop_error).toBeTruthy()
    mock({})
    expect((await get()).status).toBe(502)
  })
})

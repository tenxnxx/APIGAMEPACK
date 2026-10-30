import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { getGameBySlug } from './games/registry'
import { dnmAppleOffer, parseDnmTitle } from './services/dnm-classic-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = () => (clearPacksCache(), app.handle(new Request('http://localhost/games/dragon-nest-m-classic/packs/')))
const g = (title: string, price: string, sku: string) => ({ id: 1, sku, title, currency: 'THB', price_local_show: price, label: { title: '' }, pay_channel_sub: [] })
const shop = { code: 0, data: { shop_info: { shelf_location: [{ title: 'Dragon Cash', goods: [g('3000+130', '175.00', 'lzgofficial.gem.pay4.99'), g('600+26', '35.00', 'lzgofficial.gem.pay0.99'), g('120000+12000', '7000.00', 'lzgofficial.gem.pay200')] }] } } }
const iap = (offerName: string, name: string, price: number, currencyCode: string) => ({
  id: offerName, attributes: { name, offerName, description: { standard: `Purchase to get ${name}` }, offers: [{ price, priceFormatted: String(price), currencyCode }] }
})
const TH = { data: [iap('lzgios.gem.pay0.99', '$0.99 Cash Pack', 35, 'THB'), iap('lzgios.gem.pay4.99', '$4.99 Cash Pack', 175, 'THB'), iap('lzgios.limit.pay1.99', '$1.99 Limited-time Pack', 69, 'THB'), iap('lzgios.limit.pay25.99', '$25.99 Limited-time Pack', 930, 'THB')] }
const KH = { data: [iap('lzgios.gem.pay0.99', '$0.99 Cash Pack', 0.99, 'USD'), iap('lzgios.gem.pay4.99', '$4.99 Cash Pack', 4.99, 'USD'), iap('lzgios.limit.pay1.99', '$1.99 Limited-time Pack', 1.99, 'USD'), iap('lzgios.limit.pay25.99', '$25.99 Limited-time Pack', 29.99, 'USD')] }
let seen: string[] = []
function mock(shopRes: () => Response, apple: Record<string, unknown> = { th: TH, kh: KH }) {
  seen = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const u = String(input)
    seen.push(u)
    if (u.startsWith('https://api.mobapay.com/api/app_shop')) return shopRes()
    const m = u.match(/catalog\/([a-z]{2})\/apps\/6743824718\/top-in-apps\?.*offset=(\d+)/)
    if (m) {
      if (m[2] !== '0') return new Response('nf', { status: 404 })
      return apple[m[1]] ? Response.json(apple[m[1]]) : new Response('nf', { status: 404 })
    }
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}

describe('dragon nest m classic', () => {
  it('helpers', () => {
    for (const s of ['dnm', 'dnmclassic', 'dragonnestmclassic', 'dnm-classic']) expect(getGameBySlug(s)?.provider).toBe('dnm-classic-mobapay')
    expect(parseDnmTitle('600+26')).toEqual({ base: 600, bonus: 26 })
    expect(parseDnmTitle('120,000 + 12,000')).toEqual({ base: 120000, bonus: 12000 })
    expect(dnmAppleOffer('lzgofficial.gem.pay0.99')).toBe('lzgios.gem.pay0.99')
  })
  it('THB + base/bonus from official Mobapay shop, USD from App Store KH by product id (US 404 -> fallback)', async () => {
    mock(() => Response.json(shop))
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game.slug).toBe('dragon-nest-m-classic')
    expect(body.summary.packCount).toBe(5)
    const ps = body.categories[0].packs
    expect(ps[0]).toMatchObject({ id: 1, name: '600+26 Cash', price_thb: 35, price_usd: 0.99, appstore_th_price_thb: 35, baseItemAmount: 600, bonusItemAmount: 26, totalItemAmount: 626, item_pack: false })
    expect(ps[0].prices).toEqual({ THB: 35, USD: 0.99 })
    expect(ps[0].price_usd_source).toContain('App Store KH')
    expect(ps[1]).toMatchObject({ price_thb: 175, price_usd: 4.99, totalItemAmount: 3130 })
    expect(ps[2]).toMatchObject({ price_thb: 7000, price_usd: null, totalItemAmount: 132000 })
    expect(ps[2].price_usd_null_reason).toContain('no App Store counterpart')
    expect(seen.some((u) => u.includes('/catalog/us/'))).toBe(true)
  })
  it('Limited-time packs: App Store TH THB + USD, item_pack true, descriptions, Apple price shown as-is', async () => {
    mock(() => Response.json(shop))
    const body = (await (await get()).json()) as any
    const lp = body.categories[1].packs
    expect(body.categories[1].name).toContain('Limited-time')
    expect(lp.map((p: any) => p.price_thb)).toEqual([69, 930])
    expect(lp[0]).toMatchObject({ item_pack: true, price_usd: 1.99, product_id: 'lzgios.limit.pay1.99', description_en: 'Purchase to get $1.99 Limited-time Pack', contents: null })
    expect(lp[0].description_th_null_reason).toBeTruthy()
    expect(lp[0].contents_null_reason).toBeTruthy()
    expect(lp[1].price_usd).toBe(29.99)
    expect(lp[1].issues[0]).toContain('$25.99')
  })
  it('App Store down: webshop still served, USD null with reason (no FX)', async () => {
    mock(() => Response.json(shop), {})
    const body = (await (await get()).json()) as any
    expect(body.summary.packCount).toBe(3)
    expect(body.categories[0].packs[0].price_usd).toBeNull()
    expect(body.categories[0].packs[0].price_usd_null_reason).toContain('App Store USD unavailable')
  })
  it('502 when shop down or bad code', async () => {
    mock(() => new Response('x', { status: 503 }))
    expect((await get()).status).toBe(502)
    mock(() => Response.json({ code: 130101, message: 'x' }))
    expect((await get()).status).toBe(502)
  })
})

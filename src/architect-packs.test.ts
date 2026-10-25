import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => {
  globalThis.fetch = originalFetch
  clearPacksCache()
})

const card = (name: string, price: string) =>
  `<a class="product-card" role="article" href="/webshop/architect/product/x"><div class="body"><p class="name">${name}</p><p class="extra-item"><span class="extra-item-value">AP +23</span></p></div><div class="footer"><span class="price">${price}</span></div></a>`
const shopHtml = card('495 Diamonds', '150 TWD') + card('7,200 Diamonds', '2,000 TWD')
const iap = (n: string, p: string) => `<div class="text-pair svelte-x"><span>${n}</span> <span>${p}</span> </div>`
const thHtml = iap('7200 Diamonds', '\u0E3F2,350.00') + iap('109 Diamonds', '\u0E3F35.00')

function mock(shop: () => Response, us: () => Response = () => new Response('nf', { status: 404 })) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('https://atshop.drimage.com/webshop/architect')) return shop()
    if (url.startsWith('https://apps.apple.com/th/')) return new Response(thHtml)
    if (url.startsWith('https://apps.apple.com/us/')) return us()
    throw new Error('unexpected fetch: ' + url)
  }) as unknown as typeof fetch
}
const get = (slug = 'architect-land-of-exiles') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))

describe('architect land of exiles', () => {
  it('web shop TWD + App Store TH THB matched by amount; USD null with reason when not on US store', async () => {
    mock(() => new Response(shopHtml))
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game.name).toBe('Architect: Land of Exiles')
    const [web, ios] = body.categories
    expect(web.packs[0]).toMatchObject({ name: '495 Diamonds', baseItemAmount: 495, store_price: 150, store_currency: 'TWD', price_thb: null, price_usd: null, extras: ['AP +23'] })
    expect(web.packs[0].price_thb_null_reason).toContain('Same pack not in App Store TH')
    expect(web.packs[1]).toMatchObject({ baseItemAmount: 7200, store_price: 2000, price_thb: 2350, price_thb_source: 'apple-app-store-th', currency: 'THB' })
    expect(web.packs[1].price_usd_null_reason).toContain('404')
    expect(ios.packs.map((p: any) => p.price_thb)).toEqual([2350, 35])
  })
  it('fills USD from App Store US when listed', async () => {
    mock(() => new Response(shopHtml), () => new Response(iap('7200 Diamonds', '$69.99')))
    const body = (await (await get('architect')).json()) as any
    expect(body.categories[0].packs[1]).toMatchObject({ price_usd: 69.99, price_usd_source: 'apple-app-store-us' })
  })
  it('fills USD from USD storefronts (KH) by name and shows item packs without amounts', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://atshop.drimage.com/')) return new Response(shopHtml)
      if (url.startsWith('https://apps.apple.com/th/')) return new Response(thHtml + iap('Summon Coupon Luck Pack_G', '\u0E3F249.00'))
      if (url.startsWith('https://apps.apple.com/kh/')) return new Response(iap('Summon Coupon Luck Pack_G', 'USD 7.99') + iap('S2 Weekly Blessing Pack_G', 'USD 24.99'))
      if (url.startsWith('https://apps.apple.com/la/')) return new Response(iap('S2 Weekly Blessing Pack_G', 'USD 24.99'))
      return new Response('nf', { status: 404 })
    }) as unknown as typeof fetch
    const body = (await (await get()).json()) as any
    const ios = body.categories[1].packs
    const luck = ios.find((p: any) => p.name === 'Summon Coupon Luck Pack_G')
    expect(luck).toMatchObject({ price_thb: 249, price_usd: 7.99, price_usd_source: 'apple-app-store-kh', item_pack: true, baseItemAmount: null })
    const s2 = ios.find((p: any) => p.name === 'S2 Weekly Blessing Pack_G')
    expect(s2).toMatchObject({ price_thb: null, price_usd: 24.99 })
    expect(s2.price_thb_null_reason).toContain('TH')
  })
  it('converts TWD web tiers with live official FX (estimated) but keeps real App Store prices', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://atshop.drimage.com/')) return new Response(shopHtml)
      if (url.startsWith('https://apps.apple.com/th/')) return new Response(thHtml)
      if (url.startsWith('https://www.cbc.gov.tw/')) return new Response('<h3>NT$/US$ Closing Rate</h3><span class="date">2026-10-22</span><span class="info"><em>30.000</em></span>')
      if (url.startsWith('https://www.ecb.europa.eu/')) return new Response("<Cube time='2026-10-23'><Cube currency='USD' rate='1.0'/><Cube currency='THB' rate='33.0'/></Cube>")
      return new Response('nf', { status: 404 })
    }) as unknown as typeof fetch
    const body = (await (await get()).json()) as any
    const [p495, p7200] = body.categories[0].packs
    expect(p495).toMatchObject({ price_usd: 5, price_usd_estimated: true, price_thb: 165, price_thb_estimated: true, fx_date: expect.stringContaining('2026-10-2') })
    expect(p495.price_thb_source).toStartWith('fx-converted (')
    expect(p495.fx_source).toContain('cbc.gov.tw')
    expect(p7200).toMatchObject({ price_thb: 2350, price_thb_source: 'apple-app-store-th', price_usd: 66.67, price_usd_estimated: true })
    expect(p7200.price_thb_estimated).toBeUndefined()
    expect(body.categories[1].packs[0].price_usd_estimated).toBeUndefined()
  })
  it('keeps THB/USD null with reason when FX fetch fails (still 200)', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://atshop.drimage.com/')) return new Response(shopHtml)
      if (url.startsWith('https://apps.apple.com/th/')) return new Response(thHtml)
      if (url.startsWith('https://www.cbc.gov.tw/')) return new Response('down', { status: 503 })
      return new Response('nf', { status: 404 })
    }) as unknown as typeof fetch
    const res = await get()
    expect(res.status).toBe(200)
    const p = ((await res.json()) as any).categories[0].packs[0]
    expect(p).toMatchObject({ price_thb: null, price_usd: null })
    expect(p.price_usd_null_reason).toContain('FX fetch failed')
    expect(p.price_thb_estimated).toBeUndefined()
  })
  it('502 when web shop is down', async () => {
    mock(() => new Response('x', { status: 503 }))
    expect((await get()).status).toBe(502)
  })
  it('502 when web shop has no products', async () => {
    mock(() => new Response('<html></html>'))
    expect((await get()).status).toBe(502)
  })
})
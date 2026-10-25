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
    expect(web.packs[0].price_thb_null_reason).toContain('No same-amount')
    expect(web.packs[1]).toMatchObject({ baseItemAmount: 7200, store_price: 2000, price_thb: 2350, price_thb_source: 'apple-app-store-th', currency: 'THB' })
    expect(web.packs[1].price_usd_null_reason).toContain('404')
    expect(ios.packs.map((p: any) => p.price_thb)).toEqual([2350, 35])
  })
  it('fills USD from App Store US when listed', async () => {
    mock(() => new Response(shopHtml), () => new Response(iap('7200 Diamonds', '$69.99')))
    const body = (await (await get('architect')).json()) as any
    expect(body.categories[0].packs[1]).toMatchObject({ price_usd: 69.99, price_usd_source: 'apple-app-store-us' })
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
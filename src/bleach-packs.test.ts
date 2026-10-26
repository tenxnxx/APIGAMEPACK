import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { bleachAmount } from './services/bleach-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => {
  globalThis.fetch = originalFetch
  clearPacksCache()
})
const iap = (n: string, p: string) => `<div class="text-pair svelte-x"><span>${n}</span> <span>${p}</span> </div>`
const get = (slug: string) => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
function mock(map: Record<string, () => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f()
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}

describe('bleach games', () => {
  it('parses base amounts', () => {
    expect(bleachAmount('585 Spirit Orbs')).toBe(585)
    expect(bleachAmount('Premium Spiritual Jade \u00D760')).toBe(60)
    expect(bleachAmount('Monthly Card Membership')).toBeNull()
  })
  it('brave souls: THB from App Store TH, USD from US by name', async () => {
    mock({
      'https://apps.apple.com/th/app/id1003168863': () => new Response(iap('585 Spirit Orbs', '\u0E3F2,990.00') + iap("Beginner's Pack 2020", '\u0E3F149.00') + iap('585 Spirit Orbs', '\u0E3F2,990.00')),
      'https://apps.apple.com/us/app/id1003168863': () => new Response(iap('585 Spirit Orbs', '$79.99') + iap('25 Spirit Orbs', '$3.99'))
    })
    const res = await get('bleach-brave-souls')
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game.name).toBe('BLEACH: Brave Souls')
    const ps = body.categories[0].packs
    expect(ps).toHaveLength(3)
    expect(ps[0]).toMatchObject({ baseItemAmount: 585, totalItemAmount: 585, price_thb: 2990, price_usd: 79.99, price_usd_source: 'apple-app-store-us', item_pack: false })
    expect(ps[1]).toMatchObject({ item_pack: true, baseItemAmount: null, price_thb: 149, price_usd: null })
    expect(ps[1].price_usd_null_reason).toContain('top 10')
    expect(ps[2]).toMatchObject({ baseItemAmount: 25, price_thb: null, price_usd: 3.99 })
    expect(ps[2].price_thb_null_reason).toContain('TH')
  })
  it('soul resonance: official nvsgames TH web shop primary (satang/100), KH USD by name', async () => {
    const nvs = { code: 0, data: { activity: [], normal: [
      { goods_type: 2, product_name: 'Premium Spiritual Jade \u00D7300', price: 17900, currency_type: 'THB', product_id: 'jade300', coins: 300, uptopresent_details: { present_coin_num: 0 }, firstsave_details: null },
      { goods_type: 1, product_name: 'Monthly Card Membership', price: 17900, currency_type: 'THB', product_id: 'mc', goods_desc: '<p>Get <b>300</b>&nbsp;Jade</p>' }
    ] } }
    mock({
      'https://pay.nvsgames.com/web/payment/app/389369/country/TH/all_goods_detail': () => Response.json(nvs),
      'https://apps.apple.com/th/app/id6745081346': () => new Response(iap('Monthly Card Membership', '\u0E3F179.00')),
      'https://apps.apple.com/kh/app/id6745081346': () => new Response(iap('Monthly Card Membership', 'USD\u00A04.99'))
    })
    const res = await get('bleach-sr')
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game.slug).toBe('bleach-soul-resonance')
    const ps = body.categories[0].packs
    expect(ps[0]).toMatchObject({ price_thb: 179, baseItemAmount: 300, bonusItemAmount: 0, totalItemAmount: 300, item_pack: false, price_usd: null })
    expect(ps[0].price_usd_null_reason).toContain('USD')
    expect(ps[1]).toMatchObject({ item_pack: true, baseItemAmount: null, price_thb: 179, price_usd: 4.99, price_usd_source: 'apple-app-store-kh', description: 'Get 300 Jade' })
  })
  it('soul resonance: 502 when web shop 503 or code!=0', async () => {
    mock({ 'https://pay.nvsgames.com/': () => new Response('x', { status: 503 }) })
    expect((await get('bleach-soul-resonance')).status).toBe(502)
    mock({ 'https://pay.nvsgames.com/': () => Response.json({ code: 1, message: 'err' }) })
    expect((await get('bleach-soul-resonance')).status).toBe(502)
  })
  it('502 when App Store TH is down or empty', async () => {
    mock({ 'https://apps.apple.com/th/': () => new Response('x', { status: 503 }) })
    expect((await get('bleach-mirrors-high')).status).toBe(502)
    mock({ 'https://apps.apple.com/th/': () => new Response('<html></html>') })
    expect((await get('bleach-mirrors-high')).status).toBe(502)
  })
})
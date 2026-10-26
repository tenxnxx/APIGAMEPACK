import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const iap = (n: string, p: string) => `<div class="text-pair svelte-x"><span>${n}</span> <span>${p}</span> </div>`
const get = () => (clearPacksCache(), app.handle(new Request('http://localhost/games/captain-tsubasa-dream-team/packs/')))
function mock(map: Record<string, () => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f()
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const modal = (id: string, h3: string, price: string, body = '') => `<div class="modal fade purchase-confirm-dialog" id="purchase-confirm-dialog-${id}" tabindex="-1">
<h3>${h3}</h3></div><div class="modal__wrap--content--body--detail--price">
  <p>
     <span>USD</span> ${price}
  </p></div>${body}`
const shop = modal('com_klab_captain283_global_dreamball_2024_tier7_01', 'Dreamball x15<br />\n<span>+ Bonus Dreamball (Free) x1 <br /> 110 TU Points</span>', '6.99')
  + modal('com_klab_pack_tier19', 'Autumn Pack', '18.99', '<li>Dreamball (Paid) x33</li><li>Dreamball (Free) x2</li>')
  + modal('com_klab_item', 'Ticket Only', '0.99')
const S = 'https://charge.tsubasa-dreamteam.com/'

describe('captain tsubasa dream team', () => {
  it('USD + base/bonus from KLab official shop, THB null with reason, App Store TH/US fallback, no conversion', async () => {
    mock({
      [S]: () => new Response(shop),
      'https://apps.apple.com/th/app/id1293738123': () => new Response(iap('Dreamballs 6', '\u0E3F149.00') + iap('Dreamball 14d Pack', '\u0E3F299.00')),
      'https://apps.apple.com/us/app/id1293738123': () => new Response(iap('Dreamballs 6', '$3.99') + iap('Beginner&#39;s Pack', '$3.99'))
    })
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game.slug).toBe('captain-tsubasa-dream-team')
    const ps = body.categories[0].packs
    expect(ps[0]).toMatchObject({ name: 'Dreamball x15', price_usd: 6.99, price_thb: null, baseItemAmount: 15, bonusItemAmount: 1, totalItemAmount: 16 })
    expect(ps[0].price_thb_null_reason).toContain('USD only')
    expect(ps[1]).toMatchObject({ name: 'Autumn Pack', price_usd: 18.99, baseItemAmount: 33, bonusItemAmount: 2, totalItemAmount: 35 })
    expect(ps[2]).toMatchObject({ name: 'Ticket Only', item_pack: true, baseItemAmount: null })
    const ap = body.categories[1].packs
    expect(ap[0]).toMatchObject({ name: 'Dreamballs 6', price_thb: 149, price_usd: 3.99, baseItemAmount: 6, bonusItemAmount: null })
    expect(ap.find((p: any) => p.name === 'Dreamball 14d Pack')).toMatchObject({ price_thb: 299, price_usd: null })
    expect(ap.find((p: any) => p.name === "Beginner's Pack")).toMatchObject({ price_thb: null, price_usd: 3.99 })
  })
  it('502 when shop down or empty', async () => {
    mock({ [S]: () => new Response('x', { status: 503 }) })
    expect((await get()).status).toBe(502)
    mock({ [S]: () => new Response('<html></html>') })
    expect((await get()).status).toBe(502)
  })
})

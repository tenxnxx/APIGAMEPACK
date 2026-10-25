import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => {
  globalThis.fetch = originalFetch
  clearPacksCache()
})

const coin = (item_id: number, amount: number, thb: number, bonus: number | undefined) => ({
  item_id,
  app_point_amount: amount,
  currency: 'THB',
  currency_amount: thb,
  original_currency_amount: thb,
  promo: bonus === undefined ? undefined : { real_promo_amount: bonus }
})
const payload = (promptpayItems: unknown[]) => ({
  app_info: { app_id: 100151 },
  channels: [
    { channel: 207269, name: 'QR Code Promptpay', currency: 'THB', visible: true, items: promptpayItems },
    // identical set -> deduped
    { channel: 207156, name: 'K PLUS', currency: 'THB', visible: true, items: promptpayItems },
    // different denominations -> own category
    { channel: 207034, name: 'True Money', currency: 'THB', visible: true, items: [coin(1, 90, 50, 5)] },
    // Shell (GS) currency -> excluded
    { channel: 207070, name: 'Shell', currency: 'GS', visible: true, items: [coin(1, 18, 1500, 1)] }
  ]
})

function mock(res: () => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('https://shop.garena.sg/api/shop/apps/channels')) return res()
    throw new Error('unexpected fetch: ' + url)
  }) as unknown as typeof fetch
}
const get = (slug = 'delta-force-garena') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))

describe('GET /games/delta-force-garena/packs/', () => {
  it('maps Garena Topup Center TH channels to base + bonus = total', async () => {
    mock(() =>
      Response.json(
        payload([
          coin(4, 300, 175, 36),
          coin(1, 18, 10, 1),
          {
            item_id: 14,
            app_point_amount: 0,
            currency: 'THB',
            currency_amount: 104,
            original_currency_amount: 104,
            app_item: { name: 'Genesis Supplies - Advanced' },
            promo: { real_promo_amount: 0 }
          }
        ])
      )
    )
    const res = await get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.game).toMatchObject({ slug: 'delta-force-garena', name: 'Delta Force (Garena)' })
    expect(body.source).toBe('https://shop.garena.sg/?app=100151')
    expect(body.categories.map((c: { name: string }) => c.name)).toEqual([
      'Delta Coin (QR Code Promptpay)',
      'Item Packages (QR Code Promptpay)',
      'Packs (True Money)'
    ])
    expect(body.categories[0].packs[0]).toMatchObject({
      name: '18 Delta Coin',
      baseItemAmount: 18,
      bonusItemAmount: 1,
      totalItemAmount: 19,
      price_thb: 10,
      price_usd: null,
      bonus_available: true,
      price_thb_source: 'garena-topup-center'
    })
    expect(body.categories[0].packs[1]).toMatchObject({ baseItemAmount: 300, bonusItemAmount: 36, totalItemAmount: 336 })
    expect(body.categories[1].packs[0]).toMatchObject({ name: 'Genesis Supplies - Advanced', price_thb: 104 })
  })

  it('alias deltaforce-garena works; missing promo -> bonus null + flag', async () => {
    mock(() => Response.json(payload([coin(1, 18, 10, undefined)])))
    const res = await get('deltaforce-garena')
    expect(res.status).toBe(200)
    const pack = (await res.json()).categories[0].packs[0]
    expect(pack).toMatchObject({ baseItemAmount: 18, bonusItemAmount: null, totalItemAmount: 18, bonus_available: false })
  })

  it('502 on network failure, non-OK, invalid or empty payload', async () => {
    globalThis.fetch = (async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    expect((await get()).status).toBe(502)
    mock(() => new Response('x', { status: 503 }))
    expect((await get()).status).toBe(502)
    mock(() => new Response('not json', { status: 200 }))
    expect((await get()).status).toBe(502)
    mock(() => Response.json({ channels: [] }))
    expect((await get()).status).toBe(502)
  })
})

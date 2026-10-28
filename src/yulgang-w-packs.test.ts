import { afterEach, describe, expect, it } from 'bun:test'
import { fetchYulgangWPacks, matchYulgangWUsd, parseYulgangWIapFromHtml } from './services/yulgang-w-packs.service'

const html = `<script type="application/json">{"x":{"title":"In-App Purchases","items_V3":[
{"leadingText":"0.99USD Pack","trailingText":"฿35.00"},
{"leadingText":"29.99USD Pack","trailingText":"฿1,100.00"},
{"leadingText":"0.99USD Pack","trailingText":"฿35.00"}]}}</script>`

describe('Yulgang W packs (App Store TH fallback)', () => {
  it('parses THB + USD from IAP pairs and dedupes', () => {
    expect(parseYulgangWIapFromHtml(html)).toEqual([
      { name: '0.99USD Pack', priceUsd: 0.99, priceThb: 35 },
      { name: '29.99USD Pack', priceUsd: 29.99, priceThb: 1100 }
    ])
  })

  it('Tael amounts are null with reasons; THB first then USD', async () => {
    const body: any = await fetchYulgangWPacks({ html })
    const p = body.categories[0].packs[1]
    expect(p).toMatchObject({ price_thb: 1100, price_usd: 29.99, baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null })
    expect(typeof p.base_null_reason).toBe('string')
    expect(typeof p.bonus_null_reason).toBe('string')
    expect(body.notes.join(' ')).toContain('efunsea')
  })

  it('throws on empty IAP section (no static catalog)', async () => {
    await expect(fetchYulgangWPacks({ html: '<html></html>' })).rejects.toThrow()
  })
})

describe('Yulgang W packs (full App Store list: TH THB + USD storefront)', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  const item = (id: string, name: string, price: number, fmt: string, cur: string, offerName: string) => ({
    id, attributes: { name, offerName, offers: [{ price, priceFormatted: fmt, currencyCode: cur }] }
  })
  const th = [
    item('6776494081', '29.99USD Pack', 1100, '฿1,100.00', 'THB', 'ae.aerxjhw.30usd.pack'),
    item('6756173057', '0.99USD Pack', 35, '฿35.00', 'THB', 'ae.aerxjhw.1usd.base'),
    item('6776607340', '0.99USD Special Pack', 35, '฿35.00', 'THB', 'ae.aerxjhw.1usd.base.efun'),
    item('6776999999', 'New Pack', 69, '฿69.00', 'THB', 'ae.aerxjhw.new')
  ]
  // KH storefront: same products in USD, different order; 'New Pack' absent.
  const kh = [
    item('6756173057', '0.99USD Pack', 0.99, '$0.99', 'USD', 'ae.aerxjhw.1usd.base'),
    item('6776607340', '0.99USD Special Pack', 0.99, '$0.99', 'USD', 'ae.aerxjhw.1usd.base.efun'),
    item('6776494081', '29.99USD Pack', 29.99, '$29.99', 'USD', 'ae.aerxjhw.30usd.pack')
  ]
  const mock = (khStatus = 200) => {
    const calls: string[] = []
    globalThis.fetch = (async (input: unknown) => {
      const url = String(input)
      calls.push(url)
      if (url.includes('/catalog/th/apps/6756002784/top-in-apps')) return Response.json({ data: th })
      if (url.includes('/catalog/kh/apps/6756002784/top-in-apps'))
        return khStatus === 200 ? Response.json({ data: kh }) : new Response('x', { status: khStatus })
      if (url.includes('/catalog/la/apps/6756002784/top-in-apps')) return new Response('x', { status: 404 })
      throw new Error('unexpected fetch: ' + url)
    }) as typeof fetch
    return calls
  }

  it('THB from App Store TH, USD from App Store KH matched by offerName; all items incl. Special Packs', async () => {
    mock()
    const body: any = await fetchYulgangWPacks()
    expect(body.summary.packCount).toBe(4)
    expect(body.categories.map((c: any) => c.name)).toEqual(['Packs', 'Special Packs'])
    const packs = body.categories[0].packs
    expect(packs.map((p: any) => p.name)).toEqual(['0.99USD Pack', 'New Pack', '29.99USD Pack'])
    expect(packs[0]).toMatchObject({
      price_thb: 35, price_usd: 0.99, prices: { THB: 35, USD: 0.99 }, product_id: 'ae.aerxjhw.1usd.base',
      apple_item_id: '6756173057', item_pack: false, baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null
    })
    expect(packs[0].price_thb_source).toContain('apple-app-store-th')
    expect(packs[0].price_usd_source).toContain('apple-app-store-kh')
    expect(packs[0].price_usd_source).toContain('offerName=ae.aerxjhw.1usd.base')
    expect(packs[2]).toMatchObject({ price_thb: 1100, price_usd: 29.99, usd_in_product_name: 29.99 })
    expect(packs[1].usd_in_product_name).toBeNull()
    expect(body.categories[1].packs[0]).toMatchObject({ name: '0.99USD Special Pack', price_thb: 35, price_usd: 0.99 })
    expect(body.sources.usd).toContain('/catalog/kh/')
  })

  it('never guesses USD from the name: unmatched item gets null USD with a reason', async () => {
    mock()
    const body: any = await fetchYulgangWPacks()
    const p = body.categories[0].packs.find((x: any) => x.name === 'New Pack')
    expect(p.price_thb).toBe(69)
    expect(p.price_usd).toBeNull()
    expect(p.prices.USD).toBeNull()
    expect(p.price_usd_source).toBeNull()
    expect(p.price_usd_null_reason).toContain('offerName')
  })

  it('USD storefronts unavailable -> USD null with reason, THB still live', async () => {
    mock(503)
    const body: any = await fetchYulgangWPacks()
    for (const c of body.categories) for (const p of c.packs) {
      expect(typeof p.price_thb).toBe('number')
      expect(p.price_usd).toBeNull()
      expect(p.price_usd_null_reason).toContain('App Store US has no Yulgang W listing')
    }
    expect(body.sources.usd).toBeNull()
  })

  it('matchYulgangWUsd falls back to Apple item id, never name', () => {
    const rows = [{ id: '1', name: 'A', price: 1, priceFormatted: '$1', currency: 'USD' }]
    expect(matchYulgangWUsd(rows, { id: '1', name: 'zzz', price: 35, priceFormatted: '฿35', currency: 'THB' })?.row.price).toBe(1)
    expect(matchYulgangWUsd(rows, { id: '2', name: 'A', price: 35, priceFormatted: '฿35', currency: 'THB' })).toBeNull()
  })
})
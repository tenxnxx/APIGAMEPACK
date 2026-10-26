import { describe, expect, it } from 'bun:test'
import { fetchYulgangWPacks, parseYulgangWIapFromHtml } from './services/yulgang-w-packs.service'

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
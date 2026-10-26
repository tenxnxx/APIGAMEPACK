import { afterEach, describe, expect, it } from 'bun:test'
import { fetchBloodStrikePacks, parseBloodStrikeBonuses, parseBloodStrikeLimitedItems } from './services/bloodstrike-packs.service'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

const lp = (thb: number, usd: number) =>
  JSON.stringify({ TH: { default: { price: thb, currency: 'THB' } }, US: { default: { price: usd, currency: 'USD' } } })
const product = (goodsid: string, en: string, usd: string, thb: number) => ({
  goodsid,
  goodsinfo: en,
  currency: 'USD',
  price: usd,
  status: 1,
  permanent_display_flag: 1,
  extra: { local_price: lp(thb, Number(usd)) },
  multi_language: { default: { 'en-US': { goodsinfo: en } } }
})
const products = {
  code: '0000',
  data: [
    product('g83naxx1ena.USD.gold5000.ally', '5000 Golds', '49.9900', 1990),
    product('g83naxx1ena.usd.399pass.ally', 'Strike Pass Elite', '3.9900', 159)
  ]
}
const activity = (goodsid: string, amount: number, extra: Record<string, unknown> = {}) => ({
  goodsid,
  activity_type: '0',
  alpha2: 'all',
  marketing_free_amount: amount,
  expired_time: 2147483647,
  ...extra
})

function mockFetch(activitys: () => Response) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/products/bloodstrike/activitys')) return activitys()
    if (url.includes('/products/bloodstrike')) return new Response(JSON.stringify(products), { status: 200 })
    throw new Error('unexpected fetch: ' + url)
  }) as unknown as typeof fetch
}

describe('Blood Strike bonus Gold', () => {
  it('parseBloodStrikeBonuses keeps active TH/all bonuses only', () => {
    const map = parseBloodStrikeBonuses(
      {
        code: '0000',
        data: {
          list: [
            activity('a', 580),
            activity('b', 10, { alpha2: 'VN' }),
            activity('c', 10, { expired_time: 1 }),
            activity('d', 0)
          ]
        }
      },
      1_000_000
    )
    expect(map && [...map]).toEqual([['a', 580]])
    expect(parseBloodStrikeBonuses({ code: '9999' })).toBeNull()
  })

  it('fills base + bonus = total from live activitys', async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ code: '0000', data: { list: [activity('g83naxx1ena.USD.gold5000.ally', 580)] } }),
          { status: 200 }
        )
    )
    const body = await fetchBloodStrikePacks()
    const gold = body.categories[0].packs[0] as unknown as Record<string, unknown>
    expect(gold).toMatchObject({
      baseItemAmount: 5000,
      bonusItemAmount: 580,
      totalItemAmount: 5580,
      bonus_available: true,
      bonus_source: 'netease-gameclub-activitys'
    })
    const pass = body.categories[1].packs[0] as unknown as Record<string, unknown>
    expect(pass).toMatchObject({ bonusItemAmount: 0, bonus_available: true })
  })

  it('bonus endpoint failure -> packs still returned, bonus null + flag', async () => {
    mockFetch(() => new Response('down', { status: 503 }))
    const body = await fetchBloodStrikePacks()
    const gold = body.categories[0].packs[0] as unknown as Record<string, unknown>
    expect(gold).toMatchObject({
      baseItemAmount: 5000,
      bonusItemAmount: null,
      totalItemAmount: 5000,
      bonus_available: false,
      bonus_source: null,
      price_thb: 1990
    })
  })
})

describe('Blood Strike limited passes & bundles', () => {
  const lim = (goodsid: string, sub: string, name: string, usd: string, thb: number, eff: number, exp: number, detail = '') => ({
    goodsid, sub_item: sub, goodsinfo: name, currency: 'USD', price: usd, status: 1, permanent_display_flag: 0,
    effective_time: eff, expired_time: exp, extra: { local_price: lp(thb, Number(usd)) },
    multi_language: { default: { default: { goodsinfo: name, goods_detail: detail + '<br />Please wait while the page is loading' } } }
  })
  const payload = { code: '0000', data: [
    product('g83naxx1ena.USD.gold100.ally', '100 Golds', '0.9900', 39),
    lim('g83us_199newbiepass', '100013', 'Level-Up Pass', '1.9900', 79, 0, 2147483647, 'Unlock Level-Up Pass'),
    lim('x.099package', '1', 'Lucky Bag Week', '0.9900', 39, 100, 2000, 'Lucky Bag Week'),
    lim('x.099package', '1', 'Lucky Bag Week', '0.9900', 39, 100, 2000, 'dup'),
    lim('x.099package', '2', 'Old Season Pass', '0.9900', 39, 100, 500),
    lim('x.099package', '3', 'Halloween Bag', '0.9900', 39, 5000, 9000),
    lim('g83us_099deal', '9', '099deal', '0.9900', 39, 0, 2147483647)
  ] }
  it('keeps active, named, deduped items; counts upcoming; skips deals and expired', () => {
    const r = parseBloodStrikeLimitedItems(payload, 1000)
    expect(r.active.map((x) => x.name)).toEqual(['Level-Up Pass', 'Lucky Bag Week'])
    expect(r.active[0]).toMatchObject({ kind: 'Pass', priceThb: 79, priceUsd: 1.99, description: 'Unlock Level-Up Pass' })
    expect(r.upcoming).toBe(1)
  })
  it('category 3 as item packs with THB+USD and null Gold amounts with reasons', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/activitys')) return new Response('down', { status: 503 })
      return new Response(JSON.stringify({ ...payload, data: payload.data.map((p: any) => ({ ...p, effective_time: p.effective_time === 100 ? 0 : p.effective_time, expired_time: p.expired_time === 2000 ? 2147483000 : p.expired_time })) }), { status: 200 })
    }) as unknown as typeof fetch
    const body = (await fetchBloodStrikePacks()) as any
    const cat = body.categories.find((c: any) => c.id === 3)
    expect(cat.name).toContain('Passes & Bundles')
    const lvl = cat.packs.find((p: any) => p.name === 'Level-Up Pass')
    expect(lvl).toMatchObject({ item_pack: true, price_thb: 79, price_usd: 1.99, baseItemAmount: null, totalItemAmount: null })
    expect(lvl.base_null_reason).toBeTruthy()
    expect(lvl.description).toContain('Unlock Level-Up Pass')
  })
})

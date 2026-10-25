import { afterEach, describe, expect, it } from 'bun:test'
import { fetchBloodStrikePacks, parseBloodStrikeBonuses } from './services/bloodstrike-packs.service'

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

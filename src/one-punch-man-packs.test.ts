import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchOnePunchManPacks, opmFunds, opmKind, opmPassType,
  OnePunchManInvalidUpstreamResponseError, OnePunchManUpstreamUnavailableError
} from './services/one-punch-man-packs.service'

const item = (id: string, name: string, price: number, cur: string, offerName: string, desc?: string) => ({
  id, attributes: { name, offerName, isFamilyShareable: false, ...(desc ? { description: { standard: desc } } : {}), offers: [{ price, priceFormatted: String(price), currencyCode: cur }] }
})
const appleTh = [
  item('1491428967', '7 Funds', 39, 'THB', 'opm_sea_ios_7', 'Purchase to get 7 Funds'),
  item('1491428951', '70 Funds', 349, 'THB', 'opm_sea_ios_70', 'Purchase to get 70 Funds'),
  item('1491321097', '7 Funds Pack', 39, 'THB', 'opm_sea_gift_001', 'Purchase to get 7 Funds Pack'),
  item('1491429281', 'Monthly Card', 349, 'THB', 'opm_sea_monthcard03'),
  item('1491429606', '2-Week Bonus', 349, 'THB', 'opm_sea_monthhalfcard01'),
  item('1491429321', 'New Recruit Pack 01', 39, 'THB', 'opm_sea_rookie01')
]
const appleThTh = [item('1491428967', '7 \u0e41\u0e1a\u0e07\u0e04\u0e4c', 39, 'THB', 'opm_sea_ios_7', '\u0e0b\u0e37\u0e49\u0e2d 7')]
const appleLa = [
  item('1491428967', '7 Funds', 0.99, 'USD', 'opm_sea_ios_7'),
  item('1491321097', '7 Funds Pack', 0.99, 'USD', 'opm_sea_gift_001'),
  item('1491429281', 'Monthly Card', 9.99, 'USD', 'opm_sea_monthcard03')
]
const appleMm = [item('1491428951', '70 Funds', 9.99, 'USD', 'opm_sea_ios_70'), item('1491429606', '2-Week Bonus', 9.99, 'SGD', 'opm_sea_monthhalfcard01')]

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
function mock(opts: { thStatus?: number; thBody?: any } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: any) => {
    const url = String(input); calls.push(url)
    const j = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    if (url.includes('/th/apps/')) {
      if (opts.thStatus) return new Response('x', { status: opts.thStatus })
      return j(opts.thBody ?? { data: url.includes('l=th') ? appleThTh : appleTh })
    }
    if (url.includes('/la/apps/')) return j({ data: appleLa })
    if (url.includes('/mm/apps/')) return j({ data: appleMm })
    return new Response('nf', { status: 404 })
  }) as any
  return calls
}
const allPacks = (r: any) => r.categories.flatMap((c: any) => c.packs)

describe('one punch man parsers', () => {
  it('classifies Funds, cards and packs; parses Funds from the name', () => {
    expect(opmKind('opm_sea_ios_70', '70 Funds')).toBe('currency')
    expect(opmKind('opm_sea_gift_009', '70 Funds Pack')).toBe('bundle')
    expect(opmKind('opm_sea_rookie01', 'New Recruit Pack 01')).toBe('bundle')
    expect(opmKind('opm_sea_monthcard03', 'Monthly Card')).toBe('pass')
    expect(opmKind('opm_sea_monthhalfcard01', '2-Week Bonus')).toBe('pass')
    expect(opmPassType('opm_sea_monthhalfcard01', '2-Week Bonus')).toBe('two-week-card')
    expect(opmPassType('opm_sea_monthcard03', 'Monthly Card')).toBe('monthly-card')
    expect(opmFunds('1,050 Funds')).toBe(1050)
    expect(opmFunds('70 Funds Pack')).toBeNull()
  })
})

describe('fetchOnePunchManPacks', () => {
  it('builds App Store TH packs with USD from LA/MM, Thai names and null reasons', async () => {
    const calls = mock()
    const r: any = await fetchOnePunchManPacks()
    expect(r.game.slug).toBe('one-punch-man-the-strongest')
    expect(r.summary.packCount).toBe(6)
    const p = allPacks(r)
    const by = (o: string) => p.find((x: any) => x.product_id === o)
    const f7 = by('opm_sea_ios_7')
    expect(f7.prices).toEqual({ THB: 39, USD: 0.99 })
    expect(f7.item_pack).toBe(false); expect(f7.baseItemAmount).toBe(7); expect(f7.bonusItemAmount).toBeNull(); expect(f7.total_null_reason).toBeTruthy()
    expect(f7.price_usd_source).toContain('apple-app-store-la')
    expect(f7.name_th).toBe('7 \u0e41\u0e1a\u0e07\u0e04\u0e4c')
    expect(f7.description).toContain('Purchase to get 7 Funds')
    expect(by('opm_sea_ios_70').price_usd_source).toContain('apple-app-store-mm')
    const card = by('opm_sea_monthcard03')
    expect(card.item_pack).toBe(true); expect(card.pass_type).toBe('monthly-card'); expect(card.prices).toEqual({ THB: 349, USD: 9.99 })
    const half = by('opm_sea_monthhalfcard01')
    expect(half.price_usd).toBeNull(); expect(half.price_usd_null_reason).toContain('USD storefronts')
    expect(by('opm_sea_gift_001').item_pack).toBe(true)
    expect(by('opm_sea_rookie01').price_usd_null_reason).toBeTruthy()
    expect(by('opm_sea_rookie01').name_th_null_reason).toBeTruthy()
    expect(calls.some((u) => u.includes('/us/apps/'))).toBe(true)
    expect(r.notes.join(' ')).toContain('Codashop')
  })
  it('throws upstream errors when App Store TH is unavailable or empty', async () => {
    mock({ thStatus: 500 })
    await expect(fetchOnePunchManPacks()).rejects.toBeInstanceOf(OnePunchManUpstreamUnavailableError)
    mock({ thBody: { data: [] } })
    await expect(fetchOnePunchManPacks()).rejects.toBeInstanceOf(OnePunchManInvalidUpstreamResponseError)
  })
})

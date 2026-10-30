import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { getGameBySlug } from './games/registry'
import {
  DragonicaLandverseInvalidUpstreamResponseError,
  DragonicaLandverseUpstreamUnavailableError,
  fetchDragonicaLandversePacks,
  parseDrlvAmounts
} from './services/dragonica-landverse-packs.service'

const product = { mcode: 'maxiongg66', maingroup: 'DRLVTH', group: 'GATTO', category: 'credit', subcategory: 'cashpoint', name: 'DRLV TOPUP PACKAGE', checkout: 'topup' }
const row = (over: Record<string, unknown>) => ({
  id: 'x', salecode: 'top0026#003', productcode: 'cas0726#001', currency: 'THB', isactive: true, islimit: false, available: 0,
  unitprice: '0', discount: '0.00', netprice: '0', unitvalue: '0', media: 'https://cdn.example/img.png', product, ...over
})
const LISTING = {
  data: [
    row({ id: 'b', title: 'DRLV COIN x9000 + 180  bonus', itemcode: 'DRLVCOIN9000', detail: 'Dragonica Landverse cash 9000 coin + 180  bonus', unitvalue: '30.00', unitprice: '1065.00', netprice: '1065.00' }),
    row({ id: 'a', title: 'DRLV COIN x3000', itemcode: 'DRLVCOIN3000', detail: 'Dragonica Landverse cash 3000 coin', unitvalue: '10.00', unitprice: '360.00', netprice: '360.00' }),
    row({ id: 'c', title: 'DRLV COIN x30000+ 1800 bonus', itemcode: 'DRLVCOIN30000', detail: 'Dragonica Landverse cash 30000 coin + 1800 bonus', unitvalue: '100.00', unitprice: '3600.00', discount: '50.00', netprice: '3550.00' }),
    row({ id: 'd', title: 'Old', itemcode: 'DRLVCOIN1', isactive: false, netprice: '1.00' })
  ],
  meta: { page: 1, take: 50, itemCount: 4, pageCount: 1 }
}

const realFetch = globalThis.fetch
let calls: string[] = []
function mock(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: any) => { const url = String(input?.url ?? input); calls.push(url); return handler(url) }) as any
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

beforeEach(() => { calls = []; clearPacksCache() })
afterEach(() => { globalThis.fetch = realFetch; clearPacksCache() })

describe('Dragonica Landverse packs', () => {
  it('parses base/bonus from official title/detail', () => {
    expect(parseDrlvAmounts('DRLV COIN x9000 + 180  bonus', 'Dragonica Landverse cash 9000 coin + 180  bonus')).toEqual({ base: 9000, bonus: 180 })
    expect(parseDrlvAmounts('DRLV COIN x30000+ 1800 bonus')).toEqual({ base: 30000, bonus: 1800 })
    expect(parseDrlvAmounts('DRLV COIN x3000', 'Dragonica Landverse cash 3000 coin')).toEqual({ base: 3000, bonus: 0 })
    expect(parseDrlvAmounts(undefined, undefined, 'DRLVCOIN15000')).toEqual({ base: 15000, bonus: 0 })
  })

  it('builds Cash packs from the official THB listing (netprice, sorted, USD null)', async () => {
    mock((url) => {
      expect(url).toContain('drlv.maxion.gg/api/payment/listing')
      expect(url).toContain('currency=THB')
      expect(url).toContain('salecode=top0026%23003')
      return json(LISTING)
    })
    const r: any = await fetchDragonicaLandversePacks()
    expect(r.game.slug).toBe('dragonica-landverse')
    expect(r.summary.packCount).toBe(3)
    const packs = r.categories[0].packs
    expect(packs.map((p: any) => p.price_thb)).toEqual([360, 1065, 3550])
    expect(packs.map((p: any) => p.id)).toEqual([1, 2, 3])
    const p2 = packs[1]
    expect([p2.baseItemAmount, p2.bonusItemAmount, p2.totalItemAmount]).toEqual([9000, 180, 9180])
    expect(p2.prices).toEqual({ THB: 1065, USD: null })
    expect(p2.price_usd_null_reason).toContain('no official USD')
    expect(p2.price_ion).toBe(30)
    expect(p2.item_pack).toBe(false)
    expect(packs[2].price_thb_list).toBe(3600)
    expect(packs[2].price_thb_discount).toBe(50)
    expect(packs[0].bonusItemAmount).toBe(0)
    expect(r.notes.join(' ')).toContain('Cash Shop')
  })

  it('throws typed errors on bad upstream', async () => {
    mock(() => new Response('x', { status: 503 }))
    await expect(fetchDragonicaLandversePacks()).rejects.toBeInstanceOf(DragonicaLandverseUpstreamUnavailableError)
    mock(() => json({ nope: 1 }))
    await expect(fetchDragonicaLandversePacks()).rejects.toBeInstanceOf(DragonicaLandverseInvalidUpstreamResponseError)
    mock(() => json({ data: [] }))
    await expect(fetchDragonicaLandversePacks()).rejects.toBeInstanceOf(DragonicaLandverseInvalidUpstreamResponseError)
  })

  it('registers aliases', () => {
    for (const s of ['dragonica-landverse', 'dragonicalandverse', 'drlv', 'dragonica-lv']) {
      expect(getGameBySlug(s)?.provider).toBe('dragonica-landverse-maxion')
    }
  })

  it('serves the route and maps upstream failure to 502', async () => {
    mock(() => json(LISTING))
    const ok = await app.handle(new Request('http://localhost/games/drlv/packs/'))
    expect(ok.status).toBe(200)
    const body: any = await ok.json()
    expect(body.summary.packCount).toBe(3)
    clearPacksCache()
    mock(() => new Response('down', { status: 500 }))
    const bad = await app.handle(new Request('http://localhost/games/dragonica-landverse/packs/'))
    expect(bad.status).toBe(502)
    expect(await bad.json()).toEqual({ error: 'Upstream service unavailable' })
  })
})

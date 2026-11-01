import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { hdBlueDiamond, hdClassify, hdContents, hdKind } from './services/hololive-dreams-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'hololive-dreams') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
function mock(map: Record<string, (url: string) => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f(url)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const P = 'hololive.dreams.com.'
const row = (id: string, offer: string, name: string, price: number, cur: 'THB' | 'USD', desc: string) => ({
  id, type: 'in-apps',
  attributes: { name, offerName: P + offer, description: { standard: desc }, offers: [{ currencyCode: cur, price, priceFormatted: (cur === 'THB' ? '\u0E3F' : '$') + price.toFixed(2) }] }
})
const items: [string, string, string, number, number | null, string][] = [
  ['1', 'con.100001', 'Blue Diamond x80', 29, 0.99, 'This gets you Blue Diamond x80.'],
  ['2', 'con.100006', 'Blue Diamond x8200', 1990, 59.99, 'This gets you Blue Diamond x8200.'],
  ['3', 'con.200002', 'Great-Value Blue Diamond x720', 99, 2.99, 'This gets you Great-Value Blue Diamond x720.'],
  ['4', 'sub.200001', 'holo Passport', 99, 2.99, 'This gets you a holo Passport.'],
  ['5', 'con.300001', 'Premium Mission Pass', 399, 11.99, 'This gets you a Premium Mission Pass.'],
  ['6', 'sub.400019', 'Usada Pekora Membership', 79, 1.99, 'This gets you a Membership for Usada Pekora.'],
  ['7', 'sub.499999', 'New Talent Membership', 79, null, 'This gets you a Membership for New Talent.']
]
const TH = items.map(([id, o, n, thb, , d]) => row(id, o, n, thb, 'THB', d))
const US = items.filter((i) => i[4] != null).map(([id, o, n, , usd, d]) => row(id, o, n, usd!, 'USD', d))
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const by = (b: any, o: string) => all(b).find((p: any) => p.product_id === P + o)

describe('hololive Dreams (App Store official)', () => {
  it('parses Blue Diamond amounts, kinds and contents from the official listing', () => {
    expect(hdBlueDiamond('Blue Diamond x8200')).toEqual({ amount: 8200, greatValue: false })
    expect(hdBlueDiamond('This gets you Great-Value Blue Diamond x12300.')).toEqual({ amount: 12300, greatValue: true })
    expect(hdBlueDiamond('holo Passport')).toBeNull()
    expect(hdKind(P + 'con.100003', 'Blue Diamond x950')).toBe('currency')
    expect(hdKind(P + 'sub.403001', 'Ayunda Risu Membership')).toBe('pass')
    expect(hdKind(P + 'con.300004', 'Premium Mission Pass')).toBe('pass')
    expect(hdKind(P + 'con.900001', 'Starter Pack')).toBe('bundle')
    expect(hdContents('This gets you a Membership for IRyS.')).toEqual([{ item: 'Membership: IRyS', amount: 1 }])
    expect(hdContents('This gets you a holo Passport.')).toEqual([{ item: 'holo Passport', amount: 1 }])
    expect(hdClassify({ productId: P + 'con.900001', nameEn: 'Starter Pack', nameTh: null, rawName: 'Starter Pack', descEn: 'Starter Pack', descTh: null }).contents).toBeNull()
  })

  it('serves THB from App Store TH and USD from App Store US -> KH/LA/MM', async () => {
    mock({ [API + 'th/']: page(TH), [API + 'us/']: page(US), [API + 'kh/']: page([]), [API + 'la/']: page([]), [API + 'mm/']: page([]) })
    for (const slug of ['hololive-dreams', 'holodori', 'holodreams']) {
      const res = await get(slug)
      expect(res.status).toBe(200)
      const b: any = await res.json()
      expect(b.game.slug).toBe('hololive-dreams')
      expect(b.summary.packCount).toBe(7)
    }
    const b: any = await (await get()).json()
    expect(b.source_mode).toBe('appstore-catalog-api')
    expect(b.publisher).toContain('QualiArts')
    expect(by(b, 'con.100006')).toMatchObject({ kind: 'currency', item_pack: false, item: 'Blue Diamond', price_thb: 1990, price_usd: 59.99, baseItemAmount: 8200, bonusItemAmount: null, totalItemAmount: null, name_th: null })
    expect(by(b, 'con.100006').bonus_null_reason).toMatch(/not assumed to be 0/)
    expect(by(b, 'con.100006').name_th_null_reason).toMatch(/English name only/)
    expect(by(b, 'con.200002').bonus_note).toMatch(/Great-Value/)
    expect(by(b, 'sub.200001')).toMatchObject({ kind: 'pass', item_pack: true, price_thb: 99, price_usd: 2.99, contents: [{ item: 'holo Passport', amount: 1 }], description_en: 'This gets you a holo Passport.', description_th: null })
    expect(by(b, 'sub.400019')).toMatchObject({ price_thb: 79, price_usd: 1.99, contents: [{ item: 'Membership: Usada Pekora', amount: 1 }] })
    const miss = by(b, 'sub.499999')
    expect(miss.price_usd).toBeNull()
    expect(miss.price_usd_null_reason).toMatch(/no FX conversion/)
    expect(b.categories.map((c: any) => c.packCount)).toEqual([3, 4])
  })

  it('502 when the App Store is down', async () => {
    mock({})
    expect((await get()).status).toBe(502)
  })
})

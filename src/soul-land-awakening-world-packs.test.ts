import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { slawClassify, slawKind, slawTridentCoin } from './services/soul-land-awakening-world-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'soul-land-awakening-world') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
function mock(map: Record<string, (url: string) => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f(url)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const P = 'slmmo.global.'
const row = (id: string, offer: string, name: string, price: number, cur: 'THB' | 'USD', desc: string) => ({
  id, type: 'in-apps',
  attributes: { name, offerName: P + offer, description: { standard: desc }, offers: [{ currencyCode: cur, price, priceFormatted: (cur === 'THB' ? '\u0E3F' : '$') + price.toFixed(2) }] }
})
// [id, offer, th name, en name, thb, usd]
const items: [string, string, string, string, number, number | null][] = [
  ['1', 'currency_0.99', 'เหรียญเทพสมุทร*6', 'Trident Coin*6', 35, 0.99],
  ['2', 'currency_99.99', 'เหรียญเทพสมุทร*648', 'Trident Coin*648', 3700, 99.99],
  ['3', 'package_0.29', 'แพ็กซื้อตรง 1', 'Deluxe Pack 1', 10, 0.29],
  ['4', 'package_299.99', 'แพ็กซื้อตรง 57', 'Deluxe Pack 57', 10900, 299.99],
  ['5', 'package_5.99', 'แพ็กซื้อตรง 7', 'Deluxe Pack 7', 219, null]
]
const TH = items.map(([id, o, th, , thb]) => row(id, o, th, thb, 'THB', 'ซื้อเพื่อรับ ' + th))
const US = items.filter((i) => i[5] != null).map(([id, o, , en, , usd]) => row(id, o, en, usd!, 'USD', 'Purchase to get ' + en))
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const by = (b: any, o: string) => all(b).find((p: any) => p.product_id === P + o)

describe('Soul Land: Awakening World (App Store official)', () => {
  it('parses Trident Coin amounts and kinds from the official names', () => {
    expect(slawTridentCoin('Trident Coin*68')).toBe(68)
    expect(slawTridentCoin('เหรียญเทพสมุทร*648')).toBe(648)
    expect(slawTridentCoin('Deluxe Pack 10')).toBeNull()
    expect(slawKind(P + 'currency_9.99', 'Trident Coin*68')).toBe('currency')
    expect(slawKind(P + 'package_9.99', 'Deluxe Pack 10')).toBe('bundle')
    const c = slawClassify({ productId: P + 'package_9.99', nameEn: 'Deluxe Pack 10', nameTh: 'แพ็กซื้อตรง 10', rawName: 'แพ็กซื้อตรง 10', descEn: null, descTh: null })
    expect(c.contents).toBeNull()
    expect(c.contents_null_reason).toMatch(/in-game only/)
  })

  it('serves THB from App Store TH and USD from App Store US -> KH/LA/MM, aliases resolve', async () => {
    mock({ [API + 'th/']: page(TH), [API + 'us/']: page(US), [API + 'kh/']: page([]), [API + 'la/']: page([]), [API + 'mm/']: page([]) })
    for (const slug of ['soul-land-awakening-world', 'soulland', 'soul-land', 'slaw']) {
      const res = await get(slug)
      expect(res.status).toBe(200)
      const b: any = await res.json()
      expect(b.game.slug).toBe('soul-land-awakening-world')
      expect(b.summary.packCount).toBe(5)
    }
    const b: any = await (await get()).json()
    expect(b.source_mode).toBe('appstore-catalog-api')
    expect(b.publisher).toContain('37GAMES')
    expect(by(b, 'currency_99.99')).toMatchObject({ kind: 'currency', item_pack: false, item: 'Trident Coin', name_en: 'Trident Coin*648', name_th: 'เหรียญเทพสมุทร*648', price_thb: 3700, price_usd: 99.99, baseItemAmount: 648, bonusItemAmount: null, totalItemAmount: null })
    expect(by(b, 'currency_99.99').bonus_null_reason).toMatch(/not assumed to be 0/)
    expect(by(b, 'package_299.99')).toMatchObject({ kind: 'bundle', item_pack: true, price_thb: 10900, price_usd: 299.99, contents: null, description_th: 'ซื้อเพื่อรับ แพ็กซื้อตรง 57', description_en: 'Purchase to get Deluxe Pack 57' })
    const miss = by(b, 'package_5.99')
    expect(miss.price_usd).toBeNull()
    expect(miss.price_usd_null_reason).toMatch(/no FX conversion/)
    expect(b.categories.map((c: any) => c.packCount)).toEqual([2, 3])
    expect(b.source_details.official_webshop).toBeNull()
  })

  it('502 when the App Store is down', async () => {
    mock({})
    expect((await get()).status).toBe(502)
  })
})

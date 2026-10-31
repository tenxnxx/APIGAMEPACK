import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { crcContents, crcCrystals, crcKind } from './services/cookierun-classic-appstore-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'cookierun-classic') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
function mock(map: Record<string, (url: string) => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f(url)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const row = (id: string, offerName: string, name: string, price: number, cur: 'THB' | 'USD', desc?: string) => ({
  id, type: 'in-apps',
  attributes: { name, offerName, description: { standard: desc ?? name }, offers: [{ currencyCode: cur, price, priceFormatted: (cur === 'THB' ? '\u0E3F' : '$') + price.toFixed(2) }] }
})
const P = 'crg.dev.'
const TH = [
  row('1', P + 'crx.crystal751', '10 Crystals', 35, 'THB'),
  row('2', P + 'crx.crystal753', '120 Crystals', 279, 'THB'),
  row('3', P + 'pkg.partyrunpass.1', 'PartyRun Pass', 179, 'THB', 'Package containing PartyRun items'),
  row('4', P + 'pkg.eventpackage_tier8', 'Treasure Package', 279, 'THB', 'Package Containing 7 Guaranteed S-Tier Treasure'),
  row('5', P + 'pkg.eventpackage3_tier8', 'Treasure Package', 279, 'THB', 'Package Containing 7 Guaranteed S-Tier Treasure'),
  row('6', P + 'pkg.xxxlxp4', 'Growth XP Premium Package', 799, 'THB', 'Package Containing 4 EXP-Elixir and other items'),
  row('7', P + 'pkg.skinpackage_ch01_001', "GingerBrave's Costume", 219, 'THB', "GingerBrave's Celestial Emperor Costume"),
  row('8', P + 'pkg.newonly', 'New Package', 69, 'THB')
]
const US = [
  row('1', P + 'crx.crystal751', '10 Crystals', 0.99, 'USD'),
  row('2', P + 'crx.crystal753', '120 Crystals', 7.49, 'USD'),
  row('3', P + 'pkg.partyrunpass.1', 'PartyRun Pass', 4.99, 'USD', 'Package containing PartyRun items'),
  row('4', P + 'pkg.eventpackage_tier8', 'Treasure Package', 7.49, 'USD', 'Package Containing 7 Guaranteed S-Tier Treasure'),
  row('5', P + 'pkg.eventpackage3_tier8', 'Treasure Package', 7.49, 'USD', 'Package Containing 7 Guaranteed S-Tier Treasure'),
  row('6', P + 'pkg.xxxlxp4', 'Growth XP Premium Package', 21.99, 'USD', 'Package Containing 4 EXP-Elixir and other items'),
  row('7', P + 'pkg.skinpackage_ch01_001', "GingerBrave's Costume", 5.99, 'USD', "GingerBrave's Celestial Emperor Costume")
]
const KH = [...US.map((r) => ({ ...r, attributes: { ...r.attributes, offers: [{ ...r.attributes.offers[0], price: r.attributes.offers[0].price + 0.5 }] } })), row('8', P + 'pkg.newonly', 'New Package', 1.99, 'USD')]
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const byPid = (b: any, pid: string) => all(b).find((p: any) => p.product_id === P + pid)

describe('cookierun classic (App Store official)', () => {
  it('classifies and parses official text', () => {
    expect(crcKind(P + 'crx.crystal751', '10 Crystals')).toBe('currency')
    expect(crcKind(P + 'pkg.partyrunpass.2', 'PartyRun Pass')).toBe('pass')
    expect(crcKind(P + 'pkg.starter', 'Starter Pack')).toBe('bundle')
    expect(crcKind(null, '1,440 Crystals')).toBe('currency')
    expect(crcCrystals('1440 Crystals')).toBe(1440)
    expect(crcCrystals('Super Crystal Package')).toBeNull()
    expect(crcContents('Package Containing 4 EXP-Elixir and other items')).toEqual([
      { item: 'EXP-Elixir', amount: 4 },
      { item: 'other items (not itemised in the official listing)', amount: null }
    ])
    expect(crcContents('Package containing Potato Salad Cookie and Pet')).toEqual([
      { item: 'Potato Salad Cookie', amount: null }, { item: 'Pet', amount: null }
    ])
    expect(crcContents("Pine Monk Cookie's Soulstone Package")).toBeNull()
    expect(crcContents('Package for Starters')).toBeNull()
  })

  it('full list: THB from App Store TH, USD from US by item id, KH for items missing on US; THB-first order; aliases', async () => {
    mock({ [API + 'th/']: page(TH), [API + 'us/']: page(US), [API + 'kh/']: page(KH) })
    const r = await get()
    expect(r.status).toBe(200)
    const b: any = await r.json()
    expect(b.source_mode).toBe('appstore-catalog-api')
    expect(b.official_title).toBe('CookieRun Classic')
    expect(b.summary.packCount).toBe(8)
    expect(b.categories.map((c: any) => c.name)).toEqual(['Crystals (App Store)', 'Passes (App Store)', 'Packages & Bundles (App Store)'])
    const ten = byPid(b, 'crx.crystal751')
    expect(ten).toMatchObject({ kind: 'currency', item_pack: false, baseItemAmount: 10, bonusItemAmount: null, totalItemAmount: 10, price: 35, currency: 'THB', prices: { THB: 35, USD: 0.99 }, price_usd_source: 'apple-app-store-us (item 1)', contents: [{ item: 'Crystals', amount: 10 }] })
    expect(typeof ten.bonus_null_reason).toBe('string')
    expect(ten.description_th).toBeNull()
    expect(typeof ten.description_th_null_reason).toBe('string')
    const pass = byPid(b, 'pkg.partyrunpass.1')
    expect(pass).toMatchObject({ kind: 'pass', item_pack: true, price_thb: 179, price_usd: 4.99, description_en: 'Package containing PartyRun items' })
    // two distinct Treasure Package SKUs both kept
    expect(all(b).filter((p: any) => p.name === 'Treasure Package')).toHaveLength(2)
    expect(byPid(b, 'pkg.eventpackage_tier8').contents).toEqual([{ item: 'Guaranteed S-Tier Treasure', amount: 7 }])
    const costume = byPid(b, 'pkg.skinpackage_ch01_001')
    expect(costume.contents).toBeNull()
    expect(typeof costume.contents_null_reason).toBe('string')
    // item only on KH -> USD from KH, US items keep US price
    expect(byPid(b, 'pkg.newonly')).toMatchObject({ price_usd: 1.99, price_usd_source: 'apple-app-store-kh (item 8)' })
    // THB ascending within a category
    const bundles = b.categories[2].packs.map((p: any) => p.price_thb)
    expect(bundles).toEqual([...bundles].sort((x: number, y: number) => x - y))
    for (const slug of ['crc', 'cookie-run-classic']) {
      const a: any = await (await get(slug)).json()
      expect(a.game.slug).toBe('cookierun-classic')
      expect(a.summary.packCount).toBe(8)
    }
  })

  it('no USD storefront -> USD null with reason, THB intact (no FX)', async () => {
    mock({ [API + 'th/']: page(TH) })
    const b: any = await (await get()).json()
    const p = byPid(b, 'crx.crystal753')
    expect(p).toMatchObject({ price_thb: 279, price_usd: null, price_usd_source: null, baseItemAmount: 120 })
    expect(p.price_usd_null_reason).toContain('no FX')
  })

  it('catalog API down -> product-page fallback (TH + US pages, merged by name)', async () => {
    const html = (pairs: Array<[string, string]>) => `<html><script type="application/json">${JSON.stringify({ data: [{ data: { shelfMapping: { information: { items: [{ title: 'In-App Purchases', items: [{ textPairs: pairs }] }] } } } }] })}</script></html>`
    mock({
      'https://apps.apple.com/th/': () => new Response(html([['10 Crystals', '\u0E3F35.00'], ['PartyRun Pass', '\u0E3F179.00']])),
      'https://apps.apple.com/us/': () => new Response(html([['PartyRun Pass', '$4.99']]))
    })
    const b: any = await (await get()).json()
    expect(b.source_mode).toBe('appstore-product-page')
    const ps = all(b)
    expect(ps.find((p: any) => p.name === 'PartyRun Pass')).toMatchObject({ kind: 'pass', item_pack: true, price_thb: 179, price_usd: 4.99 })
    expect(ps.find((p: any) => p.name === '10 Crystals')).toMatchObject({ baseItemAmount: 10, price_usd: null })
  })

  it('502 when everything is down; 502 invalid when no IAP list', async () => {
    globalThis.fetch = (async () => { throw new Error('network') }) as unknown as typeof fetch
    let r = await get()
    expect(r.status).toBe(502)
    expect(await r.json()).toEqual({ error: 'Upstream service unavailable' })
    globalThis.fetch = (async () => new Response('<html>no iap</html>', { status: 200 })) as unknown as typeof fetch
    r = await get()
    expect(r.status).toBe(502)
    expect(await r.json()).toEqual({ error: 'Invalid upstream response' })
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { crbContents, crbCurrencyItem, crbKind } from './services/cookierun-crumble-appstore-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'cookierun-crumble') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
function mock(map: Record<string, (url: string) => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f(url)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const row = (id: string, offerName: string, name: string, price: number, cur: 'THB' | 'USD', desc: string) => ({
  id, type: 'in-apps',
  attributes: { name, offerName, description: { standard: desc }, offers: [{ currencyCode: cur, price, priceFormatted: (cur === 'THB' ? '\u0E3F' : '$') + price.toFixed(2) }] }
})
const P = 'dev.cc.'
const GEN_TH = 'แพ็กเกจพิเศษรวมไอเทมต่างๆ'
const GEN_EN = 'Package containing various rewards and items'
const TH = [
  row('1', P + 'crystals.tier1', 'คริสตัล 1', 35, 'THB', 'แพ็กเกจที่รับคริสตัลได้'),
  row('2', P + 'runecrystals.tier2', 'ผลึกรูน 1', 69, 'THB', GEN_TH),
  row('3', P + 'stellarpoint.tier2', 'พ้อยต์สเตลลาร์ 1', 69, 'THB', GEN_TH),
  row('4', P + 'crumblepass.tier5.3', 'Crumble Pass ซีซั่น 4', 179, 'THB', GEN_TH),
  row('5', P + 'eventpass.tier8.1', 'TADC Pass', 299, 'THB', GEN_TH),
  row('6', P + 'subscription1.tier5', 'สมาชิกเคลือบน้ำตาลรายเดือน', 179, 'THB', GEN_TH),
  row('7', P + 'pkg.event.tier4.0001', 'แพ็กเกจต้อนรับ', 149, 'THB', GEN_TH),
  row('8', P + 'pkg.event.tier2.0001', 'แพ็กเกจมือใหม่ครัมเบิล', 69, 'THB', GEN_TH),
  row('9', P + 'pkg.event.tier2.0002', 'แพ็กเกจมือใหม่ครัมเบิล', 69, 'THB', GEN_TH),
  row('10', P + 'pkg.khonly.tier2', 'แพ็กใหม่', 69, 'THB', GEN_TH)
]
const US = [
  row('1', P + 'crystals.tier1', 'Crystals 1', 0.99, 'USD', 'Package containing crystals'),
  row('2', P + 'runecrystals.tier2', 'Rune Crystals 1', 1.99, 'USD', GEN_EN),
  row('3', P + 'stellarpoint.tier2', 'Stellar Point 1', 1.99, 'USD', GEN_EN),
  row('4', P + 'crumblepass.tier5.3', 'Crumble Pass Season 4', 4.99, 'USD', GEN_EN),
  row('5', P + 'eventpass.tier8.1', 'TADC Pass', 7.99, 'USD', GEN_EN),
  row('6', P + 'subscription1.tier5', 'Monthly Sugar Coating Pass', 4.99, 'USD', GEN_EN),
  row('7', P + 'pkg.event.tier4.0001', 'Welcome Pack', 3.99, 'USD', GEN_EN),
  row('8', P + 'pkg.event.tier2.0001', 'Crumble Beginner Pack', 1.99, 'USD', GEN_EN),
  row('9', P + 'pkg.event.tier2.0002', 'Crumble Beginner Pack', 1.99, 'USD', GEN_EN)
]
const KH = [row('10', P + 'pkg.khonly.tier2', 'New Pack', 2.29, 'USD', GEN_EN)]
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const byPid = (b: any, pid: string) => all(b).find((p: any) => p.product_id === P + pid)

describe('cookierun crumble (App Store official)', () => {
  it('classifies by Devsisters product id and parses only real contents', () => {
    expect(crbCurrencyItem(P + 'crystals.tier58', 'Crystals 6')).toBe('Crystals')
    expect(crbCurrencyItem(P + 'runecrystals.tier15', 'Rune Crystals 3')).toBe('Rune Crystals')
    expect(crbCurrencyItem(P + 'stellarpoint.tier9', 'Stellar Point 2')).toBe('Stellar Points')
    expect(crbCurrencyItem(P + 'pkg.normal17.tier23', 'Crystal Jackpot Pack')).toBeNull()
    expect(crbKind(P + 'crystals.1', 'Crystal x1')).toBe('currency')
    expect(crbKind('dec.cc.crumblepass1.tier5', 'Crumble Pass Season 1')).toBe('pass')
    expect(crbKind(P + 'subscription2.tier10', 'Monthly Gacha Sugar Coating')).toBe('pass')
    expect(crbKind(P + 'demovalackage.tier5', 'Ad Removal Sugar Coating Pass')).toBe('pass')
    expect(crbKind(P + 'pkg.normal19.tier4', 'Arena Ticket Pack')).toBe('bundle')
    expect(crbKind(null, 'คริสตัล 3')).toBe('currency')
    expect(crbContents(GEN_EN)).toBeNull()
    expect(crbContents('Special packs containing a variety of essential items.')).toBeNull()
    expect(crbContents('Package containing crystals')).toEqual([{ item: 'Crystals', amount: null }])
  })

  it('full list: THB + Thai text from App Store TH, USD + English from US by item id, KH for items missing on US; aliases', async () => {
    mock({ [API + 'th/']: page(TH), [API + 'us/']: page(US), [API + 'kh/']: page(KH) })
    const r = await get()
    expect(r.status).toBe(200)
    const b: any = await r.json()
    expect(b.source_mode).toBe('appstore-catalog-api')
    expect(b.official_title).toBe('CookieRun: Crumble - Idle RPG')
    expect(b.publisher).toBe('Devsisters Corp.')
    expect(b.summary.packCount).toBe(10)
    expect(b.categories.map((c: any) => c.name)).toEqual([
      'Crystals / Rune Crystals / Stellar Points (App Store)', 'Passes & Memberships (App Store)', 'Packages & Bundles (App Store)'
    ])
    const c1 = byPid(b, 'crystals.tier1')
    expect(c1).toMatchObject({
      kind: 'currency', item: 'Crystals', item_pack: false, name: 'Crystals 1', name_th: 'คริสตัล 1',
      baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null,
      price: 35, currency: 'THB', prices: { THB: 35, USD: 0.99 }, price_usd_source: 'apple-app-store-us (item 1)',
      description_th: 'แพ็กเกจที่รับคริสตัลได้', description_en: 'Package containing crystals'
    })
    expect(typeof c1.base_null_reason).toBe('string')
    expect(typeof c1.bonus_null_reason).toBe('string')
    const pass = byPid(b, 'crumblepass.tier5.3')
    expect(pass).toMatchObject({ kind: 'pass', item_pack: true, price_thb: 179, price_usd: 4.99, name_th: 'Crumble Pass ซีซั่น 4', description_th: GEN_TH, description_en: GEN_EN, contents: null })
    expect(typeof pass.contents_null_reason).toBe('string')
    const tadc = byPid(b, 'eventpass.tier8.1')
    expect(tadc.name_th).toBeNull()
    expect(tadc.name_th_null_reason).toContain('TADC Pass')
    expect(byPid(b, 'subscription1.tier5')).toMatchObject({ kind: 'pass', item_pack: true })
    // same-name packs with distinct product ids are both kept
    expect(all(b).filter((p: any) => p.name === 'Crumble Beginner Pack')).toHaveLength(2)
    expect(byPid(b, 'pkg.khonly.tier2')).toMatchObject({ price_usd: 2.29, price_usd_source: 'apple-app-store-kh (item 10)', name: 'New Pack' })
    const bundles = b.categories[2].packs.map((p: any) => p.price_thb)
    expect(bundles).toEqual([...bundles].sort((x: number, y: number) => x - y))
    expect(all(b).map((p: any) => p.id)).toEqual(all(b).map((_: any, i: number) => i + 1))
    for (const slug of ['cookie-run-crumble', 'crumble']) {
      const a: any = await (await get(slug)).json()
      expect(a.game.slug).toBe('cookierun-crumble')
      expect(a.summary.packCount).toBe(10)
    }
  })

  it('no USD storefront -> USD null with reason, THB intact (no FX)', async () => {
    mock({ [API + 'th/']: page(TH) })
    const b: any = await (await get()).json()
    const p = byPid(b, 'pkg.event.tier4.0001')
    expect(p).toMatchObject({ price_thb: 149, price_usd: null, price_usd_source: null, name: 'แพ็กเกจต้อนรับ', name_en: null })
    expect(p.price_usd_null_reason).toContain('no FX')
    expect(typeof p.name_en_null_reason).toBe('string')
  })

  it('catalog API down -> App Store TH product page fallback, USD null with reason', async () => {
    const html = `<html><script type="application/json">${JSON.stringify({ data: [{ shelfMapping: { information: { items: [{ title: 'In-App Purchases', items: [{ textPairs: [['คริสตัล 1', '\u0E3F35.00'], ['Crumble Pass ซีซั่น 4', '\u0E3F179.00']] }] }] } } }] })}</script></html>`
    mock({ 'https://apps.apple.com/th/': () => new Response(html) })
    const b: any = await (await get()).json()
    expect(b.source_mode).toBe('appstore-product-page')
    const ps = all(b)
    expect(ps.find((p: any) => p.name_th === 'คริสตัล 1')).toMatchObject({ kind: 'currency', price_thb: 35, price_usd: null })
    expect(ps.find((p: any) => p.name_th === 'Crumble Pass ซีซั่น 4')).toMatchObject({ kind: 'pass', item_pack: true, price_thb: 179 })
    expect(typeof ps[0].price_usd_null_reason).toBe('string')
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

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { cocKind, parseCocStorePage } from './services/clash-of-clans-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'clash-of-clans') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
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
const M = 'com.supercell.magic.'
const TH = [
  row('1', M + 'package1', 'กองอัญมณี', 179, 'THB'), row('7', M + 'package7', 'กระเป๋าอัญมณี', 35, 'THB'),
  row('10', M + 'goldpass_4.99', 'Gold Pass', 179, 'THB', 'Better rewards in Season Challenges'),
  row('11', M + 'eventpass', 'Event Pass', 179, 'THB'),
  row('20', M + 'th1', 'แพ็คศาลากลางผู้เริ่มต้น', 179, 'THB'), row('21', M + 'builder1_2.99', 'Builder Hall Pack', 99, 'THB'),
  row('30', M + 'offer_4.99', 'Special Offer', 179, 'THB'), row('31', M + 'package1.t40', 'กองอัญมณี', 69, 'THB'),
  row('32', M + 'softconversion_1.99', 'ข้อเสนอพิเศษ', 69, 'THB'), row('33', M + 'holiday7', 'Special Offer', 35, 'THB')
]
const US = [
  row('1', M + 'package1', 'Pile of Gems', 4.99, 'USD'), row('7', M + 'package7', 'Pocketful of Gems', 0.99, 'USD'),
  row('10', M + 'goldpass_4.99', 'Gold Pass', 4.99, 'USD', 'Better rewards in Season Challenges'),
  row('20', M + 'th1', 'Town Hall Starter Pack', 4.99, 'USD'), row('21', M + 'builder1_2.99', 'Builder Hall Pack', 2.99, 'USD'),
  row('30', M + 'offer_4.99', 'Special Offer', 4.99, 'USD'), row('33', M + 'holiday7', 'Special Offer', 0.99, 'USD')
]
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
const enc = (o: any) => JSON.stringify(o).replace(/"/g, '&quot;')
const STORE_HTML = `<noscript id="state" data-state="${enc({ route: 'store-preview', props: { gameId: 'clashofclans', reason: 'not-authenticated' } })}"></noscript>` +
  `<noscript id="market" data-market="${enc({ countryCode: 'TH', currencyCode: 'THB' })}"></noscript><p>Log in to view offers</p>`
const STORE = 'https://store.supercell.com/clashofclans'

describe('clash of clans', () => {
  it('classifies Supercell product ids', () => {
    expect(cocKind(M + 'package5', 'Chest of Gems')).toBe('currency')
    expect(cocKind(M + 'package5.t40', 'Chest of Gems')).toBe('gem-tier')
    expect(cocKind(M + 'package5_T50', 'Chest of Gems')).toBe('gem-tier')
    expect(cocKind(M + 'offer_9.99', 'Special Offer')).toBe('tier')
    expect(cocKind(M + 'resource_9.99', 'Special Offer')).toBe('tier')
    expect(cocKind(M + 'resource1', 'Resource Pack')).toBe('bundle')
    expect(cocKind(M + 'goldpass_6.99', 'Gold Pass')).toBe('pass')
    expect(cocKind(M + 'eventpassmini', 'Mini Event Pass')).toBe('pass')
  })
  it('parses the Supercell Store preview page', () => {
    expect(parseCocStorePage(STORE_HTML)).toMatchObject({ ok: true, currency: 'THB', country: 'TH', route: 'store-preview', reason: 'not-authenticated' })
  })
  it('THB from App Store TH, USD from US by item id; gems/passes/bundles; tiers excluded; THB-sorted; nulls with reasons', async () => {
    mock({ [STORE]: () => new Response(STORE_HTML, { headers: { 'content-type': 'text/html' } }), [API + 'th/']: page(TH), [API + 'us/']: page(US) })
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game).toMatchObject({ slug: 'clash-of-clans', itemName: 'Gems' })
    const [gems, passes, bundles] = body.categories
    expect(gems.packs.map((p: any) => [p.id, p.name, p.prices.THB, p.prices.USD])).toEqual([[1, 'Pocketful of Gems', 35, 0.99], [2, 'Pile of Gems', 179, 4.99]])
    expect(gems.packs[1]).toMatchObject({
      name_th: 'กองอัญมณี', item_pack: false, baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, contents: null,
      description_en: 'Pile of Gems', description_th: 'กองอัญมณี', price_usd_source: 'apple-app-store-us (item 1)'
    })
    expect(gems.packs[1].price_thb_source).toContain('offerName=com.supercell.magic.package1')
    expect(gems.packs[1].base_null_reason).toContain('not-authenticated')
    expect(passes.packs.map((p: any) => [p.id, p.product_id, p.pass_type, p.prices.THB, p.prices.USD])).toEqual([
      [3, M + 'eventpass', 'event-pass', 179, null], [4, M + 'goldpass_4.99', 'gold-pass', 179, 4.99]
    ])
    expect(passes.packs[0].price_usd_null_reason).toContain('Not on App Store US')
    expect(passes.packs[1]).toMatchObject({ item_pack: true, description_en: 'Better rewards in Season Challenges', description_th: null })
    expect(passes.packs[1].description_th_null_reason).toContain('English only')
    expect(bundles.packs.map((p: any) => [p.id, p.name, p.name_th, p.prices.THB, p.prices.USD])).toEqual([
      [5, 'Builder Hall Pack', null, 99, 2.99], [6, 'Town Hall Starter Pack', 'แพ็คศาลากลางผู้เริ่มต้น', 179, 4.99]
    ])
    expect(bundles.packs[1].contents_null_reason).toContain('in-game only')
    expect(body.summary).toEqual({ categoryCount: 3, packCount: 6 })
    expect(body.notes.join(' ')).toContain('3 generic "Special Offer" price-tier SKUs and 1 gem-pack price-test tiers')
    expect(body.store_status.reason).toBe('not-authenticated')
  })
  it('US down -> USD from KH; alias works', async () => {
    mock({ [STORE]: () => new Response(STORE_HTML), [API + 'th/']: page(TH), [API + 'us/']: () => new Response('x', { status: 500 }), [API + 'kh/']: page(US) })
    const body = (await (await get('clashofclans')).json()) as any
    expect(body.categories[0].packs[0]).toMatchObject({ prices: { THB: 35, USD: 0.99 }, price_usd_source: 'apple-app-store-kh (item 7)' })
    expect(body.sources.usd).toContain('/catalog/kh/')
    expect(body.notes.join(' ')).toContain('App Store USD prices from KH')
  })
  it('no USD storefront and store page down -> USD null with reason, THB kept', async () => {
    mock({ [API + 'th/']: page(TH) })
    const body = (await (await get('coc-supercell')).json()) as any
    const p = body.categories[0].packs[0]
    expect(p).toMatchObject({ price_thb: 35, price_usd: null, name: 'กระเป๋าอัญมณี', description_en: null })
    expect(p.price_usd_null_reason).toContain('US/KH/LA/MM')
    expect(p.description_en_null_reason).toBeTruthy()
    expect(body.notes[0]).toContain('Supercell Store page unavailable')
  })
  it('502 when App Store TH is down', async () => {
    mock({ [STORE]: () => new Response(STORE_HTML) })
    expect((await get()).status).toBe(502)
  })
  it('coc alias still points to Clash of Critters', async () => {
    const { getGameBySlug } = await import('./games/registry')
    expect(getGameBySlug('coc')?.slug).toBe('clash-of-critters')
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { cocrBase, cocrBonus, cocrContents, cocrCurrency } from './services/clash-of-critters-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'clash-of-critters') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
const seen: string[] = []
function mock(map: Record<string, (url: string) => Response>) {
  seen.length = 0
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    seen.push(url)
    for (const [p, f] of Object.entries(map)) if (url.includes(p)) return f(url)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const desc = (b: string, g: string) => `<p><b>Pack Contains:</b><br><br>${b}<b><br><br>Special Gift:</b><br><br>${g}</p>`
const descTh = (b: string, g: string) => `<p><b>สิ่งที่อยู่ในแพ็ก:</b><br><br>${b} <br><br><b>ของขวัญพิเศษ:</b><br><br>${g}</p>`
const product = (pid: string, price: number, cur: string, cfg: Record<string, string>) => ({ productId: pid, price, currency: cur, productType: 1, staticConfig: JSON.stringify({ category: 'Ignis Gem', ...cfg }) })
const storeList = (cur: 'THA(THB)' | 'USA(USD)', lang: 'en' | 'th') => {
  const P = cur === 'THA(THB)' ? [69, 179, 18000] : [1.99, 4.99, 499.99]
  const en = lang === 'en'
  return Response.json({ code: 0, data: { currency: cur, discountInfoList: [], productList: [
    product('123002', P[1], cur, en ? { name: '500 Ignis Gems', summary: '+ 25 Extra Ignis Gems', description: desc('500 Ignis Gems', '25 Ignis Gems') } : { name: 'อัญมณีไฟ 500 เม็ด', summary: 'ได้อัญมณีไฟเพิ่ม 25 เม็ด', description: descTh('อัญมณีไฟ 500 เม็ด', 'อัญมณีไฟ 25 เม็ด') }),
    product('123001', P[0], cur, en ? { name: '200 Ignis Gems', summary: '+ 10 Extra Ignis Gems', description: desc('200 Ignis Gems', '10 Ignis Gems') } : { name: 'อัญมณีไฟ 200 เม็ด', summary: 'ได้อัญมณีไฟเพิ่ม 10 เม็ด', description: descTh('อัญมณีไฟ 200 เม็ด', 'อัญมณีไฟ 10 เม็ด') }),
    product('123009', P[2], cur, en ? { name: '50000 Ignis Gems', summary: '+ 2500 Extra Ignis Gems', description: desc('50000 Ignis Gems', '2500 Ignis Gems') } : { name: 'อัญมณีไฟ 50,000 เม็ด', summary: 'ได้อัญมณีไฟเพิ่ม 2,500 เม็ด', description: descTh('อัญมณีไฟ 50,000 เม็ด', 'อัญมณีไฟ 2,500 เม็ด') })
  ] } })
}
const tier = (id: string, t: string, name: string, price: number, cur: 'THB' | 'USD') => ({
  id, type: 'in-apps', attributes: { name, offerName: `com.farlightgames.pgame.package.${t}`, description: { standard: `Can redeem any ${name.replace(' Pack', '')} value item in the mall` }, offers: [{ currencyCode: cur, price, priceFormatted: String(price) }] }
})
const TH_TIERS = [tier('11', 't2', 'Tier 2 Offer', 69, 'THB'), tier('12', 't5', '$4.99 Pack', 179, 'THB'), tier('13', 't3', '$2.99 Pack', 99, 'THB')]
const US_TIERS = [tier('11', 't2', 'Tier 2 Offer', 1.99, 'USD'), tier('12', 't5', '$4.99 Pack', 4.99, 'USD'), tier('13', 't3', '$2.99 Pack', 2.99, 'USD')]
const page = (rows: any[]) => (url: string) => (/offset=0\b/.test(url) ? Response.json({ data: rows }) : new Response('nf', { status: 404 }))
const MALL = { '/webpay/mall/detail': () => Response.json({ code: 0, data: { mallId: 45, gameId: 10090, appId: 10088021 } }) }
const store = (cur: 'THA(THB)' | 'USA(USD)') => ({ '/webpay/product/guestProducts': (u: string) => storeList(cur, /language=th/.test(u) ? 'th' : 'en') })
const AS = (cc: string, rows: any[]) => ({ [`/catalog/${cc}/apps/6741567125/`]: page(rows) })

describe('clash of critters (Farlight official store)', () => {
  it('parses official text', () => {
    expect(cocrCurrency('THA(THB)')).toBe('THB')
    expect(cocrCurrency('USA(USD)')).toBe('USD')
    expect(cocrBase('20000 Ignis Gems')).toBe(20000)
    expect(cocrBase('Starter')).toBeNull()
    expect(cocrBonus('+ 1,000 Extra Ignis Gems')).toBe(1000)
    expect(cocrContents(desc('200 Ignis Gems', '10 Ignis Gems'))).toEqual([{ item: 'Ignis Gems', amount: 200, part: 'base' }, { item: 'Ignis Gems', amount: 10, part: 'bonus' }])
  })
  it('THB from the official store, USD = App Store US price of the same-THB tier (by Apple item id), Thai text, contents', async () => {
    mock({ ...MALL, ...store('THA(THB)'), ...AS('th', TH_TIERS), ...AS('us', US_TIERS) })
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(seen.some((u) => u.includes('guestProducts') && u.includes('language=th'))).toBe(true)
    expect(body.game).toEqual({ id: 10090, slug: 'clash-of-critters', name: 'Clash of Critters', itemName: 'Ignis Gems', itemIcon: '' })
    const packs = body.categories[0].packs
    expect(packs.map((p: any) => [p.id, p.prices.THB, p.prices.USD])).toEqual([[123001, 69, 1.99], [123002, 179, 4.99], [123009, 18000, null]])
    expect(packs[0]).toMatchObject({
      name: '200 Ignis Gems', name_th: 'อัญมณีไฟ 200 เม็ด', item_pack: false, kind: 'currency',
      baseItemAmount: 200, bonusItemAmount: 10, totalItemAmount: 210, price: 69, currency: 'THB',
      price_thb_source: 'farlight-official-store (guestProducts THA(THB))',
      description_en: 'Pack Contains:\n200 Ignis Gems\nSpecial Gift:\n10 Ignis Gems',
      description_th: 'สิ่งที่อยู่ในแพ็ก:\nอัญมณีไฟ 200 เม็ด\nของขวัญพิเศษ:\nอัญมณีไฟ 10 เม็ด',
      contents: [{ item: 'Ignis Gems', amount: 200, part: 'base' }, { item: 'Ignis Gems', amount: 10, part: 'bonus' }]
    })
    expect(packs[0].price_usd_source).toContain('apple-app-store-us (item 11 com.farlightgames.pgame.package.t2')
    expect(packs[2]).toMatchObject({ baseItemAmount: 50000, bonusItemAmount: 2500, totalItemAmount: 52500, price_usd: null })
    expect(packs[2].price_usd_null_reason).toContain('No App Store TH tier priced THB 18000 (App Store tiers top out below this pack)')
    expect(body.store_currency).toBe('THA(THB)')
    expect(body.notes.join(' ')).toContain('no item_pack entries')
  })
  it('US down -> USD from KH', async () => {
    mock({ ...MALL, ...store('THA(THB)'), ...AS('th', TH_TIERS), [`/catalog/us/`]: () => new Response('x', { status: 500 }), ...AS('kh', US_TIERS) })
    const body = (await (await get('coc')).json()) as any
    expect(body.game.slug).toBe('clash-of-critters')
    expect(body.categories[0].packs[0].price_usd_source).toContain('apple-app-store-kh (item 11')
    expect(body.sources.usd).toContain('/catalog/kh/')
  })
  it('no App Store at all -> USD null with reason, THB + amounts still official', async () => {
    mock({ ...MALL, ...store('THA(THB)') })
    const p = ((await (await get()).json()) as any).categories[0].packs[0]
    expect(p).toMatchObject({ price_thb: 69, price_usd: null, baseItemAmount: 200, totalItemAmount: 210 })
    expect(p.price_usd_null_reason).toContain('App Store TH tiers unavailable')
  })
  it('store in USD region -> USD from the store, THB from App Store TH tier', async () => {
    mock({ ...MALL, ...store('USA(USD)'), ...AS('us', US_TIERS), ...AS('th', TH_TIERS) })
    const packs = ((await (await get()).json()) as any).categories[0].packs
    expect(packs.map((p: any) => [p.id, p.prices.THB, p.prices.USD])).toEqual([[123001, 69, 1.99], [123002, 179, 4.99], [123009, null, 499.99]])
    expect(packs[0].price_usd_source).toBe('farlight-official-store (guestProducts USA(USD))')
    expect(packs[0].price_thb_source).toContain('apple-app-store-th (item 11')
    expect(packs[2].price_thb_null_reason).toContain('No App Store US tier priced USD 499.99')
  })
  it('official store down -> App Store TH tiers fallback (amounts null with reason)', async () => {
    mock({ ...AS('th', TH_TIERS), ...AS('us', US_TIERS) })
    const body = (await (await get()).json()) as any
    expect(body.categories[0].name).toBe('App Store TH price tiers (fallback)')
    expect(body.categories[0].packs[0]).toMatchObject({ prices: { THB: 69, USD: 1.99 }, baseItemAmount: null, kind: 'tier' })
    expect(body.categories[0].packs[0].base_null_reason).toBeTruthy()
  })
  it('502 when store and App Store are both down; 502 invalid on empty list', async () => {
    mock({})
    expect((await get()).status).toBe(502)
    mock({ ...MALL, '/webpay/product/guestProducts': () => Response.json({ code: 0, data: { productList: [] } }) })
    const r = await get()
    expect(r.status).toBe(502)
    expect(await r.json()).toEqual({ error: 'Invalid upstream response' })
  })
})

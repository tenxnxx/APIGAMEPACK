import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { lordrushAppStoreClassify, lordrushIconItem, lordrushLabelCurrency } from './services/lordrush-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'lordrush') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
function mock(map: Record<string, (url: string) => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f(url)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const STAR = 'https://empty-package-img.centurygame.com/production/20260812/1786502265256_EmpireStar.png'
const GEM = 'https://empty-package-img.centurygame.com/production/20260812/1786502274970_gems.png'
const pkg = (id: string, price: string, label: string, main: number, items: [string, number][], name = '', type = 1) => ({
  product_id: id, description: id, package_display_name: name, package_type: type, currency_label: label, final_amount: price,
  main_number: main, main_content: STAR, items: items.map(([icon, n]) => ({ icon, item_number: n, tips: null }))
})
const STORE = 'https://cg-vip-mall-wos.centurygame.com/api/activity/packages_info'
const store = (thbLabel: string) => (url: string) => {
  const q = new URL(url).searchParams
  const th = q.get('language_code') === 'TH'
  const label = q.get('currency') === 'THB' ? thbLabel : '$'
  const thbPrice = (usd: string, thb: string) => (label === '฿' ? thb : usd)
  return Response.json({ code: 1, msg: 'success', data: { game_id: '20343', package_list: { config_list: [
    pkg('com.s01.lordrush.token01', thbPrice('19.99', '729'), label, 1999, [[STAR, 100]], th ? 'แพ็กพิเศษจักรวรรดิ' : 'Empire Special Pack', 4),
    pkg('thirdpayment.s01.lordrush.gem19', thbPrice('9.99', '349'), label, 999, [[STAR, 50]]),
    pkg('thirdpayment.s01.lordrush.gem23', thbPrice('9.99', '349'), label, 999, [[GEM, 500]])
  ] } } })
}
const P = 'com.s01.lordrush.'
const row = (id: string, offer: string, name: string, desc: string, price: number, cur: 'THB' | 'USD') => ({
  id, type: 'in-apps', attributes: { name, offerName: P + offer, description: { standard: desc }, offers: [{ currencyCode: cur, price, priceFormatted: String(price) }] }
})
const TH = [
  row('11', 'gem01', 'Handful of Gems', "Get plenty gems you've always wanted!", 35, 'THB'),
  row('12', 'pass01', 'Regular Pass', 'Regular Pass: Unlock more rewards!', 179, 'THB'),
  row('13', 'normal05', 'Normal Pack 5', 'What you get will exceed your expectation!', 179, 'THB'),
  row('14', 'refund01', 'Refund Pack 1', 'This is a refund pack, please follow the in-game rule', 35, 'THB'),
  row('15', 'token01', 'Empire Supply 1', "Get plenty Empire Stars you've always wanted!", 729, 'THB')
]
const US = [
  row('11', 'gem01', 'Handful of Gems', "Get plenty gems you've always wanted!", 0.99, 'USD'),
  row('12', 'pass01', 'Regular Pass', 'Regular Pass: Unlock more rewards!', 4.99, 'USD'),
  row('14', 'refund01', 'Refund Pack 1', 'This is a refund pack, please follow the in-game rule', 0.99, 'USD'),
  row('15', 'token01', 'Empire Supply 1', "Get plenty Empire Stars you've always wanted!", 19.99, 'USD')
]
const KH = [row('13', 'normal05', 'Normal Pack 5', 'What you get will exceed your expectation!', 5.49, 'USD')]
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
const apple = { [API + 'th/']: page(TH), [API + 'us/']: page(US), [API + 'kh/']: page(KH), [API + 'la/']: page([]), [API + 'mm/']: page([]) }
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const by = (b: any, id: string) => all(b).find((p: any) => p.product_id === id)

describe('Lordrush (Century Games official store + App Store)', () => {
  it('parses store icons, currency labels and App Store tiers', () => {
    expect(lordrushIconItem(STAR)).toBe('Empire Star')
    expect(lordrushIconItem(GEM)).toBe('Gem')
    expect(lordrushIconItem('https://x/abc.png')).toBeNull()
    expect(lordrushLabelCurrency('฿')).toBe('THB')
    expect(lordrushLabelCurrency('$')).toBe('USD')
    expect(lordrushAppStoreClassify({ productId: P + 'gem03', nameEn: 'Sack of Gems', nameTh: null, rawName: 'Sack of Gems', descEn: null, descTh: null })).toMatchObject({ kind: 'currency', item: 'Gem', baseItemAmount: null })
    expect(lordrushAppStoreClassify({ productId: P + 'deal01', nameEn: 'Daily Deal (30d)', nameTh: null, rawName: 'x', descEn: 'Monthly Card', descTh: null }).kind).toBe('pass')
  })

  it('web store USD (THB request answered in $ -> THB null), App Store THB/USD, refund excluded, same id merged; aliases', async () => {
    mock({ [STORE]: store('$'), ...apple })
    for (const slug of ['lordrush', 'lord-rush']) {
      const res = await get(slug)
      expect(res.status).toBe(200)
      const b: any = await res.json()
      expect(b.game.slug).toBe('lordrush')
    }
    const b: any = await (await get()).json()
    expect(b.source_mode).toBe('lordrush-store+appstore')
    expect(b.publisher).toBe('Century Games Innovation Pte. Ltd.')
    expect(b.summary.packCount).toBe(6)
    const g19 = by(b, 'thirdpayment.s01.lordrush.gem19')
    expect(g19).toMatchObject({ item: 'Empire Star', price_thb: null, price_usd: 9.99, baseItemAmount: 999, bonusItemAmount: 50, totalItemAmount: 1049, name_en: '999 Empire Stars' })
    expect(g19.price_thb_null_reason).toMatch(/no FX conversion/)
    expect(by(b, 'thirdpayment.s01.lordrush.gem23')).toMatchObject({ bonusItemAmount: 0, totalItemAmount: 999, contents: [{ item: 'Empire Star', amount: 999 }, { item: 'Gem (bonus)', amount: 500 }] })
    const t1 = by(b, 'com.s01.lordrush.token01')
    expect(t1).toMatchObject({ item_pack: true, name_en: 'Empire Special Pack', name_th: 'แพ็กพิเศษจักรวรรดิ', price_thb: 729, price_usd: 19.99, baseItemAmount: 1999, bonusItemAmount: 100, totalItemAmount: 2099 })
    expect(t1.price_thb_source).toMatch(/apple-app-store-th/)
    expect(all(b).filter((p: any) => p.product_id === 'com.s01.lordrush.token01')).toHaveLength(1)
    expect(by(b, P + 'refund01')).toBeUndefined()
    expect(b.appstore_excluded.map((x: any) => x.product_id)).toEqual([P + 'refund01'])
    expect(by(b, P + 'gem01')).toMatchObject({ item: 'Gem', price_thb: 35, price_usd: 0.99, baseItemAmount: null })
    expect(by(b, P + 'gem01').base_null_reason).toBeTruthy()
    expect(by(b, P + 'pass01')).toMatchObject({ kind: 'pass', item_pack: true, description_en: 'Regular Pass: Unlock more rewards!', contents: null })
    expect(by(b, P + 'normal05')).toMatchObject({ price_thb: 179, price_usd: 5.49 })
    expect(by(b, P + 'normal05').price_usd_source).toMatch(/kh/)
  })

  it('uses web-store THB when the store labels it ฿', async () => {
    mock({ [STORE]: store('฿'), ...apple })
    const b: any = await (await get()).json()
    expect(by(b, 'thirdpayment.s01.lordrush.gem19')).toMatchObject({ price_thb: 349, price_usd: 9.99 })
    expect(by(b, 'com.s01.lordrush.token01').price_thb_source).toMatch(/lordrush-official-store/)
  })

  it('store down -> App Store only; everything down -> 502', async () => {
    mock({ ...apple })
    const res = await get()
    expect(res.status).toBe(200)
    const b: any = await res.json()
    expect(b.source_mode).toBe('appstore-catalog-api')
    expect(by(b, P + 'token01')).toMatchObject({ price_thb: 729, price_usd: 19.99 })
    mock({})
    expect((await get()).status).toBe(502)
  })
})

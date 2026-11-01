import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchLastWarStorePacks,
  lastWarAppStoreClassify,
  lastWarJsArray,
  lastWarLocaleString,
  lastWarPackTitleKey
} from './services/lastwar-store-packs.service'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
function mock(map: Record<string, (url: string) => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f(url)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const HTML = '<script type="module" crossorigin src="/assets/js/main-TEST.js"></script>'
const JS =
  'PACK_CONFIG=[{id:70000018,title:"order.giftTitle4",icon:specialIcon,percentage:2160,extraGoldBricks:0,currency_symbol:"",amount:0}],' +
  'defaultGoodsData=[{goods_name:"",amount:"9.99",pay_brick_num:1e3,currency_symbol:"$",free_brick_num:50,goods_id:"goods_1",currency:"USD",status:1},' +
  '{goods_name:"",amount:"4.99",pay_brick_num:500,currency_symbol:"$",free_brick_num:25,goods_id:"goods_8",currency:"USD",status:2}],' +
  'defaultPackData=[{item:"510035;40",diamond:"0",total:1,remain:1,currencyInfo:{amount:"19.99",currency_symbol:"$",currency:"USD"},goldBrickFree:0,id:"70000018",extraGoldBricks:100,gold_brick_doller:2e3,recharge_point:0}],' +
  'de={giftTitle4:"Sale-Goldziegel-Paket",freeClaim:"Kostenlos abholen"},en={giftTitle4:"Special Gold Brick Pack",freeClaim:"Free Claim"},th={giftTitle4:\'แพ็กเกจทองแท่งสุดคุ้ม"\',freeClaim:"x"}'
const row = (id: string, offer: string, name: string, price: number, cur: 'THB' | 'USD') => ({
  id, type: 'in-apps', attributes: { name, offerName: offer, description: { standard: name }, offers: [{ currencyCode: cur, price, priceFormatted: String(price) }] }
})
const TH = [row('1', 'prodios_5', 'Hot Package 5', 160, 'THB'), row('2', 'week_prodios_5', 'Weekly Pass', 160, 'THB'), row('3', 'month_card_prodios_25', 'Monthly Pass', 810, 'THB')]
const US = [row('1', 'prodios_5', 'Hot Package 5', 4.99, 'USD'), row('2', 'week_prodios_5', 'Weekly Pass', 4.99, 'USD')]
const KH = [row('3', 'month_card_prodios_25', 'Monthly Pass', 24.99, 'USD')]
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
const apple = { [API + 'th/']: page(TH), [API + 'us/']: page(US), [API + 'kh/']: page(KH), [API + 'la/']: page([]), [API + 'mm/']: page([]) }
const web = { 'https://store.lastwar.com/assets/js/main-TEST.js': () => new Response(JS), 'https://store.lastwar.com/': () => new Response(HTML) }
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const by = (b: any, id: string) => all(b).find((p: any) => p.product_id === id)

describe('Last War (official store + App Store TH/US full list)', () => {
  it('parses store JS arrays, locale titles and App Store kinds', () => {
    expect(lastWarJsArray(JS, 'defaultGoodsData')?.[0]).toMatchObject({ pay_brick_num: 1000, free_brick_num: 50 })
    expect(lastWarPackTitleKey(JS, '70000018')).toEqual({ title: 'order.giftTitle4' })
    expect(lastWarLocaleString(JS, 'giftTitle4')).toEqual({ en: 'Special Gold Brick Pack', th: 'แพ็กเกจทองแท่งสุดคุ้ม' })
    expect(lastWarAppStoreClassify({ productId: 'month_card_prodios_25', nameEn: 'Monthly Pass', nameTh: null, rawName: 'Monthly Pass', descEn: null, descTh: null }).kind).toBe('pass')
    expect(lastWarAppStoreClassify({ productId: 'prodios_5', nameEn: 'Hot Package 5', nameTh: null, rawName: 'Hot Package 5', descEn: null, descTh: null }).kind).toBe('bundle')
  })

  it('web Gold Bricks (USD, THB null), gift pack item_pack, App Store THB + USD US->KH', async () => {
    mock({ ...web, ...apple })
    const b: any = await fetchLastWarStorePacks()
    expect(b.source_mode).toBe('lastwar-store+appstore')
    expect(b.game).toMatchObject({ id: 200001, slug: 'last-war', name: 'Last War' })
    expect(b.publisher).toBe('FUNFLY PTE. LTD.')
    expect(b.summary.packCount).toBe(6)
    const g = by(b, 'goods_8')
    expect(g).toMatchObject({ item: 'Gold Brick', baseItemAmount: 500, bonusItemAmount: 25, totalItemAmount: 525, price_thb: null, price_usd: 4.99, prices: { THB: null, USD: 4.99 } })
    expect(g.price_thb_null_reason).toMatch(/no FX/)
    expect(all(b).filter((p: any) => p.kind === 'currency').map((p: any) => p.baseItemAmount)).toEqual([500, 1000])
    expect(by(b, '70000018')).toMatchObject({
      item_pack: true, name_en: 'Special Gold Brick Pack', name_th: 'แพ็กเกจทองแท่งสุดคุ้ม', price_usd: 19.99, price_thb: null,
      bonusItemAmount: 100, baseItemAmount: null, contents: [{ item_id: '510035', amount: 40 }, { item: 'Gold Brick (extra)', amount: 100 }]
    })
    expect(by(b, '70000018').description_th).toMatch(/^แพ็กเกจทองแท่งสุดคุ้ม/)
    expect(by(b, 'prodios_5')).toMatchObject({ kind: 'bundle', item_pack: true, price_thb: 160, price_usd: 4.99, contents: null })
    expect(by(b, 'week_prodios_5')).toMatchObject({ kind: 'pass', price_thb: 160, price_usd: 4.99 })
    expect(by(b, 'month_card_prodios_25')).toMatchObject({ price_thb: 810, price_usd: 24.99 })
    expect(by(b, 'month_card_prodios_25').price_usd_source).toMatch(/kh/)
  })

  it('store down -> App Store only; everything down -> throws', async () => {
    mock({ ...apple })
    const b: any = await fetchLastWarStorePacks()
    expect(b.summary.packCount).toBe(3)
    expect(b.notes[0]).toMatch(/Official Last War Store unavailable/)
    mock({})
    await expect(fetchLastWarStorePacks()).rejects.toThrow()
  })
})

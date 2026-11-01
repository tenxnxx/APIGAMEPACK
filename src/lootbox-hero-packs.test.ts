import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { getGameBySlug } from './games/registry'
import { lootboxHeroClassify } from './services/lootbox-hero-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => {
  globalThis.fetch = originalFetch
  clearPacksCache()
})
const get = (slug = 'lootbox-hero') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))

const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const row = (id: string, offerName: string, name: string, price: number, desc: string) => ({
  id, type: 'in-apps',
  attributes: { name, offerName, description: { standard: desc }, offers: [{ currencyCode: 'THB', price, priceFormatted: '฿' + price }] }
})
const TH = [
  row('1', 'lootboxth.iap.35', '60 เหรียญทองมืด', 35, 'ซื้อแล้วได้รับ 60 เหรียญทองมืด'),
  row('2', 'lootboxth.iap.179', '300 เหรียญทองมืด', 179, 'ซื้อแล้วได้รับ 300 เหรียญทองมืด'),
  row('3', 'lootboxth.iap.5490', '9980 เหรียญทองมืด', 5490, 'ซื้อแล้วได้รับ 9980 เหรียญทองมืด')
]
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
function mock(opts: { apple?: boolean } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (opts.apple === false && url.startsWith(API)) return new Response('down', { status: 503 })
    if (url.startsWith(API + 'th/')) return page(TH)(url)
    return new Response('nf', { status: 404 }) // not sold on US / KH / LA / MM
  }) as unknown as typeof fetch
  return calls
}
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)

describe('LootBox Hero (App Store TH, KUNG FU DUCK LLC)', () => {
  it('registry: slug + aliases resolve; classify parses Dark Gold Coin amounts from Apple names', () => {
    for (const s of ['lootbox-hero', 'lootbox', 'lootboxhero', 'heroluakhong', 'lootbox-hero-appstore'])
      expect(getGameBySlug(s)).toMatchObject({ slug: 'lootbox-hero', appId: 6757577016, provider: 'lootbox-hero-appstore' })
    const c = lootboxHeroClassify({ productId: 'x', nameEn: null, nameTh: '1280 เหรียญทองมืด', rawName: '1280 เหรียญทองมืด', descEn: null, descTh: 'ซื้อแล้วได้รับ 1280 เหรียญทองมืด' })
    expect(c).toMatchObject({ kind: 'currency', baseItemAmount: 1280, bonusItemAmount: 0 })
    const n = lootboxHeroClassify({ productId: 'x', nameEn: null, nameTh: '1280 เหรียญทองมืด', rawName: '1280 เหรียญทองมืด', descEn: null, descTh: null })
    expect(n.bonusItemAmount).toBeUndefined()
    expect(lootboxHeroClassify({ productId: 'x', nameEn: null, nameTh: 'แพ็กเกจพิเศษ', rawName: 'แพ็กเกจพิเศษ', descEn: null, descTh: null })).toMatchObject({ kind: 'bundle', contents: null })
  })

  it('THB from App Store TH, base+bonus(total), USD null with reason (Thai App Store only, no FX)', async () => {
    const calls = mock()
    const res = await get('lootbox')
    expect(res.status).toBe(200)
    const b: any = await res.json()
    expect(b.game).toMatchObject({ id: 6757577016, slug: 'lootbox-hero' })
    expect(b.publisher).toBe('KUNG FU DUCK LLC')
    expect(b.summary).toEqual({ categoryCount: 1, packCount: 3 })
    const p = all(b).find((x: any) => x.product_id === 'lootboxth.iap.179')
    expect(Object.keys(p).indexOf('price_thb')).toBeLessThan(Object.keys(p).indexOf('price_usd'))
    expect(p).toMatchObject({
      name_th: '300 เหรียญทองมืด', name_en: null, item_pack: false, kind: 'currency',
      baseItemAmount: 300, bonusItemAmount: 0, totalItemAmount: 300,
      price_thb: 179, price_usd: null, prices: { THB: 179, USD: null },
      description_th: 'ซื้อแล้วได้รับ 300 เหรียญทองมืด', contents: [{ item: 'เหรียญทองมืด', amount: 300 }]
    })
    expect(p.price_usd_null_reason).toContain('Thai App Store only')
    expect(p.name_en_null_reason).toBeTruthy()
    expect(calls.some((u) => u.startsWith(API + 'us/'))).toBe(true)
    expect(calls.some((u) => /resell|codashop|seagm|unipin/i.test(u))).toBe(false)
  })

  it('App Store down -> 502', async () => {
    mock({ apple: false })
    const res = await get()
    expect(res.status).toBe(502)
  })
})

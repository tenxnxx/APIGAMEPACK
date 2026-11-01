import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { getGameBySlug } from './games/registry'
import { fetchVampirPacks, vampirDiamondAmount, vampirKind } from './services/vampir-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => {
  globalThis.fetch = originalFetch
  clearPacksCache()
})
const get = (slug = 'vampir') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))

const WS = 'https://vampirshop.netmarble.com/api/shop/products'
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const wp = (code: string, name: string, amount: number, cur: 'THB' | 'USD', desc: string) => ({
  productCode: code, productName: name, amount, currencyCode: cur, dispAmount: String(amount),
  productDetailDescription: desc, productImageURL: `https://img/${code}.png`, maxQuantityPerOrder: 10, startSaleDatetime: 0, endSaleDatetime: 0, tags: {}
})
const WEB: Record<string, any[]> = {
  'TH-TH': [wp('theredkr_dia_001', '320 ไดอา', 99, 'THB', 'ซื้อสินค้า320 ไดอา'), wp('theredkr_dia_002', '720 ไดอา', 249, 'THB', 'ซื้อสินค้า720 ไดอา')],
  'TH-EN': [wp('theredkr_dia_001', '320 Diamonds', 99, 'THB', 'Purchase 320 Diamonds'), wp('theredkr_dia_002', '720 Diamonds', 249, 'THB', 'Purchase 720 Diamonds')],
  // dia_002 missing from the US web shop -> USD from App Store US by product code
  'US-EN': [wp('theredkr_dia_001', '320 Diamonds', 2.99, 'USD', 'Purchase 320 Diamonds')]
}
const row = (id: string, offerName: string, name: string, price: number, cur: 'THB' | 'USD', desc: string) => ({
  id, type: 'in-apps',
  attributes: { name, offerName, description: { standard: desc }, offers: [{ currencyCode: cur, price, priceFormatted: String(price) }] }
})
const TH = [
  row('1', 'theredkr_dia_001', '320 ไดอา', 99, 'THB', 'ซื้อสินค้า320 ไดอา'),
  row('2', 'thered_a_master_new3_t1', 'แพ็กเกจ VAMPIR 1', 35, 'THB', 'ซื้อสินค้าแพ็กเกจ VAMPIR 1'),
  row('3', 'theredkr_apple_event2_t22', '2,400 Diamonds', 799, 'THB', 'Purchase 2,400 Diamonds'),
  row('4', 'thered_a_master_new3_t60', 'แพ็กเกจ VAMPIR 60', 3700, 'THB', 'ซื้อสินค้าแพ็กเกจ VAMPIR 60'),
  row('5', 'thered_a_master_new3_t99', 'แพ็กเกจ VAMPIR 99', 9999, 'THB', 'ซื้อสินค้าแพ็กเกจ VAMPIR 99')
]
const US = [
  row('1', 'theredkr_dia_001', '320 Diamonds', 2.99, 'USD', 'Purchase 320 Diamonds'),
  row('9', 'theredkr_dia_002', '720 Diamonds', 6.99, 'USD', 'Purchase 720 Diamonds'),
  row('2', 'thered_a_master_new3_t1', 'Vampir Package 1', 0.99, 'USD', 'Purchase Vampir Package 1'),
  row('3', 'theredkr_apple_event2_t22', '2,400 Diamonds', 21.99, 'USD', 'Purchase 2,400 Diamonds')
]
const KH = [row('4', 'thered_a_master_new3_t60', 'Vampir Package 60', 99.99, 'USD', 'Purchase Vampir Package 60')]
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
function mock(opts: { web?: boolean; apple?: boolean } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith(WS)) {
      if (opts.web === false) return new Response('down', { status: 503 })
      const c = url.match(/country=(\w+)/)![1], l = url.match(/locale=(\w+)/)![1]
      return Response.json({ errorCode: 0, resultData: WEB[`${c}-${l}`] ?? [] })
    }
    if (opts.apple === false && url.startsWith(API)) return new Response('down', { status: 503 })
    if (url.startsWith(API + 'th/')) return page(TH)(url)
    if (url.startsWith(API + 'us/')) return page(US)(url)
    if (url.startsWith(API + 'kh/')) return page(KH)(url)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
  return calls
}
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const byPid = (b: any, pid: string) => all(b).find((p: any) => p.product_id === pid)

describe('VAMPIR (Netmarble official Web Shop + App Store)', () => {
  it('registry: slug + aliases resolve to the Netmarble provider', () => {
    for (const s of ['vampir', 'vampir-netmarble', 'vampir-mmorpg'])
      expect(getGameBySlug(s)).toMatchObject({ slug: 'vampir', appId: 6738163891, provider: 'vampir-netmarble' })
  })

  it('parses Diamond amounts and kinds from official names only', () => {
    expect(vampirDiamondAmount('7,200 Diamonds')).toBe(7200)
    expect(vampirDiamondAmount('1,600 ไดอา')).toBe(1600)
    expect(vampirDiamondAmount('Vampir Package 7')).toBeNull()
    expect(vampirKind('theredkr_dia_003', null, null)).toBe('diamonds')
    expect(vampirKind('thered_a_master_new3_t7', 'Vampir Package 7', 'แพ็กเกจ VAMPIR 7')).toBe('package')
  })

  it('web shop Diamonds: THB first then USD, base + bonus (total), TH/EN names; USD from web shop US else App Store', async () => {
    mock()
    const res = await get()
    expect(res.status).toBe(200)
    const b: any = await res.json()
    expect(b.game).toMatchObject({ id: 6738163891, slug: 'vampir', name: 'VAMPIR', itemName: 'Diamonds' })
    expect(b.publisher).toBe('Netmarble')
    expect(b.categories.map((c: any) => c.name)).toEqual(['Diamonds (Official Web Shop)', 'Diamonds (App Store)', 'VAMPIR Packages (App Store)'])
    expect(b.summary).toEqual({ categoryCount: 3, packCount: 6 })
    expect(b.source_mode).toBe('webshop+appstore')
    const d1 = byPid(b, 'theredkr_dia_001')
    expect(Object.keys(d1).indexOf('price_thb')).toBeLessThan(Object.keys(d1).indexOf('price_usd'))
    expect(d1).toMatchObject({
      id: 1, name: '320 Diamonds', name_th: '320 ไดอา', item_pack: false, kind: 'diamonds',
      baseItemAmount: 320, bonusItemAmount: 0, totalItemAmount: 320,
      price: 99, currency: 'THB', price_thb: 99, price_usd: 2.99, prices: { THB: 99, USD: 2.99 },
      description_th: 'ซื้อสินค้า320 ไดอา', description_en: 'Purchase 320 Diamonds',
      contents: [{ item: 'Diamonds', name_th: 'ไดอา', amount: 320 }], appstore_th_price: 99
    })
    expect(d1.price_thb_source).toContain('netmarble-official-webshop (country=TH')
    expect(d1.price_usd_source).toContain('netmarble-official-webshop (country=US')
    const d2 = byPid(b, 'theredkr_dia_002')
    expect(d2).toMatchObject({ price_thb: 249, price_usd: 6.99, baseItemAmount: 720, totalItemAmount: 720 })
    expect(d2.price_usd_source).toContain('apple-app-store-us')
    // the App Store copy of a web shop product is not listed twice
    expect(all(b).filter((p: any) => p.product_id === 'theredkr_dia_001')).toHaveLength(1)
  })

  it('App Store packages: item_pack with TH/EN descriptions, contents null with reason; USD US -> KH, else null with reason', async () => {
    mock()
    const b: any = await (await get('vampir-netmarble')).json()
    const p1 = byPid(b, 'thered_a_master_new3_t1')
    expect(p1).toMatchObject({
      name: 'Vampir Package 1', name_th: 'แพ็กเกจ VAMPIR 1', item_pack: true, kind: 'package',
      baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null,
      price_thb: 35, price_usd: 0.99, description_th: 'ซื้อสินค้าแพ็กเกจ VAMPIR 1', description_en: 'Purchase Vampir Package 1', contents: null
    })
    expect(p1.contents_null_reason).toContain('in-game only')
    expect(p1.base_null_reason).toBeTruthy()
    const p60 = byPid(b, 'thered_a_master_new3_t60')
    expect(p60).toMatchObject({ price_thb: 3700, price_usd: 99.99, name: 'Vampir Package 60' })
    expect(p60.price_usd_source).toContain('apple-app-store-kh')
    const p99 = byPid(b, 'thered_a_master_new3_t99')
    expect(p99.price_usd).toBeNull()
    expect(p99.price_usd_null_reason).toContain('no FX conversion')
    expect(p99.name_en).toBeNull()
    expect(p99.name_en_null_reason).toBeTruthy()
    const ev = byPid(b, 'theredkr_apple_event2_t22')
    expect(ev).toMatchObject({ kind: 'diamonds', item_pack: false, baseItemAmount: 2400, bonusItemAmount: 0, totalItemAmount: 2400, price_thb: 799, price_usd: 21.99 })
    expect(ev.name_th).toBeNull()
    expect(ev.name_th_null_reason).toBeTruthy()
  })

  it('web shop down -> App Store only (Diamonds from App Store), with a warning', async () => {
    mock({ web: false })
    const b: any = await fetchVampirPacks()
    expect(b.source_mode).toBe('appstore-only')
    expect(b.warnings.join(' ')).toContain('Official Web Shop (TH) unavailable')
    expect(byPid(b, 'theredkr_dia_001')).toMatchObject({ price_thb: 99, price_usd: 2.99, baseItemAmount: 320 })
  })

  it('App Store down -> web shop Diamonds still served', async () => {
    mock({ apple: false })
    const b: any = await fetchVampirPacks()
    expect(b.source_mode).toBe('webshop-only')
    expect(b.summary.packCount).toBe(2)
    const d2 = byPid(b, 'theredkr_dia_002')
    expect(d2.price_usd).toBeNull()
    expect(d2.price_usd_null_reason).toContain('no FX conversion')
  })

  it('all official sources down -> 502', async () => {
    mock({ web: false, apple: false })
    const res = await get('vampir-mmorpg')
    expect(res.status).toBe(502)
  })
})

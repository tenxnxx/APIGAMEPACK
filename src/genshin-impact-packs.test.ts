import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { genshinAppStoreClassify, welkinContents } from './services/genshin-impact-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'genshin-impact') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
type H = (url: string, init?: RequestInit) => Response
function mock(map: Record<string, H>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f(url, init)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const price = (amount: number, orig = 0) => ({ amount: String(amount), amount_decimal: 2, currency: 'THB', amount_display: '฿' + amount / 100, original_amount: String(orig), original_amount_decimal: orig ? 2 : 0 })
const WELKIN_EN = 'Blessing of the Welkin Moon<br>\nEach time you purchase Blessing of the Welkin Moon, you will immediately receive 300 Genesis Crystals and 30 days of the Blessing.<br>\nDuring this 30-day period, you can claim 90 Primogems each day when you log in.'
const goods = (lang: 'th' | 'en') => [
  { goods_id: 'ys_glb_primogem1ststall_tier1', goods_name: 'Genesis\u00a0Crystals', goods_desc: '', goods_type: 'virtual_currency', goods_type_desc: 'Genesis Crystals', price: price(3500), virtual_currency: { count: 60, count_bonus: 60, bonus_once_eligible: true, bonus_once_extra_count: 0 }, launch_end_time: '0' },
  { goods_id: 'ysglbbeyondgem2ndstalltier5', goods_name: 'Chronal Nexus', goods_desc: '', goods_type: 'virtual_currency', price: price(17900), virtual_currency: { count: 300, count_bonus: 30, bonus_once_eligible: true, bonus_once_extra_count: 270 } },
  { goods_id: 'ys_glb_blessofmoon_tier5', goods_name: lang === 'en' ? 'Blessing of the Welkin Moon' : 'พรแห่งดวงจันทร์', goods_type: 'vip_card', price: price(17900), goods_desc: lang === 'en' ? WELKIN_EN : 'ทุกครั้งที่ซื้อพรแห่งดวงจันทร์ จะได้รับ Genesis Crystal 300 อัน', purchase_quantity_limit: 1 },
  { goods_id: 'ys_glb_bp_extra_tier20', goods_name: lang === 'en' ? 'Gnostic Chorus' : 'BP เทพเจ้า', goods_type: 'bp', bp: { type: 'big' }, price: price(72900, 77800), goods_desc: lang === 'en' ? 'Gnostic Chorus<br />\nSee "Main Page > Battle Pass".' : 'BP เทพเจ้า', purchase_quantity_limit: 1 }
]
const asRow = (id: string, offerName: string, name: string, p: number, cur: string) => ({ id, type: 'in-apps', attributes: { name, offerName, description: { standard: name }, offers: [{ currencyCode: cur, price: p, priceFormatted: String(p) }] } })
const US = [
  asRow('11', 'ys_glb_primogem1ststall_tier1', '60 Genesis Crystals', 0.99, 'USD'),
  asRow('12', 'ysglbbeyondgem2ndstalltier5', '300 Chronal Nexus', 4.99, 'USD'),
  asRow('13', 'ys_glb_blessofmoon_tier5', 'Blessings Bundle', 4.99, 'USD')
]
const TH = [asRow('11', 'ys_glb_primogem1ststall_tier1', '60 Genesis Crystals', 35, 'THB'), asRow('20', 'ysglbgachaticketpink10tierusd2199', 'Intertwined Fate ×10', 799, 'THB')]
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const GOODS = 'https://hk4e-topup-os.hoyoverse.com/hk4e_global/mm-backpack/v1/listGoodsWebPublic'
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
const apple = { [API + 'th/']: page(TH), [API + 'us/']: page(US), [API + 'kh/']: page([]), [API + 'la/']: page([]), [API + 'mm/']: page([]) }
const topup: H = (_u, init) => {
  const lang = String((init?.headers as any)?.['x-rpc-language'] ?? 'th-th')
  return Response.json({ retcode: 0, message: 'OK', data: { goods_list: goods(lang.startsWith('en') ? 'en' : 'th') } })
}
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const by = (b: any, id: string) => all(b).find((p: any) => p.product_id === id)

describe('Genshin Impact (HoYoverse Top-Up Center TH + App Store USD)', () => {
  it('parses Welkin contents and App Store fallback items', () => {
    expect(welkinContents(WELKIN_EN)).toEqual([
      { item: 'Genesis Crystal', amount: 300 },
      { item: 'Blessing of the Welkin Moon (days)', amount: 30 },
      { item: 'Primogem (daily login, per day)', amount: 90 }
    ])
    expect(genshinAppStoreClassify({ productId: 'ys_glb_primogem6thstall_tier60', nameEn: '6480 Genesis Crystals', nameTh: null, rawName: '6480 Genesis Crystals', descEn: null, descTh: null } as any)).toMatchObject({ kind: 'currency', baseItemAmount: 6480 })
    expect(genshinAppStoreClassify({ productId: 'ysglbgachaticketpink10tierusd2199', nameEn: 'Intertwined Fate ×10', nameTh: null, rawName: 'x', descEn: null, descTh: null } as any)).toMatchObject({ kind: 'bundle', contents: [{ item: 'Intertwined Fate', amount: 10 }] })
  })

  it('THB from the Top-Up Center with first-purchase bonus, USD from App Store; aliases resolve', async () => {
    mock({ [GOODS]: topup, ...apple })
    for (const slug of ['genshin-impact', 'genshin', 'gi']) {
      const res = await get(slug)
      expect(res.status).toBe(200)
      const b: any = await res.json()
      expect(b.game.slug).toBe('genshin-impact')
      expect(b.summary.packCount).toBe(4)
    }
    const b: any = await (await get()).json()
    expect(b.source_mode).toBe('hoyoverse-topup-center')
    expect(b.categories.map((c: any) => c.name)).toEqual(['Genesis Crystals (HoYoverse Top-Up Center)', 'Chronal Nexus (HoYoverse Top-Up Center)', 'Welkin Moon & Passes (HoYoverse Top-Up Center)'])
    expect(by(b, 'ys_glb_primogem1ststall_tier1')).toMatchObject({ item: 'Genesis Crystal', price_thb: 35, price_usd: 0.99, baseItemAmount: 60, bonusItemAmount: 60, totalItemAmount: 120, item_pack: false })
    expect(by(b, 'ysglbbeyondgem2ndstalltier5')).toMatchObject({ item: 'Chronal Nexus', baseItemAmount: 300, bonusItemAmount: 300, totalItemAmount: 600, bonus_breakdown: { count_bonus: 30, bonus_once_extra_count: 270 } })
    const w = by(b, 'ys_glb_blessofmoon_tier5')
    expect(w).toMatchObject({ kind: 'pass', item_pack: true, price_thb: 179, price_usd: 4.99, name_th: 'พรแห่งดวงจันทร์' })
    expect(w.contents).toHaveLength(3)
    expect(w.description_th).toContain('พรแห่งดวงจันทร์')
    const bp = by(b, 'ys_glb_bp_extra_tier20')
    expect(bp).toMatchObject({ price_thb: 729, original_price_thb: 778, price_usd: null, contents: null, pass_type: 'big' })
    expect(bp.price_usd_null_reason).toMatch(/no FX conversion/)
    expect(bp.contents_null_reason).toMatch(/in-game/)
  })

  it('Top-Up Center down -> App Store TH fallback; everything down -> 502', async () => {
    mock({ ...apple })
    const res = await get()
    expect(res.status).toBe(200)
    const b: any = await res.json()
    expect(b.topup_center_error).toBeTruthy()
    expect(by(b, 'ys_glb_primogem1ststall_tier1')).toMatchObject({ price_thb: 35, price_usd: 0.99, baseItemAmount: 60 })
    mock({})
    expect((await get()).status).toBe(502)
  })
})

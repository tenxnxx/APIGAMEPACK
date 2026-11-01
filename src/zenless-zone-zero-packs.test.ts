import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { zzzContents, zzzKind, zzzMembershipContents } from './services/zenless-zone-zero-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'zenless-zone-zero') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
type H = (url: string, init?: RequestInit) => Response
function mock(map: Record<string, H>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f(url, init)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const price = (amount: number, cur: string, orig = 0) => ({ amount: String(amount), amount_decimal: 2, currency: cur, amount_display: cur + amount / 100, original_amount: String(orig), original_amount_decimal: orig ? 2 : 0 })
const goods = (lang: 'th' | 'en') => [
  { goods_id: 'napglbtopup60rmb600', goods_name: 'Monochrome', goods_desc: '', goods_type: 'virtual_currency', goods_type_desc: lang === 'en' ? 'Monochrome Market' : 'x', price: price(3500, 'THB'), virtual_currency: { count: 60, count_bonus: 60, bonus_once_eligible: true }, purchase_quantity_limit: 10, launch_end_time: '0' },
  { goods_id: 'napglbtopup6480rmb64800', goods_name: 'Monochrome', goods_desc: '', goods_type: 'virtual_currency', price: price(370000, 'THB'), virtual_currency: { count: 6480, count_bonus: 6480 }, launch_end_time: '0' },
  { goods_id: 'napglbvip30tierrmb3000', goods_name: lang === 'en' ? 'Inter-Knot Membership' : 'สมาชิก Inter-Knot', goods_type: 'vip_card', price: price(17900, 'THB'),
    goods_desc: lang === 'en' ? 'Each time you purchase the Inter-Knot Membership, you will immediately receive 300 Monochromes and 30 days of Inter-Knot Membership.<br />\nWhile your Inter-Knot Membership is active, you will receive 90 Polychromes upon logging in to the game every day.' : 'ทุกครั้งที่ซื้อ จะได้รับ Monochrome 300 อัน' },
  { goods_id: 'napglbbp128rmb12800', goods_name: lang === 'en' ? 'New Eridu City Fund: Premium Plan' : 'New Eridu City Fund: แผนสะสม', goods_type: 'bp', price: price(72900, 'THB', 77800), goods_desc: lang === 'en' ? 'Rewards can be viewed in game.' : 'ดูในเกม', launch_end_time: '1795892399', purchase_quantity_limit: 1 },
  { goods_id: 'napglbsharedtier1rmb9800', goods_name: lang === 'en' ? 'Entertainment Invitation Limited Gift' : 'กล่องของขวัญลิมิเต็ด', goods_type: 'consumable', price: price(54900, 'THB'),
    goods_desc: lang === 'en' ? 'Purchase to get Entertainment Invitation Limited Gift ×1. Contains: Encrypted Master Tape ×10, Denny ×100,000<br />\n• If a duplicate purchase occurs...' : 'เมื่อซื้อจะได้รับ ×1 ซึ่งประกอบด้วย: Encrypted Master Tape ×10, Denny ×100,000' },
  { goods_id: 'napglbbundle99rmb600', goods_name: lang === 'en' ? 'New Gift' : 'ของขวัญใหม่', goods_type: 'consumable', price: price(3500, 'THB'), goods_desc: lang === 'en' ? 'Purchase to get New Gift ×1. Contains: Master Tape ×1' : '' }
]
const asRow = (id: string, offerName: string, name: string, p: number, cur: string) => ({ id, type: 'in-apps', attributes: { name, offerName, description: { standard: name }, offers: [{ currencyCode: cur, price: p, priceFormatted: '$' + p }] } })
const US = [
  asRow('11', 'napglbtopup60rmb600', 'Monochrome ×60', 0.99, 'USD'),
  asRow('12', 'napglbtopup6480rmb64800', 'Monochrome ×6480', 99.99, 'USD'),
  asRow('13', 'napglbvip30tierrmb3000', 'Inter-Knot Membership', 4.99, 'USD'),
  asRow('14', 'napglbbp128rmb12800', 'Premium Plan', 19.99, 'USD'),
  asRow('15', 'napglbsharedtier1rmb9800', 'Limited Gift', 14.99, 'USD')
]
const KH = [asRow('16', 'napglbbundle99rmb600', 'New Gift', 1.09, 'USD')]
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const GOODS = 'https://nap-topup-os.hoyoverse.com/nap_global/mm-backpack/v1/listGoodsWebPublic'
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
const topup: H = (url, init) => {
  expect(url).toContain('currency=THB')
  expect(url).toContain('country=TH')
  const lang = new Headers(init?.headers).get('x-rpc-language')
  return Response.json({ retcode: 0, message: 'OK', data: { goods_list: goods(lang === 'en-us' ? 'en' : 'th') } })
}
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const by = (b: any, id: string) => all(b).find((p: any) => p.product_id === id)

describe('zenless zone zero (HoYoverse Top-Up Center + App Store USD)', () => {
  it('parses official contents', () => {
    expect(zzzContents('Contains: 1-in-4 Selectable W-Engine ×1, Encrypted Master Tape ×1, and Master Tape ×1 • x')).toEqual([
      { item: '1-in-4 Selectable W-Engine', amount: 1 }, { item: 'Encrypted Master Tape', amount: 1 }, { item: 'Master Tape', amount: 1 }
    ])
    expect(zzzContents('Contains: Encrypted Master Tape ×10, Denny ×100,000')).toEqual([{ item: 'Encrypted Master Tape', amount: 10 }, { item: 'Denny', amount: 100000 }])
    expect(zzzContents('ประกอบด้วย: Encrypted Master Tape x5, Master Tape x5')?.length).toBe(2)
    expect(zzzContents('no list')).toBeNull()
    expect(zzzMembershipContents('receive 300 Monochromes and 30 days of Inter-Knot Membership. you will receive 90 Polychromes upon logging in to the game every day')).toEqual([
      { item: 'Monochrome', amount: 300 }, { item: 'Inter-Knot Membership (days)', amount: 30 }, { item: 'Polychrome (daily login, per day)', amount: 90 }
    ])
    expect(zzzKind({ goods_type: 'bp' })).toBe('pass')
  })

  it('serves THB from the Top-Up Center, USD from App Store US -> KH', async () => {
    mock({ [GOODS]: topup, [API + 'us/']: page(US), [API + 'kh/']: page(KH), [API + 'la/']: page([]), [API + 'mm/']: page([]) })
    const res = await get()
    expect(res.status).toBe(200)
    const b: any = await res.json()
    expect(b.source_mode).toBe('hoyoverse-topup-center')
    expect(b.game.slug).toBe('zenless-zone-zero')
    expect(b.summary.packCount).toBe(6)
    expect(b.categories.map((c: any) => c.packCount)).toEqual([2, 2, 2])
    expect(by(b, 'napglbtopup60rmb600')).toMatchObject({ kind: 'currency', item_pack: false, price_thb: 35, price_usd: 0.99, baseItemAmount: 60, bonusItemAmount: 60, totalItemAmount: 120, bonus_type: 'first_purchase', repeat_purchase_total: 60, purchase_limit: 10 })
    expect(by(b, 'napglbtopup6480rmb64800')).toMatchObject({ price_thb: 3700, price_usd: 99.99, totalItemAmount: 12960 })
    const vip = by(b, 'napglbvip30tierrmb3000')
    expect(vip).toMatchObject({ kind: 'pass', item_pack: true, name_en: 'Inter-Knot Membership', name_th: 'สมาชิก Inter-Knot', price_thb: 179, price_usd: 4.99 })
    expect(vip.contents[0]).toEqual({ item: 'Monochrome', amount: 300 })
    expect(vip.description_en).toContain('90 Polychromes')
    const bp = by(b, 'napglbbp128rmb12800')
    expect(bp).toMatchObject({ price_thb: 729, original_price_thb: 778, contents: null, available_until: '2026-11-28T18:59:59.000Z' })
    expect(bp.contents_null_reason).toMatch(/in-game/)
    expect(by(b, 'napglbsharedtier1rmb9800').contents).toEqual([{ item: 'Encrypted Master Tape', amount: 10 }, { item: 'Denny', amount: 100000 }])
    const kh = by(b, 'napglbbundle99rmb600')
    expect(kh).toMatchObject({ price_usd: 1.09, price_usd_source: 'apple-app-store-kh (offerName=napglbbundle99rmb600, item 16)', description_th: null })
    expect(kh.description_th_null_reason).toBeTruthy()
  })

  it('USD missing -> null with reason (no FX)', async () => {
    mock({ [GOODS]: topup, [API + 'us/']: page(US), [API + 'kh/']: page([]), [API + 'la/']: page([]), [API + 'mm/']: page([]) })
    const b: any = await (await get('zzz')).json()
    const p = by(b, 'napglbbundle99rmb600')
    expect(p.price_usd).toBeNull()
    expect(p.price_usd_null_reason).toMatch(/no FX conversion/)
  })

  it('falls back to App Store TH when the Top-Up Center fails', async () => {
    const TH = [asRow('11', 'napglbtopup60rmb600', 'Monochrome ×60', 35, 'THB'), asRow('13', 'napglbvip30tierrmb3000', 'Inter-Knot Membership', 179, 'THB')]
    mock({ [GOODS]: () => Response.json({ retcode: -1, message: 'err', data: null }), [API + 'th/']: page(TH), [API + 'us/']: page(US), [API + 'kh/']: page([]), [API + 'la/']: page([]), [API + 'mm/']: page([]) })
    const r = await get('zenless')
    expect(r.status).toBe(200)
    const b: any = await r.json()
    expect(b.source_mode).toBe('appstore-catalog-api')
    expect(b.topup_center_error).toMatch(/retcode/)
    expect(by(b, 'napglbtopup60rmb600')).toMatchObject({ baseItemAmount: 60, bonusItemAmount: null, price_thb: 35, price_usd: 0.99 })
  })

  it('502 when everything is down', async () => {
    mock({})
    expect((await get()).status).toBe(502)
  })
})

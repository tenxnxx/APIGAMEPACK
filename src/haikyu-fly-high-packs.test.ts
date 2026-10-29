import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchHaikyuFlyHighPacks, parseHaikyuChannels, haikyuAppleOffer, HAIKYU_PASS_RE,
  HaikyuInvalidUpstreamResponseError, HaikyuUpstreamUnavailableError
} from './services/haikyu-fly-high-packs.service'

const promo = (real = 0) => ({ total_promo_amount: real, real_promo_amount: real, onetime_promo_amount: 0, firsttime_promo_amount: 0 })
const it_ = (item_id: number, price: number, gems: number, name: string, description = '', more: Record<string, unknown> = {}) => ({
  app_id: 100153, item_id, app_point_amount: gems, currency: 'THB', currency_amount: price, original_currency_amount: price,
  extra_data: '{}', is_limited_package: false, promo: promo(), app_item: { name, description, logo: `https://cdn/${item_id}.png`, show_on_shop: true }, ...more
})
const items = (th: boolean) => [
  it_(11001, 39, 60, th ? 'เพชรรุ้ง 60 เม็ด' : '60 Star Gems', '', { promo: promo(6) }),
  it_(11002, 175, 300, th ? 'เพชรรุ้ง 300 เม็ด' : '300 Star Gems'),
  it_(41308, 476, 0, th ? 'แพ็คต้อนรับเทศกาล 1' : 'Festival Opening Special Pack I', th ? 'ตั๋วรับสมัคร Supreme*20' : 'Supreme Recruit Ticket*20', { is_limited_package: true }),
  it_(16001, 315, 0, th ? 'โบนัสเพิ่มเลเวล' : 'Level Up Bonuses', 'Star Gems on level up', { extra_data: JSON.stringify({ npc_config: { display_in_special_deal: true } }) }),
  it_(99999, 10, 0, 'Hidden', '', { app_item: { name: 'Hidden', show_on_shop: false } })
]
const ch = (channel: number, name: string, currency: string, its: any[]) => ({ channel, name, currency, visible: true, items: its })
const payload = (th = false) => ({
  app_info: { point_icon: 'https://cdn/gem.png' },
  channels: [
    ch(207074, 'ShopeePay', 'THB', items(th)),
    ch(207269, 'QR Code Promptpay', 'THB', items(th)),
    ch(207000, 'Garena card', 'GS', [{ ...it_(11001, 60, 60, 'x'), currency: 'GS' }]),
    ch(207034, 'True Money', 'THB', [it_(11101, 20, 34, th ? 'เพชรรุ้ง 34เม็ด' : '34 Star Gems')]),
    ch(207080, 'DTAC SMS', 'THB', [it_(11201, 19, 32, '32 Star Gems')]),
    ch(207100, 'AIS SMS', 'THB', [it_(11201, 19, 32, '32 Star Gems')])
  ]
})
const ai = (id: string, name: string, price: number, cur: string, offer: string) => ({
  id, attributes: { name, offerName: offer, isFamilyShareable: false, description: { standard: name }, offers: [{ price, priceFormatted: String(price), currencyCode: cur }] }
})
const appleTh = [
  ai('1', '60 เพชร', 39, 'THB', haikyuAppleOffer(11001)), ai('2', '300 เพชร', 175, 'THB', haikyuAppleOffer(11002)),
  ai('10', 'บัตรเดือน', 175, 'THB', 'hiq.diamond.11040111'), ai('11', 'Premium Pass', 350, 'THB', 'hiq.diamond.1990101'),
  ai('12', 'กองทุนเช็กอินประจำวัน', 175, 'THB', 'hiq.diamond.162001'), ai('13', 'แพ็กอีเวนต์', 99, 'THB', 'hiq.diamond.777')
]
const appleUs = [
  ai('1', '60 Star Gems', 0.99, 'USD', haikyuAppleOffer(11001)), ai('2', '300 Star Gems', 4.99, 'USD', haikyuAppleOffer(11002)),
  ai('16', 'Level Up Bonuses', 9.99, 'USD', haikyuAppleOffer(16001)),
  ai('10', 'Monthly Pass', 4.99, 'USD', 'hiq.diamond.11040111'), ai('11', 'Premium Pass', 9.99, 'USD', 'hiq.diamond.1990101'),
  ai('12', 'Daily Check-In Fund', 4.99, 'USD', 'hiq.diamond.162001'), ai('13', 'Event Pack', 2.99, 'USD', 'hiq.diamond.777')
]

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
function mock(o: { termgame?: number; sg?: number; body?: any; us?: number; kh?: boolean; th?: number } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: any) => {
    const url = String(input); calls.push(url)
    const j = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    const page0 = !/offset=[1-9]/.test(url)
    if (url.includes('/api/shop/apps/channels')) {
      const s = url.includes('termgame.com') ? o.termgame ?? 200 : o.sg ?? 200
      if (s !== 200) return j({ error: 'x' }, s)
      return j(o.body ?? payload(url.includes('language=th')))
    }
    if (url.includes('/th/apps/')) return o.th ? j({}, o.th) : j({ data: page0 ? appleTh : [] })
    if (url.includes('/us/apps/')) return o.us ? j({}, o.us) : j({ data: page0 ? appleUs : [] })
    if (url.includes('/kh/apps/') && o.kh) return j({ data: page0 ? appleUs : [] })
    return j({}, 404)
  }) as any
  return calls
}
const all = (r: any) => r.categories.flatMap((c: any) => c.packs)

describe('haikyu parsers', () => {
  it('parses THB channels, excludes GS and hidden items', () => {
    const r = parseHaikyuChannels(payload())
    expect(r.channels.map((c) => c.id)).toEqual([207074, 207269, 207034, 207080, 207100])
    expect(r.excluded.join()).toContain('207000')
    const qr = r.channels[1]
    expect(qr.items.map((i) => i.item_id)).toEqual([11001, 11002, 41308, 16001])
    expect(qr.items[0]).toMatchObject({ base: 60, price: 39, promo: { real: 6 } })
    expect(qr.items[3].special_deal).toBe(true)
    expect(() => parseHaikyuChannels({})).toThrow(HaikyuInvalidUpstreamResponseError)
  })
  it('matches pass names in English and Thai', () => {
    for (const n of ['Monthly Pass', 'Battle Pass', 'Daily Check-In Fund', 'บัตรเดือนพรีเมียม', 'กองทุนเช็กอินประจำวัน']) expect(HAIKYU_PASS_RE.test(n)).toBe(true)
    for (const n of ['Passion Pack', 'Recruit Ticket *5', 'แพ็กอีเวนต์']) expect(HAIKYU_PASS_RE.test(n)).toBe(false)
  })
})

describe('fetchHaikyuFlyHighPacks', () => {
  it('builds official Garena TH THB + App Store USD + passes, with sources and null reasons', async () => {
    const calls = mock()
    const r: any = await fetchHaikyuFlyHighPacks()
    expect(r.game).toMatchObject({ slug: 'haikyu-fly-high', itemName: 'Star Gems', id: 100153 })
    expect(calls[0]).toContain('termgame.com/api/shop/apps/channels?app_id=100153&region=TH&language=en')
    expect(calls.some((u) => u.includes('language=th'))).toBe(true)
    expect(calls.every((u) => !/codashop|seagm|unipin/i.test(u))).toBe(true)
    const p = all(r)
    const g60 = p.find((x: any) => x.id === 11001 && x.channel_id === 207269)
    expect(g60.prices).toEqual({ THB: 39, USD: 0.99 })
    expect(g60.baseItemAmount).toBe(60); expect(g60.bonusItemAmount).toBe(6); expect(g60.totalItemAmount).toBe(66)
    expect(g60.item_pack).toBe(false); expect(g60.name_th).toBe('เพชรรุ้ง 60 เม็ด')
    expect(g60.price_usd_source).toContain('apple-app-store-us'); expect(g60.appstore_th_price_thb).toBe(39)
    expect(g60.channel_name).toBe('QR Code Promptpay, ShopeePay')
    const fest = p.find((x: any) => x.id === 41308)
    expect(fest.item_pack).toBe(true); expect(fest.prices).toEqual({ THB: 476, USD: null })
    expect(fest.price_usd_null_reason).toContain('Not sold on the App Store')
    expect(fest.description_th).toContain('Supreme'); expect(fest.description_en).toContain('Recruit')
    expect(fest.base_null_reason).toBeTruthy()
    const lvl = p.find((x: any) => x.id === 16001)
    expect(lvl.pack_type).toBe('level-up-bonus'); expect(lvl.prices).toEqual({ THB: 315, USD: 9.99 })
    const passes = r.categories.find((c: any) => c.name.startsWith('Passes')).packs
    expect(passes.map((x: any) => x.product_id).sort()).toEqual(['hiq.diamond.11040111', 'hiq.diamond.162001', 'hiq.diamond.1990101'])
    const mp = passes.find((x: any) => x.product_id === 'hiq.diamond.11040111')
    expect(mp).toMatchObject({ name: 'Monthly Pass', name_th: 'บัตรเดือน', item_pack: true, kind: 'pass', pack_type: 'monthly-pass', prices: { THB: 175, USD: 4.99 } })
    expect(passes.find((x: any) => x.product_id === 'hiq.diamond.162001').pack_type).toBe('check-in-fund')
    expect(p.some((x: any) => x.product_id === 'hiq.diamond.777')).toBe(false)
    const tm = r.categories.find((c: any) => c.name.includes('True Money'))
    expect(tm.packs[0]).toMatchObject({ prices: { THB: 20, USD: null }, baseItemAmount: 34 })
    expect(tm.packs[0].price_usd_null_reason).toContain('Channel-specific')
    const sms = r.categories.filter((c: any) => c.name.includes('SMS'))
    expect(sms.length).toBe(1); expect(sms[0].name).toContain('DTAC SMS / AIS SMS')
    expect(p.some((x: any) => x.channel_id === 207000)).toBe(false)
    expect(r.categories.map((c: any) => c.id)).toEqual([1, 2, 3, 4, 5])
    expect(r.summary.packCount).toBe(p.length)
    for (const x of p) for (const k of ['THB', 'USD']) if (x.prices[k] === null) expect(x[`price_${k.toLowerCase()}_null_reason`]).toBeTruthy()
    expect(r.notes.join(' ')).toContain('Excluded: Garena card (207000, currency GS)')
  })
  it('falls back to shop.garena.sg and to KH for USD when US fails', async () => {
    const calls = mock({ termgame: 503, us: 503, kh: true })
    const r: any = await fetchHaikyuFlyHighPacks()
    expect(r.source).toContain('shop.garena.sg')
    const g = all(r).find((x: any) => x.id === 11002 && x.channel_id === 207269)
    expect(g.prices).toEqual({ THB: 175, USD: 4.99 }); expect(g.price_usd_source).toContain('apple-app-store-kh')
    expect(calls.some((u) => u.includes('/kh/apps/'))).toBe(true)
    expect(r.notes.join(' ')).toContain('App Store US')
  })
  it('keeps official THB when the App Store is unavailable, with reasons', async () => {
    mock({ us: 503, th: 503 })
    const r: any = await fetchHaikyuFlyHighPacks()
    const g = all(r).find((x: any) => x.id === 11001 && x.channel_id === 207269)
    expect(g.prices).toEqual({ THB: 39, USD: null }); expect(g.price_usd_null_reason).toContain('App Store US list unavailable')
    expect(r.categories.some((c: any) => c.name.startsWith('Passes'))).toBe(false)
  })
  it('maps upstream errors', async () => {
    mock({ termgame: 503, sg: 503 })
    await expect(fetchHaikyuFlyHighPacks()).rejects.toBeInstanceOf(HaikyuUpstreamUnavailableError)
    mock({ body: { channels: [] } })
    await expect(fetchHaikyuFlyHighPacks()).rejects.toBeInstanceOf(HaikyuInvalidUpstreamResponseError)
  })
})

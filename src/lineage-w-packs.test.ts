import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchLineageWPacks, linwKind, linwPassType, passDays, diamondsTier, tierContents, cleanText, purchaseLimit, parseShopPage,
  LineageWInvalidUpstreamResponseError, LineageWUpstreamUnavailableError
} from './services/lineage-w-packs.service'

const page = (ck: string) =>
  `<html><script>self.__next_f.push([1,"{\\"storeID\\":\\"ncvshop\\",\\"clientKey\\":\\"${ck}\\",\\"display\\":{\\"productGroup\\":{\\"G1\\":\\"Special\\",\\"G3\\":\\"Diamond\\",\\"G4\\":\\"Membership\\",\\"G5\\":\\"Key\\"}}}"])</script></html>`
const CK_TH = 'eyJhbGciOiJIUzI1NiJ9.eyJjIjoiMTIxMTAyIn0.thkeythkeythkey'
const CK_SG = 'eyJhbGciOiJIUzI1NiJ9.eyJjIjoiMTQxMTAyIn0.sgkeysgkeysgkey'
const prod = (id: string, g: string, name: string, desc: string, cur: string, price: number, order = 1) => ({
  enable: 1, hidden: 0, sellingProductID: id, productName: name, productGroup: g, description: desc, productType: 'PACKAGE',
  prices: { [cur]: { currency: cur, price, convertionRate: 0 } }, inGameCurrency: 'Diamond', orderDisplay: order
})
const thProducts = {
  'sa.lw.ws.101': prod('sa.lw.ws.101', 'G3', 'แพ็ค 40 เพชร', 'เพชร 40, Mileage 8', 'THB', 28),
  'sa.lw.ws.117': prod('sa.lw.ws.117', 'G3', 'แพ็ค 20,000 เพชร', 'เพชร 20,000, Mileage 4,000', 'THB', 14000),
  'sa.lw.ws.166': prod('sa.lw.ws.166', 'G3', 'กล่องเสบียงเพชรอันโชติช่วง', '<p>จำกัด: 4 ครั้ง/บัญชี/สัปดาห์<br>เพชรไม่ผูกมัด x2000<br>ไมล์เลจ x400</p>', 'THB', 1400),
  'sa.lw.ws.133': prod('sa.lw.ws.133', 'G4', 'สมาชิกซิลเวอร์ (28 วัน)', '<p>ไดอา x400, Mileage x80</p>', 'THB', 280),
  'sa.lw.ws.175': prod('sa.lw.ws.175', 'G5', 'กุญแจปลดล็อกพรีเมียมเส้นทางแห่งการเสริมพลัง', '<p>จำกัด: 1 ครั้ง/บัญชี<br>ไมล์เลจ x80</p>', 'THB', 280),
  'sa.lw.ws.obchest1': prod('sa.lw.ws.obchest1', 'G1', 'แพ็กพิเศษ LW OBT I', '<p>อาเดนา 1000000</p><p>ไมล์เลจ 8</p>', 'THB', 28),
  'sa.lw.ws.999': { ...prod('sa.lw.ws.999', 'G1', 'hidden', '', 'THB', 1), hidden: 1 }
}
const sgProducts = {
  'sa.lw.ws.101': prod('sa.lw.ws.101', 'G3', '40 Diamonds', '40 Diamonds, 8 Mileage', 'SGD', 1.2),
  'sa.lw.ws.117': prod('sa.lw.ws.117', 'G3', '20,000 Diamonds', '20,000 Diamonds, 4,000 Mileage', 'SGD', 600),
  'sa.lw.ws.166': prod('sa.lw.ws.166', 'G3', 'Resplendent Diamond Supply Box', '<p>Limit: 4/account/week<br>Unengraved Diamond x2000<br>Mileage x400</p>', 'SGD', 60),
  'sa.lw.ws.133': prod('sa.lw.ws.133', 'G4', 'Silver Membership (28D)', '<p><!-- x -->Limit 1 per account every 28 days<br>Diamond x400, Mileage x80</p>', 'SGD', 12),
  'sa.lw.ws.175': prod('sa.lw.ws.175', 'G5', 'Journey of Enhancement Premium Unlock Key', '<p>Purchase Limit: 1 times/account<br>Mileage x80</p>', 'SGD', 12)
}
const item = (id: string, name: string, price: number, cur: string) => ({ id, attributes: { name, offers: [{ price, priceFormatted: String(price), currencyCode: cur }] } })

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
function mock(opts: { shop?: 'ok' | 'down' | 'bad' | 'nokey'; sg?: 'ok' | 'down'; apple?: 'none' | 'us' | 'kh' } = {}) {
  const calls: { url: string; body?: string }[] = []
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input); calls.push({ url, body: init?.body ? String(init.body) : undefined })
    const j = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    if (url.startsWith('https://shop.ncvgames.com/th/')) {
      if (opts.shop === 'down') return new Response('x', { status: 503 })
      return new Response(page(opts.shop === 'nokey' ? '' : CK_TH), { status: 200 })
    }
    if (url.startsWith('https://shop.ncvgames.com/sg/')) return opts.sg === 'down' ? new Response('x', { status: 500 }) : new Response(page(CK_SG), { status: 200 })
    if (url.startsWith('https://billing.vnggames.com/')) {
      const b = new URLSearchParams(String(init?.body ?? ''))
      if (b.get('clientKey') === CK_TH) return opts.shop === 'bad' ? j({ returnCode: 1, data: { nope: 1 } }) : j({ returnCode: 1, returnMessage_: 'SUCCESS', data: { products: thProducts } })
      if (b.get('clientKey') === CK_SG) return j({ returnCode: 1, returnMessage_: 'SUCCESS', data: { products: sgProducts } })
      return j({ returnCode: -1, returnMessage_: 'INVALID_DATA_INPUT' })
    }
    if (url.includes('apps.apple.com')) {
      if (!/[?&]offset=0(&|$)/.test(url)) return j({ data: [] })
      if (opts.apple === 'us' && url.includes('/us/apps/')) return j({ data: [item('1', '40 Diamonds', 0.99, 'USD'), item('2', 'Silver Membership (28D)', 9.99, 'USD')] })
      if (opts.apple === 'kh' && url.includes('/kh/apps/')) return j({ data: [item('3', '20,000 Diamonds', 499.99, 'USD')] })
      return j({ errors: [{ title: 'No related resources' }] }, 404)
    }
    return new Response('unexpected', { status: 599 })
  }) as any
  return calls
}
const allPacks = (r: any) => r.categories.flatMap((c: any) => c.packs)
const byId = (r: any, id: string) => allPacks(r).find((p: any) => p.product_id === id)

describe('lineage w parsers', () => {
  it('parses names, contents and kinds', () => {
    expect(diamondsTier('20,000 Diamonds', null)).toBe(20000)
    expect(diamondsTier(null, 'แพ็ค 1,200 เพชร')).toBe(1200)
    expect(diamondsTier('Resplendent Diamond Supply Box', 'กล่องเสบียงเพชร')).toBeNull()
    expect(tierContents('4,000 Diamonds, 800 Mileage', null)).toEqual({ diamonds: 4000, mileage: 800, plain: true })
    expect(cleanText('<p><!--x--><span>Limit 1<br>Box x1&nbsp;</span></p>')).toBe('Limit 1 / Box x1')
    expect(purchaseLimit('<p>Purchase Limit: 4 times/account/week<br>x</p>')).toBe('Purchase Limit: 4 times/account/week')
    expect(passDays('Silver Membership (28D)')).toBe(28)
    expect(passDays('สมาชิกโกลด์ (28 วัน)')).toBe(28)
    expect(linwPassType('Gold Membership (28D)', '')).toBe('gold-membership')
    expect(linwPassType('Halloween Festival Premium Unlock Key', '')).toBe('premium-pass-unlock')
    expect(linwKind({ sellingProductID: 'x', productName: 'สมาชิกซิลเวอร์ (28 วัน)', productGroup: 'G4' }, 'Silver Membership (28D)')).toBe('membership')
    expect(linwKind({ sellingProductID: 'x', productName: 'กุญแจแห่งการเติบโต', productGroup: 'G5' }, 'Journey of Growth Key')).toBe('pass')
    expect(linwKind({ sellingProductID: 'x', productName: 'แพ็ค 40 เพชร', productGroup: 'G3' }, '40 Diamonds')).toBe('currency')
    expect(parseShopPage(page(CK_TH))).toEqual({ clientKey: CK_TH, groups: { G1: 'Special', G3: 'Diamond', G4: 'Membership', G5: 'Key' } })
    expect(parseShopPage('<html></html>')).toBeNull()
  })
})

describe('fetchLineageWPacks', () => {
  it('uses the official NCV shop for THB/Thai text, SG shop for English, and null USD with a reason when Apple does not sell it', async () => {
    const calls = mock()
    const r: any = await fetchLineageWPacks()
    expect(calls.some((c) => /codashop|seagm|unipin/i.test(c.url))).toBe(false)
    expect(r.summary.packCount).toBe(6)
    const packs = allPacks(r)
    for (const p of packs) {
      expect(Object.keys(p.prices)).toEqual(['THB', 'USD'])
      expect(typeof p.prices.THB).toBe('number')
      const reasonKey: Record<string, string> = {
        price_usd: 'price_usd_null_reason', baseItemAmount: 'base_null_reason', bonusItemAmount: 'bonus_null_reason', totalItemAmount: 'total_null_reason',
        name_en: 'name_en_null_reason', description_en: 'description_en_null_reason', description_th: 'description_th_null_reason', description: 'description_null_reason',
        mileage: 'mileage_null_reason', purchase_limit: 'purchase_limit_null_reason', pass_days: 'pass_days_null_reason', first_purchase_bonus: 'first_purchase_bonus_null_reason'
      }
      for (const [k, rk] of Object.entries(reasonKey)) if (k in p && p[k] === null) expect(typeof p[rk], `${p.product_id}.${k} null without ${rk}`).toBe('string')
    }
    const d40 = byId(r, 'sa.lw.ws.101')
    expect(d40).toMatchObject({ kind: 'currency', name_en: '40 Diamonds', name_th: 'แพ็ค 40 เพชร', price_thb: 28, price_usd: null, baseItemAmount: 40, bonusItemAmount: 0, totalItemAmount: 40, mileage: 8, item_pack: false })
    expect(d40.price_usd_null_reason).toMatch(/no USD storefront/)
    expect(d40.price_usd_null_reason).toMatch(/US \(App Store IAP API HTTP 404/)
    expect(d40.price_thb_source).toMatch(/ncv-games-shop-th/)
    expect(byId(r, 'sa.lw.ws.166')).toMatchObject({ kind: 'bundle', item_pack: true, baseItemAmount: null, purchase_limit: 'Limit: 4/account/week', mileage: 400 })
    expect(byId(r, 'sa.lw.ws.133')).toMatchObject({ kind: 'membership', item_pack: true, pass_type: 'silver-membership', pass_days: 28, description_en: 'Limit 1 per account every 28 days / Diamond x400, Mileage x80' })
    expect(byId(r, 'sa.lw.ws.175')).toMatchObject({ kind: 'pass', item_pack: true, pass_type: 'premium-pass-unlock' })
    const ob = byId(r, 'sa.lw.ws.obchest1')
    expect(ob).toMatchObject({ name_en: null, name: 'แพ็กพิเศษ LW OBT I', description_th: 'อาเดนา 1000000 / ไมล์เลจ 8' })
    expect(ob.name_en_null_reason).toMatch(/not in the official NCV shop SG/)
    expect(byId(r, 'sa.lw.ws.999')).toBeUndefined()
    const sgBody = calls.find((c) => c.body?.includes('country=SG'))!.body!
    expect(sgBody).toContain('lang=en')
    expect(r.categories.map((c: any) => c.id)).toEqual([1, 2, 3, 4])
  })

  it('takes USD from App Store US, else KH, by exact English name', async () => {
    mock({ apple: 'us' })
    let r: any = await fetchLineageWPacks()
    expect(byId(r, 'sa.lw.ws.101').prices).toEqual({ THB: 28, USD: 0.99 })
    expect(byId(r, 'sa.lw.ws.133').price_usd_source).toMatch(/apple-app-store-us/)
    expect(byId(r, 'sa.lw.ws.117').price_usd).toBeNull()
    mock({ apple: 'kh' })
    r = await fetchLineageWPacks()
    expect(byId(r, 'sa.lw.ws.117')).toMatchObject({ price_usd: 499.99, price_usd_source: expect.stringMatching(/apple-app-store-kh/) })
  })

  it('keeps THB when the English SG list fails', async () => {
    mock({ sg: 'down' })
    const r: any = await fetchLineageWPacks()
    expect(byId(r, 'sa.lw.ws.101')).toMatchObject({ price_thb: 28, name_en: null, name: 'แพ็ค 40 เพชร', baseItemAmount: 40 })
    expect(byId(r, 'sa.lw.ws.101').name_en_null_reason).toMatch(/SG English list unavailable/)
  })

  it('maps upstream failures to error classes', async () => {
    mock({ shop: 'down' })
    await expect(fetchLineageWPacks()).rejects.toBeInstanceOf(LineageWUpstreamUnavailableError)
    mock({ shop: 'bad' })
    await expect(fetchLineageWPacks()).rejects.toBeInstanceOf(LineageWInvalidUpstreamResponseError)
    mock({ shop: 'nokey' })
    await expect(fetchLineageWPacks()).rejects.toBeInstanceOf(LineageWInvalidUpstreamResponseError)
  })
})

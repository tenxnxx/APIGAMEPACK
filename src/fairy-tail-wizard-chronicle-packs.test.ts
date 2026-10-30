import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchFairyTailWizardChroniclePacks, parseFtwcDescription, parseFtwcItems,
  FairyTailInvalidUpstreamResponseError, FairyTailUpstreamUnavailableError
} from './services/fairy-tail-wizard-chronicle-packs.service'

const xi = (sku: string, name: string, price: string | null, currency: string, description: string | null, more: Record<string, unknown> = {}) => ({
  item_id: Number(sku), sku, type: 'virtual_good', name, description, image_url: `https://cdn/${sku}.png`,
  price: price === null ? null : { amount: price, amount_without_discount: price, currency }, can_be_bought: true,
  limits: null, periods: [], groups: [{ external_id: 'group1', name: 'group1' }], ...more
})
const once = { limits: { per_user: { total: 1, available: 1, recurrent_schedule: null } } }
const monthly = { limits: { per_user: { total: 1, available: 1, recurrent_schedule: { interval_type: 'monthly' } } } }
const offer = { groups: [{ external_id: 'offer1', name: 'offer' }] }
const items = (cur: 'THB' | 'USD') => {
  const p = (thb: string, usd: string) => (cur === 'THB' ? thb : usd)
  return [
    xi('100001', '100DAYS Offer', null, cur, 'Gift Code', { groups: [{ external_id: 'promo' }], ...once }),
    xi('10018', '10,000 Gems', p('1600.00', '45.99'), cur, '▼Contents\n・Paid Gems: x8,000\n・[Bonus] Free Gems: x2,000\n・[Bonus] Monthly Miles: x8,000'),
    xi('10003', '[One-Time Only] One-Time Super Value Pack', p('60.00', '1.69'), cur, '▼Contents\n・Paid Gems: x300\n・[Bonus] UR Character Select Ticket II: x1\n・[Bonus] Monthly Miles: x300', { ...offer, ...once }),
    xi('10007', '[Once Monthly] Trial Pack 1', p('100.00', '2.89'), cur, '▼Contents\n・Paid Gems: x500\n・[Bonus] Trial Admission Ticket Selection Box II: x2', monthly),
    xi('511', 'Parallel World Wendy Character Growth Pass', p('3275.00', '89.99'), cur, '▼Contents\n・Parallel World Wendy Character Growth Pass\n・[Bonus] Free Gems: x15,800\n\n※ Please note that this will be invalid if you have already purchased the Character Growth Pass in-game.', { ...offer, ...once }),
    ...(cur === 'THB' ? [xi('999', 'TH only pack', '99.00', cur, 'Exceed, Celestial Spirit &amp; Dragon Box: x1')] : [])
  ]
}
const ai = (id: string, name: string, price: number, cur: string, offer: string) => ({
  id, attributes: { name, offerName: offer, description: { standard: name }, offers: [{ price, priceFormatted: String(price), currencyCode: cur }] }
})
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
function mock(o: { shop?: number; us?: number; appleTh?: number; appleUs?: number } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: any) => {
    const url = String(input); calls.push(url)
    const j = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    if (url.includes('store.xsolla.com/api/v2/project/290404/items/virtual_items')) {
      if (url.includes('country=TH')) return o.shop ? j({}, o.shop) : j({ has_more: false, items: items('THB') })
      if (url.includes('country=US')) return o.us ? j({}, o.us) : j({ has_more: false, items: items('USD') })
      return j({ has_more: false, items: o.us ? items('USD') : [] })
    }
    if (url.includes('/catalog/th/in-apps')) return o.appleTh ? j({}, o.appleTh) : j({ data: [ai('6755384846', 'Battle Pass', 199, 'THB', 'jp.co.goodroid.fairy.product.077'), ai('6755382271', 'Monthly Support Card', 199, 'THB', 'jp.co.goodroid.fairy.product.068')] })
    if (url.includes('/catalog/us/in-apps')) return o.appleUs ? j({}, o.appleUs) : j({ data: [ai('6755384846', 'Battle Pass', 4.99, 'USD', 'jp.co.goodroid.fairy.product.077')] })
    if (url.includes('/in-apps')) return j({}, 404)
    return j({}, 404)
  }) as any
  return calls
}
const all = (r: any) => r.categories.flatMap((c: any) => c.packs)
const by = (r: any, id: string) => all(r).find((p: any) => String(p.product_id) === id)

describe('fairy tail wizard chronicle parsers', () => {
  it('parses official contents (paid/free gems, bonus items, notes)', () => {
    const p = parseFtwcDescription('▼Contents\n・Paid Gems: x8,000\n・[Bonus] Free Gems: x2,000\n・[Bonus] Monthly Miles: x8,000\n※Please claim it from your in-game mail')
    expect(p.paidGems).toBe(8000); expect(p.freeGems).toBe(2000)
    expect(p.contents).toEqual([{ item: 'Paid Gems', quantity: 8000, bonus: false }, { item: 'Free Gems', quantity: 2000, bonus: true }, { item: 'Monthly Miles', quantity: 8000, bonus: true }])
    expect(p.notes).toEqual(['Please claim it from your in-game mail'])
    expect(parseFtwcDescription('- UR Character Selection Ticket IX: x1').contents[0]).toEqual({ item: 'UR Character Selection Ticket IX', quantity: 1, bonus: false })
    expect(parseFtwcDescription(null)).toEqual({ contents: [], notes: [], paidGems: null, freeGems: 0 })
  })
  it('rejects a non-Xsolla payload', () => {
    expect(() => parseFtwcItems({ foo: 1 })).toThrow(FairyTailInvalidUpstreamResponseError)
    expect(parseFtwcItems({ has_more: true, items: [xi('1', 'A', '10.00', 'THB', null, once)] }).items[0]).toMatchObject({ sku: '1', price: 10, limit_total: 1 })
  })
})

describe('fetchFairyTailWizardChroniclePacks', () => {
  it('builds THB+USD packs from the official web shop and App Store passes', async () => {
    const calls = mock()
    const r: any = await fetchFairyTailWizardChroniclePacks()
    expect(r.game).toMatchObject({ slug: 'fairy-tail-wizard-chronicle', itemName: 'Gems' })
    expect(r.categories.map((c: any) => c.name)).toEqual([
      'Gems (Official GOODROID Web Shop)', 'Passes & Cards (Official Web Shop + App Store in-app)', 'Limited Offers (Official GOODROID Web Shop)', 'Packs (Official GOODROID Web Shop)'
    ])
    expect(r.summary.packCount).toBe(7)
    expect(by(r, '10018')).toMatchObject({ kind: 'gems', item_pack: false, baseItemAmount: 8000, bonusItemAmount: 2000, totalItemAmount: 10000, price_thb: 1600, price_usd: 45.99, prices: { THB: 1600, USD: 45.99 }, description_th: null })
    const one = by(r, '10003')
    expect(one).toMatchObject({ item_pack: true, baseItemAmount: 300, bonusItemAmount: 0, totalItemAmount: 300, purchase_limit: '1 per account', price_thb: 60, price_usd: 1.69 })
    expect(one.description_en).toContain('UR Character Select Ticket II: x1'); expect(one.description_th_null_reason).toMatch(/Thai/)
    expect(by(r, '10007').purchase_limit).toBe('1 per account (resets monthly)')
    const gp = by(r, '511')
    expect(gp).toMatchObject({ kind: 'pass', item_pack: true, baseItemAmount: 0, bonusItemAmount: 15800, totalItemAmount: 15800, price_thb: 3275, price_usd: 89.99 })
    expect(gp.contents_notes[0]).toMatch(/invalid if you have already purchased/)
    const thOnly = by(r, '999')
    expect(thOnly.price_usd).toBeNull(); expect(thOnly.price_usd_null_reason).toMatch(/not sold .*US/)
    expect(thOnly.description_en).toContain('Celestial Spirit & Dragon'); expect(thOnly.base_null_reason).toBeTruthy()
    const bp = by(r, 'jp.co.goodroid.fairy.product.077')
    expect(bp).toMatchObject({ kind: 'pass', item_pack: true, store: 'apple-app-store', price_thb: 199, price_usd: 4.99, contents: null })
    expect(bp.contents_null_reason).toBeTruthy(); expect(bp.description_en_null_reason).toBeTruthy()
    const card = by(r, 'jp.co.goodroid.fairy.product.068')
    expect(card).toMatchObject({ pack_type: 'card', price_thb: 199, price_usd: null }); expect(card.price_usd_null_reason).toMatch(/US/)
    expect(all(r).some((p: any) => p.product_id === '100001')).toBe(false)
    expect(r.notes.join(' ')).toMatch(/GOODROID/); expect(r.notes.join(' ')).toMatch(/Skipped.*100DAYS/)
    expect(calls.every((u) => !/codashop|seagm|unipin|24buym|joytify/i.test(u))).toBe(true)
  })
  it('falls back for USD and tolerates App Store failures', async () => {
    mock({ us: 503, appleTh: 503 })
    const r: any = await fetchFairyTailWizardChroniclePacks()
    expect(by(r, '10018').price_usd).toBe(45.99)
    expect(by(r, '10018').price_usd_source).toMatch(/country=KH/)
    expect(all(r).some((p: any) => p.store === 'apple-app-store')).toBe(false)
    expect(r.notes.join(' ')).toMatch(/App Store TH passes unavailable/)
  })
  it('USD null with reason when no USD storefront answers', async () => {
    mock({ us: 503 })
    globalThis.fetch = ((orig) => (async (input: any, init: any) => (String(input).match(/country=(KH|LA|MM)/) ? new Response('{}', { status: 503 }) : orig(input, init))) as any)(globalThis.fetch)
    const r: any = await fetchFairyTailWizardChroniclePacks()
    expect(by(r, '10018').price_usd).toBeNull()
    expect(by(r, '10018').price_usd_null_reason).toMatch(/USD storefronts unavailable/)
  })
  it('throws when the official web shop is down', async () => {
    mock({ shop: 503 })
    await expect(fetchFairyTailWizardChroniclePacks()).rejects.toBeInstanceOf(FairyTailUpstreamUnavailableError)
  })
})

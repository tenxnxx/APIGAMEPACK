import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchFreefirePacks, parseFreefireMembership, parseLevelUpArticle, UpstreamUnavailableError,
  FREEFIRE_PASS_CATEGORY_ID, FREEFIRE_LEVEL_UP_CATEGORY_ID
} from './services/freefire-packs.service'

const promo = { total_promo_amount: 0, real_promo_amount: 0 }
const diamond = (id: number, amount: number, price: number) => ({ id, item_id: id, app_point_amount: amount, currency: 'THB', currency_amount: price, rebate_card_id: 0, app_item_id: 0, promo })
const weekly = (id: number, price: number, lang: 'th' | 'en', currency = 'THB') => ({
  id, item_id: 8, app_point_amount: 0, currency, currency_amount: price, rebate_card_id: 2, app_item_id: 0, promo,
  rebate_card: lang === 'th'
    ? { name: 'สมาชิกเพชร (สัปดาห์, รับ💎450)', description: 'ได้รับเพชรรวม 450 เพชร (ได้เพชรทันที 100 เพชร และได้อีกวันละ 50 เพชรเป็นเวลา 7 วัน)', logo: 'https://cdn/rebate/2/logo.png', level_up_pass_item: false }
    : { name: 'Weekly Membership', description: 'Get massive diamonds in total!', logo: 'https://cdn/rebate/2/logo.png', level_up_pass_item: false }
})
const booyah = (id: number, price: number, lang: 'th' | 'en') => ({
  id, item_id: 10, app_point_amount: 0, currency: 'THB', currency_amount: price, rebate_card_id: 0, app_item_id: 803000000, promo,
  app_item: lang === 'th'
    ? { name: 'บูย่าห์พาส', description: 'บูย่าห์พาส (โปรดอย่าซื้อหากคุณเปิดใช้งานสิทธิ์ขั้นสูงซีซั่นนี้ไปแล้ว ไม่อย่างนั้นจะได้ FF Token 10 ชิ้นเป็นการชดเชย)', logo: 'https://cdn/item/803/logo.png' }
    : { name: ' Booyah Pass card', description: 'BP direct purchase (please do not purchase if you have purchased in game, otherwise you could only get 10 FF tokens)', logo: 'https://cdn/item/803/logo.png' }
})
const payload = (lang: 'th' | 'en') => ({
  app_info: { app_id: 100067, app_name: 'Free Fire', point_name: 'Diamond', point_icon: 'https://cdn/point.png' },
  channels: [
    { channel: 207074, name: 'ShopeePay', visible: true, status: 1, message: '', items: [diamond(1, 100, 35), weekly(8011, 59, lang), booyah(22017, 90, lang)] },
    { channel: 207235, name: 'BBL', visible: true, status: 1, message: '', items: [weekly(67418, 65, lang), booyah(46518, 90, lang)] },
    { channel: 207070, name: 'Shell', visible: true, status: 1, message: '', items: [weekly(8013, 100, lang, 'GS')] },
    { channel: 999, name: 'Hidden', visible: false, status: 1, message: '', items: [weekly(5, 1, lang)] }
  ]
})
const ia = (id: string, name: string, price: number, cur: string, offer: string, desc = name) => ({ id, attributes: { name, offerName: offer, description: { standard: desc }, offers: [{ price, priceFormatted: String(price), currencyCode: cur }] } })
const appleTh = [
  ia('6744085405', 'Level Up Package - Level 6', 9, 'THB', 'freefire.diamond.4790'),
  ia('6744085526', 'Level Up Package - Level 30', 29, 'THB', 'freefire.diamond.4795'),
  ia('6744085276', 'Level Up Package - Level 30', 29, 'THB', 'freefire.diamond.4801'),
  ia('1412648268', 'เพชรรายสัปดาห์', 69, 'THB', 'freefire.diamond.17')
]
const appleUs = [
  ia('6744085405', 'Level Up Package - Level 6', 0.29, 'USD', 'freefire.diamond.4790'),
  ia('6744085276', 'Level Up Package - Level 30', 0.99, 'USD', 'freefire.diamond.4801'),
  ia('1412648268', 'Weekly Membership', 1.99, 'USD', 'freefire.diamond.17', 'A 7-day membership to claim diamonds daily')
]
const article = { article: { body: '<ul><li>Nivel 6: 120 diamantes y 3 tickets de Luck Royale</li><li>Nivel 30: 350 diamantes y 5 tickets de Luck Royale</li></ul>' } }

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
function mock(o: { termgame?: 'down'; apple?: number; article?: number } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: any) => {
    const url = String(input); calls.push(url)
    const j = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    if (url.includes('termgame.com') && url.includes('region=IN.TH')) {
      if (o.termgame === 'down') throw new Error('network')
      return j(payload(url.includes('language=en') ? 'en' : 'th'))
    }
    if (url.includes('termgame.com')) return j({ app_info: payload('en').app_info, channels: [] })
    if (url.includes('/catalog/th/in-apps')) return o.apple ? j({}, o.apple) : j({ data: appleTh })
    if (url.includes('/catalog/us/in-apps')) return o.apple ? j({}, o.apple) : j({ data: appleUs })
    if (url.includes('ffsoporte.garena.com')) return o.article ? j({}, o.article) : j(article)
    return j({}, 503) // App Store product pages etc. (generic enrichment) — unavailable
  }) as any
  return calls
}
const cat = (r: any, id: number) => r.categories.find((c: any) => c.id === id)

describe('free fire parsers', () => {
  it('parses Garena membership text and rejects inconsistent totals', () => {
    expect(parseFreefireMembership('ได้รับเพชรรวม 2,600 เพชร (ได้เพชรทันที 500 เพชร และได้อีกวันละ 70 เพชรเป็นเวลา 30 วัน)'))
      .toEqual({ diamonds_total: 2600, diamonds_instant: 500, diamonds_daily: 70, duration_days: 30 })
    expect(parseFreefireMembership('ได้รับเพชรรวม 999 เพชร (ได้เพชรทันที 60 เพชร และได้อีกวันละ 20 เพชรเป็นเวลา 7 วัน)')).toBeNull()
    expect(parseFreefireMembership('Get massive diamonds in total!')).toBeNull()
  })
  it('parses level-up rewards from the support article', () => {
    const m = parseLevelUpArticle(article.article.body)
    expect(m.get(6)).toEqual({ diamonds: 120, luck_royale_tickets: 3 })
    expect(m.get(30)).toEqual({ diamonds: 350, luck_royale_tickets: 5 })
    expect(m.size).toBe(2)
  })
})

describe('fetchFreefirePacks', () => {
  it('enriches per-channel membership/Booyah rows, dedupes them, and adds official Level Up Packages', async () => {
    mock()
    const r: any = await fetchFreefirePacks()
    const shopee = cat(r, 207074)
    expect(shopee.packs[0].name).toBe('Diamond 100') // plain diamond rows unchanged
    expect(shopee.packs[0].item_pack).toBeUndefined()
    const w = shopee.packs[1]
    expect(w).toMatchObject({
      name: 'สมาชิกเพชร (สัปดาห์, รับ💎450)', name_en: 'Weekly Membership', item_pack: true, pack_type: 'membership-weekly',
      baseItemAmount: 100, bonusItemAmount: 350, totalItemAmount: 450, price_thb: 59, price_usd: null,
      image_url: 'https://cdn/rebate/2/logo.png', rebate_card_id: 2,
      contents: { diamonds_total: 450, diamonds_instant: 100, diamonds_daily: 50, duration_days: 7 }
    })
    expect(w.description_th).toContain('วันละ 50 เพชร')
    expect(w.description_en).toContain('100 instantly, then 50 per day for 7 days')
    expect(w.price_usd_null_reason).toBeTruthy()
    expect(cat(r, 207070).packs[0]).toMatchObject({ currency: 'GS', price: 100, item_pack: true }) // GS keeps legacy price
    expect(cat(r, 999)).toBeUndefined()

    const passes = cat(r, FREEFIRE_PASS_CATEGORY_ID)
    expect(passes.packCount).toBe(2)
    const [bp, wk] = passes.packs
    expect(bp).toMatchObject({ pack_type: 'booyah-pass', name: 'บูย่าห์พาส', name_en: 'Booyah Pass card', price_thb: 90, price_usd: null, app_item_id: 803000000 })
    expect(bp.price_usd_null_reason).toContain('Booyah')
    expect(bp.contents.limit_en).toContain('10 FF Tokens')
    expect(bp.description_en).toContain('BP direct purchase')
    expect(bp.channel_prices).toHaveLength(2)
    expect(wk).toMatchObject({ id: 2, price_thb: 59, price_usd: null, totalItemAmount: 450 })
    expect(wk.channel_prices.map((c: any) => [c.price, c.currency])).toEqual([[59, 'THB'], [65, 'THB'], [100, 'GS']])
    expect(wk.appstore_reference).toMatchObject({ offer_name: 'freefire.diamond.17', price_thb: 69, price_usd: 1.99 })

    const lv = cat(r, FREEFIRE_LEVEL_UP_CATEGORY_ID)
    expect(lv.packs.map((p: any) => p.level)).toEqual([6, 30])
    expect(lv.packs[0]).toMatchObject({
      name_en: 'Level Up Package - Level 6', price_thb: 9, price_usd: 0.29, price_usd_source: 'appstore-us', offer_name: 'freefire.diamond.4790',
      item_pack: true, pack_type: 'level-up-package', totalItemAmount: 120, contents: { diamonds: 120, luck_royale_tickets: 3, limit: 'once per account' }
    })
    expect(lv.packs[0].description_th).toContain('120 เพชร')
    const l30 = lv.packs[1]
    expect(l30).toMatchObject({ offer_name: 'freefire.diamond.4795', price_thb: 29, price_usd: null, totalItemAmount: 350 })
    expect(l30.price_usd_null_reason).toContain('did not return')
    expect(l30.other_appstore_offers).toEqual([{ appstore_iap_id: '6744085276', offer_name: 'freefire.diamond.4801', price_thb: 29, price_usd: 0.99 }])
    expect(r.summary.packCount).toBe(r.categories.reduce((s: number, c: any) => s + c.packs.length, 0))
  })

  it('keeps pass details and reports why when App Store / support are unavailable', async () => {
    mock({ apple: 503, article: 503 })
    const r: any = await fetchFreefirePacks()
    expect(cat(r, FREEFIRE_LEVEL_UP_CATEGORY_ID)).toBeUndefined()
    const wk = cat(r, FREEFIRE_PASS_CATEGORY_ID).packs[1]
    expect(wk.appstore_reference).toBeUndefined()
    expect(wk.contents.diamonds_daily).toBe(50)
    expect(r.notes.join(' ')).toContain('App Store TH in-app lookup (Level Up Packages) failed')
    expect(r.notes.join(' ')).toContain('support article')
  })

  it('throws UpstreamUnavailableError when termgame is down', async () => {
    mock({ termgame: 'down' })
    await expect(fetchFreefirePacks()).rejects.toBeInstanceOf(UpstreamUnavailableError)
  })
})

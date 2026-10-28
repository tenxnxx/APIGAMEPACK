import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchLoveAndDeepspacePacks, ladsKind, ladsPassType, passDays, crystalsInName, crystalsInDesc,
  LoveAndDeepspaceInvalidUpstreamResponseError, LoveAndDeepspaceUpstreamUnavailableError
} from './services/love-and-deepspace-packs.service'

const item = (id: string, name: string, price: number, cur: string, offerName: string, desc?: string) => ({
  id, attributes: { name, offerName, isFamilyShareable: false, ...(desc ? { description: { standard: desc } } : {}), offers: [{ price, priceFormatted: String(price), currencyCode: cur }] }
})
const P = 'com.papegames.lysk.en.'
const appleTh = [
  item('6449526805', '60 Crystals', 29, 'THB', P + 'pack6', 'Gets 60 Crystals'),
  item('6449527878', '6480 Crystals', 3990, 'THB', P + 'pack648', 'Gets 6480 Crystals'),
  item('6472879815', 'Aurum Pass (30 Days)', 199, 'THB', P + 'card.30', 'Buy and get Aurum Pass for 30 Days'),
  item('6449528313', 'Secret Promise', 399, 'THB', P + 'bp68', 'Unlocks Secret Promise'),
  item('6474617070', 'Heartfelt Vow Upgrade', 219, 'THB', P + 'bpplus36', 'Upgrades Secret Promise into Heartfelt Vow'),
  item('6737229478', 'Double Pack 1', 9, 'THB', P + 'doublegift.1', 'Buy to double the rewards'),
  item('6474526191', 'Monthly Pack 1', 199, 'THB', P + 'gift.month30', 'Buy and get the pack'),
  item('6748344257', 'Pack 25', 399, 'THB', P + 'pack68', 'Buy and get the pack'),
  item('6578441684', 'Batch Pack 1', 59, 'THB', P + 'batchpack9', 'Buy and get the pack'),
  item('6760472424', 'Batch Pack 1', 59, 'THB', P + '01batchpack9', 'Buy and get the pack')
]
const appleThTh = [
  item('6472879815', '\u0e1a\u0e31\u0e15\u0e23 Aurum', 199, 'THB', P + 'card.30', '\u0e23\u0e31\u0e1a Aurum Pass 30 \u0e27\u0e31\u0e19'),
  item('6449526805', '60 Crystals', 29, 'THB', P + 'pack6', 'Gets 60 Crystals')
]
const appleUs = [
  item('6449526805', '60 Crystals', 0.99, 'USD', P + 'pack6'),
  item('6449527878', '6480 Crystals', 99.99, 'USD', P + 'pack648'),
  item('6472879815', 'Aurum Pass (30 Days)', 4.99, 'USD', P + 'card.30'),
  item('6449528313', 'Secret Promise', 9.99, 'USD', P + 'bp68'),
  item('6737229478', 'Double Pack 1', 0.29, 'USD', P + 'doublegift.1'),
  item('6474526191', 'Monthly Pack 1', 4.99, 'USD', P + 'gift.month30'),
  item('6578441684', 'Batch Pack 1', 1.49, 'USD', P + 'batchpack9'),
  item('9999999999', 'Batch Pack 1', 0.01, 'USD', P + 'other')
]
const appleLa = [item('6474617070', 'Heartfelt Vow Upgrade', 5.99, 'USD', P + 'bpplus36')]

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })
function mock(opts: { apple?: 'ok' | 'down' | 'bad'; us?: 'ok' | '404' } = {}) {
  const calls: string[] = []
  globalThis.fetch = (async (input: any) => {
    const url = String(input); calls.push(url)
    const j = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
    if (opts.apple === 'down') return new Response('x', { status: 500 })
    if (opts.apple === 'bad') return j({ nope: true })
    if (!/[?&]offset=0(&|$)/.test(url)) return j({ data: [] })
    if (url.includes('/th/apps/')) return j({ data: url.includes('l=th') ? appleThTh : appleTh })
    if (url.includes('/us/apps/')) return opts.us === '404' ? j({ errors: [{ title: 'No related resources' }] }, 404) : j({ data: appleUs })
    if (url.includes('/la/apps/')) return j({ data: appleLa })
    return j({ errors: [{ title: 'No related resources' }] }, 404)
  }) as any
  return calls
}
const allPacks = (r: any) => r.categories.flatMap((c: any) => c.packs)

describe('love and deepspace parsers', () => {
  it('classifies Apple items and parses amounts', () => {
    expect(ladsKind(P + 'pack6', '60 Crystals')).toBe('currency')
    expect(ladsKind(P + 'pack68', 'Pack 25')).toBe('bundle')
    expect(ladsKind(P + 'card.30', 'Aurum Pass (30 Days)')).toBe('pass')
    expect(ladsKind(P + 'bp98', 'Heartfelt Vow')).toBe('pass')
    expect(ladsKind(P + 'doublegift.9', ' Double Pack 2')).toBe('double-pack')
    expect(ladsPassType('Aurum Pass (30 Days)')).toBe('aurum-pass-monthly')
    expect(ladsPassType('Yearly Wish Pass')).toBe('yearly-pass')
    expect(ladsPassType('Everlasting Promise Extra Pack')).toBe('promise-pass-upgrade')
    expect(ladsPassType('Secret Promise')).toBe('promise-pass')
    expect(passDays('Buy and get Aurum Pass for 30 Days')).toBe(30)
    expect(crystalsInName('1,980 Crystals')).toBe(1980)
    expect(crystalsInDesc('Gets 6480 Crystals')).toBe(6480)
    expect(crystalsInDesc('Buy and get the pack')).toBeNull()
  })
})

describe('fetchLoveAndDeepspacePacks', () => {
  it('builds App Store TH packs with USD by offerName / item id only', async () => {
    const calls = mock()
    const r: any = await fetchLoveAndDeepspacePacks()
    expect(r.game.slug).toBe('love-and-deepspace'); expect(r.game.itemName).toBe('Crystals')
    const p = allPacks(r)
    expect(p.length).toBe(appleTh.length)
    const by = (o: string) => p.find((x: any) => x.product_id === P + o)
    const c60 = by('pack6')
    expect(c60.kind).toBe('currency'); expect(c60.item_pack).toBe(false)
    expect([c60.baseItemAmount, c60.bonusItemAmount, c60.totalItemAmount]).toEqual([60, 0, 60])
    expect(c60.prices).toEqual({ THB: 29, USD: 0.99 }); expect(c60.price_usd_source).toContain('apple-app-store-us')
    expect(c60.first_purchase_bonus).toBeNull(); expect(c60.first_purchase_bonus_null_reason).toContain('Top-Up Center')
    expect(c60.name_th).toBeNull(); expect(c60.name_th_null_reason).toContain('English')
    const aurum = by('card.30')
    expect(aurum.item_pack).toBe(true); expect(aurum.pass_type).toBe('aurum-pass-monthly'); expect(aurum.pass_days).toBe(30)
    expect(aurum.name_th).toBe('\u0e1a\u0e31\u0e15\u0e23 Aurum'); expect(aurum.description_th).toContain('30')
    expect(aurum.description_en).toBe('Buy and get Aurum Pass for 30 Days')
    expect(aurum.prices).toEqual({ THB: 199, USD: 4.99 })
    const up = by('bpplus36')
    expect(up.pass_type).toBe('promise-pass-upgrade'); expect(up.prices).toEqual({ THB: 219, USD: 5.99 }); expect(up.price_usd_source).toContain('apple-app-store-la')
    const dbl = by('doublegift.1')
    expect(dbl.kind).toBe('double-pack'); expect(dbl.first_purchase_double).toBe(true); expect(dbl.item_pack).toBe(true)
    expect(by('gift.month30').periodic_pack).toBe('monthly')
    expect(by('pack68').kind).toBe('bundle')
    // Same name, different offerName: no name matching
    expect(by('batchpack9').price_usd).toBe(1.49)
    const b2 = by('01batchpack9')
    expect(b2.price_usd).toBeNull(); expect(b2.price_usd_null_reason).toContain('USD storefronts')
    expect(by('pack68').price_usd_null_reason).toContain('KH')
    expect(r.categories.map((c: any) => c.id)).toEqual([1, 2, 3, 4])
    expect(calls.some((u) => /codashop|seagm|unipin/i.test(u))).toBe(false)
    for (const x of p) {
      expect(Object.keys(x.prices)).toEqual(['THB', 'USD'])
      for (const k of ['baseItemAmount', 'bonusItemAmount', 'totalItemAmount', 'price_usd', 'name_th', 'description_th']) {
        if (x[k] === null) expect(Object.keys(x).some((kk) => kk.endsWith('_null_reason') && x[kk])).toBe(true)
      }
    }
  })
  it('uses LA/MM/KH for USD when the app is not sold in the US', async () => {
    mock({ us: '404' })
    const r: any = await fetchLoveAndDeepspacePacks()
    const p = allPacks(r)
    expect(p.find((x: any) => x.product_id === P + 'bpplus36').price_usd).toBe(5.99)
    const c60 = p.find((x: any) => x.product_id === P + 'pack6')
    expect(c60.price_usd).toBeNull(); expect(c60.price_usd_null_reason).toContain('not sold')
    expect(r.notes.join(' ')).toContain('App Store US')
  })
  it('maps upstream failures to the error classes', async () => {
    mock({ apple: 'down' })
    await expect(fetchLoveAndDeepspacePacks()).rejects.toBeInstanceOf(LoveAndDeepspaceUpstreamUnavailableError)
    mock({ apple: 'bad' })
    await expect(fetchLoveAndDeepspacePacks()).rejects.toBeInstanceOf(LoveAndDeepspaceInvalidUpstreamResponseError)
  })
})

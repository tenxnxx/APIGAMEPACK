import { afterEach, describe, expect, it } from 'bun:test'
import { fetchWhiteoutSurvivalOfficialPacks, wosItemKind } from './services/whiteout-survival-packs.service'

const FS = 'https://img.example/production/20250818/1755501611_froststar_en.png'
const GEM = 'https://img.example/production/20250818/1755501641_gem_en.png'
const payload = (list: unknown[]) => ({ code: 1, data: { game_id: '20121', game_name: 'Whiteout Survival', package_list: { config_list: list } } })
const pk = (o: Record<string, unknown>) => ({ main_content: FS, package_display_name: null, package_type: 1, purchase_limit_type: 0, ...o })

const usd = payload([
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.gem27', package_type: 4, package_display_name: 'Limited Avatar Frame (30-Day) Pack', main_number: 9999, final_amount: '99.99', items: [{ item_number: 500, icon: FS }], purchase_limit_type: 2, purchase_count: 1, remain_count: 1, reset_at: 1793491200 }),
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.gem19', main_number: 999, final_amount: '9.99', items: [{ item_number: 50, icon: FS }] }),
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.gem23', main_number: 999, final_amount: '9.99', items: [{ item_number: 500, icon: GEM }] }),
  pk({ product_id: 'com.gof.whiteoutsurvival.gem64', package_type: 4, package_display_name: 'Deep Frost Special Pack', main_number: 1999, final_amount: '19.99', items: [{ item_number: 100, icon: FS }] }),
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.webonly', main_number: 123, final_amount: '1.99', items: [] })
])
const thb = payload([
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.gem27', package_type: 4, main_number: 9999, final_amount: '3700', items: [{ item_number: 500, icon: FS }] }),
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.gem19', main_number: 999, final_amount: '349', items: [{ item_number: 50, icon: FS }] }),
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.gem23', main_number: 999, final_amount: '349', items: [{ item_number: 500, icon: GEM }] }),
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.thbonly', main_number: 299, final_amount: '99', items: [{ item_number: 15, icon: FS }] })
])
const apple = (cc: string, price: number) => [{ id: '6780496647', name: 'Tundra Supply 1', price, priceFormatted: String(price), currency: cc === 'th' ? 'THB' : 'USD', offerName: 'com.gof.whiteoutsurvival.gem64' }]

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

describe('Whiteout Survival official Century store (Frost Stars)', () => {
  it('classifies bonus items by official icon', () => {
    expect(wosItemKind(FS)).toBe('frost-stars')
    expect(wosItemKind(GEM)).toBe('gems')
    expect(wosItemKind(undefined)).toBe('frost-stars')
    expect(wosItemKind('https://x/y/other.png')).toBe('other')
  })

  it('THB first then USD, base + bonus, bundles as item_pack, gems kept out of Frost Stars total', async () => {
    const body: any = await fetchWhiteoutSurvivalOfficialPacks({ packagesPayloadUsd: usd, packagesPayloadThb: thb, appStoreTh: apple('th', 729), appStoreUs: apple('us', 19.99) })
    const packs = body.categories[0].packs
    expect(packs[0]).toMatchObject({ name: 'Limited Avatar Frame (30-Day) Pack', item_pack: true, price: 3700, currency: 'THB', price_thb: 3700, price_usd: 99.99, baseItemAmount: 9999, bonusItemAmount: 500, totalItemAmount: 10499 })
    expect(packs[0].purchase_limit).toMatchObject({ count: 1, remaining: 1, resets_at: '2026-11-01T00:00:00.000Z' })
    expect(packs[1]).toMatchObject({ name: 'Frost Stars 999', price_thb: 349, price_usd: 9.99, bonusItemAmount: 50, totalItemAmount: 1049 })
    expect(packs[1].item_pack).toBeUndefined()
    expect(packs[2]).toMatchObject({ name: 'Frost Stars 999 + Gems Bonus', bonusItemAmount: 0, totalItemAmount: 999, bonus_gems: 500 })
    // official USD, THB missing on the web store -> App Store TH by offerName (same Apple product id)
    expect(packs[3]).toMatchObject({ name: 'Deep Frost Special Pack', price_thb: 729, price_thb_source: 'appstore-th', price_usd: 19.99, price_usd_source: 'official-store' })
    // THB-only web product: USD null with reason (no App Store counterpart)
    const thbOnly = packs.find((p: any) => p.baseItemAmount === 299)
    expect(thbOnly).toMatchObject({ price_thb: 99, price_usd: null })
    expect(thbOnly.price_usd_null_reason).toContain('web-only')
    // USD-only web product: no THB anywhere -> unmatched_packs with reason, not in THB list
    expect(packs.some((p: any) => p.baseItemAmount === 123)).toBe(false)
    expect(body.unmatched_packs).toHaveLength(1)
    expect(body.unmatched_packs[0]).toMatchObject({ product_id: 'thirdpayment.gof.whiteoutsurvival.webonly', price_thb: null, price_usd: 1.99 })
    expect(typeof body.unmatched_packs[0].price_thb_null_reason).toBe('string')
    expect(body.appstore_sources.thb).toContain('apps.apple.com/th/')
    expect(body.summary).toEqual({ categoryCount: 1, packCount: 5 })
  })

  it('App Store failure leaves THB null with a reason (never converted)', async () => {
    globalThis.fetch = (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch
    const onlyApple = payload([pk({ product_id: 'com.gof.whiteoutsurvival.gem64', main_number: 1999, final_amount: '19.99', items: [] })])
    const thbOther = payload([pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.gem19', main_number: 999, final_amount: '349', items: [] })])
    const body: any = await fetchWhiteoutSurvivalOfficialPacks({ packagesPayloadUsd: onlyApple, packagesPayloadThb: thbOther })
    expect(body.unmatched_packs[0].price_thb).toBeNull()
    expect(body.unmatched_packs[0].price_thb_null_reason).toContain('App Store TH')
  })

  it('throws on invalid upstream payload (502 path)', async () => {
    await expect(fetchWhiteoutSurvivalOfficialPacks({ packagesPayloadUsd: { code: 101031008, msg: 'Need Refresh!' }, packagesPayloadThb: thb })).rejects.toThrow()
  })
})
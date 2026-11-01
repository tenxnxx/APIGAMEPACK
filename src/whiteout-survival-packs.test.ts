import { afterEach, describe, expect, it } from 'bun:test'
import {
  fetchWhiteoutSurvivalOfficialPacks,
  wosAppStoreGroup,
  wosItemKind,
  wosPurchaseLimit
} from './services/whiteout-survival-packs.service'
import { getGameBySlug as resolveGame } from './games/registry'

const FS = 'https://img.example/production/20250818/1755501611_froststar_en.png'
const GEM = 'https://img.example/production/20250818/1755501641_gem_en.png'
const payload = (list: unknown[]) => ({ code: 1, data: { game_id: '20121', game_name: 'Whiteout Survival', package_list: { config_list: list } } })
const pk = (o: Record<string, unknown>) => ({ main_content: FS, package_display_name: null, package_type: 1, purchase_limit_type: 0, ...o })

const AVATAR = { product_id: 'thirdpayment.gof.whiteoutsurvival.gem27', package_type: 4, icon: 'https://img.example/pack.png', main_number: 9999, items: [{ item_number: 500, icon: FS }], purchase_limit_type: 2, purchase_limit_cycle: 3, purchase_count: 1, remain_count: 1, reset_at: 1796083200 }
const usd = payload([
  pk({ ...AVATAR, package_display_name: 'Limited Avatar Frame (30-Day) Pack', final_amount: '99.99' }),
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.gem19', main_number: 999, final_amount: '9.99', items: [{ item_number: 50, icon: FS }] }),
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.gem23', main_number: 999, final_amount: '9.99', items: [{ item_number: 500, icon: GEM }] }),
  pk({ product_id: 'com.gof.whiteoutsurvival.gem64', package_type: 4, package_display_name: 'Deep Frost Special Pack', main_number: 1999, final_amount: '19.99', items: [{ item_number: 100, icon: FS }] }),
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.webonly', main_number: 123, final_amount: '1.99', items: [] })
])
const thb = payload([
  pk({ ...AVATAR, package_display_name: 'Limited Avatar Frame (30-Day) Pack', final_amount: '3700' }),
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.gem19', main_number: 999, final_amount: '349', items: [{ item_number: 50, icon: FS }] }),
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.gem23', main_number: 999, final_amount: '349', items: [{ item_number: 500, icon: GEM }] }),
  pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.thbonly', main_number: 299, final_amount: '99', purchase_limit_type: 1, purchase_count: 1, items: [{ item_number: 15, icon: FS }] })
])
const thbTh = payload([
  pk({ ...AVATAR, package_display_name: 'แพ็กกรอบรูปอวตารจำกัดเวลา (30 วัน)', final_amount: '3700' }),
  pk({ product_id: 'com.gof.whiteoutsurvival.gem64', package_type: 4, package_display_name: 'แพ็กเกจแช่แข็งพิเศษ', main_number: 1999, final_amount: '729' })
])
const row = (cc: string, offerName: string, name: string, price: number, description?: string) => ({
  id: offerName, name, price, priceFormatted: String(price), currency: cc === 'th' ? 'THB' : 'USD', offerName, description
})
const appleTh = [
  row('th', 'com.gof.whiteoutsurvival.gem64', 'Tundra Supply 1', 729, 'Purchase the pack to unlock the Frost Star!'),
  row('th', 'com.gof.whiteoutsurvival.gem43', 'Premium pass', 349, 'Battle Pass: Unlock more rewards!'),
  row('th', 'com.gof.whiteoutsurvival.gem27', 'Daily Deal (30d)', 35, 'monthly card: claim the rewards every day!'),
  row('th', 'com.gof.whiteoutsurvival.gem18', 'Bag of Gems', 179, 'Get more gems now!'),
  row('th', 'com.gof.whiteoutsurvival.gem52', 'Refund Pack 5', 179, 'This is the Refund Pack to be purchased'),
  row('th', 'offercode.gof.whiteoutsurvival.gem1.aoc', 'Exclusive Reward Pack', 35, 'Redeem your code to claim generous rewards.')
]
const appleUs = [
  row('us', 'com.gof.whiteoutsurvival.gem64', 'Tundra Supply 1', 19.99),
  row('us', 'com.gof.whiteoutsurvival.gem43', 'Premium pass', 9.99),
  row('us', 'com.gof.whiteoutsurvival.gem27', 'Daily Deal (30d)', 0.99)
]
const appleKh = [row('us', 'com.gof.whiteoutsurvival.gem18', 'Bag of Gems', 4.99)]

const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

const flat = (b: any) => b.categories.flatMap((c: any) => c.packs)
const byName = (b: any, n: string) => flat(b).find((p: any) => p.name === n)

describe('Whiteout Survival official Century store + App Store', () => {
  it('classifies bonus items by official icon', () => {
    expect(wosItemKind(FS)).toBe('frost-stars')
    expect(wosItemKind(GEM)).toBe('gems')
    expect(wosItemKind(undefined)).toBe('frost-stars')
    expect(wosItemKind('https://x/y/other.png')).toBe('other')
  })

  it('purchase limits use the store labels (lifetime / monthly) and report unknown cycles as null', () => {
    expect(wosPurchaseLimit({ purchase_limit_type: 1, purchase_count: 1 })).toMatchObject({ period: 'lifetime', label_en: 'Lifetime Limit: 1', label_th: 'จำกัดตลอดชีพ: 1' })
    expect(wosPurchaseLimit(AVATAR)).toMatchObject({ period: 'month', resets_at_utc7: '2026-12-01 07:00 UTC+7', label_th: 'จำกัดรายเดือน: 1' })
    const odd = wosPurchaseLimit({ purchase_limit_type: 2, purchase_limit_cycle: 9, purchase_count: 2 })!
    expect(odd.period).toBeNull()
    expect(typeof odd.period_null_reason).toBe('string')
    expect(wosPurchaseLimit({ purchase_limit_type: 0 })).toBeUndefined()
  })

  it('groups App Store items by Apple description and excludes refund / offer-code items', () => {
    expect(wosAppStoreGroup(appleTh[1] as any).key).toBe('passes')
    expect(wosAppStoreGroup(appleTh[2] as any).key).toBe('cards')
    expect(wosAppStoreGroup(appleTh[3] as any).key).toBe('gems')
    expect(wosAppStoreGroup(appleTh[4] as any).excluded).toContain('Refund')
    expect(wosAppStoreGroup(appleTh[5] as any).excluded).toContain('Offer-code')
  })

  it('web store: THB first then USD, base + bonus (total), gems out of Frost Stars, bundles as item_pack with TH/EN', async () => {
    const body: any = await fetchWhiteoutSurvivalOfficialPacks({ packagesPayloadUsd: usd, packagesPayloadThb: thb, packagesPayloadThbTh: thbTh, appStoreTh: appleTh, appStoreUs: appleUs, appStoreUsdFallback: { kh: appleKh } })
    expect(body.categories[0].name).toBe('Frost Stars (Official Store)')
    expect(body.categories[1].name).toBe('Exclusive Bundles (Official Store)')
    const fs = byName(body, 'Frost Stars 999')
    expect(fs).toMatchObject({ price: 349, currency: 'THB', price_thb: 349, price_usd: 9.99, baseItemAmount: 999, bonusItemAmount: 50, totalItemAmount: 1049 })
    expect(fs.item_pack).toBeUndefined()
    expect(byName(body, 'Frost Stars 999 + Gems Bonus')).toMatchObject({ bonusItemAmount: 0, totalItemAmount: 999, bonus_gems: 500 })
    const av = byName(body, 'Limited Avatar Frame (30-Day) Pack')
    expect(av).toMatchObject({ item_pack: true, product_id: 'thirdpayment.gof.whiteoutsurvival.gem27', bonus_percent: 5, name_th: 'แพ็กกรอบรูปอวตารจำกัดเวลา (30 วัน)', price_thb: 3700, price_usd: 99.99, baseItemAmount: 9999, bonusItemAmount: 500, totalItemAmount: 10499 })
    expect(av.description_en).toContain('10,499 total')
    expect(av.description_th).toContain('แพ็กกรอบรูปอวตารจำกัดเวลา (30 วัน)')
    expect(av.description_th).toContain('จำกัดรายเดือน')
    expect(av.contents.map((c: any) => c.amount)).toEqual([9999, 500, null])
    expect(typeof av.contents[2].null_reason).toBe('string')
    // official USD, THB missing on the web store -> App Store TH by offerName (same Apple product id)
    const df = byName(body, 'Deep Frost Special Pack')
    expect(df).toMatchObject({ price_thb: 729, price_thb_source: 'appstore-th', price_usd: 19.99, price_usd_source: 'official-store', name_th: 'แพ็กเกจแช่แข็งพิเศษ' })
    expect(df.appstore_product.name).toBe('Tundra Supply 1')
    // THB-only web product: USD null with reason, lifetime limit
    const thbOnly = flat(body).find((p: any) => p.baseItemAmount === 299)
    expect(thbOnly).toMatchObject({ price_thb: 99, price_usd: null })
    expect(thbOnly.price_usd_null_reason).toContain('web-only')
    expect(thbOnly.purchase_limit.period).toBe('lifetime')
    // USD-only web product: no THB anywhere -> unmatched_packs with reason
    expect(flat(body).some((p: any) => p.baseItemAmount === 123)).toBe(false)
    expect(body.unmatched_packs).toHaveLength(1)
    expect(body.unmatched_packs[0]).toMatchObject({ product_id: 'thirdpayment.gof.whiteoutsurvival.webonly', price_thb: null, price_usd: 1.99 })
  })

  it('App Store-only passes / cards / packs: item_pack, THB from TH, USD from US then KH, Thai/contents null with reasons', async () => {
    const body: any = await fetchWhiteoutSurvivalOfficialPacks({ packagesPayloadUsd: usd, packagesPayloadThb: thb, packagesPayloadThbTh: thbTh, appStoreTh: appleTh, appStoreUs: appleUs, appStoreUsdFallback: { kh: appleKh } })
    const names = body.categories.map((c: any) => c.name)
    expect(names).toEqual(['Frost Stars (Official Store)', 'Exclusive Bundles (Official Store)', 'Passes (App Store)', 'Weekly / Monthly Cards (App Store)', 'Gem Packs (App Store)'])
    const pass = byName(body, 'Premium pass')
    expect(pass).toMatchObject({ item_pack: true, price: 349, currency: 'THB', price_thb: 349, price_usd: 9.99, price_thb_source: 'appstore-th', price_usd_source: 'appstore-us', baseItemAmount: null, contents: null, name_th: null, description_th: null })
    expect(pass.description_en).toBe('Premium pass: Battle Pass: Unlock more rewards!')
    for (const k of ['contents_null_reason', 'description_th_null_reason', 'name_th_null_reason', 'base_null_reason']) expect(typeof pass[k]).toBe('string')
    // App Store gem27 (Daily Deal 30d) is a different product from web thirdpayment...gem27
    expect(byName(body, 'Daily Deal (30d)')).toMatchObject({ price_thb: 35, price_usd: 0.99 })
    // USD falls back to App Store KH when US lacks the product
    expect(byName(body, 'Bag of Gems')).toMatchObject({ price_thb: 179, price_usd: 4.99, price_usd_source: 'appstore-kh' })
    // web-store product is not duplicated as App Store-only
    expect(byName(body, 'Tundra Supply 1')).toBeUndefined()
    expect(body.appstore_excluded.map((x: any) => x.name).sort()).toEqual(['Exclusive Reward Pack', 'Refund Pack 5'])
    const ids = flat(body).map((p: any) => p.id)
    expect(ids).toEqual(ids.map((_: unknown, i: number) => i + 1))
    expect(body.summary).toEqual({ categoryCount: 5, packCount: ids.length })
  })

  it('USD null with reason when no App Store storefront has it (never converted)', async () => {
    const body: any = await fetchWhiteoutSurvivalOfficialPacks({ packagesPayloadUsd: usd, packagesPayloadThb: thb, packagesPayloadThbTh: thbTh, appStoreTh: appleTh, appStoreUs: appleUs, appStoreUsdFallback: {} })
    const gems = byName(body, 'Bag of Gems')
    expect(gems.price_usd).toBeNull()
    expect(gems.price_usd_null_reason).toContain('App Store US')
    expect(gems.price_usd_null_reason).toContain('App Store MM')
  })

  it('App Store failure leaves THB null with a reason and omits App Store-only items with a warning', async () => {
    globalThis.fetch = (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch
    const onlyApple = payload([pk({ product_id: 'com.gof.whiteoutsurvival.gem64', main_number: 1999, final_amount: '19.99', items: [] })])
    const thbOther = payload([pk({ product_id: 'thirdpayment.gof.whiteoutsurvival.gem19', main_number: 999, final_amount: '349', items: [] })])
    const body: any = await fetchWhiteoutSurvivalOfficialPacks({ packagesPayloadUsd: onlyApple, packagesPayloadThb: thbOther })
    expect(body.unmatched_packs[0].price_thb).toBeNull()
    expect(body.unmatched_packs[0].price_thb_null_reason).toContain('App Store TH')
    expect(body.warnings.join(' ')).toContain('App Store TH in-app list unavailable')
    expect(body.categories).toHaveLength(1)
  })

  it('throws on invalid upstream payload (502 path)', async () => {
    await expect(fetchWhiteoutSurvivalOfficialPacks({ packagesPayloadUsd: { code: 101031008, msg: 'Need Refresh!' }, packagesPayloadThb: thb })).rejects.toThrow()
  })

  it('keeps aliases: whiteout-survival / wos -> official, 24buym aliases untouched', () => {
    expect(resolveGame('whiteout-survival')?.provider).toBe('whiteout-survival-official')
    expect(resolveGame('wos')?.provider).toBe('whiteout-survival-official')
    expect(resolveGame('wos-24buym')?.provider).toBe('whiteout-survival-24buym')
    expect(resolveGame('whiteout-survival-24buym')?.provider).toBe('whiteout-survival-24buym')
  })
})

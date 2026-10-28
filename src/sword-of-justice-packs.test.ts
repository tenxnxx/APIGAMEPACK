import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'sword-of-justice') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
function mock(map: Record<string, () => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f()
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const NOW = 1793169466
const lp = (thb: number | null) => ({ local_price: JSON.stringify(thb === null ? { VN: { default: { price: 1, currency: 'VND' } } } : { TH: { default: { price: thb, currency: 'THB' } } }) })
const prod = (goodsid: string, name: string, price: string, jade: number, thb: number | null, extra: any = {}) => ({
  goodsid, goodsinfo: name, currency: 'USD', price, pay_yuanbao: jade, free_yuanbao: 0, status: 1, platform: 'ad', extra: lp(thb),
  multi_language: { default: { default: { goodsinfo: name, goods_detail: `Purchase ${name}`, image_info: { normal: 'img' }, product_free_amount_activity_list: extra.list ?? null } } },
  ...extra.p
})
const products = { code: '0000', data: [
  prod('300wenyu.sea', '300 Ornate Jades', '4.9900', 300, 169, { list: [{ amount: 30, activity_description: 'Bonus' }, { amount: 24, activity_description: 'GameClubBonus' }] }),
  prod('300wenyu.sea', '300 Ornate Jades', '4.9900', 300, 169),
  prod('60wenyu.sea', '60 Ornate Jades', '0.9900', 60, 39),
  prod('980wenyu.sea', '980 Ornate Jades', '15.4900', 980, null),
  prod('300wenyu.en', '300 Ornate Jades', '4.9900', 300, null),
  prod('680zhanling.sea', 'Basic Battle Pass', '9.9900', 0, 329, { p: { expired_time: NOW + 1000 } }),
  prod('300yueka.sea', 'Monthly Pass', '4.9900', 300, 169),
  prod('300libaooversea1.sea', 'Rare Jade Exploring Pack', '4.9900', 0, 169, { p: { effective_time: NOW - 10, expired_time: NOW + 10 } }),
  prod('100libaooversea14.sea', 'Jade-Carving Pack', '1.6900', 0, 55.5, { p: { effective_time: NOW + 100, expired_time: NOW + 200 } }),
  prod('980libaoVNG.sea', 'VNG Pack', '14.9900', 980, 529, { p: { expired_time: NOW - 1 } })
] }
const acts = { code: '0000', data: { server_ts: NOW, list: [
  { goodsid: '300wenyu.sea', activity_type: '0', alpha2: 'all', marketing_free_amount: 24, effective_time: 1, expired_time: 2147483647 },
  { goodsid: '60wenyu.sea', activity_type: '0', alpha2: 'all', marketing_free_amount: 5, effective_time: 1, expired_time: 2147483647 },
  { goodsid: '60wenyu.sea', activity_type: '0', alpha2: 'all', marketing_free_amount: 99, effective_time: 1, expired_time: 2 },
  { goodsid: '300yueka.sea', activity_type: '27', alpha2: 'all', marketing_free_amount: 0, effective_time: 1, expired_time: 2147483647, after_discount_price_map: { THB: '155', USD: '4.69' } }
] } }
const P = 'https://pay.neteasegames.com/gameclub/products/swordofjustice?'
const A = 'https://pay.neteasegames.com/gameclub/products/swordofjustice/activitys'
const IAP = 'https://apps.apple.com/th/app/id6743792504'
const iap = (n: string, p: string) => `<div class="text-pair svelte-x"><span>${n}</span> <span>${p}</span> </div>`

describe('sword of justice', () => {
  it('official TH THB + USD, base+bonus, passes/bundles as item packs, App Store TH only for missing THB', async () => {
    mock({ [P]: () => Response.json(products), [A]: () => Response.json(acts), [IAP]: () => new Response(iap('980 Ornate Jades', '\u0E3F529.00')) })
    const res = await get()
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.game).toMatchObject({ slug: 'sword-of-justice', itemName: 'Ornate Jades' })
    const [cur, pass, bundle] = body.categories
    expect(cur.packs.map((p: any) => p.product_id)).toEqual(['60wenyu.sea', '300wenyu.sea', '980wenyu.sea'])
    expect(cur.packs[0]).toMatchObject({ price_thb: 39, price_usd: 0.99, baseItemAmount: 60, bonusItemAmount: 5, totalItemAmount: 65, item_pack: false })
    expect(cur.packs[1]).toMatchObject({ price_thb: 169, price_usd: 4.99, baseItemAmount: 300, bonusItemAmount: 54, totalItemAmount: 354, bonus_breakdown: { in_game_bonus: 30, gameclub_bonus: 24 } })
    expect(cur.packs[2]).toMatchObject({ price_thb: 529, price_thb_source: 'apple-app-store-th', price_usd: 15.49 })
    expect(pass.packs.map((p: any) => p.name)).toEqual(['Monthly Pass', 'Basic Battle Pass'])
    expect(pass.packs[0]).toMatchObject({ item_pack: true, price_thb: 169, price_usd: 4.99, discount_price_thb: 155, discount_price_usd: 4.69, baseItemAmount: null, pass_type: 'monthly-pass' })
    expect(pass.packs[1].pass_type).toBe('battle-pass')
    expect(bundle.packs.map((p: any) => p.product_id)).toEqual(['300libaooversea1.sea'])
    expect(bundle.message).toContain('1 upcoming')
  })
  it('null bonus with reason when activitys fails; null THB with reason when App Store lacks it; 502 on products failure', async () => {
    mock({ [P]: () => Response.json(products), [A]: () => new Response('x', { status: 500 }), [IAP]: () => new Response('none', { status: 404 }) })
    const body = (await (await get('soj')).json()) as any
    const cur = body.categories[0].packs
    expect(cur[1]).toMatchObject({ bonusItemAmount: null, totalItemAmount: 300 })
    expect(cur[1].bonus_null_reason).toContain('activitys')
    expect(cur[2].price_thb).toBeNull()
    expect(cur[2].price_thb_null_reason).toContain('App Store')
    mock({ [P]: () => new Response('x', { status: 503 }) })
    expect((await get()).status).toBe(502)
    mock({ [P]: () => Response.json({ code: '0300', msg: 'not existed' }) })
    expect((await get()).status).toBe(502)
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache } from './lib/packs-cache'
import { tlClassify, tlKind, tlPrimocryst } from './services/torchlight-infinite-packs.service'

const originalFetch = globalThis.fetch
beforeEach(() => clearPacksCache())
afterEach(() => { globalThis.fetch = originalFetch; clearPacksCache() })
const get = (slug = 'torchlight-infinite') => (clearPacksCache(), app.handle(new Request(`http://localhost/games/${slug}/packs/`)))
function mock(map: Record<string, (url: string) => Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    for (const [p, f] of Object.entries(map)) if (url.startsWith(p)) return f(url)
    return new Response('nf', { status: 404 })
  }) as unknown as typeof fetch
}
const row = (id: string, offerName: string, name: string, price: number, cur: 'THB' | 'USD', desc = name) => ({
  id, type: 'in-apps',
  attributes: { name, offerName, description: { standard: desc }, offers: [{ currencyCode: cur, price, priceFormatted: (cur === 'THB' ? '\u0E3F' : '$') + price.toFixed(2) }] }
})
const G = 'global.'
const TH = [
  row('1', G + 'recharge.primocryst60', '60 คริสตัล', 29, 'THB'),
  row('2', G + 'recharge.primocryst6480', '6480 คริสตัล', 3990, 'THB'),
  row('3', G + 'monthcard.primocryst300', 'บัตรรายเดือน', 199, 'THB'),
  row('4', G + 'handbook.1010', 'คู่มือคุณสมบัติ', 499, 'THB'),
  row('5', G + 'handbook.1040', 'Preseason Pass +1500', 699, 'THB'),
  row('6', G + 'rewardbox.421001', 'รางวัลสําหรับมือใหม่เลเวล5', 29, 'THB'),
  row('7', G + 'rewardbox.421006', 'Pactspirit Cry. Wkly - Battle', 399, 'THB', 'แพ็กคริสตัลสปิริตประจำสัปดาห์-การต่อสู้'),
  row('8', G + 'rewardbox.999999', 'แพ็กใหม่', 99, 'THB')
]
const US = [
  row('1', G + 'recharge.primocryst60', '60 Primocryst', 0.99, 'USD'),
  row('2', G + 'recharge.primocryst6480', '6480 Primocryst', 99.99, 'USD'),
  row('3', G + 'monthcard.primocryst300', 'Monthly Pass', 4.99, 'USD'),
  row('4', G + 'handbook.1010', 'Guide Qualification', 14.99, 'USD'),
  row('5', G + 'handbook.1040', 'Preseason Pass +1500', 19.99, 'USD'),
  row('6', G + 'rewardbox.421001', "Lv.5 Beginner's Gifts", 0.99, 'USD'),
  row('7', G + 'rewardbox.421006', 'Pactspirit Cry. Wkly - Battle', 9.99, 'USD')
]
const API = 'https://apps.apple.com/api/apps/v1/catalog/'
const page = (rows: any[]) => (url: string) => {
  const off = Number(url.match(/offset=(\d+)/)?.[1] ?? 0)
  const slice = rows.slice(off, off + 10)
  return slice.length ? Response.json({ data: slice }) : new Response('nf', { status: 404 })
}
const all = (b: any) => b.categories.flatMap((c: any) => c.packs)
const byPid = (b: any, pid: string) => all(b).find((p: any) => p.product_id === G + pid)

describe('torchlight infinite (App Store official)', () => {
  it('reads Primocryst amounts from the XD product id / official name and classifies passes', () => {
    expect(tlPrimocryst(G + 'recharge.primocryst3280', 'x')).toBe(3280)
    expect(tlPrimocryst(G + 'monthcard.primocryst300', 'Monthly Pass')).toBeNull()
    expect(tlPrimocryst(null, '980 คริสตัล')).toBe(980)
    expect(tlPrimocryst(null, '1980 Primocryst')).toBe(1980)
    expect(tlKind(G + 'monthcard.primocryst300', 'Monthly Pass')).toBe('pass')
    expect(tlKind(G + 'servantsubscription.1010', 'Pactspirit Rally')).toBe('pass')
    expect(tlKind(G + 'rewardbox.800001', 'Limited-Time Special Bundle 1')).toBe('bundle')
    expect(tlClassify({ productId: G + 'handbook.1010', nameEn: 'Guide Qualification', nameTh: null, rawName: 'x', descEn: null, descTh: null }).contents).toBeNull()
  })

  it('serves THB from App Store TH and USD from US -> KH/LA/MM, nulls with reasons', async () => {
    mock({
      [API + 'th/']: page(TH),
      [API + 'us/']: page(US),
      [API + 'kh/']: page([]),
      [API + 'la/']: page([]),
      [API + 'mm/']: page([])
    })
    const res = await get()
    expect(res.status).toBe(200)
    const b: any = await res.json()
    expect(b.game.slug).toBe('torchlight-infinite')
    expect(b.publisher).toBe('XD Entertainment Pte Ltd')
    expect(b.source_mode).toBe('appstore-catalog-api')
    expect(b.summary.packCount).toBe(8)
    expect(b.categories.map((c: any) => c.packCount)).toEqual([2, 3, 3])

    const p60 = byPid(b, 'recharge.primocryst60')
    expect(p60).toMatchObject({ kind: 'currency', item: 'Primocryst', item_pack: false, price_thb: 29, price_usd: 0.99, baseItemAmount: 60, bonusItemAmount: null, totalItemAmount: null, name_en: '60 Primocryst', name_th: '60 คริสตัล' })
    expect(p60.bonus_null_reason).toMatch(/not assumed to be 0/)
    expect(p60.total_null_reason).toBeTruthy()
    expect(p60.price_usd_source).toBe('apple-app-store-us (item 1)')
    expect(byPid(b, 'recharge.primocryst6480')).toMatchObject({ baseItemAmount: 6480, price_thb: 3990, price_usd: 99.99 })

    const month = byPid(b, 'monthcard.primocryst300')
    expect(month).toMatchObject({ kind: 'pass', item_pack: true, price_thb: 199, price_usd: 4.99, contents: null, baseItemAmount: null, name_en: 'Monthly Pass', name_th: 'บัตรรายเดือน', description_th: 'บัตรรายเดือน', description_en: 'Monthly Pass' })
    expect(month.contents_null_reason).toMatch(/in-game/)
    const pre = byPid(b, 'handbook.1040')
    expect(pre.name_th).toBeNull()
    expect(pre.name_th_null_reason).toMatch(/Latin-script/)

    const wk = byPid(b, 'rewardbox.421006')
    expect(wk).toMatchObject({ kind: 'bundle', item_pack: true, description_th: 'แพ็กคริสตัลสปิริตประจำสัปดาห์-การต่อสู้', price_usd: 9.99 })
    const missing = byPid(b, 'rewardbox.999999')
    expect(missing.price_usd).toBeNull()
    expect(missing.price_usd_null_reason).toMatch(/no FX conversion/)
    expect(missing.name_en).toBeNull()
    expect(missing.name_en_null_reason).toBeTruthy()
    expect(JSON.stringify(b)).not.toMatch(/codashop|seagm|unipin/i)
  })

  it('resolves aliases', async () => {
    mock({ [API + 'th/']: page(TH), [API + 'us/']: page(US), [API + 'kh/']: page([]), [API + 'la/']: page([]), [API + 'mm/']: page([]) })
    for (const s of ['torchlight', 'torchlight-infinite-xd']) {
      const r = await get(s)
      expect(r.status).toBe(200)
      expect(((await r.json()) as any).game.slug).toBe('torchlight-infinite')
    }
  })

  it('returns 502 when App Store API and page are both down', async () => {
    mock({})
    const res = await get()
    expect(res.status).toBe(502)
  })
})

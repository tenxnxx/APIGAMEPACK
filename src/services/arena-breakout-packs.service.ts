import type { RovPacksResponse } from '../types/rov'

/**
 * Arena Breakout: Mobile (Tencent / MoreFun, published by Level Infinite / Proxima Beta) — official Tencent Midasbuy
 * store (midasbuy.com/midasbuy/{th,us}/buy/uamo, Midasbuy app_id 1460000360, currency "Bonds").
 * THB = Midasbuy Thailand shelf (region=TH); USD = Midasbuy United States shelf (region=US). Matched by product_id.
 * Price = Midasbuy standard price (row without payment_channel_id); if a product only has channel-specific prices
 * (e.g. DTAC/TrueMove carrier billing) the lowest channel price is used and the channels are listed.
 * base = game_coins_num; bonus = Bonds gifts in base_group.promotion_list (e.g. "First Bonus").
 * Category 2 = Battle Pass / Privileges / Bundles: Midasbuy shelf product_types ["Rp"] (Rp + Subscription items),
 * item_pack=true (no Bonds amount), description from Midasbuy.
 * No FX conversion, no resellers, no hardcoded prices. TH failure -> throw (502); US failure -> USD null with reason.
 */
export const ABM_APP_ID = '1460000360'
export const ABM_SLUG = 'arena-breakout'
export const ABM_SHELVES_API = 'https://www.midasbuy.com/frontend/api/midasbuy/v1/shelves/query'
export const ABM_MIDASBUY_TH = 'https://www.midasbuy.com/midasbuy/th/buy/uamo'
export const ABM_MIDASBUY_US = 'https://www.midasbuy.com/midasbuy/us/buy/uamo'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class ArenaBreakoutUpstreamUnavailableError extends Error {
  constructor(message = 'Arena Breakout Midasbuy upstream unavailable') { super(message); this.name = 'ArenaBreakoutUpstreamUnavailableError' }
}
export class ArenaBreakoutInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Arena Breakout Midasbuy response') { super(message); this.name = 'ArenaBreakoutInvalidUpstreamResponseError' }
}

type Price = { amount?: string | number; display_amount?: string | number; currency?: string; payment_channel_id?: string }
const num = (v: unknown) => (v === undefined || v === null || v === '' ? NaN : Number(String(v).replace(/,/g, '')))
const val = (p: Price) => (num(p.display_amount) > 0 ? num(p.display_amount) : num(p.amount))

type Flat = { productId: string; name: string; type: string; customType: string; description: string; base: number; bonus: number; bonusTags: string[]; otherGifts: string[]; price: number | null; currency: string | null; channelsOnly: string[] | null }

const PASS_TYPES = new Set(['Rp', 'Subscription'])

function flatten(body: any, label: string, types: Set<string>): Flat[] {
  const products = body?.shelf?.products
  if (!Array.isArray(products)) throw new ArenaBreakoutInvalidUpstreamResponseError(label + ': no shelf.products')
  const out: Flat[] = []
  for (const p of products) {
    if (!types.has(p?.product_type) || typeof p?.product_id !== 'string') continue
    const rows: Price[] = [...(Array.isArray(p.prices) ? p.prices : []), ...(Array.isArray(p.collapsed_prices) ? p.collapsed_prices : [])]
      .filter((r: Price) => Number.isFinite(val(r)) && val(r) > 0)
    const std = rows.find((r) => !r.payment_channel_id) ?? null
    let pick: Price | null = std
    if (!pick) for (const r of rows) if (!pick || val(r) < val(pick)) pick = r
    let bonus = 0; const tags: string[] = []; const other: string[] = []
    for (const promo of p.base_group?.promotion_list ?? []) {
      for (const g of promo?.gift_list ?? []) {
        const q = Number(g?.quantity) || 0
        if (g?.product_type === 'GameCoins' && /bond/i.test(String(g?.name))) {
          bonus += q
          for (const t of promo.activity_tag_list_v2 ?? []) if (t?.i18n_tag) tags.push(t.i18n_tag)
        } else if (q > 0) other.push(`${g?.name ?? 'gift'} x${q}`)
      }
    }
    const chans = [...new Set(rows.map((r) => String(r.payment_channel_id)))]
    const samePrice = !std && rows.length > 1 && rows.every((r) => val(r) === val(rows[0]!))
    out.push({
      productId: p.product_id, name: String(p.name ?? p.product_id).trim(), type: String(p.product_type), customType: String(p.custom_product_type ?? ''),
      description: String(p.description ?? '').trim(), base: Number(p.game_coins_num) || 0,
      bonus, bonusTags: [...new Set(tags)], otherGifts: other,
      price: pick ? val(pick) : null, currency: pick?.currency ?? null,
      // all channels same price -> not a channel-restricted product, just no "standard" row
      channelsOnly: !std && pick && !samePrice ? chans : null
    })
  }
  return out
}

async function shelf(region: 'TH' | 'US', referer: string, productTypes: string[], signal?: AbortSignal): Promise<any> {
  let r: Response
  try {
    r = await fetch(ABM_SHELVES_API, {
      method: 'POST', signal: signal ?? AbortSignal.timeout(25_000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: 'https://www.midasbuy.com', Referer: referer, 'User-Agent': UA },
      body: JSON.stringify({ app_id: ABM_APP_ID, client_ver: 'android', is_vip_product: true, language: 'en', product_types: productTypes, region, server_id: '1', shop_code: 'midasbuy' })
    })
  } catch (e) { throw new ArenaBreakoutUpstreamUnavailableError(region + ': ' + (e instanceof Error ? e.message : 'network error')) }
  if (!r.ok) throw new ArenaBreakoutUpstreamUnavailableError(region + ': HTTP ' + r.status)
  try { return await r.json() } catch { throw new ArenaBreakoutInvalidUpstreamResponseError(region + ': not JSON') }
}

type Side = { rows: Flat[] | null; reason: string }
const safe = (p: Promise<any>, label: string, types: Set<string>): Promise<Side> =>
  p.then((b) => ({ rows: flatten(b, label, types), reason: '' })).catch((e) => ({ rows: null, reason: e instanceof Error ? e.message : String(e) }))

function passLabel(t: Flat): string {
  if (t.customType === 'SeasonPass' || /battle pass/i.test(t.name)) return 'Battle Pass'
  if (t.type === 'Subscription') return 'Monthly privilege (subscription)'
  if (/bundle|select/i.test(t.name)) return 'Bundle'
  return 'Item'
}

export async function fetchArenaBreakoutPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const COINS = new Set(['GameCoins'])
  const [thBody, us, thPass, usPass] = await Promise.all([
    shelf('TH', ABM_MIDASBUY_TH, ['GameCoins'], signal),
    safe(shelf('US', ABM_MIDASBUY_US, ['GameCoins'], signal), 'US', COINS),
    safe(shelf('TH', ABM_MIDASBUY_TH, ['Rp'], signal), 'TH', PASS_TYPES),
    safe(shelf('US', ABM_MIDASBUY_US, ['Rp'], signal), 'US', PASS_TYPES)
  ])
  const th = flatten(thBody, 'TH', COINS).filter((t) => t.currency === 'THB' && t.price !== null)
  if (!th.length) throw new ArenaBreakoutInvalidUpstreamResponseError('TH: no THB GameCoins products')
  if (us.rows && !us.rows.length) { us.reason = 'US shelf returned 0 GameCoins products'; us.rows = null }
  const usdMap = new Map((us.rows ?? []).map((r) => [r.productId, r]))
  th.sort((a, b) => a.base - b.base || (a.price ?? 0) - (b.price ?? 0))

  const packs = th.map((t, i) => {
    const u = usdMap.get(t.productId)
    const usd = u && u.currency === 'USD' && u.price !== null ? u.price : null
    const desc: string[] = []
    if (t.bonus) desc.push(`+${t.bonus} Bonds bonus${t.bonusTags.length ? ' (' + t.bonusTags.join(', ') + ')' : ''}`)
    if (t.otherGifts.length) desc.push('Gifts: ' + t.otherGifts.join(', '))
    if (t.channelsOnly) desc.push('THB price only via ' + t.channelsOnly.join('/'))
    const pack: any = {
      id: i + 1, name: t.name, product_id: t.productId,
      baseItemAmount: t.base, bonusItemAmount: t.bonus, totalItemAmount: t.base + t.bonus,
      bonus_available: t.bonus > 0, bonus_source: t.bonus > 0 ? 'midasbuy-th promotion gift_list [' + t.bonusTags.join(', ') + ']' : 'midasbuy-th (no Bonds promotion on this product)',
      item_pack: false, description: desc.join(' · '),
      price_thb: t.price, price_thb_source: t.channelsOnly ? 'midasbuy-th-official (' + t.channelsOnly.join('/') + ' only)' : 'midasbuy-th-official',
      price_usd: usd, price_usd_source: usd !== null ? 'midasbuy-us-official' : null,
      price: t.price, currency: 'THB'
    }
    if (usd === null) pack.price_usd_null_reason = us.rows
      ? (t.channelsOnly ? 'Thailand-only ' + t.channelsOnly.join('/') + ' product; not sold on Midasbuy US. No FX conversion.' : 'Not sold on Midasbuy US shelf. No FX conversion.')
      : 'Midasbuy US fetch failed: ' + us.reason
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })

  // ---- Category 2: Battle Pass / privileges / bundles (Midasbuy product_types ["Rp"]) ----
  const passTh = (thPass.rows ?? []).filter((t) => t.currency === 'THB' && t.price !== null)
  const passUsMap = new Map((usPass.rows ?? []).map((r) => [r.productId, r]))
  const order = (t: Flat) => ({ 'Battle Pass': 0, 'Monthly privilege (subscription)': 1, Bundle: 2, Item: 3 } as Record<string, number>)[passLabel(t)] ?? 9
  passTh.sort((a, b) => order(a) - order(b) || (a.price ?? 0) - (b.price ?? 0))
  const passPacks = passTh.map((t, i) => {
    const u = passUsMap.get(t.productId)
    const usd = u && u.currency === 'USD' && u.price !== null ? u.price : null
    const kind = passLabel(t)
    const pack: any = {
      id: packs.length + i + 1, name: t.name, product_id: t.productId, pass_type: kind,
      baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null,
      base_null_reason: 'Item/pass product (' + kind + '), not a Bonds top-up; no currency amount.',
      bonus_null_reason: 'Item/pass product; Midasbuy lists no Bonds bonus for it.',
      bonus_available: false, item_pack: true,
      description: [kind + (t.customType && t.customType !== '*' ? ' [' + t.customType + ']' : ''), t.description || null, t.otherGifts.length ? 'Gifts: ' + t.otherGifts.join(', ') : null, t.channelsOnly ? 'THB price only via ' + t.channelsOnly.join('/') : null].filter(Boolean).join(' · '),
      price_thb: t.price, price_thb_source: 'midasbuy-th-official (product_types Rp)',
      price_usd: usd, price_usd_source: usd !== null ? 'midasbuy-us-official (product_types Rp)' : null,
      price: t.price, currency: 'THB'
    }
    if (usd === null) pack.price_usd_null_reason = usPass.rows ? 'Not sold on Midasbuy US Rp shelf. No FX conversion.' : 'Midasbuy US Rp fetch failed: ' + usPass.reason
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })

  const notes = [
    'Official Tencent Midasbuy store (app_id ' + ABM_APP_ID + '). THB = region TH ' + ABM_MIDASBUY_TH + '; USD = region US ' + ABM_MIDASBUY_US + '. Matched by product_id, no FX.',
    'Price = Midasbuy standard price (no payment channel surcharge); carrier-billing-only TH products use their channel price.',
    'base = game_coins_num; bonus = Bonds gifts from Midasbuy promotions (e.g. First Bonus, once per account per tier).',
    'Battle Pass / privileges / bundles = Midasbuy shelf product_types ["Rp"] (item packs, no Bonds amount).'
  ]
  if (!us.rows) notes.push('USD unavailable: ' + us.reason)
  if (!thPass.rows) notes.push('Battle Pass category unavailable: ' + thPass.reason)
  const categories: any[] = [{ id: 1, name: 'Midasbuy Bonds (TH THB / US USD)', status: 0, message: 'Live (no fallback catalog)', packCount: packs.length, packs }]
  categories.push(thPass.rows
    ? { id: 2, name: 'Battle Pass / Privileges / Bundles (Midasbuy TH THB / US USD)', status: 0, message: 'Live (no fallback catalog)', packCount: passPacks.length, packs: passPacks }
    : { id: 2, name: 'Battle Pass / Privileges / Bundles (Midasbuy TH THB / US USD)', status: 1, message: 'Midasbuy TH Rp fetch failed: ' + thPass.reason, packCount: 0, packs: [] })
  const packCount = packs.length + passPacks.length
  return ({
    game: { id: Number(ABM_APP_ID), slug: ABM_SLUG, name: 'Arena Breakout: Mobile', itemName: 'Bonds', itemIcon: '' },
    categories, summary: { categoryCount: categories.length, packCount },
    fetchedAt: new Date().toISOString(), source: ABM_MIDASBUY_TH,
    sources: { thb: ABM_MIDASBUY_TH, usd: us.rows ? ABM_MIDASBUY_US : null, api: ABM_SHELVES_API },
    notes
  } as unknown) as RovPacksResponse
}

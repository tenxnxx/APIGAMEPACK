import type { RovPacksResponse } from '../types/rov'

/**
 * Crossfire: Legends (Tencent / Smilegate) — official Tencent Midasbuy store (midasbuy.com/midasbuy/{th,kh}/buy/cfl).
 * THB = Midasbuy Thailand shelf (region=TH). USD = Midasbuy Cambodia shelf (region=KH, priced in USD by Midasbuy;
 * Midasbuy has no US storefront for CFL). Matched by product_id. No FX conversion, no resellers, no hardcoded prices.
 * base = game_coins_num; bonus = CrossfireCoin gifts in base_group.promotion_list (e.g. "First Bonus").
 * Price = list price (display_amount when > 0, else amount); current Midasbuy sale price kept as *_sale.
 * TH failure -> throw (route 502); KH failure -> USD null with reason.
 */
export const CFL_APP_ID = '1460001033'
export const CFL_SLUG = 'crossfire-legends'
export const CFL_SHELVES_API = 'https://www.midasbuy.com/frontend/api/midasbuy/v1/shelves/query'
export const CFL_MIDASBUY_TH = 'https://www.midasbuy.com/midasbuy/th/buy/cfl'
export const CFL_MIDASBUY_KH = 'https://www.midasbuy.com/midasbuy/kh/buy/cfl'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class CflUpstreamUnavailableError extends Error {
  constructor(message = 'Crossfire: Legends Midasbuy upstream unavailable') { super(message); this.name = 'CflUpstreamUnavailableError' }
}
export class CflInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Crossfire: Legends Midasbuy response') { super(message); this.name = 'CflInvalidUpstreamResponseError' }
}

type Price = { amount?: string | number; display_amount?: string | number; currency?: string; payment_channel_id?: string }
const n = (v: unknown) => (v === undefined || v === null || v === '' ? NaN : Number(String(v).replace(/,/g, '')))
const list = (p: Price) => (n(p.display_amount) > 0 ? n(p.display_amount) : n(p.amount))

type Flat = { productId: string; name: string; base: number; bonus: number; bonusTags: string[]; otherGifts: string[]; list: number | null; sale: number | null; currency: string | null; channelsOnly: string[] | null }

function flatten(body: any, label: string): Flat[] {
  const products = body?.shelf?.products
  if (!Array.isArray(products)) throw new CflInvalidUpstreamResponseError(label + ': no shelf.products')
  const out: Flat[] = []
  for (const p of products) {
    if (p?.product_type !== 'GameCoins' || typeof p?.product_id !== 'string') continue
    const main: Price[] = Array.isArray(p.prices) ? p.prices : []
    const collapsed: Price[] = Array.isArray(p.collapsed_prices) ? p.collapsed_prices : []
    const rows = main.length ? main : collapsed
    let best: Price | null = null
    for (const r of rows) if (Number.isFinite(list(r)) && list(r) > 0 && (!best || list(r) > list(best))) best = r
    const saleRow = main.find((r) => !r.payment_channel_id) ?? null
    let bonus = 0; const tags: string[] = []; const other: string[] = []
    for (const promo of p.base_group?.promotion_list ?? []) {
      for (const g of promo?.gift_list ?? []) {
        const q = Number(g?.quantity) || 0
        if (g?.product_type === 'GameCoins' && /crossfire\s*coin/i.test(String(g?.name))) {
          bonus += q
          for (const t of promo.activity_tag_list_v2 ?? []) if (t?.i18n_tag) tags.push(t.i18n_tag)
        } else if (q > 0) other.push(`${g?.name ?? 'gift'} x${q}`)
      }
    }
    out.push({
      productId: p.product_id, name: String(p.name ?? p.product_id), base: Number(p.game_coins_num) || 0,
      bonus, bonusTags: [...new Set(tags)], otherGifts: other,
      list: best ? list(best) : null,
      sale: saleRow && n(saleRow.amount) > 0 ? n(saleRow.amount) : null,
      currency: best?.currency ?? null,
      channelsOnly: !main.length && best ? [...new Set(collapsed.map((r) => String(r.payment_channel_id)))] : null
    })
  }
  return out
}

async function shelf(region: 'TH' | 'KH', referer: string, signal?: AbortSignal): Promise<any> {
  let r: Response
  try {
    r = await fetch(CFL_SHELVES_API, {
      method: 'POST', signal: signal ?? AbortSignal.timeout(25_000),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Origin: 'https://www.midasbuy.com', Referer: referer, 'User-Agent': UA },
      body: JSON.stringify({ app_id: CFL_APP_ID, client_ver: 'android', is_vip_product: true, language: 'en', product_types: ['GameCoins'], region, server_id: '1', shop_code: 'midasbuy' })
    })
  } catch (e) { throw new CflUpstreamUnavailableError(region + ': ' + (e instanceof Error ? e.message : 'network error')) }
  if (!r.ok) throw new CflUpstreamUnavailableError(region + ': HTTP ' + r.status)
  try { return await r.json() } catch { throw new CflInvalidUpstreamResponseError(region + ': not JSON') }
}

export async function fetchCflPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [thBody, kh] = await Promise.all([
    shelf('TH', CFL_MIDASBUY_TH, signal),
    shelf('KH', CFL_MIDASBUY_KH, signal).then((b) => ({ rows: flatten(b, 'KH'), reason: '' })).catch((e) => ({ rows: null as Flat[] | null, reason: e instanceof Error ? e.message : String(e) }))
  ])
  const th = flatten(thBody, 'TH')
  if (!th.length) throw new CflInvalidUpstreamResponseError('TH: no GameCoins products')
  if (kh.rows && !kh.rows.length) { kh.reason = 'KH shelf returned 0 GameCoins products'; kh.rows = null }
  const usdMap = new Map((kh.rows ?? []).map((r) => [r.productId, r]))
  th.sort((a, b) => a.base - b.base)

  const packs = th.map((t, i) => {
    const u = usdMap.get(t.productId)
    const usd = u && u.currency === 'USD' && u.list !== null ? u.list : null
    const desc: string[] = []
    if (t.bonus) desc.push(`+${t.bonus} CrossfireCoin bonus${t.bonusTags.length ? ' (' + t.bonusTags.join(', ') + ')' : ''}`)
    if (t.otherGifts.length) desc.push('Gifts: ' + t.otherGifts.join(', '))
    if (t.channelsOnly) desc.push('THB price only via ' + t.channelsOnly.join('/'))
    const pack: any = {
      id: i + 1, name: t.name, product_id: t.productId,
      baseItemAmount: t.base, bonusItemAmount: t.bonus, totalItemAmount: t.base + t.bonus,
      bonus_available: true, bonus_source: 'midasbuy-th promotion gift_list' + (t.bonusTags.length ? ' [' + t.bonusTags.join(', ') + ']' : ''),
      item_pack: false, description: desc.join(' · '),
      price_thb: t.list, price_thb_sale: t.sale, price_thb_source: t.list !== null ? 'midasbuy-th-official' : null,
      price_usd: usd, price_usd_sale: u && usd !== null ? u.sale : null, price_usd_source: usd !== null ? 'midasbuy-kh-official (USD)' : null,
      price: t.list ?? usd ?? 0, currency: t.list !== null ? 'THB' : usd !== null ? 'USD' : ''
    }
    if (t.list === null) pack.price_thb_null_reason = 'Midasbuy TH lists this product without any price'
    if (usd === null) pack.price_usd_null_reason = kh.rows ? 'Not sold on Midasbuy KH (USD) shelf; Midasbuy has no US store for CFL. No FX conversion.' : 'Midasbuy KH (USD) fetch failed: ' + kh.reason
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })
  const notes = [
    'Official Tencent Midasbuy store. THB = region TH ' + CFL_MIDASBUY_TH + '; USD = region KH ' + CFL_MIDASBUY_KH + ' (Midasbuy prices CFL in USD there; no US storefront). Matched by product_id, no FX.',
    'price_* = list price (display_amount when > 0, else amount); price_*_sale = current Midasbuy discounted price.',
    'base = game_coins_num; bonus = CrossfireCoin gifts from Midasbuy promotions (e.g. First Bonus, once per account).'
  ]
  if (!kh.rows) notes.push('USD unavailable: ' + kh.reason)
  const categories = [{ id: 1, name: 'Midasbuy CrossfireCoin (TH THB / KH USD)', status: 0, message: 'Live (no fallback catalog)', packCount: packs.length, packs }]
  return ({
    game: { id: Number(CFL_APP_ID), slug: CFL_SLUG, name: 'Crossfire: Legends', itemName: 'CrossfireCoin', itemIcon: '' },
    categories, summary: { categoryCount: 1, packCount: packs.length },
    fetchedAt: new Date().toISOString(), source: CFL_MIDASBUY_TH,
    sources: { thb: CFL_MIDASBUY_TH, usd: kh.rows ? CFL_MIDASBUY_KH : null, api: CFL_SHELVES_API },
    notes
  } as unknown) as RovPacksResponse
}

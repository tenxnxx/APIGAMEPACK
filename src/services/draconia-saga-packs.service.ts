import type { RovPacksResponse } from '../types/rov'

/**
 * Draconia Saga (SugarFun Game) — official SEA web top-up https://sea.sugarfungame.com/next/recharge/
 * Live API: POST https://sea-pay.sugarfungame.com/pay-service/webpay/do  service=goods,
 * data = base64(encodeURIComponent(JSON {appKey})). The shop prices by visitor region:
 * TH visitor -> THB (data.country "TH"), US visitor -> USD (data.country "US"). We request each region
 * (X-Forwarded-For with a TH / US address) and only accept the answer if data.country matches.
 * Item = Credit (1 Credit = 60 Diamonds in game). No FX conversion, no resellers, no hardcoded prices.
 */
export const DRACONIA_SLUG = 'draconia-saga'
export const DRACONIA_APP_KEY = '1704187656426'
export const DRACONIA_APP_ID = 6476590090
export const DRACONIA_TOPUP_URL = 'https://sea.sugarfungame.com/next/recharge/index.html'
export const DRACONIA_API_URL = 'https://sea-pay.sugarfungame.com/pay-service/webpay/do'
const REGION_IP = { TH: '1.46.0.1', US: '8.8.8.8' } as const
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class DraconiaUpstreamUnavailableError extends Error {
  constructor(message = 'Draconia Saga SugarFun upstream unavailable') { super(message); this.name = 'DraconiaUpstreamUnavailableError' }
}
export class DraconiaInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Draconia Saga SugarFun response') { super(message); this.name = 'DraconiaInvalidUpstreamResponseError' }
}

type Goods = { name: string; price: number; credits: number; id: string; status: number; ext: any }

async function fetchRegion(region: 'TH' | 'US', signal?: AbortSignal): Promise<{ goods: Goods[]; discount: number | null }> {
  const data = btoa(encodeURIComponent(JSON.stringify({ appKey: DRACONIA_APP_KEY })))
  let r: Response
  try {
    r = await fetch(DRACONIA_API_URL, {
      method: 'POST', signal: signal ?? AbortSignal.timeout(20_000),
      headers: {
        'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded',
        Origin: 'https://sea.sugarfungame.com', Referer: 'https://sea.sugarfungame.com/', 'X-Forwarded-For': REGION_IP[region]
      },
      body: new URLSearchParams({ data, service: 'goods' }).toString()
    })
  } catch (e) {
    throw new DraconiaUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!r.ok) throw new DraconiaUpstreamUnavailableError('HTTP ' + r.status)
  let j: any
  try { j = await r.json() } catch { throw new DraconiaInvalidUpstreamResponseError('Non-JSON response') }
  if (j?.code !== 0 || !Array.isArray(j?.data?.goodsList)) throw new DraconiaInvalidUpstreamResponseError(`goods ${region}: code ${j?.code} ${j?.msg ?? ''}`)
  if (j.data.country !== region) throw new DraconiaInvalidUpstreamResponseError(`goods ${region}: store answered for country "${j.data.country}"`)
  const goods = (j.data.goodsList as any[])
    .filter((g) => typeof g?.goods_price === 'number' && g.goods_price > 0 && typeof g?.goods_name === 'string')
    .map((g) => ({ name: g.goods_name, price: g.goods_price, credits: Number(g.goods_number) || 0, id: String(g.goods_id), status: Number(g.status) || 0, ext: g.goodsExtInfo ?? {} }))
  if (!goods.length) throw new DraconiaInvalidUpstreamResponseError(`goods ${region}: empty`)
  return { goods, discount: typeof j.data.discount === 'number' ? j.data.discount : null }
}

export async function fetchDraconiaPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [th, us] = await Promise.all([
    fetchRegion('TH', signal),
    fetchRegion('US', signal).then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, reason: e instanceof Error ? e.message : String(e) }))
  ])
  const usGoods = us.ok ? us.v.goods : []
  const packs = th.goods.slice().sort((a, b) => a.credits - b.credits || a.price - b.price).map((g, i) => {
    const u = usGoods.find((x) => x.name === g.name && x.credits === g.credits)
    const reward = typeof g.ext?.rewardMoney === 'number' ? g.ext.rewardMoney : 0
    const pack: any = {
      id: i + 1, name: g.name, product_id: g.id,
      baseItemAmount: g.credits, bonusItemAmount: reward, totalItemAmount: g.credits + reward,
      bonus_available: true, bonus_source: 'sugarfun-webpay goodsExtInfo.rewardMoney',
      item_pack: false,
      description: g.ext?.tip ?? '',
      price_thb: g.price, price_thb_source: 'sugarfun-sea-official (country TH)',
      price_usd: u ? u.price : null, price_usd_source: u ? 'sugarfun-sea-official (country US)' : null,
      price: g.price, currency: 'THB'
    }
    if (!u) pack.price_usd_null_reason = us.ok ? `"${g.name}" not offered on the official store for US visitors` : 'Official store USD (US) request failed: ' + us.reason + '. No FX conversion.'
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  })
  const categories = [{ id: 1, name: 'Official SugarFun SEA Top-up (Credit)', packs, status: 0, message: 'Live (no fallback catalog)', packCount: packs.length }]
  const notes = [
    'Source: official SugarFun Game SEA recharge ' + DRACONIA_TOPUP_URL + ' (live webpay goods API, appKey ' + DRACONIA_APP_KEY + '). THB = price shown to TH visitors; USD = price shown to US visitors. No FX conversion.',
    'Item is Credit (store: 1 Credit = 60 Diamonds in game, usable for any direct purchase). bonus = goodsExtInfo.rewardMoney (0 when none).',
    'The store also advertises a web-only Diamond gift per order (first order / later orders); it is mailed in game as Diamonds and is not returned per pack by the API, so it is not counted in bonus.'
  ]
  if (th.discount !== null && th.discount !== 1) notes.push('Store-wide discount factor (TH): ' + th.discount)
  if (!us.ok) notes.push('USD unavailable: ' + us.reason)
  return ({
    game: { id: DRACONIA_APP_ID, slug: DRACONIA_SLUG, name: 'Draconia Saga', itemName: 'Credit', itemIcon: '' },
    categories,
    summary: { categoryCount: 1, packCount: packs.length },
    fetchedAt: new Date().toISOString(),
    source: DRACONIA_TOPUP_URL,
    sources: { goods: DRACONIA_API_URL, thb: DRACONIA_API_URL + ' (country TH)', usd: DRACONIA_API_URL + ' (country US)' },
    notes
  } as unknown) as RovPacksResponse
}

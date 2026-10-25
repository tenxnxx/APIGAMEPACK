import type { RovPack, RovPacksResponse } from '../types/rov'
import { isFiniteNumber, isRecord } from '../lib/guards'

/**
 * Aniimo — official web shop https://www.aniimo.com/store/en/ (Pawprint Studio / FunPlus-KingsGroup backend).
 * Live data from the same API the official shop page calls (POST store/init).
 * Currency is chosen by the upstream from the caller IP (get_ip_currency); TH IP -> THB.
 * base = coin, bonus = level_normal_rebate coin (standard bonus), full price = original_price.
 */
export const ANIIMO_SLUG = 'aniimo'
export const ANIIMO_GAME_ID = 999002
export const ANIIMO_SHOP_URL = 'https://www.aniimo.com/store/en/'
export const ANIIMO_STORE_API_URL = 'https://worldx-store-coin.kingsgroupgames.com/api/store/init'
const ANIIMO_STORE_BODY = { server_id: 1, game_id: ANIIMO_GAME_ID, game_project: 'worldx_global', source: 'web' }

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

/** Display-name translation only (labels the official EN page shows); never prices. */
const NAME_EN: Record<string, string> = {
  月度之证: 'Monthly Pass',
  进阶版同行手册: 'Advanced Companion Handbook',
  典藏版同行手册: "Collector's Companion Handbook"
}

export class AniimoUpstreamUnavailableError extends Error {
  constructor(message = 'Aniimo official shop upstream unavailable') {
    super(message)
    this.name = 'AniimoUpstreamUnavailableError'
  }
}
export class AniimoInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Aniimo official shop response') {
    super(message)
    this.name = 'AniimoInvalidUpstreamResponseError'
  }
}

export type AniimoPack = Omit<RovPack, 'bonusItemAmount'> & {
  bonusItemAmount: number | null
  bonus_available: boolean
  bonus_source: string | null
  first_purchase_bonus: number | null
  first_purchase_of_month_price: number | null
  product_id: string
}

function benefit(p: Record<string, unknown>, type: string): Record<string, unknown> | null {
  if (!Array.isArray(p.benefit)) return null
  const b = p.benefit.find((x) => isRecord(x) && x.act_type === type)
  return isRecord(b) ? b : null
}

export function parseAniimoProducts(payload: unknown): { currency: string; country: string | null; packs: AniimoPack[]; kind: Map<number, number> } {
  if (!isRecord(payload) || payload.code !== 0 || !isRecord(payload.data)) {
    throw new AniimoInvalidUpstreamResponseError('Unexpected store/init payload')
  }
  const gp = payload.data.game_products
  if (!isRecord(gp) || !Array.isArray(gp.data)) throw new AniimoInvalidUpstreamResponseError('No game_products')
  const ip = isRecord(payload.data.get_ip_currency) && isRecord(payload.data.get_ip_currency.data)
    ? payload.data.get_ip_currency.data : null
  const packs: AniimoPack[] = []
  const kind = new Map<number, number>()
  let currency = ''
  for (const p of gp.data) {
    if (!isRecord(p) || typeof p.currency !== 'string') continue
    const price = isFiniteNumber(p.original_price) ? p.original_price : isFiniteNumber(p.price) ? p.price : null
    if (price === null) continue
    currency = p.currency
    const coin = isFiniteNumber(p.coin) ? p.coin : 0
    const normal = benefit(p, 'level_normal_rebate')
    const first = benefit(p, 'level_first_rebate')
    const month = benefit(p, 'month_first_discount')
    const bonus = coin <= 0 ? 0 : normal && isFiniteNumber(normal.coin) ? normal.coin : null
    const desc = typeof p.description === 'string' ? p.description.trim() : ''
    const id = Number(p.package_id)
    const usd = p.currency === 'USD' ? price : null
    const thb = p.currency === 'THB' ? price : null
    packs.push({
      id: Number.isFinite(id) ? id : packs.length + 1,
      name: coin > 0 ? `${coin} Lumin Crystals` : NAME_EN[desc] ?? desc,
      baseItemAmount: coin,
      bonusItemAmount: bonus,
      totalItemAmount: coin + (bonus ?? 0),
      bonus_available: bonus !== null,
      bonus_source: bonus === null ? null : 'aniimo-official-shop-benefit',
      first_purchase_bonus: first && isFiniteNumber(first.coin) ? first.coin : null,
      first_purchase_of_month_price: month && isFiniteNumber(month.discount_price) ? month.discount_price : null,
      product_id: String(p.product_id ?? ''),
      price,
      currency: p.currency,
      ...(thb !== null ? { price_thb: thb } : {}),
      price_usd: usd,
      prices: { THB: thb, USD: usd },
      ...(thb !== null ? { price_thb_source: 'aniimo-official-shop' } : {}),
      price_usd_source: usd !== null ? 'aniimo-official-shop' : undefined
    } as AniimoPack)
    kind.set(packs[packs.length - 1].id, isFiniteNumber(p.product_type) ? p.product_type : 0)
  }
  return { currency, country: ip && typeof ip.country === 'string' ? ip.country : null, packs, kind }
}

export async function fetchAniimoPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  let response: Response
  try {
    response = await fetch(ANIIMO_STORE_API_URL, {
      method: 'POST',
      signal: options?.signal ?? AbortSignal.timeout(25_000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Referer: 'https://www.aniimo.com/', 'User-Agent': BROWSER_UA },
      body: JSON.stringify(ANIIMO_STORE_BODY)
    })
  } catch (error) {
    throw new AniimoUpstreamUnavailableError(error instanceof Error ? error.message : 'network error')
  }
  if (!response.ok) throw new AniimoUpstreamUnavailableError('HTTP ' + response.status)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new AniimoInvalidUpstreamResponseError('Non-JSON response')
  }
  const { currency, country, packs, kind } = parseAniimoProducts(payload)
  if (packs.length === 0) throw new AniimoInvalidUpstreamResponseError('No products')
  const msg = 'Live from Aniimo official shop (no fallback)'
  const cats = [
    { id: 1, name: 'Lumin Crystals', packs: packs.filter((p) => kind.get(p.id) === 1) },
    { id: 2, name: 'Passes & Handbooks', packs: packs.filter((p) => kind.get(p.id) !== 1) }
  ]
    .filter((c) => c.packs.length)
    .map((c) => ({ ...c, status: 0, message: msg, packCount: c.packs.length }))
  return ({
    game: { id: ANIIMO_GAME_ID, slug: ANIIMO_SLUG, name: 'Aniimo', itemName: 'Lumin Crystal', itemIcon: '' },
    categories: cats,
    summary: { categoryCount: cats.length, packCount: packs.length },
    fetchedAt: new Date().toISOString(),
    source: ANIIMO_SHOP_URL,
    sources: { [currency.toLowerCase() || 'price']: ANIIMO_STORE_API_URL },
    notes: [
      'Official Aniimo web shop API (same data as https://www.aniimo.com/store/en/).',
      `Currency picked by upstream from server IP: ${currency || 'unknown'} (country ${country ?? 'unknown'}). Other currency is null (never converted).`,
      'Price = original_price (full price). Bonus = level_normal_rebate coin (standard bonus); null if missing.',
      'first_purchase_bonus = level_first_rebate (first-time double); first_purchase_of_month_price = month_first_discount price (shown, not used as price).',
      'Live-fetch only; failure -> 502 (no static catalog).'
    ]
  } as unknown) as RovPacksResponse
}

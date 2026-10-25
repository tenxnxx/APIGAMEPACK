import type { RovPack, RovPacksResponse } from '../types/rov'
import { isFiniteNumber, isRecord } from '../lib/guards'

/**
 * Delta Force (Garena, Thailand) — official Garena Topup Center.
 * Live data from the same JSON API the official shop page calls:
 *   https://shop.garena.sg/?app=100151  (region=TH -> THB prices)
 * base = app_point_amount, bonus = promo.real_promo_amount, THB = original_currency_amount.
 * Never hardcodes prices; upstream failure -> throw (route maps to 502).
 */
export const DELTA_FORCE_GARENA_APP_ID = 100151
export const DELTA_FORCE_GARENA_SLUG = 'delta-force-garena'
export const DELTA_FORCE_GARENA_SHOP_URL = 'https://shop.garena.sg/?app=100151'
export const DELTA_FORCE_GARENA_CHANNELS_API_URL =
  'https://shop.garena.sg/api/shop/apps/channels?app_id=100151&region=TH&language=en'
/** Default pay channel shown first: QR Code PromptPay. */
export const DELTA_FORCE_GARENA_DEFAULT_CHANNEL = 207269

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class DeltaForceGarenaUpstreamUnavailableError extends Error {
  constructor(message = 'Garena Topup Center upstream unavailable') {
    super(message)
    this.name = 'DeltaForceGarenaUpstreamUnavailableError'
  }
}

export class DeltaForceGarenaInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Garena Topup Center response') {
    super(message)
    this.name = 'DeltaForceGarenaInvalidUpstreamResponseError'
  }
}

export type DeltaForceGarenaPack = Omit<RovPack, 'bonusItemAmount'> & {
  bonusItemAmount: number | null
  bonus_available: boolean
  bonus_source: string | null
  channel_id: number
  channel_name: string
}

type Channel = { id: number; name: string; packs: DeltaForceGarenaPack[] }

function toPack(item: Record<string, unknown>, ch: { id: number; name: string }): DeltaForceGarenaPack | null {
  const price = isFiniteNumber(item.original_currency_amount)
    ? item.original_currency_amount
    : isFiniteNumber(item.currency_amount)
      ? item.currency_amount
      : null
  if (price === null || item.currency !== 'THB') return null
  const base = isFiniteNumber(item.app_point_amount) ? item.app_point_amount : 0
  const appItem = isRecord(item.app_item) ? item.app_item : null
  const itemName = appItem && typeof appItem.name === 'string' ? appItem.name.trim() : ''
  if (base <= 0 && !itemName) return null
  const promo = isRecord(item.promo) ? item.promo : null
  const bonus =
    base <= 0 ? 0 : promo && isFiniteNumber(promo.real_promo_amount) ? promo.real_promo_amount : null
  const itemId = isFiniteNumber(item.item_id) ? item.item_id : 0
  return {
    id: base > 0 ? base : 900000 + itemId,
    name: base > 0 ? `${base} Delta Coin` : itemName,
    baseItemAmount: base,
    bonusItemAmount: bonus,
    totalItemAmount: base + (bonus ?? 0),
    bonus_available: bonus !== null,
    bonus_source: bonus === null ? null : 'garena-topup-center-promo',
    price,
    currency: 'THB',
    price_thb: price,
    price_usd: null,
    prices: { THB: price, USD: null },
    price_thb_source: 'garena-topup-center',
    channel_id: ch.id,
    channel_name: ch.name
  }
}

export function parseDeltaForceGarenaChannels(payload: unknown): Channel[] {
  if (!isRecord(payload) || !Array.isArray(payload.channels)) {
    throw new DeltaForceGarenaInvalidUpstreamResponseError('Unexpected channels payload')
  }
  const out: Channel[] = []
  for (const c of payload.channels) {
    if (!isRecord(c) || c.currency !== 'THB' || c.visible === false || !Array.isArray(c.items)) continue
    if (!isFiniteNumber(c.channel)) continue
    const ch = { id: c.channel, name: typeof c.name === 'string' ? c.name.trim() : String(c.channel) }
    const packs = c.items
      .filter(isRecord)
      .map((i) => toPack(i, ch))
      .filter((p): p is DeltaForceGarenaPack => p !== null)
      .sort((a, b) => a.price - b.price)
    if (packs.length) out.push({ ...ch, packs })
  }
  return out
}

const signature = (c: Channel) =>
  c.packs.map((p) => `${p.name}@${p.price}+${p.bonusItemAmount}`).join('|')

function toResponse(channels: Channel[]): RovPacksResponse {
  const def =
    channels.find((c) => c.id === DELTA_FORCE_GARENA_DEFAULT_CHANNEL) ??
    [...channels].sort((a, b) => b.packs.length - a.packs.length)[0]
  const seen = new Set([signature(def)])
  const extra = channels.filter((c) => {
    if (c === def) return false
    const s = signature(c)
    if (seen.has(s)) return false
    seen.add(s)
    return true
  })
  const msg = 'Live from Garena Topup Center (official, region TH; no fallback)'
  const coins = def.packs.filter((p) => p.baseItemAmount > 0)
  const items = def.packs.filter((p) => p.baseItemAmount <= 0)
  const cats = [
    { id: 1, name: `Delta Coin (${def.name})`, packs: coins },
    { id: 2, name: `Item Packages (${def.name})`, packs: items },
    ...extra.map((c, i) => ({ id: 10 + i, name: `Packs (${c.name})`, packs: c.packs }))
  ]
    .filter((c) => c.packs.length > 0)
    .map((c) => ({ ...c, status: 0, message: msg, packCount: c.packs.length }))

  return ({
    game: {
      id: DELTA_FORCE_GARENA_APP_ID,
      slug: DELTA_FORCE_GARENA_SLUG,
      name: 'Delta Force (Garena)',
      itemName: 'Delta Coin',
      itemIcon: ''
    },
    categories: cats,
    summary: { categoryCount: cats.length, packCount: cats.reduce((n, c) => n + c.packCount, 0) },
    fetchedAt: new Date().toISOString(),
    source: DELTA_FORCE_GARENA_SHOP_URL,
    sources: { thb: DELTA_FORCE_GARENA_CHANNELS_API_URL },
    notes: [
      'Official Garena Topup Center API (same data as the official shop page), region TH.',
      'THB = full listed price (original_currency_amount). Bonus = promo.real_promo_amount (live); null if missing.',
      `Default channel: ${def.name} (${def.id}). Other THB channels listed only when their packs/prices/bonus differ.`,
      'USD not provided by Garena TH shop (price_usd = null, never converted).',
      'Live-fetch only; failure -> 502 (no static catalog).'
    ]
  } as unknown) as RovPacksResponse
}

export async function fetchDeltaForceGarenaPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  let response: Response
  try {
    response = await fetch(DELTA_FORCE_GARENA_CHANNELS_API_URL, {
      signal: options?.signal ?? AbortSignal.timeout(25_000),
      headers: { Accept: 'application/json', Referer: DELTA_FORCE_GARENA_SHOP_URL, 'User-Agent': BROWSER_UA }
    })
  } catch (error) {
    throw new DeltaForceGarenaUpstreamUnavailableError(error instanceof Error ? error.message : 'network error')
  }
  if (!response.ok) throw new DeltaForceGarenaUpstreamUnavailableError('HTTP ' + response.status)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new DeltaForceGarenaInvalidUpstreamResponseError('Non-JSON response')
  }
  const channels = parseDeltaForceGarenaChannels(payload)
  if (channels.length === 0) throw new DeltaForceGarenaInvalidUpstreamResponseError('No THB packs found')
  return toResponse(channels)
}

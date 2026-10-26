import type { RovPack, RovPacksResponse } from '../types/rov'
import { isFiniteNumber, isRecord } from '../lib/guards'

/**
 * Blood Strike (NetEase) — official NetEase GamesClub top-up center.
 * Live product catalog from the same JSON API the official page uses:
 *   https://pay.neteasegames.com/BloodStrike/topup
 * USD = product.price (currency USD); THB = extra.local_price.TH.default.
 * Never hardcodes prices; upstream failure -> throw (route maps to 502).
 */
export const BLOODSTRIKE_APP_ID = 1637059453
export const BLOODSTRIKE_SLUG = 'blood-strike'
export const BLOODSTRIKE_TOPUP_URL =
  'https://pay.neteasegames.com/BloodStrike/topup'
export const BLOODSTRIKE_PRODUCTS_API_URL =
  'https://pay.neteasegames.com/gameclub/products/bloodstrike?gc_client_version=1.13.55'

/** Official bonus ("+N Gold") endpoint used by the top-up page. TH region, default NetEase Credit pay method. */
export const BLOODSTRIKE_ACTIVITYS_API_URL =
  'https://pay.neteasegames.com/gameclub/products/bloodstrike/activitys?gc_client_version=1.13.55&pay_method=gameclub_wallet&pay_type=NetEase+Credit_gameclub_wallet&alpha2=TH'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class BloodStrikeUpstreamUnavailableError extends Error {
  constructor(message = 'Blood Strike NetEase GamesClub upstream unavailable') {
    super(message)
    this.name = 'BloodStrikeUpstreamUnavailableError'
  }
}

export class BloodStrikeInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Blood Strike NetEase GamesClub response') {
    super(message)
    this.name = 'BloodStrikeInvalidUpstreamResponseError'
  }
}

/** RovPack with nullable bonus: null = official bonus source unavailable (never guessed). */
export type BloodStrikePack = Omit<RovPack, 'bonusItemAmount'> & {
  bonusItemAmount: number | null
  bonus_available: boolean
  bonus_source: string | null
}

type ParsedProduct = {
  goodsid: string
  name: string
  amount: number
  isPass: boolean
  priceUsd: number
  priceThb: number
  description: string
}

/** Limited-time / non-permanent NetEase GamesClub item (bundle, event pass, chest). */
export type BloodStrikeLimitedItem = {
  goodsid: string
  subItem: string
  name: string
  description: string
  kind: 'Pass' | 'Bundle'
  priceUsd: number
  priceThb: number
  effective: number | null
  expired: number | null
}

/** Strip HTML + the generic "Please wait ... duplicate purchases" boilerplate from goods_detail. */
function cleanDetail(product: Record<string, unknown>): string {
  const ml = product.multi_language
  if (!isRecord(ml) || !isRecord(ml.default)) return ''
  for (const lang of ['en-US', 'default']) {
    const e = ml.default[lang]
    if (isRecord(e) && typeof e.goods_detail === 'string' && e.goods_detail.trim()) {
      return e.goods_detail
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .split(/Please wait while the page/i)[0]!
        .replace(/\s+/g, ' ')
        .trim()
    }
  }
  return ''
}

function englishName(product: Record<string, unknown>): string | null {
  const ml = product.multi_language
  if (!isRecord(ml) || !isRecord(ml.default)) return null
  for (const lang of ['en-US', 'default']) {
    const entry = ml.default[lang]
    if (isRecord(entry) && typeof entry.goodsinfo === 'string' && entry.goodsinfo.trim()) {
      return entry.goodsinfo.trim()
    }
  }
  return null
}

function thbLocalPrice(extra: Record<string, unknown>): number | null {
  if (typeof extra.local_price !== 'string') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(extra.local_price)
  } catch {
    return null
  }
  if (!isRecord(parsed) || !isRecord(parsed.TH) || !isRecord(parsed.TH.default)) return null
  const def = parsed.TH.default
  if (def.currency !== 'THB' || !isFiniteNumber(def.price)) return null
  return def.price
}

/**
 * Keep only permanent catalog items (what the official page lists):
 * permanent_display_flag === 1, status 1, USD base price, TH local price.
 * Time-limited events/deals and VN-only Funcard items are excluded.
 */
export function parseBloodStrikeProducts(payload: unknown): ParsedProduct[] {
  if (!isRecord(payload) || payload.code !== '0000' || !Array.isArray(payload.data)) {
    throw new BloodStrikeInvalidUpstreamResponseError('Unexpected products payload')
  }
  const seen = new Set<string>()
  const out: ParsedProduct[] = []
  for (const product of payload.data) {
    if (!isRecord(product) || !isRecord(product.extra)) continue
    if (product.permanent_display_flag !== 1 || product.status !== 1) continue
    if (product.currency !== 'USD' || typeof product.goodsid !== 'string') continue
    if (seen.has(product.goodsid)) continue
    const priceUsd = Number(product.price)
    const priceThb = thbLocalPrice(product.extra)
    const name = englishName(product) ?? String(product.goodsinfo ?? '')
    if (!Number.isFinite(priceUsd) || priceThb === null || !name) continue
    seen.add(product.goodsid)
    const goldMatch = product.goodsid.match(/gold(\d+)/i)
    out.push({
      goodsid: product.goodsid,
      name,
      amount: goldMatch ? Number(goldMatch[1]) : 0,
      isPass: /pass/i.test(product.goodsid),
      priceUsd,
      priceThb,
      description: cleanDetail(product)
    })
  }
  return out
}

/**
 * Non-permanent catalog items (permanent_display_flag !== 1) that are live right now:
 * event bundles / chests / Level-Up Pass. Generic per-user "lightning deal" price slots
 * (names like "099deal", no item content) are skipped. Deduped by goodsid + sub_item.
 */
export function parseBloodStrikeLimitedItems(payload: unknown, nowSec = Date.now() / 1000): { active: BloodStrikeLimitedItem[]; upcoming: number } {
  if (!isRecord(payload) || payload.code !== '0000' || !Array.isArray(payload.data)) {
    throw new BloodStrikeInvalidUpstreamResponseError('Unexpected products payload')
  }
  const seen = new Set<string>()
  const active: BloodStrikeLimitedItem[] = []
  let upcoming = 0
  for (const product of payload.data) {
    if (!isRecord(product) || !isRecord(product.extra)) continue
    if (product.permanent_display_flag === 1 || product.status !== 1) continue
    if (product.currency !== 'USD' || typeof product.goodsid !== 'string') continue
    const name = englishName(product) ?? ''
    if (!name || /^\d+deal$/i.test(name)) continue
    const subItem = String(product.sub_item ?? '')
    const priceUsd = Number(product.price)
    const priceThb = thbLocalPrice(product.extra)
    if (!Number.isFinite(priceUsd) || priceThb === null) continue
    const eff = isFiniteNumber(product.effective_time) ? product.effective_time : null
    const exp = isFiniteNumber(product.expired_time) ? product.expired_time : null
    // only items with an official sale window (effective..expired) from GamesClub
    if (eff === null || exp === null || exp < nowSec) continue
    // same goodsid + name + sale window = one product (GamesClub repeats it per platform / sub_item)
    const key = product.goodsid + '|' + name + '|' + eff + '|' + exp
    if (seen.has(key)) continue
    seen.add(key)
    if (eff !== null && eff > nowSec) { upcoming++; continue }
    active.push({
      goodsid: product.goodsid, subItem, name, description: cleanDetail(product),
      kind: /pass/i.test(name) || /pass/i.test(product.goodsid) ? 'Pass' : 'Bundle',
      priceUsd, priceThb, effective: eff, expired: exp
    })
  }
  return { active, upcoming }
}

/**
 * Parse live bonus activities -> goodsid => bonus amount.
 * Returns null when the payload is unusable (caller marks bonus unavailable).
 */
export function parseBloodStrikeBonuses(payload: unknown, nowSec = Date.now() / 1000): Map<string, number> | null {
  if (!isRecord(payload) || payload.code !== '0000' || !isRecord(payload.data) || !Array.isArray(payload.data.list)) {
    return null
  }
  const out = new Map<string, number>()
  for (const a of payload.data.list) {
    if (!isRecord(a) || typeof a.goodsid !== 'string') continue
    if (!isFiniteNumber(a.marketing_free_amount) || a.marketing_free_amount <= 0) continue
    if (a.alpha2 !== 'all' && a.alpha2 !== 'TH') continue
    if (isFiniteNumber(a.expired_time) && a.expired_time < nowSec) continue
    out.set(a.goodsid, Math.max(out.get(a.goodsid) ?? 0, a.marketing_free_amount))
  }
  return out
}

function toPack(p: ParsedProduct, index: number, bonuses: Map<string, number> | null): BloodStrikePack {
  const bonus = bonuses === null ? null : p.isPass ? 0 : (bonuses.get(p.goodsid) ?? 0)
  return {
    id: p.amount > 0 ? p.amount : 900000 + index,
    name: p.name,
    baseItemAmount: p.amount,
    bonusItemAmount: bonus,
    totalItemAmount: p.amount + (bonus ?? 0),
    bonus_available: bonuses !== null,
    bonus_source: bonuses === null ? null : 'netease-gameclub-activitys',
    price: p.priceThb,
    currency: 'THB',
    price_thb: p.priceThb,
    price_usd: p.priceUsd,
    prices: { THB: p.priceThb, USD: p.priceUsd },
    price_thb_source: 'netease-gameclub',
    price_usd_source: 'netease-gameclub',
    ...(p.isPass ? { item_pack: true, pass_type: 'Strike Pass (monthly)', description: p.description || 'Strike Pass (monthly battle pass)' } : { item_pack: false })
  } as BloodStrikePack
}

const FAR_FUTURE = 2_000_000_000
function limitedToPack(p: BloodStrikeLimitedItem, index: number): Record<string, unknown> {
  const until = p.expired !== null && p.expired < FAR_FUTURE ? new Date(p.expired * 1000).toISOString().replace('.000Z', 'Z') : null
  const desc = [p.kind === 'Pass' ? 'Pass' : 'Bundle / event item', p.description || null, until ? 'Available until ' + until + ' (UTC)' : null, 'Limit 1 per order']
  return {
    id: 800000 + index,
    name: p.name,
    product_id: p.goodsid,
    sub_item: p.subItem,
    pass_type: p.kind,
    item_pack: true,
    description: desc.filter(Boolean).join(' · '),
    baseItemAmount: null,
    bonusItemAmount: null,
    totalItemAmount: null,
    base_null_reason: 'Item/pass product, not a Gold top-up; NetEase GamesClub gives no Gold amount.',
    bonus_null_reason: 'Item/pass product; no Gold bonus applies.',
    bonus_available: false,
    bonus_source: null,
    available_until: until,
    price: p.priceThb,
    currency: 'THB',
    price_thb: p.priceThb,
    price_usd: p.priceUsd,
    prices: { THB: p.priceThb, USD: p.priceUsd },
    price_thb_source: 'netease-gameclub',
    price_usd_source: 'netease-gameclub'
  }
}

function toResponse(products: ParsedProduct[], bonuses: Map<string, number> | null, limited: { active: BloodStrikeLimitedItem[]; upcoming: number } = { active: [], upcoming: 0 }): RovPacksResponse {
  const byUsd = (a: ParsedProduct, b: ParsedProduct) => a.priceUsd - b.priceUsd
  const gold = products.filter((p) => !p.isPass).sort(byUsd).map((p, i) => toPack(p, i, bonuses))
  const passes = products.filter((p) => p.isPass).sort(byUsd).map((p, i) => toPack(p, i, bonuses))
  const categories = [
    {
      id: 1,
      name: 'Gold',
      status: 0,
      message: 'Live from NetEase GamesClub official top-up (no fallback)',
      packCount: gold.length,
      packs: gold
    },
    {
      id: 2,
      name: 'Strike Pass',
      status: 0,
      message: 'Live from NetEase GamesClub official top-up (no fallback)',
      packCount: passes.length,
      packs: passes
    }
,
    {
      id: 3,
      name: 'Passes & Bundles (limited-time)',
      status: 0,
      message: 'Live from NetEase GamesClub official top-up; currently on sale only' + (limited.upcoming ? ' (' + limited.upcoming + ' upcoming not yet on sale)' : ''),
      packCount: limited.active.length,
      packs: [...limited.active].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'Pass' ? -1 : 1) || a.priceUsd - b.priceUsd).map(limitedToPack)
    }
  ].filter((c) => c.packCount > 0)

  return ({
    game: {
      id: BLOODSTRIKE_APP_ID,
      slug: BLOODSTRIKE_SLUG,
      name: 'Blood Strike',
      itemName: 'Gold',
      itemIcon: ''
    },
    categories,
    summary: {
      categoryCount: categories.length,
      packCount: gold.length + passes.length + limited.active.length
    },
    fetchedAt: new Date().toISOString(),
    source: BLOODSTRIKE_TOPUP_URL,
    sources: {
      thb: BLOODSTRIKE_PRODUCTS_API_URL,
      usd: BLOODSTRIKE_PRODUCTS_API_URL
    },
    notes: [
      'Official NetEase GamesClub product API (same data as the official top-up page).',
      'USD = product base price; THB = local_price.TH.default (full list price, Thailand region).',
      'Only permanent catalog items; time-limited event products excluded.',
      'Bonus source: ' + BLOODSTRIKE_ACTIVITYS_API_URL + (bonuses === null ? ' (UNAVAILABLE this fetch: bonus = null)' : ''),
      'Bonus Gold = live marketing_free_amount from the official activitys API (TH, NetEase Credit; identical across TH pay methods when checked). If that call fails, bonusItemAmount = null and bonus_available = false.',
      'Live-fetch only; empty/unparseable upstream -> error (no static catalog).',
      'Passes & Bundles (limited-time) = non-permanent GamesClub products whose effective..expired window includes now; per-user "NNNdeal" lightning-deal slots excluded (no item content). Item packs: Gold amounts null.'
    ]
  } as unknown) as RovPacksResponse
}

export async function fetchBloodStrikePacks(options?: {
  signal?: AbortSignal
}): Promise<RovPacksResponse> {
  let response: Response
  try {
    response = await fetch(BLOODSTRIKE_PRODUCTS_API_URL, {
      signal: options?.signal ?? AbortSignal.timeout(25_000),
      headers: {
        Accept: 'application/json',
        Referer: BLOODSTRIKE_TOPUP_URL,
        'User-Agent': BROWSER_UA
      }
    })
  } catch (error) {
    throw new BloodStrikeUpstreamUnavailableError(
      error instanceof Error ? error.message : 'network error'
    )
  }
  if (!response.ok) {
    throw new BloodStrikeUpstreamUnavailableError('HTTP ' + response.status)
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new BloodStrikeInvalidUpstreamResponseError('Non-JSON response')
  }

  const products = parseBloodStrikeProducts(payload)
  if (products.length === 0) {
    throw new BloodStrikeInvalidUpstreamResponseError('No permanent products found')
  }
  const bonuses = await fetchBonuses(options?.signal)
  return toResponse(products, bonuses, parseBloodStrikeLimitedItems(payload))
}

async function fetchBonuses(signal?: AbortSignal): Promise<Map<string, number> | null> {
  try {
    const res = await fetch(BLOODSTRIKE_ACTIVITYS_API_URL, {
      signal: signal ?? AbortSignal.timeout(15_000),
      headers: { Accept: 'application/json', Referer: BLOODSTRIKE_TOPUP_URL, 'User-Agent': BROWSER_UA }
    })
    if (!res.ok) return null
    return parseBloodStrikeBonuses(await res.json())
  } catch {
    return null
  }
}
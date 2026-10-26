import type { RovPacksResponse } from '../types/rov'

/**
 * CABAL: INFINITE COMBO — official web top-up by CB Soft / Combo Interactive (publisher).
 * Live from the same API the official member sites call:
 *   TH server  : https://th-member.combocabalm.com/topup  -> core-api game 6eaad7c6-... (THB only)
 *   SEA server : https://sea-member.combocabalm.com/topup -> core-api game 5f0740de-... (THB, USD, PHP, ...)
 * Each currency is fetched with ?currency=THB / ?currency=USD — the store's own price lists. No FX conversion.
 * base = original_point, bonus = point - original_point (Wallet Points).
 */
export const CABAL_API = 'https://core-api.combo-interactive.com'
export const CABAL_SERVERS = [
  { key: 'th', label: 'TH server (th-member.combocabalm.com)', gameId: '6eaad7c6-bfc8-48ce-a616-061a2cef8f41', page: 'https://th-member.combocabalm.com/topup' },
  { key: 'sea', label: 'SEA server (sea-member.combocabalm.com)', gameId: '5f0740de-8045-42d4-8460-b03f340f01a6', page: 'https://sea-member.combocabalm.com/topup' }
] as const
export const cabalProductsUrl = (gameId: string, currency: string) => `${CABAL_API}/topup/games/${gameId}/products?currency=${currency}&per_page=100`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class CabalUpstreamUnavailableError extends Error {
  constructor(message = 'CABAL official top-up API unavailable') { super(message); this.name = 'CabalUpstreamUnavailableError' }
}
export class CabalInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid CABAL official top-up response') { super(message); this.name = 'CabalInvalidUpstreamResponseError' }
}

type CabalProduct = { id: string; name: string; original_point: number; point: number; price: number; currency: string; position: number; description: string | null; is_enabled: boolean; is_only_guild_leader?: boolean; start_at: string | null; end_at: string | null; thumbnail: string | null }

const isProduct = (p: any): p is CabalProduct =>
  p && typeof p.id === 'string' && typeof p.price === 'number' && typeof p.point === 'number' && typeof p.original_point === 'number' && typeof p.currency === 'string'

async function fetchProducts(gameId: string, currency: string, origin: string, signal?: AbortSignal): Promise<CabalProduct[]> {
  let r: Response
  try {
    r = await fetch(cabalProductsUrl(gameId, currency), { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: 'application/json', Origin: origin, Referer: origin + '/' } })
  } catch (e) {
    throw new CabalUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!r.ok) throw new CabalUpstreamUnavailableError('HTTP ' + r.status)
  let j: any
  try { j = await r.json() } catch { throw new CabalInvalidUpstreamResponseError('Non-JSON response') }
  if (!Array.isArray(j?.data)) throw new CabalInvalidUpstreamResponseError('Missing data[]')
  return j.data.filter(isProduct).filter((p: CabalProduct) => p.is_enabled !== false && p.currency === currency)
}

export async function fetchCabalPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const results = await Promise.all(CABAL_SERVERS.map(async (s) => {
    const origin = new URL(s.page).origin
    const [thb, usd] = await Promise.all([
      fetchProducts(s.gameId, 'THB', origin, signal),
      fetchProducts(s.gameId, 'USD', origin, signal).then((rows) => ({ rows, err: null as string | null })).catch((e) => ({ rows: [] as CabalProduct[], err: e instanceof Error ? e.message : String(e) }))
    ])
    return { s, thb, usd }
  }))
  if (results.every((r) => !r.thb.length)) throw new CabalInvalidUpstreamResponseError('No THB products on any server')
  let id = 0
  const categories = results.filter((r) => r.thb.length || r.usd.rows.length).map((r, ci) => {
    const keyOf = (p: CabalProduct) => `${p.original_point}|${p.point}`
    const all = [...r.thb]
    for (const u of r.usd.rows) if (!all.some((x) => keyOf(x) === keyOf(u))) all.push(u)
    all.sort((a, b) => a.original_point - b.original_point)
    const packs = all.map((p) => {
      const t = r.thb.find((x) => keyOf(x) === keyOf(p))
      const u = r.usd.rows.find((x) => keyOf(x) === keyOf(p))
      const bonus = p.point - p.original_point
      const pack: any = {
        id: ++id, name: `Wallet Point ${p.original_point.toLocaleString('en-US')}`, local_name: p.name, product_id: p.id,
        baseItemAmount: p.original_point, bonusItemAmount: bonus, totalItemAmount: p.point,
        bonus_available: true, bonus_source: 'combo-interactive official (point - original_point)',
        item_pack: false, description: p.description ?? '',
        price_thb: t ? t.price : null, price_thb_source: t ? `combo-interactive-official-${r.s.key}` : null,
        price_usd: u ? u.price : null, price_usd_source: u ? `combo-interactive-official-${r.s.key}` : null,
        price: t ? t.price : u!.price, currency: t ? 'THB' : 'USD'
      }
      if (!t) pack.price_thb_null_reason = `Official ${r.s.key.toUpperCase()} store THB list has no pack with these points`
      if (!u) pack.price_usd_null_reason = r.usd.err ? 'Official USD list unavailable: ' + r.usd.err
        : r.usd.rows.length ? `Official ${r.s.key.toUpperCase()} store USD list has no pack with these points` : `Official ${r.s.key.toUpperCase()} server store sells in THB only (currency=USD returns 0 products)`
      pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
      return pack
    })
    return { id: ci + 1, name: r.s.label, status: 0, message: 'Live (no fallback catalog)', packCount: packs.length, packs }
  })
  return ({
    game: { id: 0, slug: 'cabal-infinite-combo', name: 'CABAL: INFINITE COMBO', itemName: 'Wallet Point', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: CABAL_SERVERS[0].page,
    sources: Object.fromEntries(CABAL_SERVERS.flatMap((s) => [[`${s.key}_thb`, cabalProductsUrl(s.gameId, 'THB')], [`${s.key}_usd`, cabalProductsUrl(s.gameId, 'USD')]])),
    notes: [
      'Official publisher web top-up (CB Soft / Combo Interactive; payments via Pay To Win Co., Ltd.). Live core-api.combo-interactive.com product lists per server and currency.',
      'Packs are Wallet Points (web wallet used to buy in-game items). base = original_point, bonus = point - original_point, total = point.',
      'TH and SEA are separate servers with different prices. USD exists only on the SEA store; TH store returns 0 USD products -> USD null. No FX conversion.'
    ]
  } as unknown) as RovPacksResponse
}
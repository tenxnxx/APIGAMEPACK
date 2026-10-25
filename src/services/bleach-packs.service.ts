import type { RovPacksResponse } from '../types/rov'
import { parseAppStoreIapRows as parseRaw, type IapRow, type ArchitectPack } from './architect-packs.service'

/**
 * BLEACH mobile games. THB = official Apple App Store TH IAP list (main upstream, 502 if unavailable).
 * USD = official Apple App Store USD storefronts (US / KH / LA). No FX conversion, no resellers.
 */
export type BleachGameConfig = {
  slug: string
  name: string
  appId: number
  publisher: string
  itemName: string
  usd: Array<[string, string]>
  extraNotes: string[]
}
const as = (cc: string, id: number, en = false) => `https://apps.apple.com/${cc}/app/id${id}${en ? '?l=en' : ''}`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export const BLEACH_GAMES: Record<string, BleachGameConfig> = {
  'bleach-brave-souls': {
    slug: 'bleach-brave-souls', name: 'BLEACH: Brave Souls', appId: 1003168863, publisher: 'KLab Inc.', itemName: 'Spirit Orbs',
    usd: [['us', as('us', 1003168863)]],
    extraNotes: ['KLab has no official web top-up store; only in-app purchases.']
  },
  'bleach-soul-resonance': {
    slug: 'bleach-soul-resonance', name: 'BLEACH: Soul Resonance', appId: 6745081346, publisher: 'Nuverse Pte. Ltd. (SEA build)', itemName: 'Premium Spiritual Jade',
    usd: [['kh', as('kh', 6745081346, true)], ['la', as('la', 6745081346, true)], ['us-crunchyroll-build', as('us', 6751220183)]],
    extraNotes: [
      'SEA/TH build (id 6745081346) is not on App Store US; USD from the same app on KH/LA storefronts (USD). "us-crunchyroll-build" = US version by Crunchyroll Games (id 6751220183), a different build; only exact-name matches are used.',
      'Official web top-up payment.playbleachsr.com (MobaPay api/env_info) lists only FR/DE/IT/ES/NL (EUR) and RU (RUB); api/app_shop for TH/US returns "App is closed" -> no official web THB/USD.'
    ]
  },
  'bleach-mirrors-high': {
    slug: 'bleach-mirrors-high', name: 'BLEACH Mirrors High', appId: 6758332966, publisher: 'Bandai Namco Entertainment', itemName: 'Item',
    usd: [['us', as('us', 6758332966)]],
    extraNotes: ['No official web top-up store found; only in-app purchases.']
  }
}
export const BLEACH_ALIASES: Record<string, string> = {
  bleach: 'bleach-brave-souls', 'bleach-bs': 'bleach-brave-souls', 'brave-souls': 'bleach-brave-souls',
  'bleach-sr': 'bleach-soul-resonance', 'soul-resonance': 'bleach-soul-resonance',
  'bleach-mh': 'bleach-mirrors-high', 'mirrors-high': 'bleach-mirrors-high'
}
export function resolveBleachGame(slug: string): BleachGameConfig | undefined {
  const s = slug.toLowerCase()
  return BLEACH_GAMES[s] ?? BLEACH_GAMES[BLEACH_ALIASES[s] ?? '']
}

export class BleachUpstreamUnavailableError extends Error {
  constructor(message = 'App Store TH unavailable') { super(message); this.name = 'BleachUpstreamUnavailableError' }
}
export class BleachInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid App Store TH response') { super(message); this.name = 'BleachInvalidUpstreamResponseError' }
}

/** Base currency amount from the pack name (Spirit Orbs / Premium Spiritual Jade); null = item pack. */
export function bleachAmount(name: string): number | null {
  const a = name.match(/^([\d,]+)\s*Spirit Orbs?$/i) ?? name.match(/Premium Spiritual Jade\s*[\u00D7xX*]\s*([\d,]+)/i)
  return a ? Number(a[1].replace(/,/g, '')) : null
}
export function parseBleachIap(html: string, cur: 'THB' | 'USD'): IapRow[] {
  return parseRaw(html, cur).map((r) => ({ ...r, amount: bleachAmount(r.name) }))
}
const key = (n: string) => n.toLowerCase().replace(/\s+/g, ' ').trim()

async function fetchIap(url: string, cur: 'THB' | 'USD', lang: string, signal?: AbortSignal) {
  try {
    const r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, 'Accept-Language': lang, Accept: 'text/html' } })
    const text = await r.text()
    if (r.status === 404) return { rows: null as IapRow[] | null, reason: 'Not listed on this storefront (HTTP 404)', status: 404 }
    if (r.status !== 200) return { rows: null, reason: `App Store HTTP ${r.status}`, status: r.status }
    const rows = parseBleachIap(text, cur)
    return rows.length ? { rows, status: 200 } : { rows: null, reason: 'No IAP rows on App Store page', status: 200 }
  } catch (e) {
    return { rows: null, reason: 'App Store fetch failed: ' + (e instanceof Error ? e.message : String(e)), status: 0 }
  }
}

export async function fetchBleachPacks(slug: string, options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const g = resolveBleachGame(slug)
  if (!g) throw new BleachInvalidUpstreamResponseError('Unknown BLEACH game')
  const thUrl = as('th', g.appId)
  const [th, usdRes] = await Promise.all([
    fetchIap(thUrl, 'THB', 'th-TH,th;q=0.9', options?.signal),
    Promise.all(g.usd.map(([sf, url]) => fetchIap(url, 'USD', 'en-US,en;q=0.9', options?.signal).then((r) => [sf, r] as const)))
  ])
  if (!th.rows) {
    if (th.status === 200) throw new BleachInvalidUpstreamResponseError(th.reason)
    throw new BleachUpstreamUnavailableError(th.reason)
  }
  const usd: IapRow[] = []
  const usdReasons: string[] = []
  for (const [sf, r] of usdRes) {
    if (!r.rows) { usdReasons.push(sf.toUpperCase() + ': ' + r.reason); continue }
    for (const row of r.rows) if (!usd.some((x) => key(x.name) === key(row.name))) usd.push({ ...row, storefront: sf })
  }
  const names: IapRow[] = [...th.rows]
  for (const r of usd) if (!names.some((x) => key(x.name) === key(r.name))) names.push(r)

  const packs = names.map((r, i) => {
    const t = th.rows!.find((x) => key(x.name) === key(r.name))
    const u = usd.find((x) => key(x.name) === key(r.name))
    const amt = r.amount
    const p = {
      id: i + 1, name: r.name,
      baseItemAmount: amt, bonusItemAmount: amt !== null ? 0 : null, totalItemAmount: amt,
      bonus_available: amt !== null, bonus_source: amt !== null ? 'apple-app-store (no bonus shown)' : null,
      item_pack: amt === null,
      store_price: null, store_currency: null,
      price_thb: t ? t.price : null, price_thb_source: t ? 'apple-app-store-th' : null,
      price_usd: u ? u.price : null, price_usd_source: u ? `apple-app-store-${u.storefront}` : null,
      price: t ? t.price : u ? u.price : 0, currency: t ? 'THB' : u ? 'USD' : ''
    } as unknown as ArchitectPack
    if (!t) p.price_thb_null_reason = 'Same pack not in App Store TH IAP list (Apple web shows top 10 only); no official web THB store'
    if (!u) p.price_usd_null_reason = usd.length ? 'Same pack not in App Store USD storefront IAP lists (top 10 only)' + (usdReasons.length ? ' [' + usdReasons.join('; ') + ']' : '') : usdReasons.join('; ') || 'unavailable'
    ;(p as any).prices = { THB: p.price_thb, USD: p.price_usd }
    return p
  })
  const categories = [{ id: 1, name: `App Store (iOS IAP: TH THB / ${g.usd.map((x) => x[0].toUpperCase()).join('-')} USD)`, packs, status: 0, message: 'Live (no fallback catalog)', packCount: packs.length }]
  const notes = [
    `Publisher: ${g.publisher}. Main: official Apple App Store TH IAP list (live, real THB). USD from official App Store USD storefronts. No FX conversion; null + *_null_reason when no match.`,
    'Apple web shows only the top 10 IAP items per storefront, so some packs exist in only one currency.',
    ...g.extraNotes
  ]
  if (usdReasons.length) notes.push('USD storefronts: ' + usdReasons.join('; '))
  return ({
    game: { id: g.appId, slug: g.slug, name: g.name, itemName: g.itemName, itemIcon: '' },
    categories,
    summary: { categoryCount: 1, packCount: packs.length },
    fetchedAt: new Date().toISOString(),
    source: thUrl,
    sources: { thb: thUrl, usd: g.usd.map((x) => x[1]).join(' , ') },
    notes
  } as unknown) as RovPacksResponse
}
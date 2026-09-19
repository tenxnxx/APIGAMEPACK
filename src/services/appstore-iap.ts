import type { RovPack } from '../types/rov'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export type AppStoreNamedPrice = {
  name: string
  price: number
  /** Item amount parsed from offer name when possible. */
  amount: number | null
}

export type AppStoreDualIap = {
  name: string
  priceThb: number
  priceUsd: number
  amount: number | null
}

export function parseThbAmount(raw: string): number | null {
  const cleaned = raw
    .replace(/\u0e3f/g, '')
    .replace(/THB/gi, '')
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '')
    .trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function parseUsdAmount(raw: string): number | null {
  const cleaned = raw
    .replace(/\$/g, '')
    .replace(/USD/gi, '')
    .replace(/US/gi, '')
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '')
    .trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Extract a primary item amount from common IAP offer names:
 * - "100-Diamond Bundle" / "310 Diamond"
 * - "9 คูปอง" / "99 คูปอง"
 * - "100 Voucher" / "1200 Vouchers"
 */
export function amountFromIapName(name: string): number | null {
  const patterns = [
    /(\d+)\s*-?\s*Diamond/i,
    /(\d+)\s*Delta\s*Coins?/i,
    /(\d+)\s*\+\s*\d+\s*(?:bonus\s*)?CP/i,
    /(\d+)\s*CP\b/i,
    /MC\s*([\d,]+)/i,
    /(\d+)\s*คูปอง/,
    /(\d+)\s*Vouchers?/i,
    /(\d+)\s*Coupons?/i,
    /(\d+)\s*Coins?\b/i
  ]
  for (const re of patterns) {
    const m = name.match(re)
    if (!m) continue
    const n = Number(String(m[1]).replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0) return n
  }
  return null
}

function collectTextPairs(node: unknown): Array<[string, string]> {
  const out: Array<[string, string]> = []
  walk(node)

  function walk(obj: unknown, underIap = false): void {
    if (!obj || typeof obj !== 'object') return
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item, underIap)
      return
    }
    const rec = obj as Record<string, unknown>
    const title = typeof rec.title === 'string' ? rec.title : ''
    const isIap =
      underIap ||
      /^In-App Purchases$/i.test(title.trim()) ||
      /ซื้อภายในแอป/i.test(title.trim())

    if (isIap) {
      const itemsV3 = rec.items_V3
      if (Array.isArray(itemsV3)) {
        for (const item of itemsV3) {
          if (!item || typeof item !== 'object') continue
          const row = item as Record<string, unknown>
          if (
            typeof row.leadingText === 'string' &&
            typeof row.trailingText === 'string'
          ) {
            out.push([row.leadingText, row.trailingText])
          }
        }
      }
      const items = rec.items
      if (Array.isArray(items)) {
        for (const item of items) {
          if (!item || typeof item !== 'object') continue
          const row = item as Record<string, unknown>
          const textPairs = row.textPairs
          if (Array.isArray(textPairs)) {
            for (const pair of textPairs) {
              if (
                Array.isArray(pair) &&
                pair.length >= 2 &&
                typeof pair[0] === 'string' &&
                typeof pair[1] === 'string'
              ) {
                out.push([pair[0], pair[1]])
              }
            }
          }
        }
      }
    }

    for (const value of Object.values(rec)) walk(value, isIap)
  }

  return out
}

export function parseAppStoreIapFromHtml(
  html: string,
  currency: 'THB' | 'USD'
): AppStoreNamedPrice[] {
  const scriptMatch = html.match(
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i
  )
  if (!scriptMatch) return []

  let root: unknown
  try {
    root = JSON.parse(scriptMatch[1])
  } catch {
    return []
  }

  const pairs = collectTextPairs(root)
  const seen = new Set<string>()
  const out: AppStoreNamedPrice[] = []
  for (const [leading, trailing] of pairs) {
    const name = String(leading ?? '').replace(/\s+/g, ' ').trim()
    if (!name) continue
    const price =
      currency === 'THB'
        ? parseThbAmount(String(trailing ?? ''))
        : parseUsdAmount(String(trailing ?? ''))
    if (price === null) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, price, amount: amountFromIapName(name) })
  }
  return out
}

/** Merge App Store TH+US IAP by offer name. Unmatched names omitted. */
export function mergeAppStoreDualByName(
  thbPacks: AppStoreNamedPrice[],
  usdPacks: AppStoreNamedPrice[]
): AppStoreDualIap[] {
  const thbByName = new Map<string, AppStoreNamedPrice>()
  for (const pack of thbPacks) {
    thbByName.set(pack.name.toLowerCase(), pack)
  }
  const out: AppStoreDualIap[] = []
  const seen = new Set<string>()
  for (const usd of usdPacks) {
    const thb = thbByName.get(usd.name.toLowerCase())
    if (!thb) continue
    const key = usd.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      name: usd.name,
      priceThb: thb.price,
      priceUsd: usd.price,
      amount: usd.amount ?? thb.amount
    })
  }
  return out.sort((a, b) => a.priceUsd - b.priceUsd)
}

/**
 * Merge remaining TH+US IAP by unique item amount when names differ
 * (e.g. "300 Delta Coins + 20 Bonus" ↔ "300 Delta Coins").
 * Ambiguous amounts (multiple THB or USD prices) are skipped.
 * Names already present in `already` (from name-merge) are excluded.
 */
export function mergeAppStoreDualByAmount(
  thbPacks: AppStoreNamedPrice[],
  usdPacks: AppStoreNamedPrice[],
  already: AppStoreDualIap[] = []
): AppStoreDualIap[] {
  const takenNames = new Set(already.map((row) => row.name.toLowerCase()))
  const takenAmounts = new Set(
    already.map((row) => row.amount).filter((a): a is number => a != null)
  )

  const thbByAmount = new Map<number, AppStoreNamedPrice>()
  const thbAmbiguous = new Set<number>()
  for (const pack of thbPacks) {
    if (pack.amount === null) continue
    if (takenAmounts.has(pack.amount)) continue
    if (takenNames.has(pack.name.toLowerCase())) continue
    if (thbAmbiguous.has(pack.amount)) continue
    const prev = thbByAmount.get(pack.amount)
    if (prev && prev.price !== pack.price) {
      thbByAmount.delete(pack.amount)
      thbAmbiguous.add(pack.amount)
      continue
    }
    thbByAmount.set(pack.amount, pack)
  }

  const usdByAmount = new Map<number, AppStoreNamedPrice>()
  const usdAmbiguous = new Set<number>()
  for (const pack of usdPacks) {
    if (pack.amount === null) continue
    if (takenAmounts.has(pack.amount)) continue
    if (takenNames.has(pack.name.toLowerCase())) continue
    if (usdAmbiguous.has(pack.amount)) continue
    const prev = usdByAmount.get(pack.amount)
    if (prev && prev.price !== pack.price) {
      usdByAmount.delete(pack.amount)
      usdAmbiguous.add(pack.amount)
      continue
    }
    usdByAmount.set(pack.amount, pack)
  }

  const out: AppStoreDualIap[] = []
  for (const [amount, usd] of usdByAmount) {
    const thb = thbByAmount.get(amount)
    if (!thb) continue
    out.push({
      name: usd.name,
      priceThb: thb.price,
      priceUsd: usd.price,
      amount
    })
  }
  return out.sort((a, b) => a.priceUsd - b.priceUsd)
}

/** Name-merge first, then unique-amount merge for leftovers. */
export function mergeAppStoreDual(
  thbPacks: AppStoreNamedPrice[],
  usdPacks: AppStoreNamedPrice[]
): AppStoreDualIap[] {
  const byName = mergeAppStoreDualByName(thbPacks, usdPacks)
  const byAmount = mergeAppStoreDualByAmount(thbPacks, usdPacks, byName)
  return [...byName, ...byAmount].sort((a, b) => a.priceUsd - b.priceUsd)
}

/**
 * Unique THB→USD map from dual IAP rows.
 * Ambiguous THB prices (two USD values) are omitted.
 */
export function buildUsdByThbTier(
  dual: AppStoreDualIap[]
): Map<number, number> {
  const map = new Map<number, number>()
  const ambiguous = new Set<number>()
  for (const row of dual) {
    if (ambiguous.has(row.priceThb)) continue
    const prev = map.get(row.priceThb)
    if (prev !== undefined && prev !== row.priceUsd) {
      map.delete(row.priceThb)
      ambiguous.add(row.priceThb)
      continue
    }
    map.set(row.priceThb, row.priceUsd)
  }
  return map
}

/** Unique item-amount → USD map. Ambiguous amounts omitted. */
export function buildUsdByAmount(
  rows: Array<{ amount: number | null; priceUsd: number }>
): Map<number, number> {
  const map = new Map<number, number>()
  const ambiguous = new Set<number>()
  for (const row of rows) {
    if (row.amount === null) continue
    if (ambiguous.has(row.amount)) continue
    const prev = map.get(row.amount)
    if (prev !== undefined && prev !== row.priceUsd) {
      map.delete(row.amount)
      ambiguous.add(row.amount)
      continue
    }
    map.set(row.amount, row.priceUsd)
  }
  return map
}

export function packNameToId(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const id = h >>> 0
  return id === 0 ? 1 : id
}

export function dualIapToRovPacks(
  dual: AppStoreDualIap[],
  itemLabel: string
): RovPack[] {
  return dual.map((pack, index) => ({
    id: pack.amount && pack.amount > 0 ? pack.amount : packNameToId(pack.name),
    name: pack.name,
    baseItemAmount: pack.amount ?? 0,
    bonusItemAmount: 0,
    totalItemAmount: pack.amount ?? 0,
    price: pack.priceThb,
    currency: 'THB',
    price_thb: pack.priceThb,
    price_usd: pack.priceUsd,
    prices: { THB: pack.priceThb, USD: pack.priceUsd },
    price_thb_source: 'appstore',
    price_usd_source: 'appstore'
  }))
}

export async function fetchAppStoreHtml(
  url: string,
  acceptLanguage: string,
  signal: AbortSignal
): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, {
      signal,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': acceptLanguage,
        'User-Agent': BROWSER_UA
      }
    })
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : 'network error for ' + url
    )
  }
  if (!response.ok) {
    throw new Error('HTTP ' + response.status + ' for ' + url)
  }
  return response.text()
}

export { BROWSER_UA }

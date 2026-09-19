import type { RovPack, RovPacksResponse } from '../types/rov'

export const LAST_WAR_OFFICIAL_SOURCE = 'https://store.lastwar.com/'
export const LAST_WAR_APPSTORE_TH_URL =
  'https://apps.apple.com/th/app/last-war-survival/id6448786147'
export const LAST_WAR_APPSTORE_US_URL =
  'https://apps.apple.com/us/app/last-war-survival/id6448786147'
export const LAST_WAR_GAME_ID = 200001
export const LAST_WAR_APPSTORE_APP_ID = 6448786147

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class LastWarUpstreamUnavailableError extends Error {
  constructor(message = 'Last War official store upstream unavailable') {
    super(message)
    this.name = 'LastWarUpstreamUnavailableError'
  }
}

export class LastWarInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Last War official store response') {
    super(message)
    this.name = 'LastWarInvalidUpstreamResponseError'
  }
}

type ParsedGoods = {
  goods_id: string
  amount: number
  pay_brick_num: number
  free_brick_num: number
  currency: string
  status?: number
}

type NamedPrice = {
  name: string
  price: number
}

function usdKey(n: number): string {
  return n.toFixed(2)
}

export function normalizeHotPackageName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim()
  const m = trimmed.match(/^Hot\s*Package\s*(\d+)$/i)
  if (m) return `Hot Package ${m[1]}`
  return trimmed
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

function resolveMainJsUrl(html: string): string | null {
  const match = html.match(/src="(\/assets\/js\/main-[^"]+\.js)"/)
  if (!match) return null
  return new URL(match[1], LAST_WAR_OFFICIAL_SOURCE).toString()
}

export function parseDefaultGoodsData(js: string): ParsedGoods[] {
  const start = js.indexOf('defaultGoodsData=')
  if (start < 0) return []
  const arrayStart = js.indexOf('[', start)
  if (arrayStart < 0) return []

  let depth = 0
  let end = -1
  for (let i = arrayStart; i < js.length; i++) {
    const ch = js[i]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end < 0) return []

  const literal = js.slice(arrayStart, end)
  // Official store ships JS object literals (1e3 etc). Evaluate only this array slice.
  // eslint-disable-next-line no-new-func
  const raw = Function(`"use strict"; return (${literal})`)() as Array<{
    goods_id?: string
    amount?: string | number
    pay_brick_num?: number
    free_brick_num?: number
    currency?: string
    status?: number
  }>

  const goods: ParsedGoods[] = []
  for (const item of raw) {
    const amount = Number(item.amount)
    const base = Number(item.pay_brick_num)
    const bonus = Number(item.free_brick_num ?? 0)
    if (!item.goods_id || !Number.isFinite(amount) || !Number.isFinite(base)) {
      continue
    }
    const parsed: ParsedGoods = {
      goods_id: item.goods_id,
      amount,
      pay_brick_num: base,
      free_brick_num: Number.isFinite(bonus) ? bonus : 0,
      currency: item.currency || 'USD'
    }
    if (item.status !== undefined) {
      parsed.status = item.status
    }
    goods.push(parsed)
  }
  return goods.sort((a, b) => a.pay_brick_num - b.pay_brick_num)
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
    const isIapSection =
      underIap ||
      /^In-App Purchases$/i.test(title.trim()) ||
      title.trim() === 'การซื้อภายในแอป'

    if (isIapSection) {
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

    for (const value of Object.values(rec)) {
      walk(value, isIapSection)
    }
  }

  return out
}

export function parseLastWarIapFromHtml(
  html: string,
  currency: 'THB' | 'USD'
): NamedPrice[] {
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
  const out: NamedPrice[] = []
  const seen = new Set<string>()
  for (const [leading, trailing] of pairs) {
    const name = normalizeHotPackageName(String(leading ?? ''))
    if (!name) continue
    const price =
      currency === 'THB'
        ? parseThbAmount(String(trailing ?? ''))
        : parseUsdAmount(String(trailing ?? ''))
    if (price === null) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ name, price })
  }
  return out
}

/** Map USD amount → THB using App Store TH+US Hot Package name merge. */
export function buildThbByUsdFromAppStore(
  thbPacks: NamedPrice[],
  usdPacks: NamedPrice[]
): Map<string, { thb: number; offerName: string }> {
  const thbByName = new Map<string, number>()
  for (const pack of thbPacks) {
    thbByName.set(pack.name.toLowerCase(), pack.price)
  }

  const out = new Map<string, { thb: number; offerName: string }>()
  for (const pack of usdPacks) {
    const thb = thbByName.get(pack.name.toLowerCase())
    if (thb === undefined) continue
    const key = usdKey(pack.price)
    if (out.has(key)) continue
    out.set(key, { thb, offerName: pack.name })
  }
  return out
}

function toDualResponse(
  goods: ParsedGoods[],
  thbByUsd: Map<string, { thb: number; offerName: string }>
): RovPacksResponse {
  const packs: RovPack[] = []
  let index = 0
  for (const item of goods) {
    const match = thbByUsd.get(usdKey(item.amount))
    if (!match) continue
    index += 1
    const priceThb = match.thb
    const priceUsd = item.amount
    packs.push({
      id: index,
      name: `Gold Brick ${item.pay_brick_num}`,
      baseItemAmount: item.pay_brick_num,
      bonusItemAmount: item.free_brick_num,
      totalItemAmount: item.pay_brick_num + item.free_brick_num,
      price: priceThb,
      currency: 'THB',
      price_thb: priceThb,
      price_usd: priceUsd,
      prices: { THB: priceThb, USD: priceUsd },
      price_thb_source: 'appstore',
      price_usd_source: 'official-store'
    })
  }

  return {
    game: {
      id: LAST_WAR_GAME_ID,
      slug: 'last-war',
      name: 'Last War',
      itemName: 'Gold Brick',
      itemIcon: ''
    },
    categories: [
      {
        id: 2,
        name: 'Official Store Gold Brick',
        status: 0,
        message:
          'Official store USD Gold Brick + App Store THB (merged by USD amount / Hot Package)',
        packCount: packs.length,
        packs
      }
    ],
    summary: {
      categoryCount: 1,
      packCount: packs.length
    },
    fetchedAt: new Date().toISOString(),
    source: LAST_WAR_OFFICIAL_SOURCE,
    sources: {
      thb: LAST_WAR_APPSTORE_TH_URL,
      usd: LAST_WAR_OFFICIAL_SOURCE
    },
    notes: [
      'USD + Gold Brick amounts from live official store JS (defaultGoodsData).',
      'THB from App Store TH In-App Purchases, matched via App Store US Hot Package USD amount.',
      'Packs without a THB match (e.g. tiers missing on App Store) are omitted.',
      'Live-fetch only; empty dual merge → error (no static catalog / no FX).'
    ]
  }
}

async function fetchText(
  url: string,
  headers: Record<string, string>,
  signal: AbortSignal
): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, { signal, headers })
  } catch (error) {
    throw new LastWarUpstreamUnavailableError(
      error instanceof Error ? error.message : 'network error for ' + url
    )
  }
  if (!response.ok) {
    throw new LastWarUpstreamUnavailableError(
      'HTTP ' + response.status + ' for ' + url
    )
  }
  try {
    return await response.text()
  } catch (error) {
    throw new LastWarUpstreamUnavailableError(
      error instanceof Error ? error.message : 'failed to read body for ' + url
    )
  }
}

/**
 * Live Last War packs: official store USD Gold Brick + App Store THB.
 * Merge by USD amount (Hot Package US price ↔ official amount).
 * Both sides required; no hardcoded catalog; no FX.
 */
export async function fetchLastWarOfficialPacks(options?: {
  signal?: AbortSignal
  /** Inject official store HTML for unit tests. */
  htmlOfficial?: string
  /** Inject official main JS for unit tests. */
  jsOfficial?: string
  /** Inject App Store TH HTML for unit tests. */
  htmlTh?: string
  /** Inject App Store US HTML for unit tests. */
  htmlUs?: string
}): Promise<RovPacksResponse> {
  const signal = options?.signal ?? AbortSignal.timeout(25_000)
  const browserHeaders = {
    Accept: 'text/html,application/xhtml+xml',
    'User-Agent': BROWSER_UA
  }

  let htmlOfficial: string
  let jsOfficial: string
  let htmlTh: string
  let htmlUs: string

  if (options && 'htmlOfficial' in options) {
    if (
      typeof options.htmlOfficial !== 'string' ||
      options.htmlOfficial.length === 0 ||
      typeof options.jsOfficial !== 'string' ||
      options.jsOfficial.length === 0
    ) {
      throw new LastWarInvalidUpstreamResponseError(
        'Empty official store fixtures'
      )
    }
    htmlOfficial = options.htmlOfficial
    jsOfficial = options.jsOfficial
  } else {
    htmlOfficial = await fetchText(
      LAST_WAR_OFFICIAL_SOURCE,
      {
        ...browserHeaders,
        'Accept-Language': 'en-US,en;q=0.9,th;q=0.8'
      },
      signal
    )
    const jsUrl = resolveMainJsUrl(htmlOfficial)
    if (!jsUrl) {
      throw new LastWarInvalidUpstreamResponseError('main JS not found')
    }
    jsOfficial = await fetchText(
      jsUrl,
      {
        Accept: '*/*',
        'User-Agent': BROWSER_UA,
        Referer: LAST_WAR_OFFICIAL_SOURCE
      },
      signal
    )
  }

  if (options && 'htmlTh' in options) {
    if (typeof options.htmlTh !== 'string' || options.htmlTh.length === 0) {
      throw new LastWarInvalidUpstreamResponseError('Empty TH HTML fixture')
    }
    htmlTh = options.htmlTh
  } else {
    htmlTh = await fetchText(
      LAST_WAR_APPSTORE_TH_URL,
      {
        ...browserHeaders,
        'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8'
      },
      signal
    )
  }

  if (options && 'htmlUs' in options) {
    if (typeof options.htmlUs !== 'string' || options.htmlUs.length === 0) {
      throw new LastWarInvalidUpstreamResponseError('Empty US HTML fixture')
    }
    htmlUs = options.htmlUs
  } else {
    htmlUs = await fetchText(
      LAST_WAR_APPSTORE_US_URL,
      {
        ...browserHeaders,
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal
    )
  }

  const goods = parseDefaultGoodsData(jsOfficial)
  if (goods.length === 0) {
    throw new LastWarInvalidUpstreamResponseError('defaultGoodsData empty')
  }

  const thbPacks = parseLastWarIapFromHtml(htmlTh, 'THB')
  const usdPacks = parseLastWarIapFromHtml(htmlUs, 'USD')
  if (thbPacks.length === 0) {
    throw new LastWarInvalidUpstreamResponseError(
      'App Store TH In-App Purchases empty'
    )
  }
  if (usdPacks.length === 0) {
    throw new LastWarInvalidUpstreamResponseError(
      'App Store US In-App Purchases empty'
    )
  }

  const thbByUsd = buildThbByUsdFromAppStore(thbPacks, usdPacks)
  if (thbByUsd.size === 0) {
    throw new LastWarInvalidUpstreamResponseError(
      'No THB↔USD Hot Package matches from App Store'
    )
  }

  const response = toDualResponse(goods, thbByUsd)
  if (response.summary.packCount === 0) {
    throw new LastWarInvalidUpstreamResponseError(
      'No official Gold Brick packs matched App Store THB by USD amount'
    )
  }

  return response
}

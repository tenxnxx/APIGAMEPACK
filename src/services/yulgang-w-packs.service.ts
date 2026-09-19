import type { RovPack, RovPacksResponse } from '../types/rov'

export const YULGANG_W_APP_ID = 6756002784
export const YULGANG_W_SLUG = 'yulgang-w'
export const YULGANG_W_APPSTORE_URL =
  'https://apps.apple.com/th/app/yulgang-w/id6756002784'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class YulgangWUpstreamUnavailableError extends Error {
  constructor(message = 'Yulgang W App Store upstream unavailable') {
    super(message)
    this.name = 'YulgangWUpstreamUnavailableError'
  }
}

export class YulgangWInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Yulgang W App Store response') {
    super(message)
    this.name = 'YulgangWInvalidUpstreamResponseError'
  }
}

type ParsedIap = {
  name: string
  priceUsd: number
  priceThb: number
}

/** Stable positive int from pack name (RovPack.id is number). */
export function packNameToId(name: string): number {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const id = h >>> 0
  return id === 0 ? 1 : id
}

export function parseThbAmount(raw: string): number | null {
  const cleaned = raw
    .replace(/\u0e3f/g, '') // Thai baht sign
    .replace(/THB/gi, '')
    .replace(/,/g, '')
    .replace(/[^\d.]/g, '')
    .trim()
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export function parseUsdFromPackName(name: string): number | null {
  const m = name.match(/([0-9]+(?:\.[0-9]+)?)\s*USD\s*Pack/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/**
 * Prefer embedded App Store JSON textPairs / items_V3 under
 * shelfMapping.information → title "In-App Purchases".
 * Falls back to HTML text-pair scraping when JSON is absent.
 */
export function parseYulgangWIapFromHtml(html: string): ParsedIap[] {
  const fromJson = parseFromEmbeddedJson(html)
  if (fromJson.length > 0) return dedupeByUsd(fromJson)

  const fromHtml = parseFromHtmlText(html)
  return dedupeByUsd(fromHtml)
}

function dedupeByUsd(packs: ParsedIap[]): ParsedIap[] {
  const seen = new Set<number>()
  const out: ParsedIap[] = []
  for (const pack of packs) {
    if (seen.has(pack.priceUsd)) continue
    seen.add(pack.priceUsd)
    out.push(pack)
  }
  return out
}

function parseFromEmbeddedJson(html: string): ParsedIap[] {
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
  const out: ParsedIap[] = []
  for (const [leading, trailing] of pairs) {
    const name = String(leading ?? '').trim()
    const usd = parseUsdFromPackName(name)
    const thb = parseThbAmount(String(trailing ?? ''))
    if (usd === null || thb === null) continue
    out.push({ name, priceUsd: usd, priceThb: thb })
  }
  return out
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
      underIap || /^In-App Purchases$/i.test(title.trim())

    if (isIapSection) {
      const itemsV3 = rec.items_V3
      if (Array.isArray(itemsV3)) {
        for (const item of itemsV3) {
          if (!item || typeof item !== 'object') continue
          const row = item as Record<string, unknown>
          if (typeof row.leadingText === 'string' && typeof row.trailingText === 'string') {
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

function parseFromHtmlText(html: string): ParsedIap[] {
  const out: ParsedIap[] = []
  // e.g. 0.99USD Pack … ฿35.00  (baht may appear as mojibake)
  const re =
    /([0-9]+(?:\.[0-9]+)?\s*USD\s*Pack)[\s\S]{0,240}?(?:\u0e3f|THB|&#3647;|&baht;|[^\x00-\x7F]{1,3})\s*([\d,]+(?:\.\d+)?)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const name = m[1].replace(/\s+/g, ' ').trim()
    const usd = parseUsdFromPackName(name)
    const thb = parseThbAmount(m[2])
    if (usd === null || thb === null) continue
    out.push({ name: name.replace(/\s+/g, ''), priceUsd: usd, priceThb: thb })
  }

  // Also try adjacent plain text pairs without baht symbol (mojibake stripped)
  if (out.length === 0) {
    const loose =
      /([0-9]+(?:\.[0-9]+)?)USD Pack[\s\S]{0,80}?([\d,]+\.\d{2})/g
    while ((m = loose.exec(html)) !== null) {
      const usd = Number(m[1])
      const thb = parseThbAmount(m[2])
      if (!Number.isFinite(usd) || thb === null) continue
      out.push({
        name: `${m[1]}USD Pack`,
        priceUsd: usd,
        priceThb: thb
      })
    }
  }

  return out
}

function toResponse(packs: ParsedIap[], source: string): RovPacksResponse {
  const mapped: RovPack[] = packs
    .slice()
    .sort((a, b) => a.priceUsd - b.priceUsd)
    .map((pack) => ({
      id: packNameToId(pack.name),
      name: pack.name,
      baseItemAmount: 0,
      bonusItemAmount: 0,
      totalItemAmount: 0,
      price: pack.priceThb,
      currency: 'THB',
      price_thb: pack.priceThb,
      price_usd: pack.priceUsd,
      prices: { THB: pack.priceThb, USD: pack.priceUsd },
      price_thb_source: 'appstore',
      price_usd_source: 'appstore'
    }))

  return {
    game: {
      id: YULGANG_W_APP_ID,
      slug: YULGANG_W_SLUG,
      name: 'Yulgang W',
      itemName: 'Pack',
      itemIcon: ''
    },
    categories: [
      {
        id: 1,
        name: 'App Store In-App Purchases',
        status: 0,
        message: 'Live IAP list from App Store TH (no fallback)',
        packCount: mapped.length,
        packs: mapped
      }
    ],
    summary: {
      categoryCount: 1,
      packCount: mapped.length
    },
    fetchedAt: new Date().toISOString(),
    source,
    sources: {
      thb: source,
      usd: source
    },
    notes: [
      'FULL THB from App Store In-App Purchases price text (฿).',
      'USD parsed from offer name pattern N.NNUSD Pack (not FX).',
      'Live-fetch only; empty/unparseable upstream → error (no static catalog).'
    ]
  }
}

/**
 * Live Yulgang W packs from App Store TH product page.
 * Parses embedded JSON textPairs (preferred) or HTML IAP pairs.
 * Never hardcodes pack prices; upstream fail → throw.
 */
export async function fetchYulgangWPacks(options?: {
  signal?: AbortSignal
  /** Inject raw HTML for unit tests (skips live fetch). */
  html?: string
}): Promise<RovPacksResponse> {
  let html: string

  if (options && 'html' in options) {
    if (typeof options.html !== 'string' || options.html.length === 0) {
      throw new YulgangWInvalidUpstreamResponseError('Empty HTML fixture')
    }
    html = options.html
  } else {
    let response: Response
    try {
      response = await fetch(YULGANG_W_APPSTORE_URL, {
        signal: options?.signal ?? AbortSignal.timeout(25_000),
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
          'User-Agent': BROWSER_UA
        }
      })
    } catch (error) {
      throw new YulgangWUpstreamUnavailableError(
        error instanceof Error ? error.message : 'network error'
      )
    }

    if (!response.ok) {
      throw new YulgangWUpstreamUnavailableError('HTTP ' + response.status)
    }

    try {
      html = await response.text()
    } catch (error) {
      throw new YulgangWUpstreamUnavailableError(
        error instanceof Error ? error.message : 'failed to read body'
      )
    }
  }

  const packs = parseYulgangWIapFromHtml(html)
  if (packs.length === 0) {
    throw new YulgangWInvalidUpstreamResponseError(
      'In-App Purchases section not found or empty'
    )
  }

  return toResponse(packs, YULGANG_W_APPSTORE_URL)
}

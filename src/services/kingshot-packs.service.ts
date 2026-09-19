import { createHmac, publicEncrypt, randomBytes, constants } from 'node:crypto'
import type { RovPack, RovPacksResponse } from '../types/rov'

export const KINGSHOT_STORE_SOURCE = 'https://store.centurygames.com/kingshot'

export const KINGSHOT_PACKAGES_API =
  'https://cg-vip-mall-wos.centurygame.com/api/activity/packages_info'

export const KINGSHOT_APPSTORE_TH_URL =
  'https://apps.apple.com/th/app/kingshot/id6739554056'
export const KINGSHOT_APPSTORE_US_URL =
  'https://apps.apple.com/us/app/kingshot/id6739554056'
export const KINGSHOT_APPSTORE_APP_ID = 6739554056

const KINGSHOT_GAME_ID = 20235
const WEB_VERSION = 'v2.3.8'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

/** Century Games vip-mall public key (store frontend). */
const PUBLIC_KEY_PEM = Buffer.from(
  'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUF0eVF1bVd0WTcyVlhSY3c4RlhKZwpwcS84SjB5U3lBaUE4S1JwRjl1STc1bHRoMzgvMkJVZ2hJZlgrcmlyZVc0RUVwNjE3UlB3c2puZDBTQXloc2NYCjBBZXhISGpkcVVRaDQzWjBNZTVadUpVUjFmaDJPRkxKZk81OTFYcC9RR2MxMC8zTnZ1R3prbFEvNm5TbkJ2WlQKaWNScVN2cDFFeUdMYzlvWWhIYVFncU0yc1ZsaThFNWx0Y1BwbVZ3b0RNUFkxSnlZdFJOMnBLVEg5cUhMc05kawpDd1ZLQ2NoYXM5UWw1eE9hck9CVFJPSG0xaXdEUFFSZHdCNFU4OFVTeXZHZURvVkp2ODM2UkNsTlRDaE1aOURaCmZpSllZVkFpWHRHd2FwQVFSeUFPbE5XamZIeHV0MGFvbHN3UW9OcUdpZzJqRkxWc1lXUzNyUU1hMlJjSlZMa1gKVHdJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==',
  'base64'
).toString('utf8')

type KingshotPackage = {
  id?: string
  pack_index?: string
  product_id?: string
  package_display_name?: string | null
  main_number?: number
  final_amount?: string | number
  currency_label?: string
  main_content?: string
  items?: Array<{ item_number?: number }>
}

type KingshotPackagesPayload = {
  code: number
  msg?: string
  data?: {
    game_id?: string
    game_name?: string
    package_list?: {
      config_list?: KingshotPackage[]
    }
  }
}

type NamedPrice = {
  name: string
  price: number
}

export class KingshotUpstreamUnavailableError extends Error {
  constructor(message = 'Kingshot upstream unavailable') {
    super(message)
    this.name = 'KingshotUpstreamUnavailableError'
  }
}

export class KingshotInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Kingshot upstream response') {
    super(message)
    this.name = 'KingshotInvalidUpstreamResponseError'
  }
}

function usdKey(n: number): string {
  return n.toFixed(2)
}

export function normalizeNormalPackName(name: string): string {
  const trimmed = name.replace(/\s+/g, ' ').trim()
  const m = trimmed.match(/^Normal\s*Pack\s*(\d+)$/i)
  if (m) return `Normal Pack ${m[1]}`
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

function createAuthSession(): { aesKey: string; authKey: string } {
  const aesKey = randomBytes(16).toString('hex')
  const authKey = publicEncrypt(
    {
      key: PUBLIC_KEY_PEM,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha1'
    },
    Buffer.from(aesKey, 'utf8')
  ).toString('base64')
  return { aesKey, authKey }
}

function signParams(
  params: Record<string, string>,
  aesKey: string
): Record<string, string> {
  const qs = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&')
  const hmacHex = createHmac('sha256', aesKey).update(qs).digest('hex')
  return {
    ...params,
    auth: Buffer.from(hmacHex, 'utf8').toString('base64')
  }
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

export function parseKingshotIapFromHtml(
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
    const name = normalizeNormalPackName(String(leading ?? ''))
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

/** Map USD amount → THB using App Store TH+US offer name merge. */
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

function mapOfficialPack(
  pack: KingshotPackage,
  index: number,
  priceThb: number,
  priceUsd: number
): RovPack {
  const baseItemAmount = Number(pack.main_number ?? 0)
  const bonusItemAmount = (pack.items ?? []).reduce(
    (sum, item) => sum + Number(item.item_number ?? 0),
    0
  )
  const displayName = (pack.package_display_name ?? '').trim()
  const name =
    displayName ||
    (baseItemAmount > 0
      ? `Kingdom Stars ${baseItemAmount}`
      : pack.product_id || `Pack ${index}`)

  return {
    id: index,
    name,
    baseItemAmount,
    bonusItemAmount,
    totalItemAmount: baseItemAmount + bonusItemAmount,
    price: priceThb,
    currency: 'THB',
    price_thb: priceThb,
    price_usd: priceUsd,
    prices: { THB: priceThb, USD: priceUsd },
    price_thb_source: 'appstore',
    price_usd_source: 'official-store'
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
    throw new KingshotUpstreamUnavailableError(
      error instanceof Error ? error.message : 'network error for ' + url
    )
  }
  if (!response.ok) {
    throw new KingshotUpstreamUnavailableError(
      'HTTP ' + response.status + ' for ' + url
    )
  }
  try {
    return await response.text()
  } catch (error) {
    throw new KingshotUpstreamUnavailableError(
      error instanceof Error ? error.message : 'failed to read body for ' + url
    )
  }
}

async function fetchOfficialPackages(
  signal: AbortSignal,
  fixture?: KingshotPackagesPayload
): Promise<KingshotPackagesPayload> {
  if (fixture) return fixture

  const { aesKey, authKey } = createAuthSession()
  const unsigned = {
    game_id: String(KINGSHOT_GAME_ID),
    currency: 'USD',
    language_code: 'EN',
    os: 'pc',
    display_all: '1',
    ts: String(Date.now()),
    webVersion: WEB_VERSION
  }
  const signed = signParams(unsigned, aesKey)
  const url = `${KINGSHOT_PACKAGES_API}?${new URLSearchParams(signed).toString()}`

  let response: Response
  try {
    response = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/json',
        Origin: 'https://store.centurygames.com',
        Referer: KINGSHOT_STORE_SOURCE,
        'Auth-Key': authKey,
        'Request-Path': KINGSHOT_STORE_SOURCE,
        'User-Agent': BROWSER_UA
      }
    })
  } catch (error) {
    throw new KingshotUpstreamUnavailableError(
      error instanceof Error ? error.message : 'Kingshot packages_info network error'
    )
  }

  if (!response.ok) {
    throw new KingshotUpstreamUnavailableError(
      'HTTP ' + response.status + ' for packages_info'
    )
  }

  try {
    return (await response.json()) as KingshotPackagesPayload
  } catch {
    throw new KingshotInvalidUpstreamResponseError('packages_info JSON parse failed')
  }
}

/**
 * Live Kingshot packs: Century Games official store USD (Kingdom Stars)
 * + App Store THB. Merge by USD amount via App Store Normal Pack name match.
 * Both sides required; no hardcoded catalog; no FX.
 * Century currency/locale params remain USD-only (verified live).
 */
export async function fetchKingshotOfficialPacks(options?: {
  signal?: AbortSignal
  /** Inject packages_info payload for unit tests. */
  packagesPayload?: KingshotPackagesPayload
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

  const payload = await fetchOfficialPackages(signal, options?.packagesPayload)

  let htmlTh: string
  let htmlUs: string

  if (options && 'htmlTh' in options) {
    if (typeof options.htmlTh !== 'string' || options.htmlTh.length === 0) {
      throw new KingshotInvalidUpstreamResponseError('Empty TH HTML fixture')
    }
    htmlTh = options.htmlTh
  } else {
    htmlTh = await fetchText(
      KINGSHOT_APPSTORE_TH_URL,
      {
        ...browserHeaders,
        'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8'
      },
      signal
    )
  }

  if (options && 'htmlUs' in options) {
    if (typeof options.htmlUs !== 'string' || options.htmlUs.length === 0) {
      throw new KingshotInvalidUpstreamResponseError('Empty US HTML fixture')
    }
    htmlUs = options.htmlUs
  } else {
    htmlUs = await fetchText(
      KINGSHOT_APPSTORE_US_URL,
      {
        ...browserHeaders,
        'Accept-Language': 'en-US,en;q=0.9'
      },
      signal
    )
  }

  const configList = payload.data?.package_list?.config_list
  if (payload.code !== 1 || !Array.isArray(configList) || configList.length === 0) {
    throw new KingshotInvalidUpstreamResponseError(
      payload.msg || 'Empty Kingshot package list'
    )
  }

  const thbPacks = parseKingshotIapFromHtml(htmlTh, 'THB')
  const usdPacks = parseKingshotIapFromHtml(htmlUs, 'USD')
  if (thbPacks.length === 0) {
    throw new KingshotInvalidUpstreamResponseError(
      'App Store TH In-App Purchases empty'
    )
  }
  if (usdPacks.length === 0) {
    throw new KingshotInvalidUpstreamResponseError(
      'App Store US In-App Purchases empty'
    )
  }

  const thbByUsd = buildThbByUsdFromAppStore(thbPacks, usdPacks)
  if (thbByUsd.size === 0) {
    throw new KingshotInvalidUpstreamResponseError(
      'No THB↔USD Normal Pack matches from App Store'
    )
  }

  const packs: RovPack[] = []
  let index = 0
  for (const item of configList) {
    const priceUsd = Number(item.final_amount ?? NaN)
    if (!Number.isFinite(priceUsd)) continue
    const match = thbByUsd.get(usdKey(priceUsd))
    if (!match) continue
    index += 1
    packs.push(mapOfficialPack(item, index, match.thb, priceUsd))
  }

  if (packs.length === 0) {
    throw new KingshotInvalidUpstreamResponseError(
      'No official Kingdom Stars packs matched App Store THB by USD amount'
    )
  }

  const itemIcon = configList[0]?.main_content ?? ''

  return {
    game: {
      id: KINGSHOT_GAME_ID,
      slug: 'kingshot',
      name: payload.data?.game_name || 'Kingshot',
      itemName: 'Kingdom Stars',
      itemIcon
    },
    categories: [
      {
        id: KINGSHOT_GAME_ID,
        name: 'Official Store Kingdom Stars',
        status: 0,
        message:
          'Official store USD Kingdom Stars + App Store THB (merged by USD amount / Normal Pack)',
        packCount: packs.length,
        packs
      }
    ],
    summary: {
      categoryCount: 1,
      packCount: packs.length
    },
    fetchedAt: new Date().toISOString(),
    source: KINGSHOT_STORE_SOURCE,
    sources: {
      thb: KINGSHOT_APPSTORE_TH_URL,
      usd: KINGSHOT_STORE_SOURCE
    },
    notes: [
      'USD + Kingdom Stars amounts from live Century Games packages_info (USD-only API).',
      'THB from App Store TH In-App Purchases, matched via App Store US Normal Pack USD amount.',
      'Packs without a THB match (tiers missing on App Store page) are omitted.',
      'Live-fetch only; empty dual merge → error (no static catalog / no FX).'
    ]
  }
}

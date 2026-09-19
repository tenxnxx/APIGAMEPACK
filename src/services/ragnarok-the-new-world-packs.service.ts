import type { RovPack, RovPackCategory, RovPacksResponse } from '../types/rov'

/** OneOne game page. Livewire wire:snapshot carries conversions.THB / conversions.MYR. */
export const RAGNAROK_TNW_ONEONE_URL =
  'https://games.oneone.com/games/ragnarok-the-new-world'

/** Official GNJOY web top-up (pay.gnjoy.game → gstore.gnjoy.game). gameId=456. */
export const RAGNAROK_TNW_GNJOY_TOPUP_URL =
  'https://pay.gnjoy.game/platform/officialTopupNew.html?gameId=456'
export const RAGNAROK_TNW_GSTORE_INIT_DATA_URL =
  'https://gstore.gnjoy.game/init_data?gameId=456'
export const RAGNAROK_TNW_GSTORE_SHOW_PRODUCT_URL =
  'https://gstore.gnjoy.game/show_product?gameId=456'
export const RAGNAROK_TNW_GSTORE_PIECE_LIST_BASE =
  'https://gstore.gnjoy.game/get_piece_list'

export const RAGNAROK_TNW_SLUG = 'ragnarok-the-new-world'
export const RAGNAROK_TNW_APP_ID = 174
export const RAGNAROK_TNW_GNJOY_GAME_ID = 456

export type RagnarokTnwRegionCode = 'TH' | 'MY' | 'ID' | 'PH' | 'SG'

export type RagnarokTnwCurrency = 'THB' | 'MYR' | 'IDR' | 'PHP' | 'SGD'

export type RagnarokTnwRegionInfo = {
  code: RagnarokTnwRegionCode
  name: string
  currency: RagnarokTnwCurrency
  location: RagnarokTnwRegionCode
  appLanguage: string
  language: string
}

export const RAGNAROK_TNW_REGION_TH: RagnarokTnwRegionInfo = {
  code: 'TH',
  name: 'Thailand',
  currency: 'THB',
  location: 'TH',
  appLanguage: 'th-TH',
  language: 'th-TH'
}

export const RAGNAROK_TNW_REGION_MY: RagnarokTnwRegionInfo = {
  code: 'MY',
  name: 'Malaysia',
  currency: 'MYR',
  location: 'MY',
  appLanguage: 'en-US',
  language: 'en-US'
}


export const RAGNAROK_TNW_REGION_ID: RagnarokTnwRegionInfo = {
  code: 'ID',
  name: 'Indonesia',
  currency: 'IDR',
  location: 'ID',
  appLanguage: 'id-ID',
  language: 'id-ID'
}

export const RAGNAROK_TNW_REGION_PH: RagnarokTnwRegionInfo = {
  code: 'PH',
  name: 'Philippines',
  currency: 'PHP',
  location: 'PH',
  appLanguage: 'en-US',
  language: 'en-US'
}

export const RAGNAROK_TNW_REGION_SG: RagnarokTnwRegionInfo = {
  code: 'SG',
  name: 'Singapore',
  currency: 'SGD',
  location: 'SG',
  appLanguage: 'en-US',
  language: 'en-US'
}

export const RAGNAROK_TNW_REGIONS: ReadonlyArray<RagnarokTnwRegionInfo> = [
  RAGNAROK_TNW_REGION_TH,
  RAGNAROK_TNW_REGION_MY,
  RAGNAROK_TNW_REGION_ID,
  RAGNAROK_TNW_REGION_PH,
  RAGNAROK_TNW_REGION_SG
]

/**
 * Last known live conversions.THB from OneOne (THB per 1 OOC).
 * Used ONLY when the live page fetch/parse fails — never as the primary source.
 * Verified 2026-09-17 Asia/Bangkok from wire:snapshot conversions.THB.
 */
export const RAGNAROK_TNW_FALLBACK_THB_PER_OOC = 7.045833333333333

/**
 * Last known live conversions.MYR from OneOne (MYR per 1 OOC).
 * Verified 2026-09-18 Asia/Bangkok from same OneOne page as THB.
 */
export const RAGNAROK_TNW_FALLBACK_MYR_PER_OOC = 0.875

/**
 * Last known live conversions.IDR from OneOne (IDR per 1 OOC).
 * Verified 2026-09-18 Asia/Bangkok from same OneOne page as THB.
 */
export const RAGNAROK_TNW_FALLBACK_IDR_PER_OOC = 3862.5

/**
 * Last known live conversions.PHP from OneOne (PHP per 1 OOC).
 * Verified 2026-09-18 Asia/Bangkok.
 */
export const RAGNAROK_TNW_FALLBACK_PHP_PER_OOC = 13.385416666666666

/**
 * Last known live conversions.SGD from OneOne (SGD per 1 OOC).
 * Verified 2026-09-18 Asia/Bangkok.
 */
export const RAGNAROK_TNW_FALLBACK_SGD_PER_OOC = 0.27708333333333335

/**
 * GNJOY Starstones product ids (SEA store). Same productIds for TH/MY/ID/PH/SG;
 * location= query selects local currency TRANS_AMOUNT.
 * Verified 2026-09-18 via get_piece_list (no login required).
 */
export const RAGNAROK_TNW_STARSTONES_PRODUCTS: ReadonlyArray<{
  starstones: number
  productId: string
  cpProductId: string
}> = [
  { starstones: 60, productId: 'com.ggv.roworldsea.xs1', cpProductId: '100001' },
  { starstones: 300, productId: 'com.ggv.roworldsea.xs2', cpProductId: '100002' },
  { starstones: 980, productId: 'com.ggv.roworldsea.xs3', cpProductId: '100003' },
  { starstones: 1980, productId: 'com.ggv.roworldsea.xs4', cpProductId: '100004' },
  { starstones: 3280, productId: 'com.ggv.roworldsea.xs5', cpProductId: '100005' },
  { starstones: 6480, productId: 'com.ggv.roworldsea.xs6', cpProductId: '100006' },
  { starstones: 12980, productId: 'com.ggv.roworldsea.xs7', cpProductId: '100007' },
  { starstones: 32980, productId: 'com.ggv.roworldsea.xs8', cpProductId: '100008' },
  { starstones: 64980, productId: 'com.ggv.roworldsea.xs9', cpProductId: '100009' },
  { starstones: 129980, productId: 'com.ggv.roworldsea.xs10', cpProductId: '100010' }
]

/**
 * Official / verified Thailand THB Starstones map (fallback when get_piece_list fails).
 * Includes large tiers verified 2026-09-18 via get_piece_list TRANS_AMOUNT.
 */
export const RAGNAROK_TNW_OFFICIAL_STARSTONES_THB: ReadonlyArray<{
  starstones: number
  priceLocal: number
}> = [
  { starstones: 60, priceLocal: 35 },
  { starstones: 300, priceLocal: 179 },
  { starstones: 980, priceLocal: 539 },
  { starstones: 1980, priceLocal: 1100 },
  { starstones: 3280, priceLocal: 1800 },
  { starstones: 6480, priceLocal: 3590 },
  { starstones: 12980, priceLocal: 7190 },
  { starstones: 32980, priceLocal: 18200 },
  { starstones: 64980, priceLocal: 35500 },
  { starstones: 129980, priceLocal: 71000 }
]

/**
 * Official / verified Malaysia MYR Starstones map (fallback when get_piece_list fails).
 * Verified 2026-09-18 Asia/Bangkok via get_piece_list?location=MY OOC TRANS_AMOUNT (xs1–xs10).
 */
export const RAGNAROK_TNW_OFFICIAL_STARSTONES_MYR: ReadonlyArray<{
  starstones: number
  priceLocal: number
}> = [
  { starstones: 60, priceLocal: 4.5 },
  { starstones: 300, priceLocal: 21.99 },
  { starstones: 980, priceLocal: 66.9 },
  { starstones: 1980, priceLocal: 132.9 },
  { starstones: 3280, priceLocal: 224.9 },
  { starstones: 6480, priceLocal: 444.9 },
  { starstones: 12980, priceLocal: 884.9 },
  { starstones: 32980, priceLocal: 2199 },
  { starstones: 64980, priceLocal: 4329 },
  { starstones: 129980, priceLocal: 8599 }
]


/**
 * Official / verified Indonesia IDR Starstones map (fallback when get_piece_list fails).
 * Verified 2026-09-18 Asia/Bangkok via get_piece_list?location=ID OOC TRANS_AMOUNT (xs1–xs10).
 */
export const RAGNAROK_TNW_OFFICIAL_STARSTONES_IDR: ReadonlyArray<{
  starstones: number
  priceLocal: number
}> = [
  { starstones: 60, priceLocal: 20000 },
  { starstones: 300, priceLocal: 100000 },
  { starstones: 980, priceLocal: 305000 },
  { starstones: 1980, priceLocal: 605000 },
  { starstones: 3280, priceLocal: 1009000 },
  { starstones: 6480, priceLocal: 2049000 },
  { starstones: 12980, priceLocal: 4049000 },
  { starstones: 32980, priceLocal: 9900000 },
  { starstones: 64980, priceLocal: 19500000 },
  { starstones: 129980, priceLocal: 38800000 }
]

/**
 * Official / verified Philippines PHP Starstones map (fallback when get_piece_list fails).
 * Verified 2026-09-18 Asia/Bangkok via get_piece_list?location=PH OOC TRANS_AMOUNT (xs1–xs10).
 */
export const RAGNAROK_TNW_OFFICIAL_STARSTONES_PHP: ReadonlyArray<{
  starstones: number
  priceLocal: number
}> = [
  { starstones: 60, priceLocal: 69 },
  { starstones: 300, priceLocal: 345 },
  { starstones: 980, priceLocal: 1040 },
  { starstones: 1980, priceLocal: 2090 },
  { starstones: 3280, priceLocal: 3490 },
  { starstones: 6480, priceLocal: 6950 },
  { starstones: 12980, priceLocal: 13890 },
  { starstones: 32980, priceLocal: 34500 },
  { starstones: 64980, priceLocal: 67950 },
  { starstones: 129980, priceLocal: 135500 }
]

/**
 * Official / verified Singapore SGD Starstones map (fallback when get_piece_list fails).
 * Verified 2026-09-18 Asia/Bangkok via get_piece_list?location=SG OOC TRANS_AMOUNT (xs1–xs10).
 */
export const RAGNAROK_TNW_OFFICIAL_STARSTONES_SGD: ReadonlyArray<{
  starstones: number
  priceLocal: number
}> = [
  { starstones: 60, priceLocal: 1.48 },
  { starstones: 300, priceLocal: 7.08 },
  { starstones: 980, priceLocal: 21.48 },
  { starstones: 1980, priceLocal: 42.48 },
  { starstones: 3280, priceLocal: 70.9 },
  { starstones: 6480, priceLocal: 140.98 },
  { starstones: 12980, priceLocal: 284.98 },
  { starstones: 32980, priceLocal: 709 },
  { starstones: 64980, priceLocal: 1390 },
  { starstones: 129980, priceLocal: 2769 }
]

export const RAGNAROK_TNW_LOCAL_FALLBACK_SOURCE = 'official-starstones-reference'
export const RAGNAROK_TNW_LOCAL_LIVE_SOURCE = 'gnjoy-get_piece_list-live'
/** @deprecated use RAGNAROK_TNW_LOCAL_* */
export const RAGNAROK_TNW_THB_FALLBACK_SOURCE = RAGNAROK_TNW_LOCAL_FALLBACK_SOURCE
export const RAGNAROK_TNW_THB_LIVE_SOURCE = RAGNAROK_TNW_LOCAL_LIVE_SOURCE

/**
 * Verified GNJOY Official Top-up USD (logged-in, region US, 2026-09-18 Asia/Bangkok).
 * Used ONLY when live gstore init_data / show_product product_list is empty
 * (guest/login-gated).
 */
export const RAGNAROK_TNW_VERIFIED_USD_FALLBACK: ReadonlyArray<{
  starstones: number
  priceUsd: number
}> = [
  { starstones: 60, priceUsd: 0.99 },
  { starstones: 300, priceUsd: 4.99 },
  { starstones: 980, priceUsd: 14.99 },
  { starstones: 1980, priceUsd: 29.99 },
  { starstones: 3280, priceUsd: 49.99 },
  { starstones: 6480, priceUsd: 99.99 },
  { starstones: 12980, priceUsd: 199.99 },
  { starstones: 32980, priceUsd: 499.99 },
  { starstones: 64980, priceUsd: 999.99 },
  { starstones: 129980, priceUsd: 1999.99 }
]

export const RAGNAROK_TNW_USD_FALLBACK_SOURCE =
  'gnjoy-official-topup-usd-verified-2026-09-18'

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class RagnarokTnwUpstreamUnavailableError extends Error {
  constructor(message = 'Ragnarok TNW upstream unavailable') {
    super(message)
    this.name = 'RagnarokTnwUpstreamUnavailableError'
  }
}

export class RagnarokTnwInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Ragnarok TNW upstream response') {
    super(message)
    this.name = 'RagnarokTnwInvalidUpstreamResponseError'
  }
}

export type RagnarokTnwRateInfo = {
  /** Local currency per 1 OOC (conversions.THB|MYR|IDR|PHP|SGD). */
  local_per_ooc: number
  currency: RagnarokTnwCurrency
  /** Present when region=TH (backward compat). */
  thb_per_ooc?: number
  /** Present when region=MY. */
  myr_per_ooc?: number
  /** Present when region=ID. */
  idr_per_ooc?: number
  /** Present when region=PH. */
  php_per_ooc?: number
  /** Present when region=SG. */
  sgd_per_ooc?: number
  /** live = parsed from OneOne HTML; fallback = last-known constant after fetch/parse failure */
  source: 'live' | 'fallback'
  url: string
  formula: string
}

export type RagnarokTnwUsdInfo = {
  byStarstones: Map<number, number>
  source: 'live' | 'fallback'
  label: string
  url: string
}

export type RagnarokTnwLocalInfo = {
  byStarstones: Map<number, number>
  sourceByStarstones: Map<number, string>
  source: 'live' | 'fallback' | 'mixed'
  label: string
  url: string
  currency: RagnarokTnwCurrency
}

export type RagnarokTnwPack = RovPack & {
  price_thb: number | null
  price_myr: number | null
  price_idr: number | null
  price_php: number | null
  price_sgd: number | null
  price_usd: number | null
  price_ooc: number | null
  price_ooc_source: string | null
  price_thb_source?: string | null
  price_myr_source?: string | null
  price_idr_source?: string | null
  price_php_source?: string | null
  price_sgd_source?: string | null
  price_usd_source?: string | null
  prices: {
    THB: number | null
    MYR: number | null
    IDR: number | null
    PHP: number | null
    SGD: number | null
    USD: number | null
    OOC: number | null
  }
}

export type RagnarokTnwPacksResponse = Omit<
  RovPacksResponse,
  'categories' | 'sources'
> & {
  region: RagnarokTnwRegionInfo
  categories: Array<
    Omit<RovPackCategory, 'packs'> & { packs: RagnarokTnwPack[] }
  >
  rate: RagnarokTnwRateInfo
  usd: {
    source: 'live' | 'fallback'
    label: string
    url: string
    packCount: number
  }
  /** Aggregate local-currency meta (THB/MYR/IDR/PHP/SGD depending on region). */
  local: {
    source: 'live' | 'fallback' | 'mixed'
    label: string
    url: string
    packCount: number
    currency: RagnarokTnwCurrency
  }
  /** Backward-compat alias when region=TH. */
  thb?: {
    source: 'live' | 'fallback' | 'mixed'
    label: string
    url: string
    packCount: number
  }
  /** Present when region=MY. */
  myr?: {
    source: 'live' | 'fallback' | 'mixed'
    label: string
    url: string
    packCount: number
  }
  /** Present when region=ID. */
  idr?: {
    source: 'live' | 'fallback' | 'mixed'
    label: string
    url: string
    packCount: number
  }
  /** Present when region=PH. */
  php?: {
    source: 'live' | 'fallback' | 'mixed'
    label: string
    url: string
    packCount: number
  }
  /** Present when region=SG. */
  sgd?: {
    source: 'live' | 'fallback' | 'mixed'
    label: string
    url: string
    packCount: number
  }
  sources: {
    local: string
    thb?: string
    myr?: string
    idr?: string
    php?: string
    sgd?: string
    usd: string
    ooc: string
    rate: string
  }
}

export type RagnarokTnwRegionsResponse = {
  game: {
    id: number
    slug: string
    name: string
    itemName: string
  }
  regions: Array<
    RagnarokTnwRegionInfo & {
      packsPath: string
      aliases: string[]
    }
  >
  fetchedAt: string
}

/** Site-style OOC: ceil to 2 decimal places (not banker's round). */
export function ceilOocTo2(localAmount: number, localPerOoc: number): number {
  if (
    !(localPerOoc > 0) ||
    !Number.isFinite(localPerOoc) ||
    !Number.isFinite(localAmount)
  ) {
    throw new RagnarokTnwInvalidUpstreamResponseError(
      'Invalid local/OOC inputs for conversion'
    )
  }
  return Math.ceil((localAmount / localPerOoc) * 100) / 100
}

export function resolveRagnarokTnwRegion(
  code?: string | null
): RagnarokTnwRegionInfo {
  const c = String(code ?? 'TH').toUpperCase()
  if (c === 'MY') return RAGNAROK_TNW_REGION_MY
  if (c === 'ID') return RAGNAROK_TNW_REGION_ID
  if (c === 'PH') return RAGNAROK_TNW_REGION_PH
  if (c === 'SG') return RAGNAROK_TNW_REGION_SG
  return RAGNAROK_TNW_REGION_TH
}

/** Map registry slug → region (default TH). */
export function resolveRagnarokTnwRegionFromSlug(
  slug: string
): RagnarokTnwRegionInfo {
  const s = slug.toLowerCase()
  if (
    s.endsWith('-my') ||
    s === 'rtnw-my' ||
    s.includes('malaysia') ||
    s === 'ragnarok-tnw-my'
  ) {
    return RAGNAROK_TNW_REGION_MY
  }
  if (
    s.endsWith('-id') ||
    s === 'rtnw-id' ||
    s.includes('indonesia') ||
    s === 'ragnarok-tnw-id'
  ) {
    return RAGNAROK_TNW_REGION_ID
  }
  if (
    s.endsWith('-ph') ||
    s === 'rtnw-ph' ||
    s.includes('philippines') ||
    s === 'ragnarok-tnw-ph'
  ) {
    return RAGNAROK_TNW_REGION_PH
  }
  if (
    s.endsWith('-sg') ||
    s === 'rtnw-sg' ||
    s.includes('singapore') ||
    s === 'ragnarok-tnw-sg'
  ) {
    return RAGNAROK_TNW_REGION_SG
  }
  return RAGNAROK_TNW_REGION_TH
}

export function listRagnarokTheNewWorldRegions(): RagnarokTnwRegionsResponse {
  return {
    game: {
      id: RAGNAROK_TNW_APP_ID,
      slug: RAGNAROK_TNW_SLUG,
      name: 'Ragnarok: The New World',
      itemName: 'Starstones'
    },
    regions: [
      {
        ...RAGNAROK_TNW_REGION_TH,
        packsPath: '/games/ragnarok-the-new-world/packs/',
        aliases: [
          '/games/ragnarok-the-new-world-th/packs/',
          '/games/rtnw/packs/',
          '/games/rtnw-th/packs/',
          '/games/ragnarok-tnw/packs/',
          '/games/ragnarok-tnw-th/packs/'
        ]
      },
      {
        ...RAGNAROK_TNW_REGION_MY,
        packsPath: '/games/ragnarok-the-new-world-my/packs/',
        aliases: [
          '/games/rtnw-my/packs/',
          '/games/ragnarok-tnw-my/packs/'
        ]
      },
      {
        ...RAGNAROK_TNW_REGION_ID,
        packsPath: '/games/ragnarok-the-new-world-id/packs/',
        aliases: [
          '/games/rtnw-id/packs/',
          '/games/ragnarok-tnw-id/packs/'
        ]
      },
      {
        ...RAGNAROK_TNW_REGION_PH,
        packsPath: '/games/ragnarok-the-new-world-ph/packs/',
        aliases: [
          '/games/rtnw-ph/packs/',
          '/games/ragnarok-tnw-ph/packs/'
        ]
      },
      {
        ...RAGNAROK_TNW_REGION_SG,
        packsPath: '/games/ragnarok-the-new-world-sg/packs/',
        aliases: [
          '/games/rtnw-sg/packs/',
          '/games/ragnarok-tnw-sg/packs/'
        ]
      }
    ],
    fetchedAt: new Date().toISOString()
  }
}

/**
 * Parse conversions.<CURRENCY> from OneOne Livewire wire:snapshot HTML.
 * Snapshot attribute values are HTML-entity encoded.
 */
export function parseOneOneLocalPerOocFromHtml(
  html: string,
  currency: RagnarokTnwCurrency
): number {
  if (!html || typeof html !== 'string') {
    throw new RagnarokTnwInvalidUpstreamResponseError('Empty OneOne HTML')
  }

  const snapshotRe = /wire:snapshot="([^"]+)"/gi
  let match: RegExpExecArray | null
  const candidates: string[] = []
  while ((match = snapshotRe.exec(html)) !== null) {
    const raw = match[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#039;/g, "'")
      .replace(/&apos;/g, "'")
    if (raw.includes('conversions') && raw.includes(currency)) {
      candidates.push(raw)
    }
  }

  const searchSpace =
    candidates.length > 0 ? candidates.join('\n') : html.replace(/&quot;/g, '"')

  const re = new RegExp(`"${currency}"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`)
  const curMatch = searchSpace.match(re)
  if (!curMatch) {
    throw new RagnarokTnwInvalidUpstreamResponseError(
      `conversions.${currency} not found in OneOne HTML`
    )
  }
  const rate = Number(curMatch[1])
  if (!(rate > 0) || !Number.isFinite(rate)) {
    throw new RagnarokTnwInvalidUpstreamResponseError(
      `conversions.${currency} is not a positive number`
    )
  }
  return rate
}

/** @deprecated prefer parseOneOneLocalPerOocFromHtml(html, 'THB') */
export function parseOneOneThbPerOocFromHtml(html: string): number {
  return parseOneOneLocalPerOocFromHtml(html, 'THB')
}

export function parseOneOneMyrPerOocFromHtml(html: string): number {
  return parseOneOneLocalPerOocFromHtml(html, 'MYR')
}

/**
 * Best-effort extract of live Starstones packs from OneOne HTML.
 * Guest pages currently expose empty `items` → returns [].
 */
export function parseOneOneStarstonesItemsFromHtml(
  html: string
): Array<{ starstones: number; priceLocal: number }> {
  const out: Array<{ starstones: number; priceLocal: number }> = []
  const decoded = html.replace(/&quot;/g, '"')
  const pairRe =
    /"?(?:quantity|amount|starstones|count)"?\s*:\s*(\d+)\s*,[\s\S]{0,120}?"?(?:price|price_thb|thb|amount_thb|price_myr)"?\s*:\s*(\d+(?:\.\d+)?)/gi
  let m: RegExpExecArray | null
  const seen = new Set<number>()
  while ((m = pairRe.exec(decoded)) !== null) {
    const starstones = Number(m[1])
    const priceLocal = Number(m[2])
    if (!Number.isFinite(starstones) || !Number.isFinite(priceLocal)) continue
    if (seen.has(starstones)) continue
    seen.add(starstones)
    out.push({ starstones, priceLocal })
  }
  return out
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    if (!(key in obj)) continue
    const raw = obj[key]
    const n =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string'
          ? Number(raw.replace(/,/g, '').trim())
          : NaN
    if (Number.isFinite(n)) return n
  }
  return null
}

/**
 * Extract base local pack price from a get_piece_list payload.
 * Prefers OOC (f_pay_type=oneverse / pay_type=ooc); else primary currency paytype.
 * Base row = first price_list entry with SUB_AMOUNT == 0 (or first entry).
 * GNJOY returns TRANS_AMOUNT in local currency even for OOC — no separate OOC currency.
 */
export function parseGnjoyPieceListBaseLocal(
  payload: unknown,
  preferredCurrency: RagnarokTnwCurrency
): number | null {
  const root = asRecord(payload)
  const data = root && 'data' in root ? asRecord(root.data) : root
  if (!data) return null
  const paytypeList = data.paytype_list
  if (!Array.isArray(paytypeList) || paytypeList.length === 0) return null

  const rows = paytypeList
    .map((p) => asRecord(p))
    .filter((p): p is Record<string, unknown> => p != null)

  const prefer =
    rows.find((p) => {
      const f = String(p.f_pay_type ?? '').toLowerCase()
      const t = String(p.pay_type ?? '').toLowerCase()
      const n = String(p.name ?? '').toUpperCase()
      return f === 'oneverse' || t === 'ooc' || n === 'OOC'
    }) ??
    rows.find(
      (p) =>
        String(p.currency ?? p.show_currency ?? '').toUpperCase() ===
        preferredCurrency
    ) ??
    rows[0]

  if (!prefer) return null
  const prices = prefer.price_list
  if (!Array.isArray(prices) || prices.length === 0) return null

  let base: Record<string, unknown> | null = null
  for (const item of prices) {
    const row = asRecord(item)
    if (!row) continue
    const sub = pickNumber(row, ['SUB_AMOUNT', 'sub_amount'])
    if (sub == null || sub === 0) {
      base = row
      break
    }
  }
  if (!base) base = asRecord(prices[0])
  if (!base) return null

  const amount = pickNumber(base, [
    'TRANS_AMOUNT',
    'GAME_TRANS_AMOUNT',
    'trans_amount',
    'IN_APP_TRANS_AMOUNT'
  ])
  if (amount == null || !(amount > 0)) return null
  return amount
}

/** @deprecated prefer parseGnjoyPieceListBaseLocal(payload, 'THB') */
export function parseGnjoyPieceListBaseThb(payload: unknown): number | null {
  return parseGnjoyPieceListBaseLocal(payload, 'THB')
}

export function buildGnjoyPieceListUrl(
  productId: string,
  cpProductId?: string,
  region: RagnarokTnwRegionInfo = RAGNAROK_TNW_REGION_TH
): string {
  const u = new URL(RAGNAROK_TNW_GSTORE_PIECE_LIST_BASE)
  u.searchParams.set('gameId', String(RAGNAROK_TNW_GNJOY_GAME_ID))
  u.searchParams.set('productId', productId)
  if (cpProductId) u.searchParams.set('cpProductId', cpProductId)
  u.searchParams.set('location', region.location)
  u.searchParams.set('appLanguage', region.appLanguage)
  u.searchParams.set('language', region.language)
  u.searchParams.set('productType', 'coin')
  u.searchParams.set('f_pay_type', 'oneverse')
  u.searchParams.set('pay_type', 'ooc')
  return u.toString()
}

/**
 * Walk GNJOY gstore product_list (catalog groups with `.list`) or a flat
 * show_product array and extract Starstones amount → USD price.
 */
export function parseGnjoyUsdProductsFromPayload(
  payload: unknown
): Array<{ starstones: number; priceUsd: number }> {
  const root = asRecord(payload)
  const data = root && 'data' in root ? root.data : payload

  const items: unknown[] = []
  if (Array.isArray(data)) {
    items.push(...data)
  } else {
    const dataObj = asRecord(data)
    const productList = dataObj?.product_list
    if (Array.isArray(productList)) {
      for (const group of productList) {
        const g = asRecord(group)
        if (g && Array.isArray(g.list)) items.push(...g.list)
        else items.push(group)
      }
    }
  }

  const out: Array<{ starstones: number; priceUsd: number }> = []
  const seen = new Set<number>()

  for (const item of items) {
    const row = asRecord(item)
    if (!row) continue

    const starstones = pickNumber(row, [
      'num',
      'NUM',
      'coin',
      'COIN',
      'coin_num',
      'game_coin',
      'GAME_COIN',
      'amount',
      'AMOUNT',
      'quantity',
      'starstones',
      'Starstones',
      'bound_starstone',
      'BOUND_STARSTONE'
    ])

    const priceUsd = pickNumber(row, [
      'price',
      'PRICE',
      'usd_price',
      'USD_PRICE',
      'show_price',
      'SHOW_PRICE',
      'currency_amount',
      'CURRENCY_AMOUNT',
      'pay_amount',
      'PAY_AMOUNT',
      'amount_usd',
      'real_price',
      'REAL_PRICE'
    ])

    const currencyRaw = row.currency ?? row.CURRENCY ?? row.product_currency
    const currency =
      typeof currencyRaw === 'string' ? currencyRaw.toUpperCase() : 'USD'
    if (currency && currency !== 'USD' && currency !== 'US$') continue
    if (starstones == null || priceUsd == null) continue
    if (!(starstones > 0) || !(priceUsd > 0)) continue
    if (seen.has(starstones)) continue
    seen.add(starstones)
    out.push({ starstones, priceUsd })
  }

  return out
}

async function fetchText(
  url: string,
  signal?: AbortSignal,
  accept = 'text/html,application/xhtml+xml'
): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(25_000),
      headers: {
        Accept: accept,
        'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
        'User-Agent': BROWSER_UA,
        Referer: RAGNAROK_TNW_GNJOY_TOPUP_URL,
        Origin: 'https://pay.gnjoy.game'
      }
    })
  } catch (error) {
    throw new RagnarokTnwUpstreamUnavailableError(
      error instanceof Error ? error.message : 'network error'
    )
  }
  if (!response.ok) {
    throw new RagnarokTnwUpstreamUnavailableError('HTTP ' + response.status)
  }
  try {
    return await response.text()
  } catch (error) {
    throw new RagnarokTnwUpstreamUnavailableError(
      error instanceof Error ? error.message : 'failed to read body'
    )
  }
}

async function fetchOneOneHtml(signal?: AbortSignal): Promise<string> {
  let response: Response
  try {
    response = await fetch(RAGNAROK_TNW_ONEONE_URL, {
      signal: signal ?? AbortSignal.timeout(25_000),
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
        'User-Agent': BROWSER_UA,
        Referer: 'https://games.oneone.com/'
      }
    })
  } catch (error) {
    throw new RagnarokTnwUpstreamUnavailableError(
      error instanceof Error ? error.message : 'network error'
    )
  }
  if (!response.ok) {
    throw new RagnarokTnwUpstreamUnavailableError('HTTP ' + response.status)
  }
  try {
    return await response.text()
  } catch (error) {
    throw new RagnarokTnwUpstreamUnavailableError(
      error instanceof Error ? error.message : 'failed to read body'
    )
  }
}

/**
 * Live local currency from GNJOY get_piece_list per Starstones product.
 * Verified 2026-09-18: works WITHOUT login for location=TH|MY|ID|PH|SG.
 */
export async function fetchGnjoyLiveLocalFromPieceList(options?: {
  signal?: AbortSignal
  region?: RagnarokTnwRegionInfo | RagnarokTnwRegionCode
  /** Inject per-productId JSON payloads (tests). */
  pieceListByProductId?: Record<string, unknown>
  /** Skip network (tests). */
  skipNetwork?: boolean
  products?: ReadonlyArray<{
    starstones: number
    productId: string
    cpProductId: string
  }>
}): Promise<{
  products: Array<{
    starstones: number
    priceLocal: number
    productId: string
  }>
  notes: string[]
  region: RagnarokTnwRegionInfo
}> {
  const region =
    typeof options?.region === 'string' || options?.region == null
      ? resolveRagnarokTnwRegion(options?.region as string | undefined)
      : options.region
  const notes: string[] = []
  const catalog = options?.products ?? RAGNAROK_TNW_STARSTONES_PRODUCTS
  const out: Array<{
    starstones: number
    priceLocal: number
    productId: string
  }> = []

  if (options?.pieceListByProductId) {
    for (const row of catalog) {
      const payload = options.pieceListByProductId[row.productId]
      if (payload == null) continue
      const local = parseGnjoyPieceListBaseLocal(payload, region.currency)
      if (local != null) {
        out.push({
          starstones: row.starstones,
          priceLocal: local,
          productId: row.productId
        })
      }
    }
    if (out.length > 0) {
      notes.push(
        `GNJOY get_piece_list ${region.currency} from fixtures (${out.length}/${catalog.length} products, location=${region.location}).`
      )
    } else {
      notes.push(
        `GNJOY get_piece_list fixtures present but no TRANS_AMOUNT parsed (${region.currency}).`
      )
    }
    return { products: out, notes, region }
  }

  if (options?.skipNetwork) {
    notes.push(
      `GNJOY get_piece_list network skipped (fixture/test, location=${region.location}).`
    )
    return { products: [], notes, region }
  }

  const results = await Promise.all(
    catalog.map(async (row) => {
      const url = buildGnjoyPieceListUrl(row.productId, row.cpProductId, region)
      try {
        const text = await fetchText(
          url,
          options?.signal,
          'application/json, text/plain, */*'
        )
        const json = JSON.parse(text) as unknown
        const local = parseGnjoyPieceListBaseLocal(json, region.currency)
        if (local == null) {
          return {
            row,
            error: 'no TRANS_AMOUNT in paytype_list' as string | null,
            local: null as number | null
          }
        }
        return { row, error: null as string | null, local }
      } catch (error) {
        return {
          row,
          error: error instanceof Error ? error.message : 'unknown',
          local: null as number | null
        }
      }
    })
  )

  let failCount = 0
  for (const r of results) {
    if (r.local != null) {
      out.push({
        starstones: r.row.starstones,
        priceLocal: r.local,
        productId: r.row.productId
      })
    } else {
      failCount++
      if (r.error) {
        notes.push(`get_piece_list ${r.row.productId} failed: ${r.error}`)
      }
    }
  }

  if (out.length > 0) {
    notes.push(
      `GNJOY live ${region.currency} from get_piece_list location=${region.location} (${out.length}/${catalog.length} products; no login/serverId required).`
    )
  } else {
    notes.push(
      `GNJOY get_piece_list returned no usable ${region.currency} (will use official ${region.currency} map).`
    )
  }
  if (failCount > 0 && out.length > 0) {
    notes.push(
      `${failCount} get_piece_list product(s) missing; gaps filled from official ${region.currency} map.`
    )
  }

  return { products: out, notes, region }
}

/** @deprecated prefer fetchGnjoyLiveLocalFromPieceList({ region: 'TH' }) */
export async function fetchGnjoyLiveThbFromPieceList(options?: {
  signal?: AbortSignal
  pieceListByProductId?: Record<string, unknown>
  skipNetwork?: boolean
  products?: ReadonlyArray<{
    starstones: number
    productId: string
    cpProductId: string
  }>
}): Promise<{
  products: Array<{ starstones: number; priceThb: number; productId: string }>
  notes: string[]
}> {
  const r = await fetchGnjoyLiveLocalFromPieceList({
    ...options,
    region: 'TH'
  })
  return {
    notes: r.notes,
    products: r.products.map((p) => ({
      starstones: p.starstones,
      priceThb: p.priceLocal,
      productId: p.productId
    }))
  }
}

/**
 * Live-first USD from GNJOY gstore (init_data product_list, then show_product).
 * Guest responses typically have empty product_list → returns [].
 */
export async function fetchGnjoyLiveUsdProducts(options?: {
  signal?: AbortSignal
  initDataJson?: unknown
  showProductJson?: unknown
  skipNetwork?: boolean
}): Promise<{
  products: Array<{ starstones: number; priceUsd: number }>
  from: 'init_data' | 'show_product' | 'none'
  notes: string[]
}> {
  const notes: string[] = []

  const tryParse = (
    payload: unknown,
    from: 'init_data' | 'show_product'
  ): Array<{ starstones: number; priceUsd: number }> => {
    try {
      return parseGnjoyUsdProductsFromPayload(payload)
    } catch (error) {
      notes.push(
        `GNJOY ${from} parse failed: ` +
          (error instanceof Error ? error.message : 'unknown')
      )
      return []
    }
  }

  if (options && 'initDataJson' in (options ?? {}) && options?.initDataJson != null) {
    const products = tryParse(options.initDataJson, 'init_data')
    if (products.length > 0) {
      return { products, from: 'init_data', notes }
    }
  }

  if (
    options &&
    'showProductJson' in (options ?? {}) &&
    options?.showProductJson != null
  ) {
    const products = tryParse(options.showProductJson, 'show_product')
    if (products.length > 0) {
      return { products, from: 'show_product', notes }
    }
  }

  if (options?.skipNetwork) {
    notes.push('GNJOY live USD network skipped (fixture/test).')
    return { products: [], from: 'none', notes }
  }

  try {
    const text = await fetchText(
      RAGNAROK_TNW_GSTORE_INIT_DATA_URL,
      options?.signal,
      'application/json, text/plain, */*'
    )
    const json = JSON.parse(text) as unknown
    const products = tryParse(json, 'init_data')
    if (products.length > 0) {
      notes.push(
        `GNJOY live USD from init_data (${products.length} Starstones tiers).`
      )
      return { products, from: 'init_data', notes }
    }
    notes.push(
      'GNJOY init_data reachable but product_list empty (login-gated catalog).'
    )
  } catch (error) {
    notes.push(
      'GNJOY init_data fetch failed: ' +
        (error instanceof Error ? error.message : 'unknown')
    )
  }

  try {
    const text = await fetchText(
      RAGNAROK_TNW_GSTORE_SHOW_PRODUCT_URL,
      options?.signal,
      'application/json, text/plain, */*'
    )
    const json = JSON.parse(text) as unknown
    const products = tryParse(json, 'show_product')
    if (products.length > 0) {
      notes.push(
        `GNJOY live USD from show_product (${products.length} Starstones tiers).`
      )
      return { products, from: 'show_product', notes }
    }
    notes.push(
      'GNJOY show_product reachable but data empty (login-gated catalog).'
    )
  } catch (error) {
    notes.push(
      'GNJOY show_product fetch failed: ' +
        (error instanceof Error ? error.message : 'unknown')
    )
  }

  return { products: [], from: 'none', notes }
}

function buildUsdInfo(
  live: Array<{ starstones: number; priceUsd: number }>,
  from: 'init_data' | 'show_product' | 'none'
): RagnarokTnwUsdInfo {
  if (live.length > 0) {
    const byStarstones = new Map(live.map((r) => [r.starstones, r.priceUsd]))
    return {
      byStarstones,
      source: 'live',
      label:
        from === 'show_product'
          ? 'gnjoy-gstore-show_product-live'
          : 'gnjoy-gstore-init_data-live',
      url:
        from === 'show_product'
          ? RAGNAROK_TNW_GSTORE_SHOW_PRODUCT_URL
          : RAGNAROK_TNW_GSTORE_INIT_DATA_URL
    }
  }
  const byStarstones = new Map(
    RAGNAROK_TNW_VERIFIED_USD_FALLBACK.map((r) => [r.starstones, r.priceUsd])
  )
  return {
    byStarstones,
    source: 'fallback',
    label: RAGNAROK_TNW_USD_FALLBACK_SOURCE,
    url: RAGNAROK_TNW_GNJOY_TOPUP_URL
  }
}

function officialLocalMap(
  region: RagnarokTnwRegionInfo
): ReadonlyArray<{ starstones: number; priceLocal: number }> {
  switch (region.code) {
    case 'MY':
      return RAGNAROK_TNW_OFFICIAL_STARSTONES_MYR
    case 'ID':
      return RAGNAROK_TNW_OFFICIAL_STARSTONES_IDR
    case 'PH':
      return RAGNAROK_TNW_OFFICIAL_STARSTONES_PHP
    case 'SG':
      return RAGNAROK_TNW_OFFICIAL_STARSTONES_SGD
    default:
      return RAGNAROK_TNW_OFFICIAL_STARSTONES_THB
  }
}

function buildLocalInfo(
  region: RagnarokTnwRegionInfo,
  live: Array<{ starstones: number; priceLocal: number }>,
  oneOneItems: Array<{ starstones: number; priceLocal: number }>,
  forceFallback: boolean
): RagnarokTnwLocalInfo {
  const byStarstones = new Map<number, number>()
  const sourceByStarstones = new Map<number, string>()

  for (const row of officialLocalMap(region)) {
    byStarstones.set(row.starstones, row.priceLocal)
    sourceByStarstones.set(row.starstones, RAGNAROK_TNW_LOCAL_FALLBACK_SOURCE)
  }

  if (!forceFallback) {
    for (const row of oneOneItems) {
      byStarstones.set(row.starstones, row.priceLocal)
      sourceByStarstones.set(row.starstones, 'oneone-live-items')
    }
    for (const row of live) {
      byStarstones.set(row.starstones, row.priceLocal)
      sourceByStarstones.set(row.starstones, RAGNAROK_TNW_LOCAL_LIVE_SOURCE)
    }
  }

  const sources = new Set(sourceByStarstones.values())
  let source: 'live' | 'fallback' | 'mixed' = 'fallback'
  let label = RAGNAROK_TNW_LOCAL_FALLBACK_SOURCE
  let url = 'official-starstones-reference'

  if (sources.size === 1 && sources.has(RAGNAROK_TNW_LOCAL_LIVE_SOURCE)) {
    source = 'live'
    label = RAGNAROK_TNW_LOCAL_LIVE_SOURCE
    url = RAGNAROK_TNW_GSTORE_PIECE_LIST_BASE
  } else if (sources.size === 1 && sources.has('oneone-live-items')) {
    source = 'live'
    label = 'oneone-live-items'
    url = RAGNAROK_TNW_ONEONE_URL
  } else if (
    sources.has(RAGNAROK_TNW_LOCAL_LIVE_SOURCE) ||
    sources.has('oneone-live-items')
  ) {
    if (sources.has(RAGNAROK_TNW_LOCAL_FALLBACK_SOURCE)) {
      source = 'mixed'
      label =
        live.length > 0
          ? `${RAGNAROK_TNW_LOCAL_LIVE_SOURCE}+${RAGNAROK_TNW_LOCAL_FALLBACK_SOURCE}`
          : `oneone-live-items+${RAGNAROK_TNW_LOCAL_FALLBACK_SOURCE}`
      url =
        live.length > 0
          ? RAGNAROK_TNW_GSTORE_PIECE_LIST_BASE
          : RAGNAROK_TNW_ONEONE_URL
    } else {
      source = 'live'
      label = live.length > 0 ? RAGNAROK_TNW_LOCAL_LIVE_SOURCE : 'oneone-live-items'
      url =
        live.length > 0
          ? RAGNAROK_TNW_GSTORE_PIECE_LIST_BASE
          : RAGNAROK_TNW_ONEONE_URL
    }
  }

  return {
    byStarstones,
    sourceByStarstones,
    source,
    label,
    url,
    currency: region.currency
  }
}

function mergeStarstoneIds(
  localMap: Map<number, number>,
  usdMap: Map<number, number>
): number[] {
  const ids = new Set<number>()
  for (const id of localMap.keys()) ids.add(id)
  for (const id of usdMap.keys()) ids.add(id)
  return [...ids].sort((a, b) => a - b)
}

function buildPacks(
  region: RagnarokTnwRegionInfo,
  starstoneIds: number[],
  local: RagnarokTnwLocalInfo,
  usd: RagnarokTnwUsdInfo,
  rate: RagnarokTnwRateInfo
): RagnarokTnwPack[] {
  return starstoneIds.map((starstones) => {
    const priceLocal = local.byStarstones.has(starstones)
      ? local.byStarstones.get(starstones)!
      : null
    const priceUsd = usd.byStarstones.has(starstones)
      ? usd.byStarstones.get(starstones)!
      : null
    const priceOoc =
      priceLocal != null ? ceilOocTo2(priceLocal, rate.local_per_ooc) : null

    const priceThb = region.currency === 'THB' ? priceLocal : null
    const priceMyr = region.currency === 'MYR' ? priceLocal : null
    const priceIdr = region.currency === 'IDR' ? priceLocal : null
    const pricePhp = region.currency === 'PHP' ? priceLocal : null
    const priceSgd = region.currency === 'SGD' ? priceLocal : null

    const primaryPrice = priceLocal ?? priceUsd ?? 0
    const primaryCurrency =
      priceLocal != null
        ? region.currency
        : priceUsd != null
          ? 'USD'
          : region.currency

    const localSource =
      priceLocal != null
        ? local.sourceByStarstones.get(starstones) ?? local.label
        : null

    return {
      id: starstones,
      name: `${starstones} Starstones`,
      baseItemAmount: starstones,
      bonusItemAmount: 0,
      totalItemAmount: starstones,
      price: primaryPrice,
      currency: primaryCurrency,
      price_thb: priceThb,
      price_myr: priceMyr,
      price_idr: priceIdr,
      price_php: pricePhp,
      price_sgd: priceSgd,
      price_usd: priceUsd,
      price_ooc: priceOoc,
      prices: {
        THB: priceThb,
        MYR: priceMyr,
        IDR: priceIdr,
        PHP: pricePhp,
        SGD: priceSgd,
        USD: priceUsd,
        OOC: priceOoc
      },
      price_thb_source: region.currency === 'THB' ? localSource : null,
      price_myr_source: region.currency === 'MYR' ? localSource : null,
      price_idr_source: region.currency === 'IDR' ? localSource : null,
      price_php_source: region.currency === 'PHP' ? localSource : null,
      price_sgd_source: region.currency === 'SGD' ? localSource : null,
      price_usd_source: priceUsd != null ? usd.label : null,
      price_ooc_source:
        priceOoc != null
          ? rate.source === 'live'
            ? 'oneone-live-rate'
            : 'fallback-rate'
          : null
    }
  })
}

function fallbackRateFor(region: RagnarokTnwRegionInfo): number {
  switch (region.code) {
    case 'MY':
      return RAGNAROK_TNW_FALLBACK_MYR_PER_OOC
    case 'ID':
      return RAGNAROK_TNW_FALLBACK_IDR_PER_OOC
    case 'PH':
      return RAGNAROK_TNW_FALLBACK_PHP_PER_OOC
    case 'SG':
      return RAGNAROK_TNW_FALLBACK_SGD_PER_OOC
    default:
      return RAGNAROK_TNW_FALLBACK_THB_PER_OOC
  }
}

function makeRateInfo(
  region: RagnarokTnwRegionInfo,
  localPerOoc: number,
  source: 'live' | 'fallback'
): RagnarokTnwRateInfo {
  const formula = `OOC = ceil(${region.currency} / local_per_ooc, 2)`
  const base: RagnarokTnwRateInfo = {
    local_per_ooc: localPerOoc,
    currency: region.currency,
    source,
    url: RAGNAROK_TNW_ONEONE_URL,
    formula
  }
  if (region.currency === 'THB') base.thb_per_ooc = localPerOoc
  if (region.currency === 'MYR') base.myr_per_ooc = localPerOoc
  if (region.currency === 'IDR') base.idr_per_ooc = localPerOoc
  if (region.currency === 'PHP') base.php_per_ooc = localPerOoc
  if (region.currency === 'SGD') base.sgd_per_ooc = localPerOoc
  return base
}

/**
 * Live Ragnarok: The New World packs for a country region (TH default; MY/ID/PH/SG).
 * - Local (THB/MYR/IDR/PHP/SGD): live GNJOY get_piece_list?location= first; else official map
 * - USD: live GNJOY gstore init_data/show_product first; verified US map fallback
 * - OOC: ceil(local / live OneOne conversions[CURRENCY], 2)
 */
export async function fetchRagnarokTheNewWorldPacks(options?: {
  signal?: AbortSignal
  /** Country region (default TH / Thailand). */
  region?: RagnarokTnwRegionCode | RagnarokTnwRegionInfo
  /** Inject raw OneOne HTML for unit tests (skips live OneOne fetch). */
  html?: string
  /** Force OneOne rate fallback (tests). */
  forceRateFallback?: boolean
  /** Inject GNJOY init_data JSON (tests). */
  gnjoyInitDataJson?: unknown
  /** Inject GNJOY show_product JSON (tests). */
  gnjoyShowProductJson?: unknown
  /** Skip GNJOY USD network and use verified USD fallback (tests). */
  forceUsdFallback?: boolean
  /** Inject get_piece_list JSON keyed by productId (tests). */
  gnjoyPieceListByProductId?: Record<string, unknown>
  /** Skip get_piece_list network; use official local map (tests). */
  forceLocalFallback?: boolean
  /** @deprecated alias of forceLocalFallback */
  forceThbFallback?: boolean
}): Promise<RagnarokTnwPacksResponse> {
  const region =
    typeof options?.region === 'object' && options?.region != null
      ? options.region
      : resolveRagnarokTnwRegion(
          typeof options?.region === 'string' ? options.region : 'TH'
        )

  let html: string | null = null
  let rate: RagnarokTnwRateInfo
  const notes: string[] = []
  const forceLocalFallback =
    options?.forceLocalFallback === true || options?.forceThbFallback === true

  if (options && 'html' in options) {
    if (typeof options.html !== 'string' || options.html.length === 0) {
      throw new RagnarokTnwInvalidUpstreamResponseError('Empty HTML fixture')
    }
    html = options.html
  } else if (!options?.forceRateFallback) {
    try {
      html = await fetchOneOneHtml(options?.signal)
    } catch (error) {
      notes.push(
        `OneOne live fetch failed; using fallback ${region.currency}/OOC rate. ` +
          (error instanceof Error ? error.message : 'unknown error')
      )
      html = null
    }
  }

  if (html && !options?.forceRateFallback) {
    try {
      const localPerOoc = parseOneOneLocalPerOocFromHtml(html, region.currency)
      rate = makeRateInfo(region, localPerOoc, 'live')
    } catch (error) {
      notes.push(
        `OneOne HTML parse failed for conversions.${region.currency}; using fallback rate. ` +
          (error instanceof Error ? error.message : 'unknown error')
      )
      rate = makeRateInfo(region, fallbackRateFor(region), 'fallback')
    }
  } else {
    rate = makeRateInfo(region, fallbackRateFor(region), 'fallback')
    if (!notes.some((n) => n.includes('fallback'))) {
      notes.push(
        `Using fallback ${region.currency}/OOC rate (live OneOne rate unavailable).`
      )
    }
  }

  const oneOneItems = html ? parseOneOneStarstonesItemsFromHtml(html) : []
  if (html && oneOneItems.length === 0) {
    notes.push(
      `OneOne guest page has empty items (login-gated catalog); ${region.currency} from get_piece_list / official map.`
    )
  } else if (oneOneItems.length > 0) {
    notes.push(
      `Starstones denominations also present in OneOne items (${oneOneItems.length}).`
    )
  }

  const skipUpstreamNetwork =
    options?.forceUsdFallback === true ||
    forceLocalFallback ||
    options?.forceRateFallback === true ||
    options?.gnjoyInitDataJson != null ||
    options?.gnjoyShowProductJson != null ||
    options?.gnjoyPieceListByProductId != null ||
    options?.html != null

  const liveLocal = await fetchGnjoyLiveLocalFromPieceList({
    signal: options?.signal,
    region,
    pieceListByProductId: options?.gnjoyPieceListByProductId,
    skipNetwork: skipUpstreamNetwork && !options?.gnjoyPieceListByProductId
  })
  notes.push(...liveLocal.notes)

  if (forceLocalFallback) {
    notes.push(
      `Forced official Starstones ${region.currency} fallback map (tests/ops).`
    )
  }

  const local = buildLocalInfo(
    region,
    forceLocalFallback ? [] : liveLocal.products,
    forceLocalFallback ? [] : oneOneItems,
    forceLocalFallback
  )

  if (local.source === 'fallback') {
    notes.push(
      `${region.currency} from official Starstones reference map. ` +
        `Live get_piece_list location=${region.location} unavailable or skipped.`
    )
  }

  const liveUsd = await fetchGnjoyLiveUsdProducts({
    signal: options?.signal,
    initDataJson: options?.gnjoyInitDataJson,
    showProductJson: options?.gnjoyShowProductJson,
    skipNetwork:
      skipUpstreamNetwork &&
      options?.gnjoyInitDataJson == null &&
      options?.gnjoyShowProductJson == null
  })
  notes.push(...liveUsd.notes)

  if (options?.forceUsdFallback) {
    notes.push(
      'Forced verified GNJOY Official Top-up USD fallback map (tests/ops).'
    )
  }

  const usd = buildUsdInfo(
    options?.forceUsdFallback ? [] : liveUsd.products,
    options?.forceUsdFallback ? 'none' : liveUsd.from
  )
  if (usd.source === 'fallback') {
    notes.push(
      'USD from verified GNJOY Official Top-up map (logged-in US region, 2026-09-18). ' +
        'Live gstore product_list was empty/unavailable without login.'
    )
  }

  const starstoneIds = mergeStarstoneIds(local.byStarstones, usd.byStarstones)
  const packs = buildPacks(region, starstoneIds, local, usd, rate)

  const category: RovPackCategory & { packs: RagnarokTnwPack[] } = {
    id: 1,
    name: `Official Starstones (${region.name})`,
    status: 0,
    message: `${region.currency} = GNJOY get_piece_list location=${region.location} live or official map; USD = GNJOY live or verified US top-up; OOC = ceil(${region.currency} / live OneOne rate)`,
    packCount: packs.length,
    packs
  }

  const localPriceOf = (p: RagnarokTnwPack): number | null => {
    switch (region.currency) {
      case 'THB':
        return p.price_thb
      case 'MYR':
        return p.price_myr
      case 'IDR':
        return p.price_idr
      case 'PHP':
        return p.price_php
      case 'SGD':
        return p.price_sgd
      default:
        return null
    }
  }

  const localMeta = {
    source: local.source,
    label: local.label,
    url: local.url,
    packCount: packs.filter((p) => localPriceOf(p) != null).length,
    currency: region.currency
  }

  const sources: RagnarokTnwPacksResponse['sources'] = {
    local: local.label,
    usd: usd.label,
    ooc: rate.source === 'live' ? RAGNAROK_TNW_ONEONE_URL : 'fallback-rate',
    rate: rate.source === 'live' ? RAGNAROK_TNW_ONEONE_URL : 'fallback-rate'
  }
  if (region.currency === 'THB') sources.thb = local.label
  if (region.currency === 'MYR') sources.myr = local.label
  if (region.currency === 'IDR') sources.idr = local.label
  if (region.currency === 'PHP') sources.php = local.label
  if (region.currency === 'SGD') sources.sgd = local.label

  const regionSlug =
    region.code === 'TH'
      ? RAGNAROK_TNW_SLUG
      : `ragnarok-the-new-world-${region.code.toLowerCase()}`

  const response: RagnarokTnwPacksResponse = {
    game: {
      id: RAGNAROK_TNW_APP_ID,
      slug: regionSlug,
      name: 'Ragnarok: The New World',
      itemName: 'Starstones',
      itemIcon: ''
    },
    region: {
      code: region.code,
      name: region.name,
      currency: region.currency,
      location: region.location,
      appLanguage: region.appLanguage,
      language: region.language
    },
    categories: [category],
    summary: {
      categoryCount: 1,
      packCount: packs.length
    },
    fetchedAt: new Date().toISOString(),
    source: RAGNAROK_TNW_ONEONE_URL,
    sources,
    rate,
    usd: {
      source: usd.source,
      label: usd.label,
      url: usd.url,
      packCount: packs.filter((p) => p.price_usd != null).length
    },
    local: localMeta,
    notes
  }

  const currencyMeta = {
    source: localMeta.source,
    label: localMeta.label,
    url: localMeta.url,
    packCount: localMeta.packCount
  }
  if (region.currency === 'THB') response.thb = currencyMeta
  if (region.currency === 'MYR') response.myr = currencyMeta
  if (region.currency === 'IDR') response.idr = currencyMeta
  if (region.currency === 'PHP') response.php = currencyMeta
  if (region.currency === 'SGD') response.sgd = currencyMeta

  return response
}

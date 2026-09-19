import { createHmac, publicEncrypt, randomBytes, constants } from 'node:crypto'
import type { RovPack, RovPacksResponse } from '../types/rov'

export const CENTURY_PACKAGES_API =
  'https://cg-vip-mall-wos.centurygame.com/api/activity/packages_info'

const WEB_VERSION = 'v2.3.8'

/** Century Games vip-mall public key (store frontend). */
const PUBLIC_KEY_PEM = Buffer.from(
  'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUF0eVF1bVd0WTcyVlhSY3c4RlhKZwpwcS84SjB5U3lBaUE4S1JwRjl1STc1bHRoMzgvMkJVZ2hJZlgrcmlyZVc0RUVwNjE3UlB3c2puZDBTQXloc2NYCjBBZXhISGpkcVVRaDQzWjBNZTVadUpVUjFmaDJPRkxKZk81OTFYcC9RR2MxMC8zTnZ1R3prbFEvNm5TbkJ2WlQKaWNScVN2cDFFeUdMYzlvWWhIYVFncU0yc1ZsaThFNWx0Y1BwbVZ3b0RNUFkxSnlZdFJOMnBLVEg5cUhMc05kawpDd1ZLQ2NoYXM5UWw1eE9hck9CVFJPSG0xaXdEUFFSZHdCNFU4OFVTeXZHZURvVkp2ODM2UkNsTlRDaE1aOURaCmZpSllZVkFpWHRHd2FwQVFSeUFPbE5XamZIeHV0MGFvbHN3UW9OcUdpZzJqRkxWc1lXUzNyUU1hMlJjSlZMa1gKVHdJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==',
  'base64'
).toString('utf8')

export type CenturyGameConfig = {
  gameId: number
  slug: string
  storePath: string
  defaultName: string
  itemName: string
  categoryName: string
}

type CenturyPackage = {
  product_id?: string
  package_display_name?: string
  main_number?: number
  final_amount?: string | number
  main_content?: string
  items?: Array<{ item_number?: number }>
}

type CenturyPackagesPayload = {
  code: number
  msg?: string
  data?: {
    game_id?: string
    game_name?: string
    package_list?: {
      config_list?: CenturyPackage[]
    }
  }
}

export class CenturyUpstreamUnavailableError extends Error {
  constructor(message = 'Century Games upstream unavailable') {
    super(message)
    this.name = 'CenturyUpstreamUnavailableError'
  }
}

export class CenturyInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Century Games upstream response') {
    super(message)
    this.name = 'CenturyInvalidUpstreamResponseError'
  }
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

function storeUrlFor(config: CenturyGameConfig): string {
  return `https://store.centurygames.com/${config.storePath}`
}

function packName(pack: CenturyPackage, index: number, itemName: string): string {
  const baseItemAmount = Number(pack.main_number ?? 0)
  const displayName = (pack.package_display_name ?? '').trim()
  return (
    displayName ||
    (baseItemAmount > 0
      ? `${itemName} ${baseItemAmount}`
      : pack.product_id || `Pack ${index + 1}`)
  )
}

function bonusAmount(pack: CenturyPackage): number {
  return (pack.items ?? []).reduce(
    (sum, item) => sum + Number(item.item_number ?? 0),
    0
  )
}

function mapPack(
  pack: CenturyPackage,
  index: number,
  itemName: string,
  currency: string
): RovPack {
  const baseItemAmount = Number(pack.main_number ?? 0)
  const bonusItemAmount = bonusAmount(pack)

  return {
    id: index + 1,
    name: packName(pack, index, itemName),
    baseItemAmount,
    bonusItemAmount,
    totalItemAmount: baseItemAmount + bonusItemAmount,
    price: Number(pack.final_amount ?? 0),
    currency
  }
}

function mapDualPack(
  pack: CenturyPackage,
  index: number,
  itemName: string,
  priceThb: number,
  priceUsd: number
): RovPack {
  const baseItemAmount = Number(pack.main_number ?? 0)
  const bonusItemAmount = bonusAmount(pack)

  return {
    id: index + 1,
    name: packName(pack, index, itemName),
    baseItemAmount,
    bonusItemAmount,
    totalItemAmount: baseItemAmount + bonusItemAmount,
    price: priceThb,
    currency: 'THB',
    price_thb: priceThb,
    price_usd: priceUsd,
    prices: { THB: priceThb, USD: priceUsd },
    price_thb_source: 'official-store',
    price_usd_source: 'official-store'
  }
}

async function fetchPackagesPayload(
  config: CenturyGameConfig,
  currency: string,
  signal: AbortSignal,
  fixture?: CenturyPackagesPayload
): Promise<CenturyPackagesPayload> {
  if (fixture) return fixture

  const storeUrl = storeUrlFor(config)
  const { aesKey, authKey } = createAuthSession()
  const unsigned = {
    game_id: String(config.gameId),
    currency,
    language_code: 'EN',
    os: 'pc',
    display_all: '1',
    ts: String(Date.now()),
    webVersion: WEB_VERSION
  }
  const signed = signParams(unsigned, aesKey)
  const url = `${CENTURY_PACKAGES_API}?${new URLSearchParams(signed).toString()}`

  let response: Response
  try {
    response = await fetch(url, {
      signal,
      headers: {
        Accept: 'application/json',
        Origin: 'https://store.centurygames.com',
        Referer: storeUrl,
        'Auth-Key': authKey,
        'Request-Path': storeUrl,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
  } catch {
    throw new CenturyUpstreamUnavailableError()
  }

  if (!response.ok) {
    throw new CenturyUpstreamUnavailableError()
  }

  try {
    return (await response.json()) as CenturyPackagesPayload
  } catch {
    throw new CenturyInvalidUpstreamResponseError()
  }
}

function requireConfigList(
  payload: CenturyPackagesPayload,
  label: string
): CenturyPackage[] {
  const configList = payload.data?.package_list?.config_list
  if (payload.code !== 1 || !Array.isArray(configList) || configList.length === 0) {
    throw new CenturyInvalidUpstreamResponseError(
      payload.msg || `Empty Century Games package list (${label})`
    )
  }
  return configList
}

/**
 * Single-currency Century packages_info fetch.
 * Used by 24buym secondary USD lookup (currency: 'USD') and legacy callers.
 */
export async function fetchCenturyGamesOfficialPacks(
  config: CenturyGameConfig,
  options?: {
    signal?: AbortSignal
    currency?: string
    /** Inject packages_info payload for unit tests. */
    packagesPayload?: CenturyPackagesPayload
  }
): Promise<RovPacksResponse> {
  const currency = options?.currency ?? 'USD'
  const signal = options?.signal ?? AbortSignal.timeout(15_000)
  const payload = await fetchPackagesPayload(
    config,
    currency,
    signal,
    options?.packagesPayload
  )
  const configList = requireConfigList(payload, currency)

  // Keep USD label for USD fetches (24buym index filters currency === 'USD').
  // For other currencies, label matches the requested currency amount.
  const packCurrency = currency.toUpperCase() === 'USD' ? 'USD' : currency.toUpperCase()
  const packs = configList.map((pack, index) =>
    mapPack(pack, index, config.itemName, packCurrency)
  )
  const itemIcon = configList[0]?.main_content ?? ''

  return {
    game: {
      id: config.gameId,
      slug: config.slug,
      name: payload.data?.game_name || config.defaultName,
      itemName: config.itemName,
      itemIcon
    },
    categories: [
      {
        id: config.gameId,
        name: config.categoryName,
        status: 0,
        message: '',
        packCount: packs.length,
        packs
      }
    ],
    summary: {
      categoryCount: 1,
      packCount: packs.length
    },
    fetchedAt: new Date().toISOString(),
    source: CENTURY_PACKAGES_API
  }
}

/**
 * Dual-currency Century packs: live packages_info USD + THB, merge by product_id.
 * Primary price is THB. Unmatched product_ids are omitted (no FX / no invent).
 * Verified live for Whiteout Survival (game_id 20121); Kingshot remains USD-only API.
 */
export async function fetchCenturyGamesDualCurrencyPacks(
  config: CenturyGameConfig,
  options?: {
    signal?: AbortSignal
    packagesPayloadUsd?: CenturyPackagesPayload
    packagesPayloadThb?: CenturyPackagesPayload
  }
): Promise<RovPacksResponse> {
  const signal = options?.signal ?? AbortSignal.timeout(25_000)
  const storeUrl = storeUrlFor(config)

  const [usdPayload, thbPayload] = await Promise.all([
    fetchPackagesPayload(config, 'USD', signal, options?.packagesPayloadUsd),
    fetchPackagesPayload(config, 'THB', signal, options?.packagesPayloadThb)
  ])

  const usdList = requireConfigList(usdPayload, 'USD')
  const thbList = requireConfigList(thbPayload, 'THB')

  const thbByProductId = new Map<string, number>()
  for (const pack of thbList) {
    const pid = (pack.product_id ?? '').trim()
    if (!pid) continue
    const amount = Number(pack.final_amount ?? NaN)
    if (!Number.isFinite(amount)) continue
    if (!thbByProductId.has(pid)) thbByProductId.set(pid, amount)
  }

  if (thbByProductId.size === 0) {
    throw new CenturyInvalidUpstreamResponseError(
      'Century THB packages_info had no product_id prices'
    )
  }

  const packs: RovPack[] = []
  let index = 0
  for (const pack of usdList) {
    const pid = (pack.product_id ?? '').trim()
    if (!pid) continue
    const priceUsd = Number(pack.final_amount ?? NaN)
    if (!Number.isFinite(priceUsd)) continue
    const priceThb = thbByProductId.get(pid)
    if (priceThb === undefined) continue
    index += 1
    packs.push(mapDualPack(pack, index - 1, config.itemName, priceThb, priceUsd))
  }

  if (packs.length === 0) {
    throw new CenturyInvalidUpstreamResponseError(
      'No Century USD packs matched THB by product_id'
    )
  }

  const itemIcon = usdList[0]?.main_content ?? ''

  return {
    game: {
      id: config.gameId,
      slug: config.slug,
      name: usdPayload.data?.game_name || config.defaultName,
      itemName: config.itemName,
      itemIcon
    },
    categories: [
      {
        id: config.gameId,
        name: config.categoryName,
        status: 0,
        message:
          `Official store USD ${config.itemName} + official store THB (merged by product_id)`,
        packCount: packs.length,
        packs
      }
    ],
    summary: {
      categoryCount: 1,
      packCount: packs.length
    },
    fetchedAt: new Date().toISOString(),
    source: storeUrl,
    sources: {
      thb: storeUrl,
      usd: storeUrl
    },
    notes: [
      'USD + THB amounts from live Century Games packages_info (currency=USD and currency=THB).',
      'Packs matched by product_id; tiers missing on either side are omitted.',
      'Live-fetch only; empty dual merge → error (no static catalog / no FX).'
    ]
  }
}

import type { RovPacksResponse } from '../types/rov'
import {
  APPSTORE_FULL_IAP_NOTE,
  APPSTORE_IAP_API_BASE,
  fetchAppStoreFullIap,
  type AppStoreFullIapRow
} from './appstore-full-iap'

/**
 * CookieRun Classic (Devsisters Corp., App Store id 6759596824, bundle com.devsisters.crg).
 * Official title on the App Store: "CookieRun Classic" (the 2026 relaunch of the original CookieRun, not OvenBreak/Kingdom).
 * Devsisters runs no top-up webshop for it: its official support page says all purchases are processed by Apple / Google Play
 * (the CookieRun Store sells merchandise only). So:
 *   THB = official Apple App Store TH (full in-app purchase list via the App Store web catalog API),
 *   USD = App Store US, per item fallback KH / LA / MM (USD storefronts), matched by Apple item id / offerName
 *   (Devsisters' own product id, crg.dev.*). No FX, no resellers, no hardcoded prices or amounts.
 * If the catalog API is unavailable, the TH + US product pages (top-10 IAP list) are parsed and merged by name.
 */

export const COOKIERUN_CLASSIC_APP_ID = 6759596824
export const COOKIERUN_CLASSIC_SLUG = 'cookierun-classic'
export const COOKIERUN_CLASSIC_APPSTORE_TH_URL =
  'https://apps.apple.com/th/app/cookierun-classic/id6759596824'
export const COOKIERUN_CLASSIC_APPSTORE_US_URL =
  'https://apps.apple.com/us/app/cookierun-classic/id6759596824'
export const COOKIERUN_CLASSIC_OFFICIAL_TITLE = 'CookieRun Classic'
export const COOKIERUN_CLASSIC_PUBLISHER = 'Devsisters Corp.'
export const COOKIERUN_CLASSIC_SUPPORT_IAP_URL =
  'https://cs-cookierunclassic.devsisters.com/hc/en-us/articles/59357257042073-Who-processes-in-app-purchases'
const USD_CCS = ['us', 'kh', 'la', 'mm'] as const

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class CookieRunClassicAppStoreUpstreamUnavailableError extends Error {
  constructor(message = 'Cookie Run Classic App Store upstream unavailable') {
    super(message)
    this.name = 'CookieRunClassicAppStoreUpstreamUnavailableError'
  }
}

export class CookieRunClassicAppStoreInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Cookie Run Classic App Store response') {
    super(message)
    this.name = 'CookieRunClassicAppStoreInvalidUpstreamResponseError'
  }
}

type NamedPrice = {
  name: string
  price: number
}

type MergedIap = {
  name: string
  priceThb: number | null
  priceUsd: number | null
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
 * Prefer embedded App Store JSON textPairs / items_V3 under
 * shelfMapping.information → title "In-App Purchases".
 * Falls back to HTML text-pair scraping when JSON is absent.
 */
export function parseCookieRunClassicIapFromHtml(
  html: string,
  currency: 'THB' | 'USD'
): NamedPrice[] {
  const fromJson = parseFromEmbeddedJson(html, currency)
  if (fromJson.length > 0) return dedupeByName(fromJson)

  const fromHtml = parseFromHtmlText(html, currency)
  return dedupeByName(fromHtml)
}

/** Keep first occurrence per offer name (App Store often lists duplicate names). */
function dedupeByName(packs: NamedPrice[]): NamedPrice[] {
  const seen = new Set<string>()
  const out: NamedPrice[] = []
  for (const pack of packs) {
    const key = pack.name.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(pack)
  }
  return out
}

function parseFromEmbeddedJson(
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
  const seenPair = new Set<string>()
  for (const [leading, trailing] of pairs) {
    const name = String(leading ?? '').trim()
    if (!name) continue
    const price =
      currency === 'THB'
        ? parseThbAmount(String(trailing ?? ''))
        : parseUsdAmount(String(trailing ?? ''))
    if (price === null) continue
    const pairKey = name.toLowerCase() + '|' + price
    if (seenPair.has(pairKey)) continue
    seenPair.add(pairKey)
    out.push({ name, price })
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

function parseFromHtmlText(
  html: string,
  currency: 'THB' | 'USD'
): NamedPrice[] {
  const out: NamedPrice[] = []
  if (currency === 'THB') {
    const re =
      /([A-Za-z0-9][^<\n]{0,80}?)[\s\S]{0,120}?(?:\u0e3f|THB|&#3647;)\s*([\d,]+(?:\.\d+)?)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      const name = m[1].replace(/\s+/g, ' ').trim()
      const thb = parseThbAmount(m[2])
      if (!name || thb === null) continue
      if (!/crystal|package|pass|bundle|treasure|soul|key/i.test(name)) continue
      out.push({ name, price: thb })
    }
    return out
  }

  const re =
    /([A-Za-z0-9][^<\n]{0,80}?)[\s\S]{0,80}?\$\s*([\d,]+(?:\.\d+)?)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const name = m[1].replace(/\s+/g, ' ').trim()
    const usd = parseUsdAmount(m[2])
    if (!name || usd === null) continue
    if (!/crystal|package|pass|bundle|treasure|soul|key/i.test(name)) continue
    out.push({ name, price: usd })
  }
  return out
}

export function mergeCookieRunClassicIap(
  thbPacks: NamedPrice[],
  usdPacks: NamedPrice[]
): MergedIap[] {
  const byName = new Map<string, MergedIap>()

  for (const pack of thbPacks) {
    const key = pack.name.trim().toLowerCase()
    const existing = byName.get(key)
    if (existing) {
      if (existing.priceThb === null) existing.priceThb = pack.price
      continue
    }
    byName.set(key, {
      name: pack.name.trim(),
      priceThb: pack.price,
      priceUsd: null
    })
  }

  for (const pack of usdPacks) {
    const key = pack.name.trim().toLowerCase()
    const existing = byName.get(key)
    if (existing) {
      if (existing.priceUsd === null) existing.priceUsd = pack.price
      continue
    }
    byName.set(key, {
      name: pack.name.trim(),
      priceThb: null,
      priceUsd: pack.price
    })
  }

  return [...byName.values()]
}


export type CrcKind = 'currency' | 'pass' | 'bundle'
/** Classify by Devsisters' product id (Apple offerName), else by name. */
export function crcKind(productId: string | null, name: string): CrcKind {
  const pid = productId ?? ''
  if (/\.crx\.crystal\d+$/i.test(pid) || (!pid && /^\s*[\d,]+\s+crystals?\s*$/i.test(name))) return 'currency'
  if (/pass/i.test(pid) || /\bpass\b/i.test(name)) return 'pass'
  return 'bundle'
}

/** Crystal amount from the official item name ("120 Crystals"). */
export function crcCrystals(name: string): number | null {
  const m = name.match(/^\s*([\d,]+)\s+crystals?\s*$/i)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

export type CrcContent = { item: string; amount: number | null }
/**
 * Contents from Apple's official item description, only when it lists them
 * ("Package Containing 4 EXP-Elixir and other items", "Package containing X Cookie and Pet").
 * Titles such as "Pine Monk Cookie's Soulstone Package" do not list contents -> null.
 */
export function crcContents(description: string | undefined | null): CrcContent[] | null {
  const d = (description ?? '').replace(/\s+/g, ' ').trim()
  const m = d.match(/^(?:a\s+)?(?:special\s+)?package\s+(?:containing|including)\s+(.+)$/i)
  if (!m) return null
  const out: CrcContent[] = []
  for (const raw of m[1].split(/\s*,\s*|\s+and\s+/i)) {
    const part = raw.replace(/\.$/, '').trim()
    if (!part) continue
    if (/^(?:various\s+)?other items$/i.test(part)) {
      out.push({ item: 'other items (not itemised in the official listing)', amount: null })
      continue
    }
    const n = part.match(/^([\d,]+)\s+(.+)$/)
    if (n) out.push({ item: n[2], amount: Number(n[1].replace(/,/g, '')) })
    else out.push({ item: part, amount: null })
  }
  return out.length ? out : null
}

const hasThai = (s: string | undefined | null) => !!s && /[\u0E00-\u0E7F]/.test(s)


async function fetchUsdFor(
  need: AppStoreFullIapRow[],
  signal?: AbortSignal
): Promise<{ match: Map<string, { row: AppStoreFullIapRow; cc: string }>; reasons: string[] }> {
  const match = new Map<string, { row: AppStoreFullIapRow; cc: string }>()
  const reasons: string[] = []
  let pending = need.slice()
  // Sequential: Apple rate-limits bursts. KH/LA/MM only for items still missing.
  for (const cc of USD_CCS) {
    if (!pending.length) break
    let rows: AppStoreFullIapRow[]
    try {
      rows = (await fetchAppStoreFullIap(cc, String(COOKIERUN_CLASSIC_APP_ID), cc === 'us' ? 'en-US' : null, signal)).filter(
        (r) => r.currency === 'USD'
      )
    } catch (e) {
      reasons.push(`${cc.toUpperCase()}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    const byId = new Map(rows.map((r) => [r.id, r]))
    const byOffer = new Map(rows.filter((r) => r.offerName).map((r) => [r.offerName!, r]))
    const still: AppStoreFullIapRow[] = []
    for (const t of pending) {
      const u = byId.get(t.id) ?? (t.offerName ? byOffer.get(t.offerName) : undefined)
      if (u) match.set(t.id, { row: u, cc })
      else still.push(t)
    }
    if (still.length) reasons.push(`${cc.toUpperCase()}: ${still.length} item(s) not listed`)
    pending = still
  }
  return { match, reasons }
}

function baseFields(kind: CrcKind, name: string) {
  if (kind === 'currency') {
    const n = crcCrystals(name)
    return {
      baseItemAmount: n,
      bonusItemAmount: null,
      totalItemAmount: n,
      ...(n === null ? { base_null_reason: 'Crystal amount not stated in the official item name' } : {}),
      bonus_null_reason: 'Official listing states only the Crystal amount; no separate bonus is published',
      bonus_available: false
    }
  }
  return {
    baseItemAmount: null,
    bonusItemAmount: null,
    totalItemAmount: null,
    base_null_reason: kind === 'pass' ? 'Pass item; not a plain Crystals amount' : 'Package/bundle item; not a plain Crystals amount',
    bonus_null_reason: 'No currency bonus on pass/package items',
    bonus_available: false
  }
}

function contentsFields(kind: CrcKind, name: string, description: string | null) {
  if (kind === 'currency') {
    const n = crcCrystals(name)
    return n !== null
      ? { contents: [{ item: 'Crystals', amount: n }] }
      : { contents: null, contents_null_reason: 'Crystal amount not stated officially' }
  }
  const c = crcContents(description)
  return c
    ? { contents: c }
    : {
        contents: null,
        contents_null_reason: 'Apple official listing gives only the package title, not an itemised contents list (shown in-game only)'
      }
}

const CAT_NAMES: Record<CrcKind, string> = {
  currency: 'Crystals (App Store)',
  pass: 'Passes (App Store)',
  bundle: 'Packages & Bundles (App Store)'
}

function buildCategories(packs: any[], message: string) {
  const byPrice = (a: any, b: any) =>
    (a.price_thb ?? Infinity) - (b.price_thb ?? Infinity) ||
    (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) ||
    String(a.product_id ?? a.name).localeCompare(String(b.product_id ?? b.name))
  let n = 0
  return (['currency', 'pass', 'bundle'] as CrcKind[])
    .map((k, i) => ({ id: i + 1, name: CAT_NAMES[k], packs: packs.filter((p) => p.kind === k) }))
    .filter((c) => c.packs.length)
    .map((c) => {
      c.packs.sort(byPrice)
      for (const p of c.packs) if (!p.id) p.id = ++n
      return { ...c, status: 0, message, packCount: c.packs.length }
    })
}

function envelope(categories: any[], extra: Record<string, unknown>, notes: string[]): RovPacksResponse {
  return {
    game: {
      id: COOKIERUN_CLASSIC_APP_ID,
      slug: COOKIERUN_CLASSIC_SLUG,
      name: 'Cookie Run Classic',
      itemName: 'Crystals',
      itemIcon: ''
    },
    official_title: COOKIERUN_CLASSIC_OFFICIAL_TITLE,
    publisher: COOKIERUN_CLASSIC_PUBLISHER,
    categories,
    summary: {
      categoryCount: categories.length,
      packCount: categories.reduce((s: number, c: any) => s + c.packs.length, 0)
    },
    fetchedAt: new Date().toISOString(),
    ...extra,
    notes
  } as unknown as RovPacksResponse
}

const COMMON_NOTES = [
  `Devsisters has no top-up webshop for CookieRun Classic: its support page says all purchases are processed by Apple / Google Play (${COOKIERUN_CLASSIC_SUPPORT_IAP_URL}). The CookieRun Store sells merchandise only.`,
  'Crystals: base = amount in the official item name ("N Crystals"); bonus null (none published); total = base.',
  'Passes and packages are item_pack:true. contents are parsed only from Apple\'s official item description when it lists items; otherwise null with a reason. Unofficial wiki/reseller figures are never used.',
  'Apple shows this app in English only (its only listed language), including on the TH storefront, so name_th / description_th are null with a reason unless Apple returns Thai text.'
]

/** Primary: full IAP list (catalog API) TH + USD storefronts, matched by Apple item id / offerName. */
async function fromCatalogApi(signal?: AbortSignal): Promise<RovPacksResponse> {
  const th = (await fetchAppStoreFullIap('th', String(COOKIERUN_CLASSIC_APP_ID), 'th', signal)).filter((r) => r.currency === 'THB')
  if (!th.length) throw new Error('App Store TH returned no THB rows')
  const seen = new Set<string>()
  const uniq = th.filter((r) => {
    const k = r.offerName || r.id
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const usd = await fetchUsdFor(uniq, signal)
  const usdCcs = new Set<string>()
  const packs = uniq.map((t) => {
    const m = usd.match.get(t.id)
    if (m) usdCcs.add(m.cc)
    const nameEn = m?.row.name ?? (hasThai(t.name) ? null : t.name) ?? t.name
    const kind = crcKind(t.offerName ?? null, nameEn)
    const descEn = (m?.row.description || (!hasThai(t.description) ? t.description : '') || '').trim() || null
    const pack: any = {
      id: 0,
      name: nameEn,
      name_th: hasThai(t.name) ? t.name : null,
      product_id: t.offerName ?? null,
      apple_item_id: t.id,
      kind,
      item_pack: kind !== 'currency',
      ...baseFields(kind, nameEn),
      price: t.price,
      currency: 'THB',
      prices: { THB: t.price, USD: m?.row.price ?? null },
      price_thb: t.price,
      price_thb_source: `apple-app-store-th (${t.offerName ? `offerName=${t.offerName}, ` : ''}item ${t.id})`,
      price_usd: m?.row.price ?? null,
      price_usd_source: m ? `apple-app-store-${m.cc} (item ${m.row.id})` : null,
      description_en: descEn,
      description_th: hasThai(t.description) ? t.description : null,
      ...contentsFields(kind, nameEn, descEn),
      family_shareable: t.familyShareable ?? null
    }
    if (!pack.name_th) pack.name_th_null_reason = 'Apple TH lists this item in English only (app language: English)'
    if (!pack.description_th) pack.description_th_null_reason = 'Apple TH shows this item\'s description in English only (app language: English)'
    if (!descEn) pack.description_en_null_reason = 'No description on Apple for this item'
    if (!m)
      pack.price_usd_null_reason =
        'Not found on App Store US / KH / LA / MM by item id or offerName' + (usd.reasons.length ? ` (${usd.reasons.join('; ')})` : '') + '; no FX conversion'
    return pack
  })
  const categories = buildCategories(packs, 'Live App Store full in-app purchase list (no fallback catalog)')
  const usdList = [...usdCcs]
  const notes = [
    'THB = official Apple App Store TH (full in-app purchase list). USD = App Store US; items missing there fall back to KH / LA / MM (USD storefronts). Matched by Apple item id / offerName (Devsisters product id). No FX conversion, no resellers, no hardcoded prices.',
    ...COMMON_NOTES
  ]
  if (usd.reasons.length) notes.push('USD lookup: ' + usd.reasons.join('; '))
  notes.push(APPSTORE_FULL_IAP_NOTE)
  const api = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${COOKIERUN_CLASSIC_APP_ID}/top-in-apps`
  return envelope(
    categories,
    {
      source: api('th'),
      sources: { thb: COOKIERUN_CLASSIC_APPSTORE_TH_URL, usd: COOKIERUN_CLASSIC_APPSTORE_US_URL },
      source_details: {
        thb_api: api('th'),
        usd_api: (usdList.length ? usdList : ['us']).map(api),
        usd_storefronts: usdList,
        devsisters_iap_policy: COOKIERUN_CLASSIC_SUPPORT_IAP_URL
      },
      source_mode: 'appstore-catalog-api'
    },
    notes
  )
}

/** Fallback: TH + US product pages (Apple shows the top IAPs only), merged by offer name. */
async function fromProductPages(options?: { signal?: AbortSignal; htmlTh?: string; htmlUs?: string }, apiReason?: string) {
  let htmlTh: string
  if (options && 'htmlTh' in options) {
    if (typeof options.htmlTh !== 'string' || options.htmlTh.length === 0)
      throw new CookieRunClassicAppStoreInvalidUpstreamResponseError('Empty TH HTML fixture')
    htmlTh = options.htmlTh
  } else {
    htmlTh = await fetchAppStoreHtml(COOKIERUN_CLASSIC_APPSTORE_TH_URL, 'th-TH,th;q=0.9,en;q=0.8', options?.signal)
  }
  const thbPacks = parseCookieRunClassicIapFromHtml(htmlTh, 'THB')
  if (thbPacks.length === 0)
    throw new CookieRunClassicAppStoreInvalidUpstreamResponseError('In-App Purchases section not found or empty on App Store TH')

  let usdPacks: NamedPrice[] = []
  let usdReason: string | null = null
  try {
    let htmlUs: string
    if (options && 'htmlUs' in options) {
      if (typeof options.htmlUs !== 'string' || options.htmlUs.length === 0) throw new Error('Empty US HTML fixture')
      htmlUs = options.htmlUs
    } else {
      htmlUs = await fetchAppStoreHtml(COOKIERUN_CLASSIC_APPSTORE_US_URL, 'en-US,en;q=0.9', options?.signal)
    }
    usdPacks = parseCookieRunClassicIapFromHtml(htmlUs, 'USD')
    if (!usdPacks.length) usdReason = 'App Store US page has no parseable In-App Purchases list'
  } catch (e) {
    usdReason = 'App Store US page unavailable: ' + (e instanceof Error ? e.message : String(e))
  }

  const merged = mergeCookieRunClassicIap(thbPacks, usdPacks)
  const packs = merged.map((p) => {
    const kind = crcKind(null, p.name)
    const pack: any = {
      id: packNameToId(p.name),
      name: p.name,
      name_th: null,
      name_th_null_reason: 'Apple lists this item in English only (app language: English)',
      product_id: null,
      kind,
      item_pack: kind !== 'currency',
      ...baseFields(kind, p.name),
      price: p.priceThb ?? p.priceUsd ?? 0,
      currency: p.priceThb !== null ? 'THB' : 'USD',
      ...(p.priceThb !== null ? { price_thb: p.priceThb, price_thb_source: 'appstore' } : { price_thb: null }),
      price_usd: p.priceUsd,
      prices: { THB: p.priceThb, USD: p.priceUsd },
      price_usd_source: p.priceUsd !== null ? 'appstore' : null,
      description_en: null,
      description_en_null_reason: 'App Store product page shows only names and prices (catalog API unavailable)',
      description_th: null,
      description_th_null_reason: 'App Store product page shows only names and prices; app is English only',
      ...(kind === 'currency'
        ? contentsFields(kind, p.name, null)
        : { contents: null, contents_null_reason: 'App Store product page shows only names and prices (catalog API unavailable)' })
    }
    if (p.priceThb === null) pack.price_thb_null_reason = 'Not in the App Store TH page IAP list (page shows top items only)'
    if (p.priceUsd === null)
      pack.price_usd_null_reason = (usdReason ?? 'Not in the App Store US page IAP list (page shows top items only)') + '; no FX conversion'
    return pack
  })
  const sorted = packs.sort(
    (a, b) =>
      (a.price_thb ?? Infinity) - (b.price_thb ?? Infinity) ||
      (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) ||
      a.name.localeCompare(b.name)
  )
  const categories = [
    {
      id: 1,
      name: 'App Store In-App Purchases (product-page fallback)',
      status: 0,
      message: 'Live IAP list from App Store TH + US product pages (top items only; merged by offer name)',
      packCount: sorted.length,
      packs: sorted
    }
  ]
  const notes = [
    'Fallback mode: App Store catalog API unavailable' + (apiReason ? ` (${apiReason})` : '') + '; THB/USD read from the App Store TH / US product pages, which list only the top in-app purchases, merged by offer name (duplicates collapsed).',
    ...COMMON_NOTES
  ]
  if (usdReason) notes.push(usdReason)
  return envelope(
    categories,
    {
      source: COOKIERUN_CLASSIC_APPSTORE_TH_URL,
      sources: { thb: COOKIERUN_CLASSIC_APPSTORE_TH_URL, usd: COOKIERUN_CLASSIC_APPSTORE_US_URL },
      source_mode: 'appstore-product-page'
    },
    notes
  )
}

async function fetchAppStoreHtml(url: string, acceptLanguage: string, signal?: AbortSignal): Promise<string> {
  let response: Response
  try {
    response = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(25_000),
      headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': acceptLanguage, 'User-Agent': BROWSER_UA }
    })
  } catch (error) {
    throw new CookieRunClassicAppStoreUpstreamUnavailableError(error instanceof Error ? error.message : 'network error')
  }
  if (!response.ok) throw new CookieRunClassicAppStoreUpstreamUnavailableError('HTTP ' + response.status + ' for ' + url)
  try {
    return await response.text()
  } catch (error) {
    throw new CookieRunClassicAppStoreUpstreamUnavailableError(error instanceof Error ? error.message : 'failed to read body')
  }
}

/**
 * Live CookieRun Classic packs. Primary: App Store catalog API (full list, TH + USD storefronts by item id).
 * Fallback: TH + US product pages. Never hardcodes prices; both down -> throws (route returns 502).
 * htmlTh / htmlUs inject page HTML for unit tests (skips the catalog API).
 */
export async function fetchCookieRunClassicAppStorePacks(options?: {
  signal?: AbortSignal
  htmlTh?: string
  htmlUs?: string
}): Promise<RovPacksResponse> {
  if (options && ('htmlTh' in options || 'htmlUs' in options)) return fromProductPages(options)
  let apiReason: string
  try {
    return await fromCatalogApi(options?.signal)
  } catch (e) {
    apiReason = e instanceof Error ? e.message : String(e)
  }
  return fromProductPages(options, apiReason)
}

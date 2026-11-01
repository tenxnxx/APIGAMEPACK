import type { RovPacksResponse } from '../types/rov'
import { APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, fetchAppStoreFullIap, type AppStoreFullIapRow } from './appstore-full-iap'

/**
 * VAMPIR (Netmarble, game code "thered"; App Store id 6738163891, Google Play com.netmarble.thered;
 * global launch incl. Thailand 2026-10-28, promoted on netmarble.in.th).
 *
 * Sources (official only, live on every request, no FX / resellers / hardcoded prices or amounts):
 *  1. Netmarble's official VAMPIR Web Shop (vampirshop.netmarble.com), public product API
 *     /api/shop/products?country=TH (THB) and country=US (USD), locale TH / EN for names. Sells Diamonds.
 *  2. Apple App Store TH full in-app purchase list (Thai names / descriptions) for everything the Web Shop does not
 *     sell (VAMPIR packages, App Store-only Diamonds). USD from App Store US, else KH / LA / MM, matched by Apple
 *     item id / offerName (Netmarble product id).
 */

export const VAMPIR_APP_ID = 6738163891
export const VAMPIR_SLUG = 'vampir'
export const VAMPIR_OFFICIAL_TITLE = 'VAMPIR'
export const VAMPIR_PUBLISHER = 'Netmarble'
export const VAMPIR_WEBSHOP_URL = 'https://vampirshop.netmarble.com'
export const VAMPIR_WEBSHOP_TH_URL = 'https://vampirshop.netmarble.com/th'
export const VAMPIR_WEBSHOP_PRODUCTS_API = 'https://vampirshop.netmarble.com/api/shop/products'
export const VAMPIR_APPSTORE_TH_URL = 'https://apps.apple.com/th/app/vampir/id6738163891'
export const VAMPIR_APPSTORE_US_URL = 'https://apps.apple.com/us/app/vampir/id6738163891'
const USD_CCS = ['us', 'kh', 'la', 'mm'] as const
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class VampirUpstreamUnavailableError extends Error {
  constructor(message = 'VAMPIR upstream unavailable') {
    super(message)
    this.name = 'VampirUpstreamUnavailableError'
  }
}
export class VampirInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid VAMPIR upstream response') {
    super(message)
    this.name = 'VampirInvalidUpstreamResponseError'
  }
}

export type VampirWebshopProduct = {
  productCode: string
  productName: string
  amount: number
  currencyCode: string
  dispAmount?: string
  productDetailDescription?: string | null
  productImageURL?: string | null
  maxQuantityPerOrder?: number | null
  startSaleDatetime?: number | null
  endSaleDatetime?: number | null
  tags?: Record<string, unknown> | null
}

const hasThai = (s: string | null | undefined) => !!s && /[\u0E00-\u0E7F]/.test(s)

/** Diamond amount from an official name: "7,200 Diamonds" / "7,200 ไดอา". */
export function vampirDiamondAmount(name: string | null | undefined): number | null {
  const m = (name ?? '').match(/^\s*([\d,]+)\s*(?:diamonds?|ไดอา(?:มอนด์)?)\s*$/i)
  return m ? Number(m[1].replace(/,/g, '')) : null
}

export type VampirKind = 'diamonds' | 'package'
export function vampirKind(productId: string | null, nameEn: string | null, nameTh: string | null): VampirKind {
  if (/_dia_\d+$/i.test(productId ?? '') || vampirDiamondAmount(nameEn) !== null || vampirDiamondAmount(nameTh) !== null) return 'diamonds'
  return 'package'
}

/** GET the official Web Shop product list (public, no login). */
export async function fetchVampirWebshopProducts(country: 'TH' | 'US', locale: 'TH' | 'EN', signal?: AbortSignal): Promise<VampirWebshopProduct[]> {
  const url = `${VAMPIR_WEBSHOP_PRODUCTS_API}?country=${country}&locale=${locale}`
  let res: Response
  try {
    res = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(20_000),
      headers: { Accept: 'application/json, text/plain, */*', Referer: `${VAMPIR_WEBSHOP_URL}/${locale.toLowerCase()}`, 'User-Agent': UA }
    })
  } catch (e) {
    throw new VampirUpstreamUnavailableError(`Web Shop ${country}/${locale}: ${e instanceof Error ? e.message : 'network error'}`)
  }
  if (!res.ok) throw new VampirUpstreamUnavailableError(`Web Shop ${country}/${locale}: HTTP ${res.status}`)
  let body: any
  try {
    body = await res.json()
  } catch {
    throw new VampirInvalidUpstreamResponseError(`Web Shop ${country}/${locale}: non-JSON response`)
  }
  if (body?.errorCode !== 0 || !Array.isArray(body?.resultData))
    throw new VampirInvalidUpstreamResponseError(`Web Shop ${country}/${locale}: errorCode ${body?.errorCode ?? '?'}`)
  return (body.resultData as any[]).filter(
    (p) => p && typeof p.productCode === 'string' && typeof p.productName === 'string' && typeof p.amount === 'number' && typeof p.currencyCode === 'string'
  )
}

const settle = async <T>(p: Promise<T>): Promise<{ ok: T; err: null } | { ok: null; err: string }> => {
  try {
    return { ok: await p, err: null }
  } catch (e) {
    return { ok: null, err: e instanceof Error ? e.message : String(e) }
  }
}

type Usd = { row: AppStoreFullIapRow; cc: string }
async function appStoreUsd(need: AppStoreFullIapRow[], usRows: AppStoreFullIapRow[] | null, usErr: string | null, signal?: AbortSignal) {
  const match = new Map<string, Usd>()
  const reasons: string[] = []
  let pending = need.slice()
  for (const cc of USD_CCS) {
    if (!pending.length) break
    let rows: AppStoreFullIapRow[]
    if (cc === 'us') {
      if (!usRows) {
        reasons.push(`US: ${usErr ?? 'unavailable'}`)
        continue
      }
      rows = usRows
    } else {
      try {
        rows = (await fetchAppStoreFullIap(cc, String(VAMPIR_APP_ID), null, signal)).filter((r) => r.currency === 'USD')
      } catch (e) {
        reasons.push(`${cc.toUpperCase()}: ${e instanceof Error ? e.message : String(e)}`)
        continue
      }
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

const NO_FX = '; no FX conversion'

function diamondAmounts(base: number | null, src: string) {
  return base === null
    ? {
        baseItemAmount: null,
        bonusItemAmount: null,
        totalItemAmount: null,
        base_null_reason: 'Official product name does not state a Diamond amount',
        bonus_null_reason: 'Base amount unknown',
        total_null_reason: 'Base amount unknown'
      }
    : {
        baseItemAmount: base,
        bonusItemAmount: 0,
        totalItemAmount: base,
        amount_source: src,
        bonus_note: 'The official listing names only this Diamond amount and shows no bonus Diamonds for this product'
      }
}

function buildWebshopPack(th: VampirWebshopProduct, en: VampirWebshopProduct | undefined, usd: { price: number; source: string } | null, usdReason: string | null, apple: AppStoreFullIapRow | undefined) {
  const nameEn = en?.productName ?? (hasThai(th.productName) ? null : th.productName)
  const nameTh = hasThai(th.productName) ? th.productName : null
  const base = vampirDiamondAmount(nameEn) ?? vampirDiamondAmount(th.productName)
  const descTh = hasThai(th.productDetailDescription) ? th.productDetailDescription!.trim() : null
  const descEn = (en?.productDetailDescription ?? '').trim() || null
  const pack: any = {
    id: 0,
    name: nameEn ?? th.productName,
    name_en: nameEn,
    name_th: nameTh,
    product_id: th.productCode,
    kind: 'diamonds',
    item: 'Diamonds',
    item_pack: false,
    ...diamondAmounts(base, 'official Web Shop product name'),
    price: th.amount,
    currency: 'THB',
    prices: { THB: th.amount, USD: usd?.price ?? null },
    price_thb: th.amount,
    price_thb_source: `netmarble-official-webshop (country=TH, ${th.productCode})`,
    price_usd: usd?.price ?? null,
    price_usd_source: usd?.source ?? null,
    description_th: descTh,
    description_en: descEn,
    contents: base === null ? null : [{ item: 'Diamonds', name_th: 'ไดอา', amount: base }],
    image: th.productImageURL ?? null,
    max_quantity_per_order: th.maxQuantityPerOrder ?? null
  }
  if (base === null) pack.contents_null_reason = 'Diamond amount not stated in the official product name'
  if (!nameEn) pack.name_en_null_reason = 'Web Shop EN locale did not return this product'
  if (!nameTh) pack.name_th_null_reason = 'Web Shop TH locale returned no Thai name for this product'
  if (!descTh) pack.description_th_null_reason = 'Web Shop TH locale returned no Thai description'
  if (!descEn) pack.description_en_null_reason = 'Web Shop EN locale returned no English description'
  if (!usd) pack.price_usd_null_reason = (usdReason ?? 'Not listed on the Web Shop (country=US) or App Store US / KH / LA / MM') + NO_FX
  if (apple) {
    pack.appstore_th_price = apple.price
    pack.appstore_th_item_id = apple.id
  }
  return pack
}

function buildAppStorePack(t: AppStoreFullIapRow, m: Usd | undefined, usdReasons: string[]) {
  const nameEn = m?.row.name ?? (hasThai(t.name) ? null : t.name)
  const nameTh = hasThai(t.name) ? t.name : null
  const pid = t.offerName ?? null
  const kind = vampirKind(pid, nameEn, nameTh)
  const descEn = (m?.row.description || (!hasThai(t.description) ? t.description : '') || '').trim() || null
  const descTh = hasThai(t.description) ? t.description!.trim() : null
  const base = kind === 'diamonds' ? vampirDiamondAmount(nameEn) ?? vampirDiamondAmount(t.name) : null
  const pack: any = {
    id: 0,
    name: nameEn ?? t.name,
    name_en: nameEn,
    name_th: nameTh,
    product_id: pid,
    apple_item_id: t.id,
    kind,
    ...(kind === 'diamonds' ? { item: 'Diamonds' } : {}),
    item_pack: kind !== 'diamonds',
    ...(kind === 'diamonds'
      ? diamondAmounts(base, 'App Store official item name')
      : {
          baseItemAmount: null,
          bonusItemAmount: null,
          totalItemAmount: null,
          base_null_reason: 'Package item, not a plain Diamond amount',
          bonus_null_reason: 'Package item; no Diamond bonus published',
          total_null_reason: 'Package item, not a plain Diamond amount'
        }),
    price: t.price,
    currency: 'THB',
    prices: { THB: t.price, USD: m?.row.price ?? null },
    price_thb: t.price,
    price_thb_source: `apple-app-store-th (${pid ? `offerName=${pid}, ` : ''}item ${t.id})`,
    price_usd: m?.row.price ?? null,
    price_usd_source: m ? `apple-app-store-${m.cc} (item ${m.row.id})` : null,
    description_th: descTh,
    description_en: descEn
  }
  if (kind === 'diamonds') {
    pack.contents = base === null ? null : [{ item: 'Diamonds', name_th: 'ไดอา', amount: base }]
    if (base === null) pack.contents_null_reason = 'Diamond amount not stated in the official item name'
  } else {
    pack.contents = null
    pack.contents_null_reason = `Apple's official description only says "${descEn ?? descTh ?? 'Purchase package'}"; the items inside are shown in-game only (Netmarble publishes no item list for it)`
  }
  if (!nameEn) pack.name_en_null_reason = 'No USD App Store storefront listed this item, and App Store TH gives only the Thai name'
  if (!nameTh) pack.name_th_null_reason = `App Store TH (Thai locale) lists this item under its English name only ("${t.name}")`
  if (!descTh) pack.description_th_null_reason = 'App Store TH returned no Thai description for this item'
  if (!descEn) pack.description_en_null_reason = 'No English description on a USD App Store storefront for this item'
  if (!m) pack.price_usd_null_reason = 'Not found on App Store US / KH / LA / MM by item id or offerName' + (usdReasons.length ? ` (${usdReasons.join('; ')})` : '') + NO_FX
  return pack
}

const byPrice = (a: any, b: any) =>
  (a.price_thb ?? Infinity) - (b.price_thb ?? Infinity) ||
  (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) ||
  String(a.product_id ?? a.name).localeCompare(String(b.product_id ?? b.name), 'en', { numeric: true })

/** Live VAMPIR packs. Never hardcodes prices; all sources down -> throws (route returns 502). */
export async function fetchVampirPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const id = String(VAMPIR_APP_ID)
  const [wsThTh, wsThEn, wsUsEn, asTh, asUs] = await Promise.all([
    settle(fetchVampirWebshopProducts('TH', 'TH', signal)),
    settle(fetchVampirWebshopProducts('TH', 'EN', signal)),
    settle(fetchVampirWebshopProducts('US', 'EN', signal)),
    settle(fetchAppStoreFullIap('th', id, 'th', signal)),
    settle(fetchAppStoreFullIap('us', id, 'en-US', signal))
  ])
  const warnings: string[] = []
  const webTh = (wsThTh.ok ?? []).filter((p) => p.currencyCode === 'THB')
  if (wsThTh.err) warnings.push(`Official Web Shop (TH) unavailable: ${wsThTh.err}`)
  else if (!webTh.length) warnings.push('Official Web Shop (TH) returned no THB products')
  if (wsThEn.err) warnings.push(`Official Web Shop EN names unavailable: ${wsThEn.err}`)
  if (wsUsEn.err) warnings.push(`Official Web Shop (US) unavailable: ${wsUsEn.err}`)
  const appleTh = (asTh.ok ?? []).filter((r) => r.currency === 'THB')
  if (asTh.err) warnings.push(`App Store TH in-app list unavailable: ${asTh.err}`)
  const usRows = asUs.ok ? asUs.ok.filter((r) => r.currency === 'USD') : null

  if (!webTh.length && !appleTh.length) {
    throw new VampirUpstreamUnavailableError(`No official VAMPIR price source available (${warnings.join('; ')})`)
  }

  // App Store TH: unique by offerName / id.
  const seen = new Set<string>()
  const appleUniq = appleTh.filter((r) => {
    const k = r.offerName || r.id
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const appleByOffer = new Map(appleUniq.filter((r) => r.offerName).map((r) => [r.offerName!, r]))
  const webCodes = new Set(webTh.map((p) => p.productCode))
  const appleRest = appleUniq.filter((r) => !(r.offerName && webCodes.has(r.offerName)))

  // USD for web products: Web Shop country=US first, else App Store US/KH/LA/MM by product code.
  const webUs = new Map((wsUsEn.ok ?? []).filter((p) => p.currencyCode === 'USD').map((p) => [p.productCode, p]))
  const webEn = new Map((wsThEn.ok ?? []).map((p) => [p.productCode, p]))
  const webNeedApple = webTh.filter((p) => !webUs.has(p.productCode))
  const pseudo = webNeedApple.map(
    (p) => appleByOffer.get(p.productCode) ?? ({ id: `web:${p.productCode}`, offerName: p.productCode, name: p.productName, price: 0, priceFormatted: '', currency: 'THB' } as AppStoreFullIapRow)
  )
  const usd = await appStoreUsd([...appleRest, ...pseudo], usRows, asUs.err, signal)
  if (asUs.err) warnings.push(`App Store US in-app list unavailable: ${asUs.err}`)

  const webPacks = webTh.map((p) => {
    const u = webUs.get(p.productCode)
    let usdVal: { price: number; source: string } | null = u ? { price: u.amount, source: `netmarble-official-webshop (country=US, ${p.productCode})` } : null
    let reason: string | null = null
    if (!usdVal) {
      const ps = pseudo.find((x) => x.offerName === p.productCode)
      const m = ps ? usd.match.get(ps.id) : undefined
      if (m) usdVal = { price: m.row.price, source: `apple-app-store-${m.cc} (offerName=${p.productCode}, item ${m.row.id})` }
      else
        reason =
          `Not on the official Web Shop (country=US${wsUsEn.err ? `: ${wsUsEn.err}` : ''}) nor App Store US / KH / LA / MM` +
          (usd.reasons.length ? ` (${usd.reasons.join('; ')})` : '')
    }
    return buildWebshopPack(p, webEn.get(p.productCode), usdVal, reason, appleByOffer.get(p.productCode))
  })
  const applePacks = appleRest.map((t) => buildAppStorePack(t, usd.match.get(t.id), usd.reasons))

  const groups: Array<{ name: string; packs: any[]; message: string }> = [
    { name: 'Diamonds (Official Web Shop)', packs: webPacks, message: 'Live official Netmarble VAMPIR Web Shop' },
    { name: 'Diamonds (App Store)', packs: applePacks.filter((p) => p.kind === 'diamonds'), message: 'Live App Store TH full in-app purchase list' },
    { name: 'VAMPIR Packages (App Store)', packs: applePacks.filter((p) => p.kind === 'package'), message: 'Live App Store TH full in-app purchase list' }
  ]
  let n = 0
  const categories = groups
    .filter((g) => g.packs.length)
    .map((g, i) => {
      g.packs.sort(byPrice)
      for (const p of g.packs) p.id = ++n
      return { id: i + 1, name: g.name, status: 0, message: g.message, packCount: g.packs.length, packs: g.packs }
    })

  const usdCcs = [...new Set([...usd.match.values()].map((m) => m.cc))]
  const api = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${VAMPIR_APP_ID}/top-in-apps`
  const notes = [
    'VAMPIR by Netmarble (App Store id 6738163891, Google Play com.netmarble.thered), live in Thailand since 2026-10-28.',
    'Diamonds: THB and USD from Netmarble\'s official VAMPIR Web Shop (vampirshop.netmarble.com, country=TH / country=US). Base = the Diamond amount in the official product name; the listing shows no bonus Diamonds, so bonus = 0 and total = base. Web Shop purchases may also earn Netmarble Web Shop points / event rewards, which are not Diamonds and are not itemised per product.',
    'Everything the Web Shop does not sell (VAMPIR Packages, App Store-only Diamonds) comes from the official App Store TH full in-app purchase list (Thai names / descriptions); USD from App Store US, else KH / LA / MM, matched by Apple item id / offerName. App Store items that the Web Shop also sells are shown once (Web Shop) with appstore_th_price for reference.',
    'VAMPIR Packages are item_pack:true; Apple\'s description is only "Purchase Vampir Package N", so contents are null with a reason.',
    'No FX conversion, no resellers, no hardcoded prices or amounts.',
    APPSTORE_FULL_IAP_NOTE
  ]
  if (usd.reasons.length) notes.push('USD lookup: ' + usd.reasons.join('; '))
  return {
    game: { id: VAMPIR_APP_ID, slug: VAMPIR_SLUG, name: 'VAMPIR', itemName: 'Diamonds', itemIcon: webTh[0]?.productImageURL ?? '' },
    official_title: VAMPIR_OFFICIAL_TITLE,
    publisher: VAMPIR_PUBLISHER,
    categories,
    summary: { categoryCount: categories.length, packCount: n },
    source: webTh.length ? VAMPIR_WEBSHOP_TH_URL : VAMPIR_APPSTORE_TH_URL,
    sources: {
      thb: webTh.length ? VAMPIR_WEBSHOP_TH_URL : VAMPIR_APPSTORE_TH_URL,
      usd: webUs.size ? VAMPIR_WEBSHOP_URL + '/en' : VAMPIR_APPSTORE_US_URL,
      webshop_api: VAMPIR_WEBSHOP_PRODUCTS_API,
      appstore_th: VAMPIR_APPSTORE_TH_URL,
      appstore_usd: (usdCcs.length ? usdCcs : ['us']).map((cc) => `https://apps.apple.com/${cc}/app/vampir/id${VAMPIR_APP_ID}`),
      appstore_api: [api('th'), ...(usdCcs.length ? usdCcs : ['us']).map(api)]
    },
    source_mode: webTh.length ? (appleTh.length ? 'webshop+appstore' : 'webshop-only') : 'appstore-only',
    warnings,
    fetchedAt: new Date().toISOString(),
    notes
  } as unknown as RovPacksResponse
}

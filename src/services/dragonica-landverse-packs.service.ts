import type { RovPacksResponse } from '../types/rov'

/**
 * Dragonica Landverse (Thailand), published by Maxion Tech Co., Ltd. (Gravity Co., Ltd. x Maxion Tech), PC MMOARPG,
 * Thai server "Gatto", grand launch 17 Jul 2026. Successor in TH after Dragonica Origin (PT GRAVITY Game Link) closed 30 Jun 2026.
 * Official top-up: https://drlv.maxion.gg/TopUp. The page loads its packages from the same-origin, anonymous payment proxy
 * GET /api/payment/listing?currency=THB&salecode=top0026#003&saledisplay=partner (Maxifi store, PromptPay checkout) which returns
 * each "DRLV COIN" package with its live THB price (unitprice / discount / netprice) and ION (BSC token) price (unitvalue).
 * Base/bonus Cash come from the official package title/detail ("cash 9000 coin + 180 bonus"). No resellers, no FX conversion.
 * The official store sells only THB (PromptPay) and ION; there is no USD storefront and no App Store/Google Play app, so USD is null.
 */
export const DRLV_SLUG = 'dragonica-landverse'
export const DRLV_NAME = 'Dragonica Landverse'
export const DRLV_TOPUP_PAGE = 'https://drlv.maxion.gg/TopUp'
export const DRLV_SALECODE = 'top0026#003'
export const DRLV_LISTING_API = 'https://drlv.maxion.gg/api/payment/listing'
export const drlvListingUrl = (currency = 'THB') => {
  const q = new URLSearchParams({ page: '1', take: '50', sort: 'unitvalue:ASC', isactive: 'true', currency, salecode: DRLV_SALECODE, saledisplay: 'partner' })
  return `${DRLV_LISTING_API}?${q.toString()}`
}
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const USD_NULL_REASON = 'The official Maxion top-up (drlv.maxion.gg/TopUp) sells only in THB (PromptPay) and ION; Dragonica Landverse is PC-only with no App Store/Google Play listing, so there is no official USD price (no FX conversion)'

export class DragonicaLandverseUpstreamUnavailableError extends Error {
  constructor(message = 'Dragonica Landverse upstream unavailable') { super(message); this.name = 'DragonicaLandverseUpstreamUnavailableError' }
}
export class DragonicaLandverseInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Dragonica Landverse upstream response') { super(message); this.name = 'DragonicaLandverseInvalidUpstreamResponseError' }
}

export type DrlvListing = {
  id?: string; salecode?: string; productcode?: string; title?: string; itemcode?: string; detail?: string
  unitvalue?: string; unitprice?: string; discount?: string; netprice?: string; currency?: string; media?: string; icon?: string
  isactive?: boolean; islimit?: boolean; available?: number; deleteat?: string | null
  product?: { category?: string; subcategory?: string; maingroup?: string; group?: string; name?: string; description?: string; checkout?: string }
}

const num = (s: unknown) => { const n = typeof s === 'number' ? s : Number(String(s ?? '').replace(/,/g, '').trim()); return Number.isFinite(n) ? n : null }

/** "DRLV COIN x9000 + 180  bonus" / "Dragonica Landverse cash 9000 coin + 180 bonus" -> { base: 9000, bonus: 180 } */
export function parseDrlvAmounts(title?: string, detail?: string, itemcode?: string): { base: number; bonus: number } | null {
  for (const s of [detail, title]) {
    if (!s) continue
    const m = s.match(/(?:x\s*|cash\s+)(\d[\d,]*)(?:\s*coin)?\s*(?:\+\s*(\d[\d,]*)\s*bonus)?/i)
    if (m) return { base: Number(m[1].replace(/,/g, '')), bonus: m[2] ? Number(m[2].replace(/,/g, '')) : 0 }
  }
  const c = itemcode?.match(/^DRLVCOIN(\d+)$/i)
  return c ? { base: Number(c[1]), bonus: 0 } : null
}

export async function fetchDragonicaLandversePacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const url = drlvListingUrl('THB')
  let r: Response
  try {
    r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', Referer: DRLV_TOPUP_PAGE }, signal: options?.signal })
  } catch (e) { throw new DragonicaLandverseUpstreamUnavailableError(`Maxion DRLV listing API: ${e instanceof Error ? e.message : String(e)}`) }
  if (!r.ok) throw new DragonicaLandverseUpstreamUnavailableError(`Maxion DRLV listing API HTTP ${r.status}`)
  let j: any
  try { j = await r.json() } catch { throw new DragonicaLandverseInvalidUpstreamResponseError('Maxion DRLV listing API: not JSON') }
  if (!j || !Array.isArray(j.data)) throw new DragonicaLandverseInvalidUpstreamResponseError('Maxion DRLV listing API: bad shape (no data[])')

  const issues: string[] = []
  const coin: any[] = []
  const other: any[] = []
  for (const x of j.data as DrlvListing[]) {
    if (x.isactive === false || x.deleteat) continue
    if (x.salecode && x.salecode !== DRLV_SALECODE) continue
    if ((x.currency ?? '').toUpperCase() !== 'THB') { issues.push(`${x.itemcode ?? x.id}: currency ${x.currency} is not THB, skipped`); continue }
    const thb = num(x.netprice) ?? num(x.unitprice)
    if (thb === null || thb <= 0) { issues.push(`${x.itemcode ?? x.id}: no THB price, skipped`); continue }
    const listThb = num(x.unitprice)
    const discount = num(x.discount) ?? 0
    const amounts = parseDrlvAmounts(x.title, x.detail, x.itemcode)
    const isCash = x.product?.subcategory === 'cashpoint' || /^DRLVCOIN/i.test(x.itemcode ?? '')
    const base: any = {
      id: 0,
      name: (x.title ?? '').replace(/\s+/g, ' ').replace(/\s*\+\s*/g, ' + ').trim(),
      product_id: x.itemcode ?? x.id ?? null,
      listing_id: x.id ?? null,
      store: 'maxion-drlv-topup',
      description_en: x.detail ? x.detail.replace(/\s+/g, ' ').trim() : null,
      description_th: null,
      description_th_null_reason: 'The official top-up listing gives the package text in English only',
      price_thb: thb,
      price_thb_list: listThb,
      price_thb_discount: discount,
      price_thb_source: 'maxion-drlv-topup-official (listing netprice)',
      price_usd: null,
      price_usd_source: null,
      price_usd_null_reason: USD_NULL_REASON,
      price_ion: num(x.unitvalue),
      price_ion_note: 'Official alternative price in ION (Maxion BSC token) on the same top-up page; not converted to THB/USD',
      price: thb,
      currency: 'THB',
      payment_method: 'PromptPay QR (THB) or ION wallet, official Maxion top-up',
      image_url: x.media ?? null,
      purchase_limit: x.islimit ? 'Limited (official listing islimit=true)' : null
    }
    if (isCash && amounts) {
      Object.assign(base, {
        kind: 'cash', item_pack: false,
        baseItemAmount: amounts.base, bonusItemAmount: amounts.bonus, totalItemAmount: amounts.base + amounts.bonus,
        bonus_source: 'maxion-drlv-topup-official (package title/detail)',
        contents: [{ item: 'Cash', quantity: amounts.base + amounts.bonus }]
      })
      coin.push(base)
    } else {
      Object.assign(base, {
        kind: 'bundle', item_pack: true,
        baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null,
        base_null_reason: 'Item pack; not a Cash top-up amount', bonus_null_reason: 'Item pack; no Cash bonus',
        contents: null, contents_null_reason: 'The official listing does not itemise this package'
      })
      other.push(base)
    }
  }
  if (!coin.length && !other.length) throw new DragonicaLandverseInvalidUpstreamResponseError('Maxion DRLV listing API returned no THB packages')
  const byThb = (a: any, b: any) => a.price_thb - b.price_thb || String(a.product_id).localeCompare(String(b.product_id))
  let n = 1
  const categories = ([['Cash (Official Maxion Top-Up TH)', coin], ['Packages (Official Maxion Top-Up TH)', other]] as [string, any[]][])
    .filter(([, l]) => l.length)
    .map(([name, l]) => {
      l.sort(byThb); l.forEach((p) => { p.id = n++; p.prices = { THB: p.price_thb, USD: p.price_usd } })
      return { name, status: 0, message: 'OK', packCount: l.length, packs: l }
    })
  const notes = [
    'Publisher: Maxion Tech Co., Ltd. holds the official publishing rights for Dragonica Landverse in Thailand (© Gravity Co., Ltd. x Maxion Tech Co., Ltd.). Official top-up: https://drlv.maxion.gg/TopUp (live Maxion payment listing API, salecode top0026#003).',
    'THB = official listing netprice (unitprice minus discount). base/bonus Cash = official package title/detail; total = base + bonus. No FX conversion, no resellers.',
    'USD: ' + USD_NULL_REASON + '.',
    'Passes/bundles: the official THB top-up sells only Cash packages. Premium VIP, costumes and other packs are bought in the in-game Cash Shop with Cash (not THB), so no THB-priced item packs/passes exist to list.'
  ]
  if (issues.length) notes.push('Skipped listings: ' + issues.join('; '))
  return ({
    game: { id: 0, slug: DRLV_SLUG, name: DRLV_NAME, itemName: 'Cash', itemIcon: '' },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    source: DRLV_TOPUP_PAGE,
    sources: { topup_page: DRLV_TOPUP_PAGE, listing_api: url, thb: DRLV_TOPUP_PAGE, cash_shop_guide: 'https://drlv.gitbook.io/dragonica-landverse-whitepaper/undefined/cash-shop' },
    notes
  } as unknown) as RovPacksResponse
}

import type { RovPacksResponse } from '../types/rov'
import {
  AppStoreGameInvalidUpstreamResponseError,
  AppStoreGameUpstreamUnavailableError,
  appStoreApiUrl,
  fetchAppStoreGamePacks,
  fetchAppStoreUsdFor,
  gameEnvelope,
  type AppStoreGameConfig,
  type AsClassified,
  type AsContent,
  type AsItemInput
} from './appstore-game-packs'

/**
 * Zenless Zone Zero (HoYoverse / COGNOSPHERE PTE. LTD., App Store id 1606356401).
 * THB = HoYoverse's official Top-Up Center for Thailand (https://sdk.hoyoverse.com/payment/zenless/th/index.html),
 *   read from the public pre-login goods list the page itself loads
 *   (nap-topup-os.hoyoverse.com/nap_global/mm-backpack/v1/listGoodsWebPublic?biz=nap_global&currency=THB&country=TH;
 *   no login, no UID, no token). Thai names / descriptions with x-rpc-language th-th, English with en-us.
 * USD = Apple App Store US, per-item fallback KH / LA / MM, matched by offerName = HoYoverse goods_id.
 * Top-Up Center down -> App Store TH full in-app list (THB) + the same USD lookup.
 * No FX, no resellers, no hardcoded prices or amounts.
 */

export const ZZZ_APP_ID = 1606356401
export const ZZZ_SLUG = 'zenless-zone-zero'
export const ZZZ_TOPUP_URL = 'https://sdk.hoyoverse.com/payment/zenless/th/index.html'
export const ZZZ_GOODS_API = 'https://nap-topup-os.hoyoverse.com/nap_global/mm-backpack/v1/listGoodsWebPublic'
export const ZZZ_APPSTORE_TH_URL = 'https://apps.apple.com/th/app/zenless-zone-zero/id1606356401'
export const ZZZ_APPSTORE_US_URL = 'https://apps.apple.com/us/app/zenless-zone-zero/id1606356401'
const OFFICIAL_TITLE = 'Zenless Zone Zero'
const PUBLISHER = 'HoYoverse (COGNOSPHERE PTE. LTD.)'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const GAME = { appId: ZZZ_APP_ID, slug: ZZZ_SLUG, name: 'Zenless Zone Zero', itemName: 'Monochrome', officialTitle: OFFICIAL_TITLE, publisher: PUBLISHER }

export type ZzzGoods = {
  goods_id: string
  goods_name: string
  goods_desc?: string
  goods_type: string
  goods_type_desc?: string
  price: { amount: string; amount_decimal: number; currency: string; amount_display?: string; original_amount?: string; original_amount_decimal?: number; original_amount_display?: string }
  virtual_currency?: { count: number; count_bonus?: number; bonus_once_eligible?: boolean } | null
  bp?: { type?: string } | null
  consumable?: { count?: number } | null
  purchase_quantity_limit?: number
  launch_end_time?: string
  icon_url?: string
}

const stripHtml = (s: string | undefined | null) =>
  (s ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim() || null
const money = (amount: string | undefined, dec: number | undefined) => {
  if (amount == null || amount === '' || !/^\d+$/.test(amount)) return null
  const n = Number(amount) / 10 ** (dec ?? 0)
  return n > 0 ? n : null
}

/** "Contains: A ×1, B ×10, and C ×1" (EN) or "ประกอบด้วย: A x1, B x1" (TH) from the official description. */
export function zzzContents(desc: string | null | undefined): AsContent[] | null {
  const d = (desc ?? '').replace(/\s+/g, ' ')
  const m = d.match(/(?:Contains|ประกอบด้วย)\s*:\s*(.+?)(?:\s*•|$)/i)
  if (!m) return null
  const out: AsContent[] = []
  for (const raw of m[1].split(/\s*,\s+(?:and\s+)?|\s+and\s+/i)) {
    const p = raw.trim().replace(/\.$/, '')
    const n = p.match(/^(.+?)\s*[×x]\s*([\d,]+)$/i)
    if (n) out.push({ item: n[1].trim(), amount: Number(n[2].replace(/,/g, '')) })
    else if (p) out.push({ item: p, amount: null })
  }
  return out.length ? out : null
}

/** Inter-Knot Membership: "receive 300 Monochromes and 30 days of Inter-Knot Membership ... 90 Polychromes ... every day". */
export function zzzMembershipContents(desc: string | null | undefined): AsContent[] | null {
  const d = (desc ?? '').replace(/\s+/g, ' ')
  const mono = d.match(/receive\s+([\d,]+)\s+Monochromes?/i)
  const days = d.match(/([\d,]+)\s+days\s+of\s+Inter-Knot Membership/i)
  const poly = d.match(/receive\s+([\d,]+)\s+Polychromes?\s+upon logging in[^.]*every day/i)
  const out: AsContent[] = []
  if (mono) out.push({ item: 'Monochrome', amount: Number(mono[1].replace(/,/g, '')) })
  if (days) out.push({ item: 'Inter-Knot Membership (days)', amount: Number(days[1].replace(/,/g, '')) })
  if (poly) out.push({ item: 'Polychrome (daily login, per day)', amount: Number(poly[1].replace(/,/g, '')) })
  return out.length ? out : null
}

export type ZzzKind = 'currency' | 'pass' | 'bundle'
export function zzzKind(g: Pick<ZzzGoods, 'goods_type'>): ZzzKind {
  if (g.goods_type === 'virtual_currency') return 'currency'
  if (g.goods_type === 'vip_card' || g.goods_type === 'bp') return 'pass'
  return 'bundle'
}

async function fetchGoods(currency: string, country: string, lang: string, signal?: AbortSignal): Promise<ZzzGoods[]> {
  const url = `${ZZZ_GOODS_API}?biz=nap_global&currency=${currency}&country=${country}`
  let res: Response
  try {
    res = await fetch(url, {
      signal: signal ?? AbortSignal.timeout(20_000),
      headers: { Accept: 'application/json', Origin: 'https://sdk.hoyoverse.com', Referer: 'https://sdk.hoyoverse.com/', 'x-rpc-language': lang, 'User-Agent': UA }
    })
  } catch (e) {
    throw new AppStoreGameUpstreamUnavailableError('HoYoverse Top-Up Center: ' + (e instanceof Error ? e.message : 'network error'))
  }
  if (!res.ok) throw new AppStoreGameUpstreamUnavailableError('HoYoverse Top-Up Center HTTP ' + res.status)
  let j: any
  try {
    j = await res.json()
  } catch {
    throw new AppStoreGameInvalidUpstreamResponseError('HoYoverse Top-Up Center returned non-JSON')
  }
  if (j?.retcode !== 0 || !Array.isArray(j?.data?.goods_list))
    throw new AppStoreGameInvalidUpstreamResponseError(`HoYoverse Top-Up Center retcode ${j?.retcode}: ${j?.message ?? ''}`)
  return j.data.goods_list as ZzzGoods[]
}

const CAT: Record<ZzzKind, string> = {
  currency: 'Monochrome (HoYoverse Top-Up Center)',
  pass: 'Inter-Knot Membership & New Eridu City Fund (HoYoverse Top-Up Center)',
  bundle: 'Bundle Shop (HoYoverse Top-Up Center)'
}

function buildPack(th: ZzzGoods, en: ZzzGoods | undefined, usd: { price: number; cc: string; id: string } | undefined, usdReason: string) {
  const kind = zzzKind(th)
  const priceThb = money(th.price.amount, th.price.amount_decimal)
  const origThb = money(th.price.original_amount, th.price.original_amount_decimal)
  const descTh = stripHtml(th.goods_desc)
  const descEn = stripHtml(en?.goods_desc)
  const nameEn = en?.goods_name ?? null
  const vc = th.virtual_currency
  const p: any = {
    id: 0,
    name: nameEn ?? th.goods_name,
    name_en: nameEn,
    name_th: th.goods_name || null,
    product_id: th.goods_id,
    goods_type: th.goods_type,
    shop_section: en?.goods_type_desc ?? th.goods_type_desc ?? null,
    kind,
    ...(kind === 'currency' ? { item: 'Monochrome' } : {}),
    item_pack: kind !== 'currency'
  }
  if (kind === 'currency') {
    const base = typeof vc?.count === 'number' ? vc.count : null
    const bonus = typeof vc?.count_bonus === 'number' ? vc.count_bonus : null
    p.baseItemAmount = base
    p.bonusItemAmount = bonus
    p.totalItemAmount = base != null && bonus != null ? base + bonus : null
    p.bonus_available = bonus != null && bonus > 0
    if (bonus != null && bonus > 0) {
      p.bonus_type = 'first_purchase'
      p.bonus_note = 'First-purchase bonus per tier (HoYoverse Top-Up Center "count_bonus"); repeat purchases give the base amount only'
      p.bonus_once_eligible_logged_out = vc?.bonus_once_eligible ?? null
      p.repeat_purchase_total = base
    }
    if (base == null) p.base_null_reason = 'Top-Up Center returned no Monochrome count for this goods'
    if (bonus == null) p.bonus_null_reason = 'Top-Up Center returned no bonus count for this goods; not assumed to be 0'
    if (p.totalItemAmount == null) p.total_null_reason = 'Base or bonus missing from the Top-Up Center response'
    p.contents = base != null ? [{ item: 'Monochrome', amount: base }] : null
    if (!p.contents) p.contents_null_reason = 'Top-Up Center returned no Monochrome count'
  } else {
    Object.assign(p, {
      baseItemAmount: null,
      bonusItemAmount: null,
      totalItemAmount: null,
      base_null_reason: kind === 'pass' ? 'Membership / City Fund item; not a plain currency amount' : 'Bundle item; not a plain currency amount',
      bonus_null_reason: 'No currency bonus on membership / fund / bundle items',
      total_null_reason: 'Not a plain currency amount',
      bonus_available: false
    })
    const c = th.goods_type === 'vip_card' ? zzzMembershipContents(descEn) : zzzContents(descEn) ?? zzzContents(descTh)
    p.contents = c
    if (!c)
      p.contents_null_reason =
        th.goods_type === 'bp'
          ? 'HoYoverse says New Eridu City Fund rewards are listed in-game only ("Menu > New Eridu City Fund"); not itemised on the Top-Up Center'
          : 'The official description does not itemise the contents'
  }
  Object.assign(p, {
    price: priceThb,
    currency: 'THB',
    prices: { THB: priceThb, USD: usd?.price ?? null },
    price_thb: priceThb,
    price_thb_display: th.price.amount_display ?? null,
    price_thb_source: `hoyoverse-topup-center-th (goods_id=${th.goods_id})`,
    ...(origThb ? { original_price_thb: origThb, original_price_thb_note: 'Strikethrough price shown by the Top-Up Center' } : {}),
    price_usd: usd?.price ?? null,
    price_usd_source: usd ? `apple-app-store-${usd.cc} (offerName=${th.goods_id}, item ${usd.id})` : null,
    description_th: descTh,
    description_en: descEn,
    purchase_limit: typeof th.purchase_quantity_limit === 'number' ? th.purchase_quantity_limit : null,
    available_until:
      th.launch_end_time && th.launch_end_time !== '0' && /^\d+$/.test(th.launch_end_time)
        ? new Date(Number(th.launch_end_time) * 1000).toISOString()
        : null,
    icon_url: th.icon_url ?? null
  })
  if (priceThb == null) p.price_thb_null_reason = 'Top-Up Center returned no THB amount'
  if (!nameEn) p.name_en_null_reason = 'English Top-Up Center list did not return this goods_id'
  if (!p.name_th) p.name_th_null_reason = 'Thai Top-Up Center list returned an empty name'
  if (!descTh) p.description_th_null_reason = 'The Top-Up Center gives no description for this goods (Monochrome tiers are name + amount only)'
  if (!descEn) p.description_en_null_reason = 'The Top-Up Center gives no description for this goods (Monochrome tiers are name + amount only)'
  if (!usd) p.price_usd_null_reason = usdReason
  return p
}

async function fromTopUpCenter(signal?: AbortSignal): Promise<RovPacksResponse> {
  const th = await fetchGoods('THB', 'TH', 'th-th', signal)
  if (!th.length) throw new AppStoreGameInvalidUpstreamResponseError('HoYoverse Top-Up Center returned no THB goods')
  if (th.some((g) => g.price?.currency !== 'THB')) throw new AppStoreGameInvalidUpstreamResponseError('HoYoverse Top-Up Center did not price in THB')
  let en: ZzzGoods[] = []
  const notes: string[] = []
  try {
    en = await fetchGoods('THB', 'TH', 'en-us', signal)
  } catch (e) {
    notes.push('English Top-Up Center list unavailable: ' + (e instanceof Error ? e.message : String(e)))
  }
  const enById = new Map(en.map((g) => [g.goods_id, g]))
  const usd = await fetchAppStoreUsdFor(ZZZ_APP_ID, th.map((g) => ({ key: g.goods_id, offerName: g.goods_id })), signal)
  const usdReason =
    'Not found on App Store US / KH / LA / MM by offerName (HoYoverse goods_id)' + (usd.reasons.length ? ` (${usd.reasons.join('; ')})` : '') + '; no FX conversion'
  const usdCcs = new Set<string>()
  const packs = th.map((g) => {
    const m = usd.match.get(g.goods_id)
    if (m) usdCcs.add(m.cc)
    return buildPack(g, enById.get(g.goods_id), m ? { price: m.row.price, cc: m.cc, id: m.row.id } : undefined, usdReason)
  })
  const byPrice = (a: any, b: any) =>
    (a.price_thb ?? Infinity) - (b.price_thb ?? Infinity) || (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) || String(a.product_id).localeCompare(String(b.product_id))
  let n = 0
  const categories = (['currency', 'pass', 'bundle'] as ZzzKind[])
    .map((k, i) => ({ id: i + 1, name: CAT[k], packs: packs.filter((p) => p.kind === k) }))
    .filter((c) => c.packs.length)
    .map((c) => {
      c.packs.sort(byPrice)
      for (const p of c.packs) p.id = ++n
      return { ...c, status: 0, message: 'Live HoYoverse Top-Up Center (TH) goods list', packCount: c.packs.length }
    })
  const usdList = [...usdCcs]
  const thApi = `${ZZZ_GOODS_API}?biz=nap_global&currency=THB&country=TH`
  return gameEnvelope(
    GAME,
    categories,
    {
      source: thApi,
      sources: { thb: ZZZ_TOPUP_URL, usd: ZZZ_APPSTORE_US_URL },
      source_details: {
        thb_page: ZZZ_TOPUP_URL,
        thb_api: thApi,
        usd_api: (usdList.length ? usdList : ['us']).map((cc) => appStoreApiUrl(cc, ZZZ_APP_ID)),
        usd_storefronts: usdList
      },
      source_mode: 'hoyoverse-topup-center'
    },
    [
      `THB = HoYoverse official Top-Up Center for Thailand (${ZZZ_TOPUP_URL}), from the public pre-login goods list the page loads (no login / UID). USD = App Store US, per-item fallback KH / LA / MM, matched by offerName = goods_id. No FX conversion, no resellers, no hardcoded prices.`,
      'Monochrome: base = Top-Up Center count, bonus = its first-purchase bonus (count_bonus), total = base + bonus for a first purchase; repeat purchases give base only (repeat_purchase_total). Live promos shown on the page (e.g. card / wallet discounts) are not part of the goods price.',
      'Inter-Knot Membership, New Eridu City Fund plans and Bundle Shop gifts are item_pack:true; contents come from the official Top-Up Center description (City Fund rewards are listed in-game only, so null with a reason).',
      'Some App Store-only items (e.g. Master Tape / Encrypted Master Tape singles, Special Bundles, other Limited Gift tiers) are not sold on the Top-Up Center and are not listed here.',
      ...notes,
      ...(usd.reasons.length ? ['USD lookup: ' + usd.reasons.join('; ')] : [])
    ]
  )
}

/** App Store fallback classifier (offerName = goods_id: napglbtopupN..., vip, bp, bundle...). */
export function zzzAppStoreClassify(it: AsItemInput): AsClassified {
  const pid = it.productId ?? ''
  const topup = pid.match(/^napglbtopup(\d+)rmb\d+$/i)
  if (topup) return { kind: 'currency', item: 'Monochrome', baseItemAmount: Number(topup[1]) }
  if (!pid) {
    const n = (it.nameEn ?? it.rawName).match(/^\s*Monochrome\s*[×x]\s*([\d,]+)\s*$/i)
    if (n) return { kind: 'currency', item: 'Monochrome', baseItemAmount: Number(n[1].replace(/,/g, '')) }
  }
  if (/vip|bp\d/i.test(pid) || (!pid && /membership|plan/i.test(it.nameEn ?? it.rawName))) return { kind: 'pass', contents: null, contents_null_reason: 'Apple description does not itemise the contents' }
  return { kind: 'bundle', contents: null, contents_null_reason: 'Apple description does not itemise the contents' }
}

const APPSTORE_CFG: AppStoreGameConfig = {
  ...GAME,
  thUrl: ZZZ_APPSTORE_TH_URL,
  usUrl: ZZZ_APPSTORE_US_URL,
  categoryNames: { currency: 'Monochrome (App Store)', pass: 'Inter-Knot Membership & City Fund (App Store)', bundle: 'Gifts & Bundles (App Store)' },
  classify: zzzAppStoreClassify,
  notes: ['Fallback: the HoYoverse Top-Up Center goods list was unavailable, so THB comes from the official App Store TH list. Monochrome bonus is not published by Apple, so bonus / total are null with a reason.']
}

/** Live Zenless Zone Zero packs. HoYoverse Top-Up Center (THB) first, App Store TH fallback; all down -> throws (502). */
export async function fetchZenlessZoneZeroPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  let reason: string
  try {
    return await fromTopUpCenter(options?.signal)
  } catch (e) {
    reason = e instanceof Error ? e.message : String(e)
  }
  const r: any = await fetchAppStoreGamePacks(APPSTORE_CFG, options?.signal)
  r.topup_center_error = reason
  r.notes = [`HoYoverse Top-Up Center unavailable (${reason}); using App Store TH.`, ...(r.notes ?? [])]
  return r
}

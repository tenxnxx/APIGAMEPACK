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
 * Genshin Impact (HoYoverse / COGNOSPHERE PTE. LTD., App Store id 1517783697).
 * THB = HoYoverse's official Top-Up Center for Thailand (https://sdk.hoyoverse.com/payment/genshin/th/index.html),
 *   read from the public pre-login goods list the page itself loads
 *   (hk4e-topup-os.hoyoverse.com/hk4e_global/mm-backpack/v1/listGoodsWebPublic?biz=hk4e_global&currency=THB&country=TH;
 *   no login, no UID, no token). Thai names / descriptions with x-rpc-language th-th, English with en-us.
 * USD = Apple App Store US, per-item fallback KH / LA / MM, matched by offerName = HoYoverse goods_id.
 * Top-Up Center down -> App Store TH full in-app list (THB) + the same USD lookup.
 * No FX, no resellers, no hardcoded prices or amounts.
 */

export const GENSHIN_APP_ID = 1517783697
export const GENSHIN_SLUG = 'genshin-impact'
export const GENSHIN_TOPUP_URL = 'https://sdk.hoyoverse.com/payment/genshin/th/index.html'
export const GENSHIN_GOODS_API = 'https://hk4e-topup-os.hoyoverse.com/hk4e_global/mm-backpack/v1/listGoodsWebPublic'
export const GENSHIN_APPSTORE_TH_URL = 'https://apps.apple.com/th/app/genshin-impact/id1517783697'
export const GENSHIN_APPSTORE_US_URL = 'https://apps.apple.com/us/app/genshin-impact/id1517783697'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const GAME = {
  appId: GENSHIN_APP_ID,
  slug: GENSHIN_SLUG,
  name: 'Genshin Impact',
  itemName: 'Genesis Crystal',
  officialTitle: 'Genshin Impact',
  publisher: 'HoYoverse (COGNOSPHERE PTE. LTD.)'
}

export type GenshinGoods = {
  goods_id: string
  goods_name: string
  goods_desc?: string
  goods_type: string
  goods_type_desc?: string
  price: { amount: string; amount_decimal: number; currency: string; amount_display?: string; original_amount?: string; original_amount_decimal?: number }
  virtual_currency?: { count: number; count_bonus?: number; bonus_once_eligible?: boolean; bonus_once_extra_count?: number } | null
  bp?: { type?: string } | null
  purchase_quantity_limit?: number
  launch_end_time?: string
  icon_url?: string
}

const clean = (s: string | undefined | null) => (s ?? '').replace(/\u00a0/g, ' ').trim()
export const stripHtml = (s: string | undefined | null) =>
  clean((s ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')) || null
const money = (amount: string | undefined, dec: number | undefined) => {
  if (amount == null || !/^\d+$/.test(amount)) return null
  const n = Number(amount) / 10 ** (dec ?? 0)
  return n > 0 ? n : null
}
const int = (s: string) => Number(s.replace(/,/g, ''))

/** Welkin Moon: "immediately receive 300 Genesis Crystals and 30 days of the Blessing ... claim 90 Primogems each day". */
export function welkinContents(desc: string | null | undefined): AsContent[] | null {
  const d = (desc ?? '').replace(/\s+/g, ' ')
  const gc = d.match(/receive\s+([\d,]+)\s+Genesis Crystals?/i)
  const days = d.match(/([\d,]+)\s+days\s+of\s+the\s+Blessing/i)
  const pri = d.match(/claim\s+([\d,]+)\s+Primogems?\s+each day/i)
  const out: AsContent[] = []
  if (gc) out.push({ item: 'Genesis Crystal', amount: int(gc[1]) })
  if (days) out.push({ item: 'Blessing of the Welkin Moon (days)', amount: int(days[1]) })
  if (pri) out.push({ item: 'Primogem (daily login, per day)', amount: int(pri[1]) })
  return out.length ? out : null
}

export type GenshinKind = 'currency' | 'pass'
export function genshinKind(g: Pick<GenshinGoods, 'goods_type'>): GenshinKind | 'bundle' {
  if (g.goods_type === 'virtual_currency') return 'currency'
  if (g.goods_type === 'vip_card' || g.goods_type === 'bp') return 'pass'
  return 'bundle'
}

async function fetchGoods(lang: string, signal?: AbortSignal): Promise<GenshinGoods[]> {
  const url = `${GENSHIN_GOODS_API}?biz=hk4e_global&currency=THB&country=TH`
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
  return j.data.goods_list as GenshinGoods[]
}

const PASS_REWARDS_IN_GAME =
  'HoYoverse says the rewards are listed in-game only ("Main Page > Battle Pass" / "Paimon Menu > Miliastra Pass"); not itemised on the Top-Up Center'

function buildPack(th: GenshinGoods, en: GenshinGoods | undefined, usd: { price: number; cc: string; id: string } | undefined, usdReason: string) {
  const kind = genshinKind(th)
  const priceThb = money(th.price.amount, th.price.amount_decimal)
  const origThb = money(th.price.original_amount, th.price.original_amount_decimal)
  const descTh = stripHtml(th.goods_desc)
  const descEn = stripHtml(en?.goods_desc)
  const nameEn = clean(en?.goods_name) || null
  const nameTh = clean(th.goods_name) || null
  const vc = th.virtual_currency
  const item = kind === 'currency' ? nameEn?.replace(/Crystals$/i, 'Crystal') ?? nameTh : undefined
  const p: any = {
    id: 0,
    name: kind === 'currency' && typeof vc?.count === 'number' ? `${vc.count} ${nameEn ?? nameTh}` : nameEn ?? nameTh,
    name_en: nameEn,
    name_th: nameTh,
    product_id: th.goods_id,
    goods_type: th.goods_type,
    shop_section: clean(en?.goods_type_desc ?? th.goods_type_desc) || null,
    kind,
    ...(item ? { item } : {}),
    item_pack: kind !== 'currency'
  }
  if (kind === 'currency') {
    const base = typeof vc?.count === 'number' ? vc.count : null
    const b1 = typeof vc?.count_bonus === 'number' ? vc.count_bonus : null
    const b2 = typeof vc?.bonus_once_extra_count === 'number' ? vc.bonus_once_extra_count : 0
    const bonus = b1 != null ? b1 + b2 : null
    Object.assign(p, {
      baseItemAmount: base,
      bonusItemAmount: bonus,
      totalItemAmount: base != null && bonus != null ? base + bonus : null,
      bonus_available: bonus != null && bonus > 0
    })
    if (bonus != null && bonus > 0) {
      p.bonus_type = 'first_purchase'
      p.bonus_breakdown = { count_bonus: b1, bonus_once_extra_count: b2 }
      p.bonus_note =
        'First-purchase bonus per tier from the Top-Up Center (count_bonus' + (b2 ? ' + bonus_once_extra_count, the extra first-purchase bonus it shows' : '') + '); repeat purchases give the base amount only'
      p.bonus_once_eligible_logged_out = vc?.bonus_once_eligible ?? null
      p.repeat_purchase_total = base
    }
    if (base == null) p.base_null_reason = 'Top-Up Center returned no count for this goods'
    if (bonus == null) p.bonus_null_reason = 'Top-Up Center returned no bonus count for this goods; not assumed to be 0'
    if (p.totalItemAmount == null) p.total_null_reason = 'Base or bonus missing from the Top-Up Center response'
    p.contents = base != null ? [{ item, amount: base }] : null
    if (!p.contents) p.contents_null_reason = 'Top-Up Center returned no count'
  } else {
    Object.assign(p, {
      baseItemAmount: null,
      bonusItemAmount: null,
      totalItemAmount: null,
      base_null_reason: 'Pass / membership item; not a plain currency amount',
      bonus_null_reason: 'No currency bonus on pass / membership items',
      total_null_reason: 'Not a plain currency amount',
      bonus_available: false,
      ...(th.bp?.type ? { pass_type: th.bp.type } : {})
    })
    const c = th.goods_type === 'vip_card' ? welkinContents(descEn) : null
    p.contents = c
    if (!c) p.contents_null_reason = th.goods_type === 'vip_card' ? 'The official description could not be itemised' : PASS_REWARDS_IN_GAME
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
    purchase_limit: typeof th.purchase_quantity_limit === 'number' && th.purchase_quantity_limit > 0 ? th.purchase_quantity_limit : null,
    available_until:
      th.launch_end_time && th.launch_end_time !== '0' && /^\d+$/.test(th.launch_end_time) ? new Date(Number(th.launch_end_time) * 1000).toISOString() : null,
    icon_url: th.icon_url ?? null
  })
  if (priceThb == null) p.price_thb_null_reason = 'Top-Up Center returned no THB amount'
  if (!nameEn) p.name_en_null_reason = 'English Top-Up Center list did not return this goods_id'
  if (!nameTh) p.name_th_null_reason = 'Thai Top-Up Center list returned an empty name'
  if (!descTh) p.description_th_null_reason = 'The Top-Up Center gives no description for this goods (currency tiers are name + amount only)'
  if (!descEn) p.description_en_null_reason = 'The Top-Up Center gives no description for this goods (currency tiers are name + amount only)'
  if (!usd) p.price_usd_null_reason = usdReason
  return p
}

async function fromTopUpCenter(signal?: AbortSignal): Promise<RovPacksResponse> {
  const th = await fetchGoods('th-th', signal)
  if (!th.length) throw new AppStoreGameInvalidUpstreamResponseError('HoYoverse Top-Up Center returned no THB goods')
  if (th.some((g) => g.price?.currency !== 'THB')) throw new AppStoreGameInvalidUpstreamResponseError('HoYoverse Top-Up Center did not price in THB')
  let en: GenshinGoods[] = []
  const notes: string[] = []
  try {
    en = await fetchGoods('en-us', signal)
  } catch (e) {
    notes.push('English Top-Up Center list unavailable: ' + (e instanceof Error ? e.message : String(e)))
  }
  const enById = new Map(en.map((g) => [g.goods_id, g]))
  const usd = await fetchAppStoreUsdFor(GENSHIN_APP_ID, th.map((g) => ({ key: g.goods_id, offerName: g.goods_id })), signal)
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
  // Group: one category per currency (Genesis Crystals, Chronal Nexus, ...), then passes, then anything else.
  const groups = new Map<string, any[]>()
  for (const p of packs) {
    const key = p.kind === 'currency' ? `${p.name_en ?? p.item} (HoYoverse Top-Up Center)` : p.kind === 'pass' ? 'Welkin Moon & Passes (HoYoverse Top-Up Center)' : 'Other items (HoYoverse Top-Up Center)'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(p)
  }
  const order = (k: string) => (k.startsWith('Genesis') ? 0 : k.startsWith('Welkin') ? 2 : k.startsWith('Other') ? 3 : 1)
  let n = 0
  const categories = [...groups.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]) || a[0].localeCompare(b[0]))
    .map(([name, ps], i) => {
      ps.sort(byPrice)
      for (const p of ps) p.id = ++n
      return { id: i + 1, name, packs: ps, status: 0, message: 'Live HoYoverse Top-Up Center (TH) goods list', packCount: ps.length }
    })
  const usdList = [...usdCcs]
  const thApi = `${GENSHIN_GOODS_API}?biz=hk4e_global&currency=THB&country=TH`
  return gameEnvelope(
    GAME,
    categories,
    {
      source: thApi,
      sources: { thb: GENSHIN_TOPUP_URL, usd: GENSHIN_APPSTORE_US_URL },
      source_details: {
        thb_page: GENSHIN_TOPUP_URL,
        thb_api: thApi,
        usd_api: (usdList.length ? usdList : ['us']).map((cc) => appStoreApiUrl(cc, GENSHIN_APP_ID)),
        usd_storefronts: usdList
      },
      source_mode: 'hoyoverse-topup-center'
    },
    [
      `THB = HoYoverse official Top-Up Center for Thailand (${GENSHIN_TOPUP_URL}), from the public pre-login goods list the page loads (no login / UID). USD = App Store US, per-item fallback KH / LA / MM, matched by offerName = goods_id. No FX conversion, no resellers, no hardcoded prices.`,
      'Genesis Crystals / Chronal Nexus: base = Top-Up Center count, bonus = its first-purchase bonus (count_bonus, plus bonus_once_extra_count when the page shows an extra first-purchase bonus), total = base + bonus for a first purchase; repeat purchases give base only (repeat_purchase_total).',
      'Blessing of the Welkin Moon, Battle Pass (Gnostic Hymn / Chorus, Travel Notes) and Miliastra Pass items are item_pack:true; Welkin contents come from the official description, pass rewards are listed in-game only (null with a reason).',
      'App Store-only items (e.g. Intertwined / Acquaint Fate, Arcane Keystones, gift-card bundles, special offers) are not sold on the Top-Up Center and are not listed here.',
      ...notes,
      ...(usd.reasons.length ? ['USD lookup: ' + usd.reasons.join('; ')] : [])
    ]
  )
}

/** App Store fallback classifier (offerName = goods_id). */
export function genshinAppStoreClassify(it: AsItemInput): AsClassified {
  const pid = it.productId ?? ''
  const name = it.nameEn ?? it.rawName
  const m = name.match(/^\s*([\d,]+)\s+(Genesis Crystals?|Chronal Nexus)\s*$/i)
  if (m && /gem|stall/i.test(pid || 'gem'))
    return { kind: 'currency', item: /chronal/i.test(m[2]) ? 'Chronal Nexus' : 'Genesis Crystal', baseItemAmount: int(m[1]) }
  if (/blessofmoon/i.test(pid)) {
    return { kind: 'pass', contents: null, contents_null_reason: 'Apple description does not itemise the contents' }
  }
  if (/_bp_|bptier|bp\d|discounttierbp/i.test(pid)) return { kind: 'pass', contents: null, contents_null_reason: PASS_REWARDS_IN_GAME }
  const f = name.match(/^(.+?)\s*[×x]\s*([\d,]+)\s*$/)
  if (f) return { kind: 'bundle', contents: [{ item: f[1].trim(), amount: int(f[2]) }] }
  return { kind: 'bundle', contents: null, contents_null_reason: 'Apple description does not itemise the contents' }
}

const APPSTORE_CFG: AppStoreGameConfig = {
  ...GAME,
  thUrl: GENSHIN_APPSTORE_TH_URL,
  usUrl: GENSHIN_APPSTORE_US_URL,
  categoryNames: { currency: 'Genesis Crystals & Chronal Nexus (App Store)', pass: 'Welkin Moon & Passes (App Store)', bundle: 'Fates, Keystones & Bundles (App Store)' },
  classify: genshinAppStoreClassify,
  notes: ['Fallback: the HoYoverse Top-Up Center goods list was unavailable, so THB comes from the official App Store TH list. The first-purchase bonus is not published by Apple, so bonus / total are null with a reason.']
}

/** Live Genshin Impact packs. HoYoverse Top-Up Center (THB) first, App Store TH fallback; all down -> throws (502). */
export async function fetchGenshinImpactPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
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

import { fetchAppStoreFullIap, APPSTORE_FULL_IAP_NOTE, APPSTORE_IAP_API_BASE, type AppStoreFullIapRow } from './appstore-full-iap'
import type { RovPacksResponse } from '../types/rov'
import { matchApple } from './where-winds-meet-packs.service'

/**
 * HAIKYU!! FLY HIGH (Garena, Thailand/SEA) - official Garena Topup Center for Thailand (termgame.com, app_id 100153,
 * region TH; same API as shop.garena.sg). THB = original_currency_amount of the default THB channel (QR PromptPay);
 * Star Gems base = app_point_amount, bonus = promo.real_promo_amount. Other THB channels (TrueMoney / carrier SMS) are
 * listed only when their denominations differ; Garena Shell/prepaid-card (GS) channels are excluded.
 * Apple App Store (app 6737688139, com.garena.game.haikyu): Garena item ids map 1:1 to Apple offerName "hiq.diamond.<item_id>".
 * USD = App Store US (else KH/LA/MM when the US list is unavailable) by that offerName. Passes / monthly passes / check-in
 * funds are not sold on the Garena web shop, so they come from App Store TH (THB, Thai names) + US (USD, English names).
 * No FX, no resellers, no hardcoded prices.
 */
export const HAIKYU_SLUG = 'haikyu-fly-high'
export const HAIKYU_GARENA_APP_ID = 100153
export const HAIKYU_APPLE_ID = 6737688139
export const HAIKYU_SHOP_URL = `https://termgame.com/?app=${HAIKYU_GARENA_APP_ID}`
export const haikyuChannelsUrl = (lang: 'en' | 'th', host = 'termgame.com') =>
  `https://${host}/api/shop/apps/channels?app_id=${HAIKYU_GARENA_APP_ID}&region=TH&language=${lang}`
export const HAIKYU_FALLBACK_HOST = 'shop.garena.sg'
export const HAIKYU_DEFAULT_CHANNEL = 207269
export const HAIKYU_USD_FALLBACK_STOREFRONTS = ['kh', 'la', 'mm'] as const
export const haikyuCatalogUrl = (cc: string) => `${APPSTORE_IAP_API_BASE}/${cc}/apps/${HAIKYU_APPLE_ID}/top-in-apps`
export const haikyuAppleOffer = (itemId: number | string) => `hiq.diamond.${itemId}`
/** Passes sold only in-app: Monthly / Premium Monthly Pass, Premium Pass (DX / upgrade), Battle Pass, Daily Check-in Fund. */
export const HAIKYU_PASS_RE = /\b(pass|fund)\b|บัตรเดือน|กองทุนเช็กอิน/i
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class HaikyuUpstreamUnavailableError extends Error {
  constructor(message = 'HAIKYU!! FLY HIGH Garena Topup Center upstream unavailable') { super(message); this.name = 'HaikyuUpstreamUnavailableError' }
}
export class HaikyuInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid HAIKYU!! FLY HIGH Garena Topup Center response') { super(message); this.name = 'HaikyuInvalidUpstreamResponseError' }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const THAI = /[\u0E00-\u0E7F]/
const thai = (s: string | null | undefined) => (s && THAI.test(s) ? s : null)

export type HaikyuItem = {
  item_id: number; base: number; price: number; name: string; description: string; logo: string | null
  promo: { real: number | null; firsttime: number; onetime: number }; limited: boolean; special_deal: boolean
}
export type HaikyuChannel = { id: number; name: string; items: HaikyuItem[] }

/** THB channels only (visible); GS (Garena Shell / prepaid card) channels excluded and counted. */
export function parseHaikyuChannels(json: any): { channels: HaikyuChannel[]; excluded: string[] } {
  if (!json || typeof json !== 'object' || !Array.isArray(json.channels)) throw new HaikyuInvalidUpstreamResponseError('Unexpected channels payload')
  const channels: HaikyuChannel[] = []; const excluded: string[] = []
  for (const c of json.channels) {
    if (!c || typeof c !== 'object' || num(c.channel) === null || !Array.isArray(c.items)) continue
    const name = str(c.name) || String(c.channel)
    if (c.currency !== 'THB') { excluded.push(`${name} (${c.channel}, currency ${c.currency})`); continue }
    if (c.visible === false) continue
    const items: HaikyuItem[] = []
    for (const i of c.items) {
      const price = num(i?.original_currency_amount) ?? num(i?.currency_amount)
      const itemId = num(i?.item_id)
      if (price === null || itemId === null || i.currency !== 'THB') continue
      const ai = i.app_item && typeof i.app_item === 'object' ? i.app_item : {}
      if (ai.show_on_shop === false) continue
      const base = num(i.app_point_amount) ?? 0
      const name = str(ai.name)
      if (base <= 0 && !name) continue
      let extra: any = {}
      try { extra = typeof i.extra_data === 'string' ? JSON.parse(i.extra_data) : {} } catch { extra = {} }
      const p = i.promo && typeof i.promo === 'object' ? i.promo : null
      items.push({
        item_id: itemId, base, price, name, description: str(ai.description), logo: typeof ai.logo === 'string' ? ai.logo : null,
        promo: { real: p ? num(p.real_promo_amount) : null, firsttime: (p && num(p.firsttime_promo_amount)) || 0, onetime: (p && num(p.onetime_promo_amount)) || 0 },
        limited: i.is_limited_package === true, special_deal: extra?.npc_config?.display_in_special_deal === true
      })
    }
    if (items.length) channels.push({ id: c.channel, name, items })
  }
  return { channels, excluded }
}

type List = { rows: AppStoreFullIapRow[] } | { rows: null; reason: string }
const reasonOf = (x: List) => ('reason' in x ? x.reason : '')
async function list(cc: string, l: string | null, signal?: AbortSignal): Promise<List> {
  try { return { rows: await fetchAppStoreFullIap(cc, String(HAIKYU_APPLE_ID), l, signal) } } catch (e) { return { rows: null, reason: e instanceof Error ? e.message : String(e) } }
}
async function getJson(url: string, signal?: AbortSignal): Promise<any> {
  let r: Response
  try {
    r = await fetch(url, { signal: signal ?? AbortSignal.timeout(25_000), headers: { 'User-Agent': UA, Accept: 'application/json', Referer: HAIKYU_SHOP_URL } })
  } catch (e) { throw new HaikyuUpstreamUnavailableError(e instanceof Error ? e.message : 'network error') }
  if (!r.ok) throw new HaikyuUpstreamUnavailableError('HTTP ' + r.status)
  try { return await r.json() } catch { throw new HaikyuInvalidUpstreamResponseError('Non-JSON response') }
}
/** termgame.com (Garena TH) first, then the same Garena API on shop.garena.sg. */
async function channels(lang: 'en' | 'th', signal?: AbortSignal): Promise<{ json: any; url: string }> {
  try { const url = haikyuChannelsUrl(lang); return { json: await getJson(url, signal), url } } catch (e) {
    if (e instanceof HaikyuInvalidUpstreamResponseError) throw e
    const url = haikyuChannelsUrl(lang, HAIKYU_FALLBACK_HOST); return { json: await getJson(url, signal), url }
  }
}

const sig = (c: HaikyuChannel) => c.items.map((i) => `${i.item_id}@${i.price}+${i.promo.real}`).sort().join('|')

export async function fetchHaikyuFlyHighPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const en = await channels('en', signal)
  const parsed = parseHaikyuChannels(en.json)
  if (!parsed.channels.length) throw new HaikyuInvalidUpstreamResponseError('No THB items found')
  const thRes = await channels('th', signal).catch((e) => ({ json: null, url: '', error: e instanceof Error ? e.message : String(e) }))
  const thNames = new Map<number, { name: string; description: string }>()
  if (thRes.json) { try { for (const c of parseHaikyuChannels(thRes.json).channels) for (const i of c.items) if (!thNames.has(i.item_id)) thNames.set(i.item_id, { name: i.name, description: i.description }) } catch { /* Thai names optional */ } }
  const thReason = thRes.json ? 'No Thai text in the official Garena TH (language=th) item' : `Official Garena TH Thai-language list unavailable (${(thRes as any).error})`

  const thTh = await list('th', 'th', signal)
  const us = await list('us', 'en-US', signal)
  const fb: Record<string, List> = {}
  // Fallback USD storefronts only when the US list itself is unavailable (Apple's HAIKYU catalog is the same set of
  // hiq.diamond.* items on every storefront, ~870 items = ~88 paged calls each).
  const usdFor = async (ref: { offerName: string }) => {
    if (us.rows) { const m = matchApple(us.rows, ref); return m && m.row.currency === 'USD' ? { m, cc: 'us' } : null }
    for (const cc of HAIKYU_USD_FALLBACK_STOREFRONTS) {
      fb[cc] ??= await list(cc, null, signal)
      if (!fb[cc].rows) continue
      const f = matchApple(fb[cc].rows, ref)
      return f && f.row.currency === 'USD' ? { m: f, cc } : null
    }
    return null
  }
  const usdReason = (offer: string) =>
    us.rows
      ? `Not sold on the App Store (no ${offer} in the App Store US list); Garena TH shop has no USD`
      : `App Store US list unavailable (${reasonOf(us)}); not found on ${HAIKYU_USD_FALLBACK_STOREFRONTS.map((c) => c.toUpperCase()).join('/')} either`
  const thList = () => (thTh.rows ? 'not in the Thai-language App Store TH list by offerName' : `Thai-language App Store TH list unavailable (${reasonOf(thTh)})`)

  const def = parsed.channels.find((c) => c.id === HAIKYU_DEFAULT_CHANNEL) ?? [...parsed.channels].sort((a, b) => b.items.length - a.items.length)[0]
  const sameAsDefault: string[] = []
  const extraGroups: { c: HaikyuChannel; names: string[] }[] = []
  for (const c of parsed.channels) {
    if (c === def) continue
    const s = sig(c)
    if (s === sig(def)) { sameAsDefault.push(c.name); continue }
    const g = extraGroups.find((x) => sig(x.c) === s)
    if (g) g.names.push(c.name)
    else extraGroups.push({ c, names: [c.name] })
  }

  const toPack = async (i: HaikyuItem, ch: HaikyuChannel, channelNames: string[]) => {
    const offer = haikyuAppleOffer(i.item_id)
    const isCur = i.base > 0
    const thT = thNames.get(i.item_id)
    const nameTh = thai(thT?.name); const descTh = thai(thT?.description)
    const isDefault = ch === def
    const u = isDefault ? await usdFor({ offerName: offer }) : null
    const appTh = isDefault ? matchApple(thTh.rows, { offerName: offer })?.row : undefined
    const bonus = isCur ? i.promo.real : null
    const pack: any = {
      id: i.item_id, name: i.name || `${i.base} Star Gems`, product_id: String(i.item_id), kind: isCur ? 'currency' : 'bundle', store: 'garena-topup-center-th',
      name_th: nameTh, name_th_source: nameTh ? 'garena-topup-center-th (language=th)' : null, ...(nameTh ? {} : { name_th_null_reason: thReason }),
      description: [descTh, i.description].filter((x, k, a) => x && a.indexOf(x) === k).join(' / ') || null,
      description_th: descTh, description_th_source: descTh ? 'garena-topup-center-th (language=th)' : null, ...(descTh ? {} : { description_th_null_reason: thReason }),
      description_en: i.description || null, description_en_source: i.description ? 'garena-topup-center-th (language=en)' : null,
      ...(i.description ? {} : { description_en_null_reason: 'No official item description' }),
      image_url: i.logo,
      baseItemAmount: isCur ? i.base : null, bonusItemAmount: bonus, totalItemAmount: isCur && bonus !== null ? i.base + bonus : null,
      item_pack: !isCur,
      ...(isCur
        ? { bonus_breakdown: { promo_bonus: i.promo.real, first_time_bonus: i.promo.firsttime, one_time_bonus: i.promo.onetime }, bonus_available: bonus !== null, bonus_source: bonus !== null ? 'garena-topup-center promo.real_promo_amount (live)' : null, ...(bonus === null ? { bonus_null_reason: 'Garena item has no promo block', total_null_reason: 'No bonus value' } : {}) }
        : { pack_type: i.item_id === 16001 ? 'level-up-bonus' : i.special_deal ? 'special-deal' : 'bundle', base_null_reason: 'Item pack (contents in description); grants no Star Gems directly', bonus_null_reason: 'Item pack: no Star Gems bonus', total_null_reason: 'Item pack contents are not a single Star Gems amount', limited_package: i.limited }),
      channel_id: ch.id, channel_name: channelNames.join(', '),
      apple_offer_name: isDefault ? offer : null, apple_item_id: u?.m.row.id ?? appTh?.id ?? null,
      price_thb: i.price, price_thb_source: `garena-topup-center-th (official, region TH, channel ${ch.id}, original_currency_amount)`,
      price_usd: u ? u.m.row.price : null, price_usd_source: u ? `apple-app-store-${u.cc} (USD storefront, ${u.m.by})` : null,
      appstore_th_price_thb: appTh && appTh.currency === 'THB' ? appTh.price : null,
      price: i.price, currency: 'THB'
    }
    if (!pack.price_usd_source) pack.price_usd_null_reason = isDefault ? usdReason(offer) : `Channel-specific denomination (${ch.name}); no App Store equivalent, Garena TH shop has no USD`
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    return pack
  }

  const defNames = [def.name, ...sameAsDefault]
  const defPacks = [] as any[]
  for (const i of def.items) defPacks.push(await toPack(i, def, defNames))
  const garenaOffers = new Set(parsed.channels.flatMap((c) => c.items.map((i) => haikyuAppleOffer(i.item_id))))

  // Passes: App Store-only (not on the Garena web shop).
  const passRefs: { offer: string; th?: AppStoreFullIapRow; us?: AppStoreFullIapRow }[] = []
  const usRows = us.rows ?? (await (async () => { for (const cc of HAIKYU_USD_FALLBACK_STOREFRONTS) { fb[cc] ??= await list(cc, null, signal); if (fb[cc].rows) return fb[cc].rows } return null })())
  for (const r of [...(usRows ?? []), ...(thTh.rows ?? [])]) {
    if (!r.offerName || garenaOffers.has(r.offerName) || passRefs.some((p) => p.offer === r.offerName)) continue
    const usR = matchApple(usRows, { offerName: r.offerName })?.row
    const thR = matchApple(thTh.rows, { offerName: r.offerName })?.row
    if (!HAIKYU_PASS_RE.test(`${usR?.name ?? ''} ${thR?.name ?? ''}`)) continue
    passRefs.push({ offer: r.offerName, th: thR, us: usR })
  }
  const passes = []
  for (const p of passRefs) {
    const u = await usdFor({ offerName: p.offer })
    const nameEn = p.us?.name ?? (thai(p.th?.name) ? null : p.th?.name) ?? null
    const nameTh = thai(p.th?.name)
    const descEn = p.us?.description ?? null; const descTh = thai(p.th?.description)
    const thb = p.th && p.th.currency === 'THB' ? p.th.price : null
    const usd = u ? u.m.row.price : null
    const n = `${nameEn ?? ''} ${p.th?.name ?? ''}`
    const pack: any = {
      id: Number(p.th?.id ?? p.us?.id) || 0, name: nameEn ?? p.th?.name ?? p.offer, product_id: p.offer, kind: 'pass', store: 'apple-app-store',
      name_th: nameTh, name_th_source: nameTh ? 'apple-app-store-th (th)' : null, ...(nameTh ? {} : { name_th_null_reason: p.th ? 'Thai-language App Store TH item name is not in Thai' : thList() }),
      description: [descTh, descEn].filter((x, k, a) => x && a.indexOf(x) === k).join(' / ') || null,
      description_th: descTh, description_th_source: descTh ? 'apple-app-store-th (th)' : null, ...(descTh ? {} : { description_th_null_reason: p.th ? 'Thai-language App Store TH description is not in Thai' : thList() }),
      description_en: descEn, description_en_source: descEn ? `apple-app-store-${u?.cc ?? 'us'} (en)` : null, ...(descEn ? {} : { description_en_null_reason: 'No English App Store description' }),
      apple_item_id: p.th?.id ?? p.us?.id ?? null,
      baseItemAmount: null, bonusItemAmount: null, totalItemAmount: null, item_pack: true,
      pack_type: /monthly|บัตรเดือน/i.test(n) ? 'monthly-pass' : /fund|กองทุน/i.test(n) ? 'check-in-fund' : /upgrade|อัปเกรด/i.test(n) ? 'pass-upgrade' : /battle/i.test(n) ? 'battle-pass' : 'premium-pass',
      base_null_reason: 'Pass (rewards unlock in-game; contents not itemised by Apple)', bonus_null_reason: 'Pass: no Star Gems bonus', total_null_reason: 'Pass: not a Star Gems amount',
      availability_note: 'Sold only in-app (not on the Garena TH web shop); Apple keeps listing past season passes',
      price_thb: thb, price_thb_source: thb !== null ? `apple-app-store-th (item ${p.th!.id}, offerName=${p.offer})` : null,
      price_usd: usd, price_usd_source: u ? `apple-app-store-${u.cc} (USD storefront, ${u.m.by})` : null,
      price: thb ?? usd, currency: thb !== null ? 'THB' : usd !== null ? 'USD' : null
    }
    if (thb === null) pack.price_thb_null_reason = thTh.rows ? 'Not sold on App Store TH (by offerName); not on the Garena TH web shop' : `App Store TH list unavailable (${reasonOf(thTh)})`
    if (usd === null) pack.price_usd_null_reason = usdReason(p.offer)
    pack.prices = { THB: pack.price_thb, USD: pack.price_usd }
    passes.push(pack)
  }

  const extraCats = []
  for (const g of extraGroups) {
    const ps = [] as any[]
    for (const i of g.c.items) ps.push(await toPack(i, g.c, g.names))
    extraCats.push({ name: `Star Gems (${g.names.join(' / ')}, official Garena TH channel denominations)`, packs: ps })
  }
  const sortP = (a: any, b: any) => (a.price_thb ?? Infinity) - (b.price_thb ?? Infinity) || (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) || a.id - b.id
  const msg = 'Live (no fallback catalog)'
  const cats = [
    { name: `Star Gems (Official Garena Topup Center TH, ${def.name})`, packs: defPacks.filter((p) => p.kind === 'currency') },
    { name: `Item Packs (Official Garena Topup Center TH, ${def.name})`, packs: defPacks.filter((p) => p.kind !== 'currency') },
    { name: 'Passes (Monthly / Premium / Battle Pass, Check-in Fund; App Store TH THB / USD storefront)', packs: passes },
    ...extraCats
  ]
  const categories = cats.filter((c) => c.packs.length).map((c, k) => ({ id: k + 1, ...c, packs: c.packs.sort(sortP), status: 0, message: msg, packCount: c.packs.length }))
  const appTotal = us.rows?.length ?? thTh.rows?.length ?? null
  const notes = [
    `Main: official Garena Topup Center Thailand (termgame.com, app_id ${HAIKYU_GARENA_APP_ID}, region TH; live channels API, same data as the shop page). THB = original_currency_amount on the default channel ${def.name} (${def.id})${sameAsDefault.length ? `; identical on ${sameAsDefault.join(', ')}` : ''}. Star Gems base = app_point_amount, bonus = promo.real_promo_amount (live). No FX conversion, no resellers.`,
    `USD: the Garena TH shop has no USD, so USD = Apple App Store US price of the same item (Garena item_id N = Apple offerName "hiq.diamond.N"), else ${HAIKYU_USD_FALLBACK_STOREFRONTS.map((c) => c.toUpperCase()).join('/')} when the US list is unavailable. appstore_th_price_thb is shown for reference (App Store TH can differ from the web shop).`,
    'Passes (Monthly Pass, Premium Monthly Pass, Premium Pass / DX / upgrade, Battle Pass, Daily Check-in Fund) are not sold on the Garena web shop; they come from App Store TH (THB, Thai names) and App Store US (USD, English names) by offerName. Apple keeps listing past season passes, so a season pass may be purchasable only during its season.',
    `Other THB channels with different denominations are listed as their own categories (USD null). Excluded: ${parsed.excluded.join(', ') || 'none'} - Garena Shell / prepaid-card currency, not real THB checkout.`,
    `App Store-only limited event packs (${appTotal ?? 'many'} Apple IAPs in total, mostly past in-game event packs) are not listed; only passes are taken from the App Store.`,
    APPSTORE_FULL_IAP_NOTE
  ]
  if (!thTh.rows) notes.push('App Store TH (Thai): ' + reasonOf(thTh))
  if (!us.rows) notes.push('App Store US: ' + reasonOf(us))
  if (!thRes.json) notes.push(thReason)
  return ({
    game: { id: HAIKYU_GARENA_APP_ID, slug: HAIKYU_SLUG, name: 'HAIKYU!! FLY HIGH', itemName: 'Star Gems', itemIcon: str(en.json?.app_info?.point_icon) },
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s, c) => s + c.packCount, 0) },
    fetchedAt: new Date().toISOString(),
    source: en.url,
    sources: {
      thb: en.url, thai_names: thRes.json ? (thRes as any).url : null, shop_page: HAIKYU_SHOP_URL,
      appstore_th: haikyuCatalogUrl('th'), appstore_us: haikyuCatalogUrl('us'), appstore_usd_fallback: HAIKYU_USD_FALLBACK_STOREFRONTS.map(haikyuCatalogUrl)
    },
    notes
  } as unknown) as RovPacksResponse
}

import type { RovPacksResponse } from '../types/rov'
import {
  AppStoreGameInvalidUpstreamResponseError,
  AppStoreGameUpstreamUnavailableError,
  fetchAppStoreGamePacks,
  gameEnvelope,
  type AppStoreGameConfig,
  type AsClassified,
  type AsItemInput
} from './appstore-game-packs'

/**
 * Last War: Survival, published by FUNFLY PTE. LTD. (App Store id 6448786147, sold on the Thai App Store).
 *   1) Official Last War Store (https://store.lastwar.com/): the public, logged-out storefront list is shipped in the
 *      store's own live main JS (defaultGoodsData = Gold Brick tiers, defaultPackData = gift packs, USD). Local-currency
 *      (THB) prices are only shown after a game-account login, which is not done -> web-store THB is null with a reason.
 *      Base = pay_brick_num, bonus = free_brick_num (store fields). Pack names (EN/TH) come from the store's own locales.
 *   2) Official Apple App Store TH full in-app list (THB) + App Store US -> KH/LA/MM (USD), via the shared builder.
 * Web Gold Brick tiers and App Store Hot Packages are different products, so prices are never matched across them.
 * No FX, no resellers, no hardcoded prices or amounts.
 */

export const LAST_WAR_STORE_URL = 'https://store.lastwar.com/'
export const LAST_WAR_APP_ID = 6448786147
export const LAST_WAR_GAME_ID = 200001
export const LAST_WAR_SLUG = 'last-war'
export const LAST_WAR_TH_URL = 'https://apps.apple.com/th/app/last-war-survival/id6448786147'
export const LAST_WAR_US_URL = 'https://apps.apple.com/us/app/last-war-survival/id6448786147'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null)

/** Slice and evaluate one JS array literal `name=[...]` from the store's JS (object literal syntax, 1e3 etc.). */
export function lastWarJsArray(js: string, name: string): any[] | null {
  const start = js.indexOf(name + '=[')
  if (start < 0) return null
  const a = start + name.length + 1
  let depth = 0
  let q: string | null = null
  for (let i = a; i < js.length; i++) {
    const ch = js[i]
    if (q) {
      if (ch === '\\') i++
      else if (ch === q) q = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') q = ch
    else if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') {
      depth--
      if (depth === 0) {
        const lit = js.slice(a, i + 1)
        if (!/^[\[\]{}\w\s:,."'$;.+-]*$/.test(lit.replace(/"[^"]*"/g, '""'))) return null
        try {
          // eslint-disable-next-line no-new-func
          const v = Function(`"use strict"; return (${lit})`)()
          return Array.isArray(v) ? v : null
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** A locale string key (e.g. giftTitle4) from the store's bundled locales: EN = the locale with freeClaim "Free Claim", TH = Thai text. */
export function lastWarLocaleString(js: string, key: string): { en: string | null; th: string | null } {
  const re = new RegExp(key + `:(["'])((?:(?!\\1).)*)\\1`, 'g')
  let en: string | null = null
  let th: string | null = null
  for (const m of js.matchAll(re)) {
    const v = m[2].replace(/^["']|["']$/g, '').trim()
    if (!th && /[\u0E00-\u0E7F]/.test(v)) th = v
    const fc = js.indexOf('freeClaim:', m.index!)
    if (!en && fc >= 0 && fc - m.index! < 2000 && js.startsWith('freeClaim:"Free Claim"', fc)) en = v
  }
  return { en, th }
}

/** PACK_CONFIG entry title key for a pack id (the config holds image variables, so it is read by pattern, not evaluated). */
export function lastWarPackTitleKey(js: string, id: string): { title: string } | null {
  if (!/^\d+$/.test(id)) return null
  const m = js.match(new RegExp(`\\{id:${id},title:"([\\w.]+)"`))
  return m ? { title: m[1] } : null
}

const PRICE_THB_NULL =
  'The official Last War Store shows its public (logged-out) list in USD only; THB prices are shown only after logging in with a game account (not done), and USD is not converted (no FX)'

function usdOf(cur: unknown, amount: unknown): number | null {
  return String(cur ?? '').toUpperCase() === 'USD' ? num(amount) : null
}

export function buildLastWarGoldBrick(g: any, names: { th: string | null }) {
  const base = num(g?.pay_brick_num)
  const bonus = num(g?.free_brick_num)
  const usd = usdOf(g?.currency, g?.amount)
  const p: any = {
    id: 0,
    name: base != null ? `Gold Brick ${base}` : String(g?.goods_id ?? ''),
    name_en: base != null ? `${base.toLocaleString('en-US')} Gold Bricks` : null,
    name_th: names.th && base != null ? `${names.th} ${base.toLocaleString('en-US')}` : null,
    product_id: g?.goods_id ?? null,
    kind: 'currency',
    item: 'Gold Brick',
    item_pack: false,
    store_status: g?.status ?? null,
    baseItemAmount: base,
    bonusItemAmount: bonus,
    totalItemAmount: base != null && bonus != null ? base + bonus : null,
    price: usd,
    currency: 'USD',
    prices: { THB: null, USD: usd },
    price_thb: null,
    price_thb_source: null,
    price_thb_null_reason: PRICE_THB_NULL,
    price_usd: usd,
    price_usd_source: usd != null ? `last-war-official-store (store.lastwar.com defaultGoodsData, ${g?.goods_id})` : null,
    contents: base != null ? [{ item: 'Gold Brick', amount: base }, ...(bonus ? [{ item: 'Gold Brick (bonus)', amount: bonus }] : [])] : null,
    source: 'last-war-official-store'
  }
  if (usd == null) p.price_usd_null_reason = `The store listed this tier in ${g?.currency ?? 'an unknown currency'}, not USD; no FX`
  if (!p.name_th) p.name_th_null_reason = 'The store shows Gold Brick tiers as an icon and number only, with no Thai (or English) tier name'
  if (base == null) p.base_null_reason = 'The store gave no pay_brick_num'
  if (bonus == null) p.bonus_null_reason = 'The store gave no free_brick_num; not assumed to be 0'
  return p
}

export function buildLastWarGiftPack(k: any, cfg: any, title: { en: string | null; th: string | null }) {
  const usd = usdOf(k?.currencyInfo?.currency, k?.currencyInfo?.amount)
  const items = String(k?.item ?? '')
    .split(/[|,]/)
    .map((s) => s.split(';'))
    .filter((x) => x[0])
    .map(([id, n]) => ({ item: `Item ${id} (shown as an icon only in the store; name not given)`, item_id: id, amount: num(n) }))
  const extra = num(k?.extraGoldBricks)
  const diamonds = num(k?.diamond)
  const contents = [...items, ...(diamonds ? [{ item: 'Diamond', amount: diamonds }] : []), ...(extra ? [{ item: 'Gold Brick (extra)', amount: extra }] : [])]
  const p: any = {
    id: 0,
    name: title.en ?? `Pack ${k?.id}`,
    name_en: title.en,
    name_th: title.th,
    product_id: String(k?.id ?? ''),
    kind: 'bundle',
    item: 'Gold Brick',
    item_pack: true,
    purchase_limit_total: num(k?.total),
    baseItemAmount: null,
    base_null_reason: `The store gives this pack a "gold_brick_doller" value of ${k?.gold_brick_doller ?? 'n/a'} but does not say it is Gold Bricks received, so no base is stated`,
    bonusItemAmount: extra,
    totalItemAmount: null,
    total_null_reason: 'Base not stated by the official store',
    store_gold_brick_value: num(k?.gold_brick_doller),
    price: usd,
    currency: 'USD',
    prices: { THB: null, USD: usd },
    price_thb: null,
    price_thb_source: null,
    price_thb_null_reason: PRICE_THB_NULL,
    price_usd: usd,
    price_usd_source: usd != null ? `last-war-official-store (store.lastwar.com defaultPackData, ${k?.id})` : null,
    description_en: title.en ? `${title.en}: ${contents.map((c) => `${c.amount ?? '?'} × ${c.item.replace(/ \(shown.*\)$/, '')}`).join(', ')}` : null,
    description_th: title.th ? `${title.th}: ${contents.map((c) => `${c.amount ?? '?'} × ${c.item.replace(/ \(shown.*\)$/, '')}`).join(', ')}` : null,
    contents: contents.length ? contents : null,
    source: 'last-war-official-store'
  }
  if (cfg?.title) p.store_title_key = cfg.title
  if (!title.en) p.name_en_null_reason = 'The store locale has no English title for this pack'
  if (!title.th) p.name_th_null_reason = 'The store locale has no Thai title for this pack'
  if (!p.description_en) p.description_en_null_reason = 'No English pack title in the store locale'
  if (!p.description_th) p.description_th_null_reason = 'No Thai pack title in the store locale'
  if (!contents.length) p.contents_null_reason = 'The store listed no items for this pack'
  if (extra == null) p.bonus_null_reason = 'The store gave no extraGoldBricks; not assumed to be 0'
  if (usd == null) p.price_usd_null_reason = 'The store gave no USD price for this pack'
  return p
}

export function lastWarAppStoreClassify(it: AsItemInput): AsClassified {
  const pid = it.productId ?? ''
  const n = it.nameEn ?? it.rawName
  const generic = `Apple's listing gives only the name ("${n}"); what the pack contains is shown in-game only`
  if (/pass|month_card/i.test(pid) || /pass/i.test(n)) return { kind: 'pass', contents: null, contents_null_reason: generic }
  return { kind: 'bundle', contents: null, contents_null_reason: `${generic}. Hot Packages are in-game offer slots whose rewards change, not a fixed Gold Brick amount` }
}

const APPSTORE_CFG: AppStoreGameConfig = {
  appId: LAST_WAR_APP_ID,
  slug: LAST_WAR_SLUG,
  name: 'Last War',
  officialTitle: 'Last War:Survival',
  publisher: 'FUNFLY PTE. LTD.',
  itemName: 'Gold Brick',
  thUrl: LAST_WAR_TH_URL,
  usUrl: LAST_WAR_US_URL,
  categoryNames: { currency: 'Currency (App Store)', pass: 'Passes (App Store)', bundle: 'Hot Packages (App Store)' },
  classify: lastWarAppStoreClassify,
  nameThNullReason: (raw) => `App Store TH (Thai locale) lists this item under its English name only ("${raw}")`,
  notes: []
}

const NOTES = [
  `Last War: Survival (App Store title "Last War:Survival") is published by FUNFLY PTE. LTD. and is sold on the Thai App Store (id ${LAST_WAR_APP_ID}). Official web store: ${LAST_WAR_STORE_URL}.`,
  'Official Last War Store: the public logged-out list from the store\'s live JS (Gold Brick tiers + gift packs, USD). THB is shown by the store only after a game-account login (not done), so web-store THB is null; no FX. Base = pay_brick_num, bonus = free_brick_num.',
  'App Store: full in-app list, THB from App Store TH, USD from App Store US -> KH/LA/MM matched by offerName. Hot Packages and passes are named without contents, so contents are null with a reason. Web Gold Brick tiers and App Store Hot Packages are different products and are not price-matched.'
]

async function getText(url: string, signal?: AbortSignal, referer?: string): Promise<string> {
  let r: Response
  try {
    r = await fetch(url, { signal: signal ?? AbortSignal.timeout(20_000), headers: { 'User-Agent': UA, Accept: '*/*', ...(referer ? { Referer: referer } : {}) } })
  } catch (e) {
    throw new AppStoreGameUpstreamUnavailableError(`Last War store: ${e instanceof Error ? e.message : String(e)}`)
  }
  if (!r.ok) throw new AppStoreGameUpstreamUnavailableError(`Last War store: HTTP ${r.status} for ${url}`)
  return r.text()
}

async function storeSide(signal?: AbortSignal) {
  const html = await getText(LAST_WAR_STORE_URL, signal)
  const m = html.match(/src="(\/assets\/js\/main-[^"]+\.js)"/)
  if (!m) throw new AppStoreGameInvalidUpstreamResponseError('Last War store: main JS not found')
  const js = await getText(new URL(m[1], LAST_WAR_STORE_URL).toString(), signal, LAST_WAR_STORE_URL)
  const goods = lastWarJsArray(js, 'defaultGoodsData')
  if (!goods?.length) throw new AppStoreGameInvalidUpstreamResponseError('Last War store: defaultGoodsData empty')
  const packs = lastWarJsArray(js, 'defaultPackData') ?? []
  const brickTh: string | null = null
  const gold = goods
    .filter((g) => g?.goods_id && !String(g.goods_id).includes('double'))
    .map((g) => buildLastWarGoldBrick(g, { th: brickTh }))
    .sort((a, b) => (a.baseItemAmount ?? 0) - (b.baseItemAmount ?? 0))
  const gifts = packs.map((k) => {
    const cfg = lastWarPackTitleKey(js, String(k?.id ?? ''))
    const key = String(cfg?.title ?? '').split('.').pop() ?? ''
    return buildLastWarGiftPack(k, cfg, key ? lastWarLocaleString(js, key) : { en: null, th: null })
  })
  return { gold, gifts, mainJs: m[1] }
}

/** Live Last War packs: official store (USD, logged-out list) + App Store TH/US full in-app list. */
export async function fetchLastWarStorePacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const signal = options?.signal
  const [wR, asR] = await Promise.allSettled([storeSide(signal), fetchAppStoreGamePacks(APPSTORE_CFG, signal)])
  const err = (r: PromiseSettledResult<unknown>) => (r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : null)
  if (wR.status === 'rejected' && asR.status === 'rejected') {
    const e = asR.reason
    throw e instanceof AppStoreGameInvalidUpstreamResponseError || e instanceof AppStoreGameUpstreamUnavailableError
      ? e
      : new AppStoreGameUpstreamUnavailableError(e instanceof Error ? e.message : String(e))
  }
  const cats: any[] = []
  if (wR.status === 'fulfilled') {
    if (wR.value.gifts.length) cats.push({ name: 'Special Packs (official Last War Store)', packs: wR.value.gifts, status: 0, message: 'Live official store list (logged-out, USD)' })
    cats.push({ name: 'Gold Bricks (official Last War Store)', packs: wR.value.gold, status: 0, message: 'Live official store list (logged-out, USD)' })
  }
  const as: any = asR.status === 'fulfilled' ? asR.value : null
  if (as) for (const c of as.categories) cats.push(c)
  let n = 0
  const categories = cats.map((c, i) => {
    for (const p of c.packs) p.id = ++n
    return { ...c, id: i + 1, packCount: c.packs.length }
  })
  const notes = [...NOTES, ...(as ? as.notes : [])]
  if (wR.status === 'rejected') notes.unshift(`Official Last War Store unavailable (${err(wR)}); App Store list only.`)
  if (!as) notes.unshift(`App Store unavailable (${err(asR)}); web store list only.`)
  return gameEnvelope(
    { appId: LAST_WAR_GAME_ID, slug: LAST_WAR_SLUG, name: 'Last War', itemName: 'Gold Brick', officialTitle: APPSTORE_CFG.officialTitle, publisher: APPSTORE_CFG.publisher },
    categories,
    {
      source: LAST_WAR_STORE_URL,
      sources: { thb: LAST_WAR_TH_URL, usd: wR.status === 'fulfilled' ? LAST_WAR_STORE_URL : LAST_WAR_US_URL, webshop: LAST_WAR_STORE_URL },
      source_details: {
        webshop: LAST_WAR_STORE_URL,
        apple_app_id: LAST_WAR_APP_ID,
        ...(wR.status === 'fulfilled' ? { webshop_main_js: wR.value.mainJs } : { webshop_error: err(wR) }),
        ...(as?.source_details ?? {}),
        ...(as ? {} : { appstore_error: err(asR) })
      },
      source_mode: wR.status === 'fulfilled' && as ? 'lastwar-store+appstore' : wR.status === 'fulfilled' ? 'lastwar-store' : as?.source_mode
    },
    notes
  )
}

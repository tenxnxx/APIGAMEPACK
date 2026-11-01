import type { RovPacksResponse } from '../types/rov'
import { parseCookieRunClassicIapFromHtml } from './cookierun-classic-appstore-packs.service'

/**
 * Dark War: Survival (App Store "Dark War:Survival", id 6670441558, bundle com.readygo.dark.nbios; seller Omnilojo Pte. Ltd.,
 * webshop copyright Florere Game Limited; Google Play com.readygo.dark.gp; released 2024-09-19, available on App Store TH).
 *
 * Primary source = the publisher's official webshop https://pay.darkwar-survival.com/ ("Dark War: Survival Store"), which
 * prices in the requester's region currency (THB for Thailand) without login:
 *   getitem.php    -> Dawn Badge top-ups (price, pay_brick_num = base, free_brick_num = bonus, doubleGoodsList = "Double!" promo)
 *   getproduct.php -> weekly / monthly / limited packs (contents + price tier goods_id -> price from getitem)
 *   getwarpass.php -> Value Pass paid tiers (adv / sup), daily rewards
 *   index-*.js + th-*.js -> official English / Thai item & pack names (items / giftItem tables)
 * The App Store in-app list is not usable (every item is an opaque "Resource Hot Sale N"), so it is only a last-resort fallback.
 * No FX, no resellers, no hardcoded prices or amounts. No login (UID) is ever used.
 */

export const DARKWAR_APP_ID = 6670441558
export const DARKWAR_SLUG = 'dark-war-survival'
export const DARKWAR_OFFICIAL_TITLE = 'Dark War: Survival'
export const DARKWAR_PUBLISHER = 'Omnilojo Pte. Ltd. (App Store seller; webshop © Florere Game Limited)'
export const DARKWAR_WEBSHOP_URL = 'https://pay.darkwar-survival.com/'
export const DARKWAR_PAYMENT_TERMS_URL = 'https://darkwar-survival.com/terms/en/payment_terms.html'
export const DARKWAR_APPSTORE_TH_URL = 'https://apps.apple.com/th/app/dark-war-survival/id6670441558'
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

export class DarkWarUpstreamUnavailableError extends Error {
  constructor(message = 'Dark War: Survival upstream unavailable') {
    super(message)
    this.name = 'DarkWarUpstreamUnavailableError'
  }
}
export class DarkWarInvalidUpstreamResponseError extends Error {
  constructor(message = 'Invalid Dark War: Survival upstream response') {
    super(message)
    this.name = 'DarkWarInvalidUpstreamResponseError'
  }
}

/* ----------------------------- text tables ----------------------------- */

export type DwsDict = { items: Record<string, string>; giftItem: Record<string, string>; strings: Record<string, string> }

function braceBody(src: string, start: number): string | null {
  let depth = 1
  let j = start
  while (j < src.length && depth) {
    const c = src[j]
    if (c === '"' || c === "'" || c === '`') {
      j++
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1
    } else if (c === '{') depth++
    else if (c === '}') depth--
    j++
  }
  return depth ? null : src.slice(start, j - 1)
}

const esc = (s: string) => s.replace(/[$]/g, '\\$')
const unq = (v: string) => {
  try {
    return JSON.parse('"' + v + '"') as string
  } catch {
    return v
  }
}

/** Value of top-level locale key (e.g. `items:Wh` -> body of `Wh={...}` / string of `Wh="..."`). */
function localeVar(src: string, key: string): { obj?: string; str?: string } | null {
  const m = src.match(new RegExp('[{,]' + key + ':([A-Za-z_$][\\w$]*)[,}]'))
  if (!m) return null
  const v = esc(m[1])
  const o = new RegExp('(?:^|[,;\\s(])' + v + '=\\{').exec(src)
  if (o) {
    const body = braceBody(src, o.index + o[0].length)
    if (body != null) return { obj: body }
  }
  const s = new RegExp('(?:^|[,;\\s(])' + v + '="((?:[^"\\\\]|\\\\.)*)"').exec(src)
  return s ? { str: unq(s[1]) } : null
}

function numericTable(body: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!body) return out
  for (const m of body.matchAll(/(?:^|,)"?(\d+)"?:"((?:[^"\\]|\\.)*)"/g)) out[m[1]] = unq(m[2])
  return out
}

function stringProp(body: string | undefined, prop: string): string | undefined {
  const m = body?.match(new RegExp('(?:^|[{,])' + prop + ':"((?:[^"\\\\]|\\\\.)*)"'))
  return m ? unq(m[1]) : undefined
}

/** Parse the official locale tables out of a webshop JS bundle. */
export function parseDwsLocale(src: string): DwsDict {
  const items = numericTable(localeVar(src, 'items')?.obj)
  const giftItem = numericTable(localeVar(src, 'giftItem')?.obj)
  const strings: Record<string, string> = {}
  const gb = localeVar(src, 'goldBricks')
  if (gb?.str) strings.goldBricks = gb.str
  const pp = localeVar(src, 'passport')?.obj
  for (const k of ['title', 'freePass', 'newValuePass', 'purchaseTierOnly'] as const) {
    const v = stringProp(pp, k)
    if (v) strings['passport.' + k] = v
  }
  const r = pp?.match(/rules:\{([^}]*)\}/)?.[1]
  for (const k of ['rule1', 'rule2', 'rule3']) {
    const v = stringProp(r, k)
    if (v) strings['passport.rules.' + k] = v
  }
  return { items, giftItem, strings }
}

const mergeDict = (a: DwsDict, b: DwsDict): DwsDict => ({
  items: { ...b.items, ...a.items },
  giftItem: { ...b.giftItem, ...a.giftItem },
  strings: { ...b.strings, ...a.strings }
})
const emptyDict = (): DwsDict => ({ items: {}, giftItem: {}, strings: {} })

/** "2K" -> 2000, "1.5M" -> 1500000, "20" -> 20. Unknown -> null. */
export function parseDwsAmount(raw: unknown): number | null {
  const s = String(raw ?? '').replace(/,/g, '').trim()
  const m = s.match(/^(\d+(?:\.\d+)?)\s*([KMB]?)$/i)
  if (!m) return null
  const mult = { '': 1, K: 1e3, M: 1e6, B: 1e9 }[m[2].toUpperCase() as '' | 'K' | 'M' | 'B']
  return Math.round(Number(m[1]) * mult)
}

/* ------------------------------- fetching ------------------------------- */

async function fetchText(url: string, signal?: AbortSignal, init?: RequestInit): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      signal: signal ?? AbortSignal.timeout(25_000),
      headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8', ...(init?.headers ?? {}) }
    })
  } catch (e) {
    throw new DarkWarUpstreamUnavailableError(e instanceof Error ? e.message : 'network error')
  }
  if (!res.ok) throw new DarkWarUpstreamUnavailableError(`HTTP ${res.status} for ${url}`)
  try {
    return await res.text()
  } catch (e) {
    throw new DarkWarUpstreamUnavailableError(e instanceof Error ? e.message : 'failed to read body')
  }
}

const randomUuid = () =>
  (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, '')

async function postApi(name: string, uuid: string, signal?: AbortSignal): Promise<any> {
  const url = new URL(name + '.php', DARKWAR_WEBSHOP_URL).toString()
  const text = await fetchText(url, signal, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/plain, */*', Origin: 'https://pay.darkwar-survival.com', Referer: DARKWAR_WEBSHOP_URL },
    body: JSON.stringify({ uuid, fromkoc: '' })
  })
  try {
    return JSON.parse(text)
  } catch {
    throw new DarkWarInvalidUpstreamResponseError(`${name}.php returned non-JSON`)
  }
}

/** Official names: main bundle (English inline) + Thai locale chunk(s). Asset folder / hashes found at runtime. */
async function fetchLocales(signal?: AbortSignal): Promise<{ en: DwsDict; th: DwsDict; errors: string[]; mainJs: string | null }> {
  const errors: string[] = []
  let en = emptyDict()
  let th = emptyDict()
  let mainJs: string | null = null
  try {
    const html = await fetchText(DARKWAR_WEBSHOP_URL, signal, { headers: { Accept: 'text/html' } })
    const src = html.match(/<script[^>]+type="module"[^>]+src="([^"]+index-[^"]+\.js)"/)?.[1] ?? html.match(/src="([^"]*index-[^"]+\.js)"/)?.[1]
    if (!src) throw new Error('main script not found in webshop index.html')
    mainJs = new URL(src, DARKWAR_WEBSHOP_URL).toString()
    const js = await fetchText(mainJs, signal)
    en = parseDwsLocale(js)
    if (!Object.keys(en.items).length) errors.push('English item table not found in ' + mainJs)
    const thAt = js.indexOf('th:async')
    const thPaths = thAt >= 0 ? [...js.slice(thAt, thAt + 600).matchAll(/import\("(\.\/th-[\w-]+\.js)"\)/g)].map((m) => m[1]) : []
    if (!thPaths.length) errors.push('Thai locale chunk not referenced in ' + mainJs)
    for (const p of thPaths) {
      try {
        th = mergeDict(th, parseDwsLocale(await fetchText(new URL(p, mainJs).toString(), signal)))
      } catch (e) {
        errors.push(`Thai chunk ${p}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (thPaths.length && !Object.keys(th.items).length) errors.push('Thai item table not found')
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e))
  }
  return { en, th, errors, mainJs }
}

/* ------------------------------- building ------------------------------- */

type Tier = { amount: number; currency: string; symbol: string | null; base: number | null; bonus: number | null; limit: number | null; status: number | null }

const nz = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
const iso = (sec: unknown) => (nz(sec) ? new Date(Number(sec) * 1000).toISOString() : null)

export type DwsContent = { item_id: string; item: string | null; item_en: string | null; item_th: string | null; amount: number | null; amount_text: string }

function contentRows(goods: any[], en: DwsDict, th: DwsDict): DwsContent[] {
  return (Array.isArray(goods) ? goods : []).map((g) => {
    const id = String(g?.id ?? '')
    const text = String(g?.num ?? '')
    return { item_id: id, item: en.items[id] ?? th.items[id] ?? null, item_en: en.items[id] ?? null, item_th: th.items[id] ?? null, amount: parseDwsAmount(text), amount_text: text }
  })
}

const describe = (rows: DwsContent[], lang: 'en' | 'th') =>
  rows.map((r) => `${(lang === 'en' ? r.item_en : r.item_th) ?? r.item ?? `#${r.item_id}`} x${r.amount_text}`).join(', ')

function moneyFields(tier: Tier | undefined, tierId: string, region: string | null) {
  const cur = tier?.currency ?? null
  const thb = cur === 'THB' ? tier!.amount : null
  const usd = cur === 'USD' ? tier!.amount : null
  const src = tier ? `darkwar-official-webshop (getitem ${tierId}${region ? `, clientCountry ${region}` : ''})` : null
  const out: any = {
    price: tier?.amount ?? null,
    currency: cur,
    prices: { THB: thb, USD: usd, ...(cur && cur !== 'THB' && cur !== 'USD' ? { [cur]: tier!.amount } : {}) },
    price_thb: thb,
    price_thb_source: thb != null ? src : null,
    price_usd: usd,
    price_usd_source: usd != null ? src : null
  }
  if (!tier) {
    out.price_null_reason = `Price tier ${tierId} not present in the webshop price list (getitem.php)`
    out.price_thb_null_reason = out.price_null_reason
    out.price_usd_null_reason = out.price_null_reason
    return out
  }
  if (thb == null)
    out.price_thb_null_reason = `The official webshop priced this request in ${cur} (clientCountry ${region ?? 'unknown'}); it only shows the requester's region currency and THB is shown only to Thailand visitors. No FX conversion.`
  if (usd == null)
    out.price_usd_null_reason = `The official webshop prices in the requester's region currency (${cur}${region ? `, clientCountry ${region}` : ''}); its USD list (goods_usd) is returned only after a game-UID login, which this service never does. Webshop items are not App Store products (the App Store lists only opaque "Resource Hot Sale N" IAPs), so there is no App Store US/KH/LA/MM match. No FX conversion.`
  return out
}

function nameFields(en: string | null | undefined, th: string | null | undefined, enReason: string, thReason: string) {
  return {
    name: en ?? th ?? null,
    name_en: en ?? null,
    ...(en ? {} : { name_en_null_reason: enReason }),
    name_th: th ?? null,
    ...(th ? {} : { name_th_null_reason: thReason })
  }
}

const PERIOD_TEXT: Record<string, { en: string; th: string }> = {
  week: { en: 'Weekly pack', th: 'แพ็กรายสัปดาห์' },
  month: { en: 'Monthly pack', th: 'แพ็กรายเดือน' },
  limited: { en: 'Limited pack', th: 'แพ็กจำกัดเวลา' }
}

function buildPack(x: any, group: 'week' | 'month' | 'limited', tiers: Map<string, Tier>, en: DwsDict, th: DwsDict, region: string | null, ends: string | null) {
  const nameIds = [x?.nameid, x?.nameid2].filter((v) => v !== null && v !== undefined && v !== '').map(String)
  const nEn = nameIds.map((i) => en.giftItem[i]).filter(Boolean)
  const nTh = nameIds.map((i) => th.giftItem[i]).filter(Boolean)
  const contents = contentRows(x?.goods, en, th)
  const tierId = String(x?.goods_id ?? '')
  const limit = nz(x?.count)
  const p = PERIOD_TEXT[group]
  const descEn = contents.length ? `${p.en}${limit ? ` (limit ${limit})` : ''}: ${describe(contents, 'en')}` : null
  const descTh = contents.length ? `${p.th}${limit ? ` (จำกัด ${limit} ครั้ง)` : ''}: ${describe(contents, 'th')}` : null
  return {
    id: 0,
    group,
    ...nameFields(
      nEn.length === nameIds.length && nEn.length ? nEn.join(' ') : null,
      nTh.length === nameIds.length && nTh.length ? nTh.join(' ') : null,
      `Pack name id ${nameIds.join('+') || '?'} not found in the webshop English text table`,
      `Pack name id ${nameIds.join('+') || '?'} not found in the webshop Thai text table`
    ),
    product_id: String(x?.id ?? ''),
    name_id: nameIds.join('+') || null,
    price_tier: tierId,
    kind: 'bundle',
    item_pack: true,
    baseItemAmount: null,
    bonusItemAmount: null,
    totalItemAmount: null,
    base_null_reason: 'Item pack; contents listed in contents, not a plain Dawn Badge amount',
    bonus_null_reason: 'No Dawn Badge bonus on item packs',
    total_null_reason: 'Item pack; not a plain currency amount',
    bonus_available: false,
    ...moneyFields(tiers.get(tierId), tierId, region),
    description_en: descEn,
    description_th: descTh,
    description_source: 'composed from the official webshop pack contents and its official English / Thai item names',
    ...(contents.length ? {} : { description_null_reason: 'Webshop returned no contents for this pack' }),
    contents: contents.length ? contents : null,
    ...(contents.length ? {} : { contents_null_reason: 'Webshop returned no contents for this pack' }),
    value_rate: x?.rate ? String(x.rate) : null,
    vip_points: nz(x?.vipscore),
    purchase_limit: limit,
    purchase_limit_period: group === 'limited' ? 'event' : group,
    period_ends_at: ends,
    image: x?.cover_image ?? null
  }
}

function buildPass(key: 'adv' | 'sup', g: any, rewards: any[], tiers: Map<string, Tier>, en: DwsDict, th: DwsDict, region: string | null, ends: string | null) {
  const days = (Array.isArray(rewards) ? rewards : []).map((r) => ({ day: nz(r?.day), contents: contentRows(r?.[key]?.goods, en, th) }))
  const instant = contentRows(
    (Array.isArray(g?.goodsList) ? g.goodsList : []).map((s: string) => {
      const [id, num] = String(s).split('_')
      return { id, num }
    }),
    en,
    th
  )
  const total = new Map<string, DwsContent>()
  for (const r of [...instant, ...days.flatMap((d) => d.contents)]) {
    const t = total.get(r.item_id)
    if (!t) total.set(r.item_id, { ...r })
    else {
      t.amount = t.amount != null && r.amount != null ? t.amount + r.amount : null
      t.amount_text = t.amount != null ? String(t.amount) : `${t.amount_text}+${r.amount_text}`
    }
  }
  const contents = [...total.values()]
  const tierId = String(g?.goodsId ?? '')
  const tEn = en.strings['passport.title'] ?? null
  const tTh = th.strings['passport.title'] ?? null
  const label = key === 'adv' ? 'paid tier 1' : 'paid tier 2'
  const labelTh = key === 'adv' ? 'ระดับเสียเงิน 1' : 'ระดับเสียเงิน 2'
  const dayCount = days.filter((d) => d.contents.length).length
  return {
    id: 0,
    group: 'pass',
    ...nameFields(
      tEn ? `${tEn} (${label})` : null,
      tTh ? `${tTh} (${labelTh})` : null,
      'Value Pass title not found in the webshop English text table',
      'Value Pass title not found in the webshop Thai text table'
    ),
    tier_label_note: `The webshop labels the two paid pass columns only by price (internal keys "adv" / "sup"); "${label}" is a neutral label, not an official name.`,
    product_id: String(g?.id ?? ''),
    name_id: g?.nameid != null ? String(g.nameid) : null,
    pass_tier: key,
    price_tier: tierId,
    kind: 'pass',
    item_pack: true,
    baseItemAmount: null,
    bonusItemAmount: null,
    totalItemAmount: null,
    base_null_reason: 'Pass; rewards listed in contents, not a plain Dawn Badge amount',
    bonus_null_reason: 'No Dawn Badge bonus on passes',
    total_null_reason: 'Pass; not a plain currency amount',
    bonus_available: false,
    ...moneyFields(tiers.get(tierId), tierId, region),
    description_en: contents.length
      ? `${tEn ?? 'Value Pass'} ${label}, ${dayCount} daily reward tier(s) (1 tier unlocks per day) + on purchase: ${describe(contents, 'en')} (totals over all days)` +
        (en.strings['passport.purchaseTierOnly'] ? `. ${en.strings['passport.purchaseTierOnly']}` : '')
      : null,
    description_th: contents.length
      ? `${tTh ?? 'พาสสุดคุ้ม'} ${labelTh} รางวัลรายวัน ${dayCount} ระดับ (ปลดล็อกวันละ 1 ระดับ) + เมื่อซื้อ: ${describe(contents, 'th')} (รวมทุกวัน)` +
        (th.strings['passport.purchaseTierOnly'] ? ` ${th.strings['passport.purchaseTierOnly']}` : '')
      : null,
    description_source: 'composed from the official webshop pass rewards (getwarpass.php) and its official English / Thai text',
    contents: contents.length ? contents : null,
    ...(contents.length ? {} : { contents_null_reason: 'Webshop returned no rewards for this pass tier' }),
    rewards_by_day: days,
    vip_points: nz(g?.vipscore),
    period_ends_at: ends
  }
}

function buildCurrency(goods: any, doubles: Record<string, unknown>, en: DwsDict, th: DwsDict, region: string | null) {
  const id = String(goods?.goods_id ?? '')
  const base = nz(goods?.pay_brick_num)
  const std = nz(goods?.free_brick_num)
  const dbl = nz(doubles?.[id])
  // Same rule as the webshop UI: Double! -> extra = base + 2 * free (shown as "Double! 210%"), else extra = free ("105%").
  const bonus = base != null && std != null ? (dbl ? base + 2 * std : std) : null
  const total = base != null && bonus != null ? base + bonus : null
  const item = en.strings.goldBricks ?? 'Dawn Badges'
  const itemTh = th.strings.goldBricks ?? null
  const tier: Tier = { amount: Number(goods.amount), currency: String(goods.currency ?? ''), symbol: goods.currency_symbol ?? null, base, bonus: std, limit: nz(goods.limit), status: nz(goods.status) }
  return {
    id: 0,
    group: 'currency',
    name: base != null ? `${base.toLocaleString('en-US')} ${item}` : item,
    name_en: base != null ? `${base.toLocaleString('en-US')} ${item}` : item,
    name_th: itemTh ? (base != null ? `${itemTh} ${base.toLocaleString('en-US')}` : itemTh) : null,
    ...(itemTh ? {} : { name_th_null_reason: 'Thai name for Dawn Badges not found in the webshop Thai text table' }),
    product_id: id,
    price_tier: id,
    kind: 'currency',
    item,
    item_th: itemTh,
    item_pack: false,
    baseItemAmount: base,
    bonusItemAmount: bonus,
    totalItemAmount: total,
    ...(base == null ? { base_null_reason: 'Webshop returned no pay_brick_num' } : {}),
    ...(bonus == null ? { bonus_null_reason: 'Webshop returned no free_brick_num' } : {}),
    ...(total == null ? { total_null_reason: 'Base or bonus missing' } : {}),
    bonus_available: !!bonus,
    standard_bonus: std,
    double_bonus_active: !!dbl,
    bonus_label: dbl ? `Double! ${dbl}%` : '105%',
    ...(dbl
      ? { double_bonus_note: `Webshop doubleGoodsList marks ${id} as "Double!" (${dbl}%); the site shows bonus = base + 2 × free. The site does not state how long or how many times the Double applies.` }
      : {}),
    ...moneyFields(tier, id, region),
    description_en: base != null && bonus != null ? `${item} on the official Dark War webshop: ${base} + ${bonus} bonus = ${total}` : null,
    description_th: itemTh && base != null && bonus != null ? `${itemTh} บนเว็บช็อปทางการ Dark War: ${base} + โบนัส ${bonus} = ${total}` : null,
    contents: total != null ? [{ item_id: 'dawn_badges', item, item_en: item, item_th: itemTh, amount: total, amount_text: String(total) }] : null,
    purchase_limit: nz(goods.limit),
    purchase_limit_period: 'week'
  }
}

const CATS: { key: string; name: string; message: string }[] = [
  { key: 'currency', name: 'Dawn Badges (Official Webshop)', message: 'Live official webshop Dawn Badge list (getitem.php)' },
  { key: 'pass', name: 'Value Pass (Official Webshop)', message: 'Live official webshop Value Pass (getwarpass.php)' },
  { key: 'week', name: 'Weekly Packs (Official Webshop)', message: 'Live official webshop weekly packs (getproduct.php)' },
  { key: 'month', name: 'Monthly Packs (Official Webshop)', message: 'Live official webshop monthly packs (getproduct.php)' },
  { key: 'limited', name: 'Limited Packs (Official Webshop)', message: 'Live official webshop limited packs (getproduct.php)' }
]

function categorize(packs: any[], cats = CATS) {
  let n = 0
  return cats
    .map((c, i) => ({ id: i + 1, name: c.name, message: c.message, packs: packs.filter((p) => p.group === c.key) }))
    .filter((c) => c.packs.length)
    .map((c) => {
      c.packs.sort((a: any, b: any) => (a.price ?? Infinity) - (b.price ?? Infinity) || String(a.product_id).localeCompare(String(b.product_id)))
      for (const p of c.packs) p.id = ++n
      return { id: c.id, name: c.name, packs: c.packs, status: 0, message: c.message, packCount: c.packs.length }
    })
}

function envelope(categories: any[], extra: Record<string, unknown>, notes: string[]): RovPacksResponse {
  return {
    game: { id: DARKWAR_APP_ID, slug: DARKWAR_SLUG, name: 'Dark War: Survival', itemName: 'Dawn Badges', itemIcon: '' },
    official_title: DARKWAR_OFFICIAL_TITLE,
    publisher: DARKWAR_PUBLISHER,
    categories,
    summary: { categoryCount: categories.length, packCount: categories.reduce((s: number, c: any) => s + c.packs.length, 0) },
    fetchedAt: new Date().toISOString(),
    ...extra,
    notes
  } as unknown as RovPacksResponse
}

async function fromWebshop(signal?: AbortSignal): Promise<RovPacksResponse> {
  const uuid = randomUuid()
  const [index, item, product, pass, locales] = await Promise.all([
    postApi('getindex', uuid, signal).catch(() => null),
    postApi('getitem', uuid, signal),
    postApi('getproduct', uuid, signal).catch((e) => ({ __error: e instanceof Error ? e.message : String(e) })),
    postApi('getwarpass', uuid, signal).catch((e) => ({ __error: e instanceof Error ? e.message : String(e) })),
    fetchLocales(signal)
  ])
  const goods = Array.isArray(item?.goods) ? item.goods.filter((g: any) => g && g.goods_id && Number.isFinite(Number(g.amount))) : []
  if (!goods.length) throw new DarkWarInvalidUpstreamResponseError('getitem.php returned no priced goods')
  const region = typeof index?.clientCountry === 'string' ? index.clientCountry : null
  const { en, th } = locales
  const tiers = new Map<string, Tier>(
    goods.map((g: any) => [String(g.goods_id), { amount: Number(g.amount), currency: String(g.currency ?? item.defCurrency ?? ''), symbol: g.currency_symbol ?? null, base: nz(g.pay_brick_num), bonus: nz(g.free_brick_num), limit: nz(g.limit), status: nz(g.status) }])
  )
  const doubles = item?.doubleGoodsList && typeof item.doubleGoodsList === 'object' ? item.doubleGoodsList : {}
  const packs: any[] = goods.map((g: any) => buildCurrency({ ...g, currency: g.currency ?? item.defCurrency }, doubles, en, th, region))
  const warnings: string[] = []
  if (product?.__error) warnings.push('getproduct.php: ' + product.__error)
  else {
    for (const [arr, group, fin] of [
      ['wdata', 'week', 'wfinishtime'],
      ['mdata', 'month', 'mfinishtime'],
      ['ldata', 'limited', null]
    ] as const) {
      for (const x of Array.isArray(product?.[arr]) ? product[arr] : [])
        packs.push(buildPack(x, group, tiers, en, th, region, iso(fin ? product[fin] : x?.finishtime ?? x?.endtime)))
    }
  }
  if (pass?.__error) warnings.push('getwarpass.php: ' + pass.__error)
  else if (pass && pass.code === 0) {
    for (const key of ['adv', 'sup'] as const) {
      const g = pass[key + 'GoodsId']
      if (g?.goodsId) packs.push(buildPass(key, g, pass.reward, tiers, en, th, region, iso(pass.finishtime)))
    }
  }
  const currencies = [...new Set(goods.map((g: any) => String(g.currency ?? item.defCurrency)))]
  const notes = [
    `Source: the publisher's official webshop ${DARKWAR_WEBSHOP_URL} (Dark War: Survival Store, payment terms ${DARKWAR_PAYMENT_TERMS_URL}). Prices are live from its API, in the requester's region currency (this response: ${currencies.join('/')}, clientCountry ${region ?? 'unknown'}). No FX, no resellers, no hardcoded prices, no login.`,
    'THB is shown first. USD is null with a reason when the webshop serves THB: its USD list needs a game-UID login, and webshop items are not App Store products (App Store TH/US list only opaque "Resource Hot Sale N" IAPs), so there is nothing to match on App Store US/KH/LA/MM.',
    'Dawn Badges: base = pay_brick_num, bonus = the bonus the webshop shows (free_brick_num, or base + 2 × free when the item is marked "Double!" in doubleGoodsList), total = base + bonus. Dawn Badges are used in-game to buy packs.',
    'Packs and the Value Pass are item_pack:true; contents and English / Thai names come from the webshop API and its own text tables; prices come from the matching price tier (goods_id) in getitem.php, exactly as the webshop does.',
    ...warnings
  ]
  if (locales.errors.length) notes.push('Name tables: ' + locales.errors.join('; '))
  return envelope(
    categorize(packs),
    {
      source: DARKWAR_WEBSHOP_URL,
      sources: { thb: currencies.includes('THB') ? DARKWAR_WEBSHOP_URL : null, usd: currencies.includes('USD') ? DARKWAR_WEBSHOP_URL : null },
      source_details: {
        api: ['getindex', 'getitem', 'getproduct', 'getwarpass'].map((n) => new URL(n + '.php', DARKWAR_WEBSHOP_URL).toString()),
        locale_bundle: locales.mainJs,
        client_country: region,
        webshop_currency: currencies,
        payment_terms: DARKWAR_PAYMENT_TERMS_URL,
        appstore_th: DARKWAR_APPSTORE_TH_URL
      },
      source_mode: 'official-webshop',
      ...(warnings.length ? { warnings } : {})
    },
    notes
  )
}

/** Fallback: App Store TH product page (top IAPs; opaque names). */
async function fromAppStorePage(signal: AbortSignal | undefined, reason: string): Promise<RovPacksResponse> {
  const html = await fetchText(DARKWAR_APPSTORE_TH_URL, signal, { headers: { Accept: 'text/html,application/xhtml+xml' } })
  const rows = parseCookieRunClassicIapFromHtml(html, 'THB')
  if (!rows.length) throw new DarkWarInvalidUpstreamResponseError('In-App Purchases section not found or empty on App Store TH')
  const packs = rows.map((r) => ({
    id: 0,
    group: 'appstore',
    name: r.name,
    name_en: r.name,
    name_th: null,
    name_th_null_reason: 'Dark War: Survival has no Thai localisation on the App Store; IAP names are English only',
    product_id: null,
    kind: 'bundle',
    item_pack: true,
    baseItemAmount: null,
    bonusItemAmount: null,
    totalItemAmount: null,
    base_null_reason: 'App Store IAP names are opaque ("Resource Hot Sale N"); no amount published',
    bonus_null_reason: 'No bonus published on the App Store listing',
    total_null_reason: 'No amount published',
    bonus_available: false,
    price: r.price,
    currency: 'THB',
    prices: { THB: r.price, USD: null },
    price_thb: r.price,
    price_thb_source: 'apple-app-store-th (product page)',
    price_usd: null,
    price_usd_source: null,
    price_usd_null_reason: 'Fallback mode: the App Store product page gives no item ids, so US prices cannot be paired; no FX conversion',
    description_en: null,
    description_en_null_reason: 'App Store product page shows names and prices only',
    description_th: null,
    description_th_null_reason: 'App Store product page shows names and prices only',
    contents: null,
    contents_null_reason: 'App Store does not publish the contents of Dark War: Survival IAPs'
  }))
  return envelope(
    categorize(packs, [{ key: 'appstore', name: 'In-App Purchases (App Store TH, fallback)', message: 'Live App Store TH product page (official webshop unavailable)' }]),
    { source: DARKWAR_APPSTORE_TH_URL, sources: { thb: DARKWAR_APPSTORE_TH_URL, usd: null }, source_mode: 'appstore-product-page', webshop_error: reason },
    [`Fallback mode: the official webshop was unavailable (${reason}); THB read from the App Store TH product page (top in-app purchases only, opaque names, no contents).`]
  )
}

/** Live Dark War: Survival packs. Never hardcodes prices; all sources down -> throws (route returns 502). */
export async function fetchDarkWarSurvivalPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  let reason: string
  try {
    return await fromWebshop(options?.signal)
  } catch (e) {
    reason = e instanceof Error ? e.message : String(e)
  }
  return fromAppStorePage(options?.signal, reason)
}

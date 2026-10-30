import { getGameBySlug } from '../games/registry'
import type { RovPack, RovPackCategory, RovPacksResponse } from '../types/rov'
import {
  buildTermgamePacksSource,
  fetchTermgamePacks,
  InvalidUpstreamResponseError,
  UpstreamUnavailableError,
  type FetchTermgamePacksOptions
} from './termgame-packs.service'

export { InvalidUpstreamResponseError, UpstreamUnavailableError }

const game = getGameBySlug('freefire')!

export const FREEFIRE_PACKS_SOURCE = buildTermgamePacksSource(game.appId)
export const FREEFIRE_PACKS_SOURCE_EN = buildTermgamePacksSource(game.appId, 'IN.TH', 'en')

/** Garena Free Fire on App Store (TH + US storefronts both publish IAP). */
export const FREEFIRE_APPSTORE_TH_URL =
  'https://apps.apple.com/th/app/free-fire/id1300146617'
export const FREEFIRE_APPSTORE_US_URL =
  'https://apps.apple.com/us/app/free-fire/id1300146617'

/**
 * Garena's own App Store in-app purchase ids for "Level Up Package - Level N" (offerName
 * freefire.diamond.4790-4795 = the set ranked in the App Store top in-app list; 4796-4801 = a second,
 * less-purchased set Garena also still lists). Only the ids are fixed here: names, descriptions and
 * prices are read live from Apple's catalog on every request (THB from th, USD from us). No FX.
 */
export const FREEFIRE_LEVEL_UP_IAP_IDS = {
  primary: ['6744085405', '6744085440', '6744085523', '6744085334', '6744085275', '6744085526'],
  secondary: ['6744085441', '6744085243', '6744085273', '6744085244', '6744085333', '6744085276']
}
/** Garena's App Store membership IAPs (separate SKUs from termgame; shown only as appstore_reference). */
export const FREEFIRE_MEMBERSHIP_IAP_IDS: Partial<Record<string, string>> = {
  'membership-weekly': '1412648268',
  'membership-monthly': '1412648284',
  'membership-lite': '6479015362'
}
export const FREEFIRE_APPSTORE_INAPPS_API = 'https://apps.apple.com/api/apps/v1/catalog'
export const freefireInAppsUrl = (cc: 'th' | 'us', ids: string[], l?: string) =>
  `${FREEFIRE_APPSTORE_INAPPS_API}/${cc}/in-apps?ids=${ids.join(',')}&platform=iphone${l ? `&l=${l}` : ''}`

/** Garena Free Fire official support (Zendesk) article "Paquete de Aumento de Nivel" — per-level rewards. */
export const FREEFIRE_LEVEL_UP_ARTICLE_API =
  'https://ffsoporte.garena.com/api/v2/help_center/es-419/articles/47242997500313.json'
export const FREEFIRE_LEVEL_UP_ARTICLE_URL =
  'https://ffsoporte.garena.com/hc/es-419/articles/47242997500313'

export const FREEFIRE_PASS_CATEGORY_ID = 900167
export const FREEFIRE_LEVEL_UP_CATEGORY_ID = 900267

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

type RawItem = {
  id: number
  item_id?: number
  currency: string
  currency_amount: number
  rebate_card_id?: number
  app_item_id?: number
  rebate_card?: { name?: string; description?: string; logo?: string; level_up_pass_item?: boolean } | null
  app_item?: { name?: string; description?: string; logo?: string; icon?: string } | null
}
type RawPayload = { channels: Array<{ channel: number; name: string; visible: boolean; items: RawItem[] }> }

export type FreefirePack = RovPack & Record<string, unknown>

async function fetchJson(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<unknown> {
  const r = await fetch(url, { headers, signal })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  return r.json()
}

/** Same request the generic termgame service makes; errors map to the route's 502s. */
async function fetchTermgameRaw(url: string, signal: AbortSignal): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', Referer: `https://termgame.com/?app=${game.appId}` },
      signal
    })
  } catch {
    throw new UpstreamUnavailableError()
  }
  if (!response.ok) throw new UpstreamUnavailableError()
  try {
    return await response.json()
  } catch {
    throw new InvalidUpstreamResponseError()
  }
}

const num = (s: string) => Number(s.replace(/,/g, ''))

/**
 * Parse Garena's own membership text, e.g.
 * "ได้รับเพชรรวม 450 เพชร (ได้เพชรทันที 100 เพชร และได้อีกวันละ 50 เพชรเป็นเวลา 7 วัน)".
 * Returns null unless instant + daily × days equals the stated total.
 */
export function parseFreefireMembership(text: string | undefined | null) {
  if (!text) return null
  const m = text.match(
    /เพชรรวม\s*([\d,]+)\s*เพชร[\s\S]*?ทันที\s*([\d,]+)\s*เพชร[\s\S]*?วันละ\s*([\d,]+)\s*เพชร[\s\S]*?เวลา\s*(\d+)\s*วัน/
  )
  if (!m) return null
  const [total, instant, daily, days] = [num(m[1]), num(m[2]), num(m[3]), num(m[4])]
  if (instant + daily * days !== total) return null
  return { diamonds_total: total, diamonds_instant: instant, diamonds_daily: daily, duration_days: days }
}

/** "Nivel 6: 120 diamantes y 3 tickets de Luck Royale" lines from the official support article. */
export function parseLevelUpArticle(html: string | undefined | null) {
  const out = new Map<number, { diamonds: number; luck_royale_tickets: number }>()
  if (!html) return out
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ')
  for (const m of text.matchAll(/Nivel\s+(\d+)\s*:\s*([\d.,]+)\s*diamantes\s+y\s+(\d+)\s+tickets?\s+de\s+Luck\s+Royale/gi)) {
    out.set(Number(m[1]), { diamonds: num(m[2].replace(/\./g, '')), luck_royale_tickets: Number(m[3]) })
  }
  return out
}

type PassKind = 'membership-weekly' | 'membership-monthly' | 'membership-lite' | 'booyah-pass' | 'membership'

function passKind(nameTh: string, nameEn: string, isBooyah: boolean): PassKind {
  if (isBooyah || /booyah|บูย่า/i.test(nameEn + nameTh)) return 'booyah-pass'
  if (/lite|มินิ/i.test(nameEn + nameTh)) return 'membership-lite'
  if (/monthly|เดือน/i.test(nameEn + nameTh)) return 'membership-monthly'
  if (/weekly|สัปดาห์/i.test(nameEn + nameTh)) return 'membership-weekly'
  return 'membership'
}

type PassInfo = {
  key: string
  kind: PassKind
  ids: { rebate_card_id?: number; app_item_id?: number }
  fields: Record<string, unknown>
}

function buildPassInfo(item: RawItem, en: RawItem | undefined): PassInfo | null {
  const isRebate = !!item.rebate_card && !!item.rebate_card_id
  const isApp = !!item.app_item && !!item.app_item_id
  if (!isRebate && !isApp) return null
  const th = (isRebate ? item.rebate_card : item.app_item)!
  const enSrc = en ? (isRebate ? en.rebate_card : en.app_item) : null
  const nameTh = (th.name ?? '').trim()
  const nameEn = (enSrc?.name ?? '').trim()
  const kind = passKind(nameTh, nameEn, isApp)
  const contents = kind === 'booyah-pass' ? null : parseFreefireMembership(th.description)
  const descTh = (th.description ?? '').trim() || null
  let descEn: string | null = (enSrc?.description ?? '').trim() || null
  if (contents) {
    descEn =
      `${contents.diamonds_total} diamonds in total: ${contents.diamonds_instant} instantly, then ` +
      `${contents.diamonds_daily} per day for ${contents.duration_days} days.` +
      (descEn ? ` (Garena EN text: "${descEn}")` : '')
  }
  const key = isRebate ? `rebate:${item.rebate_card_id}` : `app_item:${item.app_item_id}`
  const fields: Record<string, unknown> = {
    name: nameTh || nameEn,
    name_th: nameTh || null,
    name_en: nameEn || null,
    description_th: descTh,
    description_en: descEn,
    item_pack: true,
    pack_type: kind,
    image_url: th.logo ?? (th as { icon?: string }).icon ?? null,
    ...(isRebate ? { rebate_card_id: item.rebate_card_id } : { app_item_id: item.app_item_id }),
    contents:
      kind === 'booyah-pass'
        ? {
            item: 'Booyah Pass (premium, current season)',
            duration: 'current Booyah Pass season',
            limit_th: 'ซื้อได้ครั้งเดียวต่อซีซั่น — ถ้าเปิดใช้งานสิทธิ์ขั้นสูงซีซั่นนี้แล้วจะได้ FF Token 10 ชิ้นเป็นการชดเชยแทน',
            limit_en: 'One per season: if this season’s premium pass is already active you only get 10 FF Tokens as compensation.',
            source: 'termgame app_item description (Garena official)'
          }
        : contents
          ? { ...contents, source: 'parsed from termgame rebate_card description (Garena official)' }
          : null,
    ...(kind !== 'booyah-pass' && !contents
      ? { contents_null_reason: 'Garena description did not state instant/daily/days/total in a parseable, consistent form.' }
      : {}),
    details_source: FREEFIRE_PACKS_SOURCE
  }
  if (contents) {
    fields.baseItemAmount = contents.diamonds_instant
    fields.bonusItemAmount = contents.diamonds_daily * contents.duration_days
    fields.totalItemAmount = contents.diamonds_total
  }
  return { key, kind, ids: isRebate ? { rebate_card_id: item.rebate_card_id } : { app_item_id: item.app_item_id }, fields }
}

const PASS_USD_NULL_REASON =
  'Garena sells this on termgame TH only in THB and termgame region=US has no memberships; the App Store membership is a separate SKU at a different price (see appstore_reference on the deduplicated row), so no exact USD price exists (no FX conversion).'
const BOOYAH_USD_NULL_REASON =
  'Booyah Pass is sold on termgame TH only in THB; termgame region=US and the App Store (TH/US) do not sell this item, so no official USD price exists (no FX conversion).'
const usdReason = (kind: PassKind) => (kind === 'booyah-pass' ? BOOYAH_USD_NULL_REASON : PASS_USD_NULL_REASON)

type AppleRow = { id: string; name: string; price: number; currency: string; offerName?: string; description?: string }

function parseInApps(json: unknown): AppleRow[] {
  const data = (json as { data?: unknown })?.data
  if (!Array.isArray(data)) throw new Error('bad shape')
  const out: AppleRow[] = []
  for (const d of data as Array<{ id?: unknown; attributes?: Record<string, any> }>) {
    const a = d.attributes
    const offer = Array.isArray(a?.offers) ? a!.offers[0] : undefined
    if (!a || typeof a.name !== 'string' || !offer || typeof offer.price !== 'number') continue
    out.push({
      id: String(d.id ?? ''),
      name: a.name.replace(/\s+/g, ' ').trim(),
      price: offer.price,
      currency: typeof offer.currencyCode === 'string' ? offer.currencyCode : '',
      ...(typeof a.offerName === 'string' ? { offerName: a.offerName } : {}),
      ...(typeof a.description?.standard === 'string' ? { description: a.description.standard.trim() } : {})
    })
  }
  return out
}

async function settle<T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await p }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function levelOf(name: string): number | null {
  const m = name.match(/Level\s*(\d+)/i)
  return m ? Number(m[1]) : null
}

export async function fetchFreefirePacks(
  options?: Omit<FetchTermgamePacksOptions, 'appId' | 'slug' | 'usdEnrichment'>
): Promise<RovPacksResponse> {
  const signal = options?.signal ?? AbortSignal.timeout(25_000)
  const raw = options?.upstreamFixture !== undefined ? options.upstreamFixture : await fetchTermgameRaw(FREEFIRE_PACKS_SOURCE, signal)

  const allIds = [
    ...FREEFIRE_LEVEL_UP_IAP_IDS.primary,
    ...FREEFIRE_LEVEL_UP_IAP_IDS.secondary,
    ...(Object.values(FREEFIRE_MEMBERSHIP_IAP_IDS) as string[])
  ]
  const appleHeaders = { 'User-Agent': UA, Accept: 'application/json', Origin: 'https://apps.apple.com', Referer: 'https://apps.apple.com/' }
  const [base, rawEn, appleTh, appleUs, article] = await Promise.all([
    fetchTermgamePacks({
      appId: game.appId,
      slug: game.slug,
      ...options,
      signal,
      upstreamFixture: raw,
      usdEnrichment: {
        appStoreThUrl: FREEFIRE_APPSTORE_TH_URL,
        appStoreUsUrl: FREEFIRE_APPSTORE_US_URL,
        termgameUsdRegion: 'US',
        termgameUsdLanguage: 'en',
        appendAppStoreCategory: true,
        appStoreCategoryName: 'App Store Diamond Bundles',
        appStoreCategoryId: 900067
      }
    }),
    settle(fetchTermgameRaw(FREEFIRE_PACKS_SOURCE_EN, signal)),
    settle(fetchJson(freefireInAppsUrl('th', allIds), appleHeaders, signal).then(parseInApps)),
    settle(fetchJson(freefireInAppsUrl('us', allIds), appleHeaders, signal).then(parseInApps)),
    settle(fetchJson(FREEFIRE_LEVEL_UP_ARTICLE_API, { Accept: 'application/json', 'User-Agent': UA }, signal))
  ])

  const notes = [...(base.notes ?? [])]
  const rawTh = raw as RawPayload
  const enById = new Map<number, RawItem>()
  if (rawEn.ok && Array.isArray((rawEn.value as RawPayload)?.channels)) {
    for (const ch of (rawEn.value as RawPayload).channels) for (const it of ch.items ?? []) enById.set(it.id, it)
  } else {
    notes.push('termgame EN payload unavailable; name_en/description_en of passes may be null.')
  }

  // ---- 1) Enrich termgame membership / Booyah rows in place (they were "Diamond 0") + dedupe ----
  const rawById = new Map<number, { item: RawItem; channel: { channel: number; name: string } }>()
  for (const ch of rawTh.channels ?? []) {
    if (!ch.visible) continue
    for (const it of ch.items ?? []) rawById.set(it.id, { item: it, channel: ch })
  }
  const passes = new Map<string, { info: PassInfo; channels: Array<Record<string, unknown>> }>()
  for (const cat of base.categories) {
    cat.packs = cat.packs.map((pack) => {
      const r = rawById.get(pack.id)
      if (!r) return pack
      const info = buildPassInfo(r.item, enById.get(pack.id))
      if (!info) return pack
      const enriched: FreefirePack = { ...pack, ...info.fields }
      if (pack.currency === 'THB' && enriched.price_usd == null) enriched.price_usd_null_reason = usdReason(info.kind)
      const entry = passes.get(info.key) ?? { info, channels: [] }
      entry.channels.push({ channel_id: cat.id, channel_name: cat.name, termgame_id: pack.id, item_id: r.item.item_id ?? null, price: pack.price, currency: pack.currency })
      passes.set(info.key, entry)
      return enriched
    })
  }

  // App Store references for memberships (separate SKUs; shown for comparison only, never as the termgame price).
  const order: PassKind[] = ['booyah-pass', 'membership-weekly', 'membership-lite', 'membership-monthly', 'membership']
  if (passes.size > 0) {
    const passPacks: FreefirePack[] = [...passes.values()]
      .sort((a, b) => order.indexOf(a.info.kind) - order.indexOf(b.info.kind))
      .map(({ info, channels }, i) => {
        const thb = channels.filter((c) => c.currency === 'THB').map((c) => c.price as number)
        const minThb = thb.length ? Math.min(...thb) : null
        const minRow = channels.find((c) => c.currency === 'THB' && c.price === minThb)
        const refId = FREEFIRE_MEMBERSHIP_IAP_IDS[info.kind]
        const refTh = refId && appleTh.ok ? appleTh.value.find((r) => r.id === refId) : undefined
        const refUs = refId && appleUs.ok ? appleUs.value.find((r) => r.id === refId) : undefined
        const appstore_reference = refTh
          ? {
              note: 'Separate App Store SKU (bought in the iOS game), not the termgame item; for comparison only.',
              appstore_iap_id: refId,
              offer_name: refTh.offerName ?? null,
              name_th: refTh.name,
              name_en: refUs?.name ?? null,
              description: refUs?.description ?? refTh.description ?? null,
              price_thb: refTh.price,
              price_usd: refUs?.currency === 'USD' ? refUs.price : null
            }
          : undefined
        return {
          id: Number(info.ids.rebate_card_id ?? info.ids.app_item_id ?? i),
          name: String(info.fields.name),
          baseItemAmount: (info.fields.baseItemAmount as number) ?? 0,
          bonusItemAmount: (info.fields.bonusItemAmount as number) ?? 0,
          totalItemAmount: (info.fields.totalItemAmount as number) ?? 0,
          price: minThb ?? (channels[0]?.price as number),
          currency: minThb != null ? 'THB' : String(channels[0]?.currency),
          price_thb: minThb ?? undefined,
          price_usd: null,
          prices: { THB: minThb, USD: null },
          price_thb_source: minThb != null ? `termgame (lowest of ${thb.length} THB channel(s): ${minRow?.channel_name})` : 'termgame',
          price_usd_source: null,
          ...(minThb == null ? { price_thb_null_reason: 'Only sold for Garena Shells (GS) on termgame.' } : {}),
          price_usd_null_reason: usdReason(info.kind),
          ...info.fields,
          channel_prices: channels,
          ...(appstore_reference ? { appstore_reference } : {})
        } as FreefirePack
      })
    base.categories.push({
      id: FREEFIRE_PASS_CATEGORY_ID,
      name: 'Passes & Memberships (Garena official, deduplicated)',
      status: 0,
      message:
        'One row per Garena pass. termgame lists each pass once per payment channel (different item ids/prices, e.g. ShopeePay/QR ฿59 vs bank ฿65); those per-channel rows are kept in their channel categories and listed here under channel_prices.',
      packCount: passPacks.length,
      packs: passPacks
    } as RovPackCategory)
  }

  // ---- 2) Level Up Packages from Garena's App Store IAP (official), contents from Garena support ----
  const rewards = article.ok
    ? parseLevelUpArticle((article.value as { article?: { body?: string } })?.article?.body)
    : new Map<number, { diamonds: number; luck_royale_tickets: number }>()
  if (!article.ok) notes.push('Garena Free Fire support article (level-up rewards) unavailable: ' + article.error)
  if (!appleTh.ok) notes.push('App Store TH in-app lookup (Level Up Packages) failed: ' + appleTh.error)
  if (!appleUs.ok) notes.push('App Store US in-app lookup (Level Up Packages) failed: ' + appleUs.error)

  if (appleTh.ok) {
    const usById = new Map((appleUs.ok ? appleUs.value : []).map((r) => [r.id, r]))
    const thRows = appleTh.value.filter((r) => /level up package/i.test(r.name) && levelOf(r.name) != null)
    const primary = new Set(FREEFIRE_LEVEL_UP_IAP_IDS.primary)
    const levels = [...new Set(thRows.map((r) => levelOf(r.name)!))].sort((a, b) => a - b)
    const lvPacks: FreefirePack[] = []
    for (const lv of levels) {
      const rows = thRows.filter((r) => levelOf(r.name) === lv).sort((a, b) => Number(!primary.has(a.id)) - Number(!primary.has(b.id)))
      const main = rows[0]
      const us = usById.get(main.id)
      const usd = us && us.currency === 'USD' ? us.price : null
      const rw = rewards.get(lv)
      lvPacks.push({
        id: Number(main.id),
        name: `แพ็คเกจเติบโต เลเวล ${lv}`,
        name_th: `แพ็คเกจเติบโต เลเวล ${lv}`,
        name_en: main.name,
        baseItemAmount: rw?.diamonds ?? 0,
        bonusItemAmount: 0,
        totalItemAmount: rw?.diamonds ?? 0,
        price: main.price,
        currency: 'THB',
        price_thb: main.price,
        price_usd: usd,
        prices: { THB: main.price, USD: usd },
        price_thb_source: 'appstore-th',
        price_usd_source: usd != null ? 'appstore-us' : null,
        ...(usd == null
          ? { price_usd_null_reason: appleUs.ok ? `App Store US did not return in-app ${main.id} (${main.offerName ?? ''}).` : 'App Store US lookup failed this request.' }
          : {}),
        offer_name: main.offerName ?? null,
        appstore_iap_id: main.id,
        item_pack: true,
        pack_type: 'level-up-package',
        level: lv,
        description_th: rw
          ? `ปลดล็อกเมื่อบัญชีถึงเลเวล ${lv}: ได้รับ ${rw.diamonds} เพชร และตั๋ว Luck Royale ${rw.luck_royale_tickets} ใบ ซื้อได้ 1 ครั้งต่อบัญชี (ข้อมูลรางวัลจาก Garena Free Fire Support ภูมิภาคละตินอเมริกา; เซิร์ฟเวอร์ TH อาจต่างได้)`
          : null,
        description_en: rw
          ? `Unlocks at account level ${lv}: ${rw.diamonds} diamonds + ${rw.luck_royale_tickets} Luck Royale tickets. Purchasable once per account. (Rewards per Garena Free Fire Support, LATAM; TH server may differ.) App Store text: "${main.description ?? main.name}".`
          : null,
        ...(rw
          ? { contents: { diamonds: rw.diamonds, luck_royale_tickets: rw.luck_royale_tickets, limit: 'once per account', unlock: `account level ${lv}`, source: FREEFIRE_LEVEL_UP_ARTICLE_URL, source_region: 'LATAM (es-419)' } }
          : { contents: null, description_null_reason: article.ok ? `Garena support article has no reward line for level ${lv}.` : 'Garena support article unavailable this request; App Store text is only the item name.' }),
        ...(rows.length > 1
          ? {
              other_appstore_offers: rows.slice(1).map((r) => ({
                appstore_iap_id: r.id,
                offer_name: r.offerName ?? null,
                price_thb: r.price,
                price_usd: usById.get(r.id)?.currency === 'USD' ? usById.get(r.id)!.price : null
              }))
            }
          : {})
      } as FreefirePack)
    }
    if (lvPacks.length) {
      base.categories.push({
        id: FREEFIRE_LEVEL_UP_CATEGORY_ID,
        name: 'Level Up Packages (Garena App Store IAP)',
        status: 0,
        message:
          'Garena sells Level Up Packages on termgame only to signed-in eligible accounts (rebate_card.level_up_pass_item), so the public termgame list has none. Prices here are Garena’s own App Store IAP (TH ฿ / US $, live); rewards from Garena Free Fire Support.',
        packCount: lvPacks.length,
        packs: lvPacks
      } as RovPackCategory)
    }
  }

  base.summary = {
    categoryCount: base.categories.length,
    packCount: base.categories.reduce((s, c) => s + c.packCount, 0)
  }
  if (passes.size || base.categories.some((c) => c.id === FREEFIRE_LEVEL_UP_CATEGORY_ID)) {
    notes.push(
      'Passes/memberships: names + descriptions from termgame rebate_card/app_item (TH + EN); diamonds parsed from Garena text.',
      'Level Up Packages: Garena App Store IAP (apps.apple.com catalog in-apps, th + us); rewards from ' + FREEFIRE_LEVEL_UP_ARTICLE_URL + '.'
    )
  }
  base.notes = notes
  return base
}

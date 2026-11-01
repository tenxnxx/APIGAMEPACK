import type { RovPacksResponse } from '../types/rov'
import { fetchAppStoreGamePacks, type AppStoreGameConfig, type AsClassified, type AsItemInput } from './appstore-game-packs'

/**
 * LootBox Hero ("ฮีโร่ล่าของ" on the Thai App Store), published by KUNG FU DUCK LLC (App Store id 6757577016,
 * bundle com.lootboxth.ios; official site https://lootboxhero.9ring.com/). Sold on the Thai App Store only.
 * The official web Top up Center (pay-lootboxhero.9ring.com) asks for a game-account login before it shows products,
 * so prices come from the official Apple App Store TH full in-app list (THB). The app is not listed on the US / KH /
 * LA / MM storefronts, so USD is null with a reason (no FX).
 * No resellers, no hardcoded prices or amounts.
 */

export const LOOTBOX_HERO_APP_ID = 6757577016
export const LOOTBOX_HERO_SLUG = 'lootbox-hero'
export const LOOTBOX_HERO_ITEM_TH = 'เหรียญทองมืด'

const thNum = (s: string) => Number(s.replace(/,/g, ''))

export function lootboxHeroClassify(it: AsItemInput): AsClassified {
  const name = (it.nameTh ?? it.rawName ?? '').trim()
  const m = name.match(/^([\d,]+)\s*เหรียญทองมืด$/)
  if (m) {
    const base = thNum(m[1])
    const d = (it.descTh ?? '').match(/ได้รับ\s*([\d,]+)\s*เหรียญทองมืด/)
    const stated = d ? thNum(d[1]) : null
    return {
      kind: 'currency',
      item: LOOTBOX_HERO_ITEM_TH,
      baseItemAmount: base,
      ...(stated === base
        ? { bonusItemAmount: 0, bonus_note: `Apple's Thai description says the purchase gives exactly ${base} ${LOOTBOX_HERO_ITEM_TH} ("${it.descTh}"), so no bonus is included` }
        : {}),
      contents: [{ item: LOOTBOX_HERO_ITEM_TH, amount: base }]
    }
  }
  const generic = `Apple's listing gives only the name ("${name}"); what it contains is shown in-game only`
  if (/บัตร|pass|card|รายเดือน|รายสัปดาห์/i.test(name)) return { kind: 'pass', contents: null, contents_null_reason: generic }
  return { kind: 'bundle', contents: null, contents_null_reason: generic }
}

const CFG: AppStoreGameConfig = {
  appId: LOOTBOX_HERO_APP_ID,
  slug: LOOTBOX_HERO_SLUG,
  name: 'LootBox Hero',
  officialTitle: 'ฮีโร่ล่าของ',
  publisher: 'KUNG FU DUCK LLC',
  itemName: LOOTBOX_HERO_ITEM_TH,
  thUrl: 'https://apps.apple.com/th/app/id6757577016',
  usUrl: 'https://apps.apple.com/us/app/id6757577016',
  categoryNames: { currency: 'เหรียญทองมืด (App Store)', pass: 'Passes (App Store)', bundle: 'Packs (App Store)' },
  classify: lootboxHeroClassify,
  notes: [
    'LootBox Hero ("ฮีโร่ล่าของ", official site https://lootboxhero.9ring.com/) is published by KUNG FU DUCK LLC and is sold on the Thai App Store only (id 6757577016). "Lootbox RPG" (Mario J. Gaida, id 1449364050) shares the name but is a paid app with no in-app purchases, so it is not a top-up game.',
    'The official web Top up Center (https://pay-lootboxhero.9ring.com/) shows products only after a game-account login (not done), so it is not used.',
    'The App Store lists items in Thai only; there is no English name or USD storefront (not on App Store US / KH / LA / MM), so name_en and USD are null with a reason (no FX).'
  ],
  sourceDetails: { official_site: 'https://lootboxhero.9ring.com/', webshop: 'https://pay-lootboxhero.9ring.com/', webshop_requires_login: true }
}

/** Live LootBox Hero packs from the App Store TH full in-app list (USD storefronts tried: US -> KH/LA/MM). */
export async function fetchLootboxHeroPacks(options?: { signal?: AbortSignal }): Promise<RovPacksResponse> {
  const b: any = await fetchAppStoreGamePacks(CFG, options?.signal)
  for (const c of b.categories ?? [])
    for (const p of c.packs ?? []) {
      if (p.price_usd == null && p.price_usd_null_reason)
        p.price_usd_null_reason = 'LootBox Hero is not listed on App Store US / KH / LA / MM (Thai App Store only); no FX conversion'
      if (p.name_en == null) p.name_en_null_reason = 'The App Store lists this game in Thai only; no English item name is published'
      if (p.description_en == null) p.description_en_null_reason = 'The App Store lists this game in Thai only; no English description is published'
    }
  return b
}

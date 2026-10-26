export type GameProvider =
  | 'termgame'
  | 'lastwar-official'
  | 'kingshot-official'
  | 'whiteout-survival-official'
  | 'whiteout-survival-24buym'
  | 'pubgm-midasbuy'
  | 'efootball-codashop-ios'
  | 'clash-of-critters-farlight'
  | 'mlbb-codashop'
  | 'cookierun-classic-appstore'
  | 'cookierun-classic-24buym'
  | 'lastwar-24buym'
  | 'heartopia-xd'
  | 'roblox-premiumfeatures'
  | 'wuwa-midasbuy'
  | 'yulgang-w-appstore'
  | 'rtnw-oneone'
  | 'rtnw-oneone-my'
  | 'rtnw-oneone-id'
  | 'rtnw-oneone-ph'
  | 'rtnw-oneone-sg'
  | 'bloodstrike-netease'
  | 'delta-force-garena'
  | 'aniimo-official'
  | 'architect-drimage'
  | 'bleach-appstore'
  | 'aceracer-netease'
  | 'cabal-combo'
  | 'tsubasa-klab'
  | 'cfl-midasbuy'
  | 'destiny-rising-netease'
  | 'draconia-sugarfun'
  | 'dnm-classic-mobapay'
export type GameRegistryEntry = {
  appId: number
  slug: string
  provider: GameProvider
}

export const GAME_REGISTRY: Record<string, GameRegistryEntry> = {
  rov: { appId: 100055, slug: 'rov', provider: 'termgame' },
  freefire: { appId: 100067, slug: 'freefire', provider: 'termgame' },
  'delta-force': { appId: 100151, slug: 'delta-force', provider: 'termgame' },
  'fc-online-m': { appId: 100071, slug: 'fc-online-m', provider: 'termgame' },
  'cod-mobile': { appId: 100082, slug: 'cod-mobile', provider: 'termgame' },
  'last-war': { appId: 200001, slug: 'last-war', provider: 'lastwar-official' },
  kingshot: { appId: 20235, slug: 'kingshot', provider: 'kingshot-official' },
  'whiteout-survival': {
    appId: 20121,
    slug: 'whiteout-survival',
    provider: 'whiteout-survival-official'
  },
  wos: {
    appId: 20121,
    slug: 'whiteout-survival',
    provider: 'whiteout-survival-official'
  },
  'whiteout-survival-24buym': {
    appId: 20121,
    slug: 'whiteout-survival-24buym',
    provider: 'whiteout-survival-24buym'
  },
  'wos-24buym': {
    appId: 20121,
    slug: 'whiteout-survival-24buym',
    provider: 'whiteout-survival-24buym'
  },
  'pubg-mobile': {
    appId: 1450015065,
    slug: 'pubg-mobile',
    provider: 'pubgm-midasbuy'
  },
  pubgm: {
    appId: 1450015065,
    slug: 'pubg-mobile',
    provider: 'pubgm-midasbuy'
  },
  efootball: {
    appId: 317,
    slug: 'efootball',
    provider: 'efootball-codashop-ios'
  },
  'efootball-ios': {
    appId: 317,
    slug: 'efootball',
    provider: 'efootball-codashop-ios'
  },
  'clash-of-critters': {
    appId: 10090,
    slug: 'clash-of-critters',
    provider: 'clash-of-critters-farlight'
  },
  coc: {
    appId: 10090,
    slug: 'clash-of-critters',
    provider: 'clash-of-critters-farlight'
  },
  'mobile-legends': {
    appId: 19,
    slug: 'mobile-legends',
    provider: 'mlbb-codashop'
  },
  'lastwar-24buym': {
    appId: 24002,
    slug: 'lastwar-24buym',
    provider: 'lastwar-24buym'
  },
  'last-war-24buym': {
    appId: 24002,
    slug: 'lastwar-24buym',
    provider: 'lastwar-24buym'
  },
  'lw-24buym': {
    appId: 24002,
    slug: 'lastwar-24buym',
    provider: 'lastwar-24buym'
  },
  'cookierun-classic': {
    appId: 6759596824,
    slug: 'cookierun-classic',
    provider: 'cookierun-classic-appstore'
  },
  crc: {
    appId: 6759596824,
    slug: 'cookierun-classic',
    provider: 'cookierun-classic-appstore'
  },
  'cookie-run-classic': {
    appId: 6759596824,
    slug: 'cookierun-classic',
    provider: 'cookierun-classic-appstore'
  },
  'cookierun-classic-24buym': {
    appId: 24001,
    slug: 'cookierun-classic-24buym',
    provider: 'cookierun-classic-24buym'
  },
  'crc-24buym': {
    appId: 24001,
    slug: 'cookierun-classic-24buym',
    provider: 'cookierun-classic-24buym'
  },
  heartopia: {
    appId: 2085001,
    slug: 'heartopia',
    provider: 'heartopia-xd'
  },
  'heartopia-xd': {
    appId: 2085001,
    slug: 'heartopia',
    provider: 'heartopia-xd'
  },
  roblox: {
    appId: 1,
    slug: 'roblox',
    provider: 'roblox-premiumfeatures'
  },
  robux: {
    appId: 1,
    slug: 'roblox',
    provider: 'roblox-premiumfeatures'
  },
  'wuthering-waves': {
    appId: 1460000975,
    slug: 'wuthering-waves',
    provider: 'wuwa-midasbuy'
  },
  wuwa: {
    appId: 1460000975,
    slug: 'wuthering-waves',
    provider: 'wuwa-midasbuy'
  },
  'wuthering-waves-midasbuy': {
    appId: 1460000975,
    slug: 'wuthering-waves',
    provider: 'wuwa-midasbuy'
  },
  'yulgang-w': {
    appId: 6756002784,
    slug: 'yulgang-w',
    provider: 'yulgang-w-appstore'
  },
  yulgangw: {
    appId: 6756002784,
    slug: 'yulgang-w',
    provider: 'yulgang-w-appstore'
  },
  ygw: {
    appId: 6756002784,
    slug: 'yulgang-w',
    provider: 'yulgang-w-appstore'
  },
  'delta-force-garena': { appId: 100151, slug: 'delta-force-garena', provider: 'delta-force-garena' },
  'deltaforce-garena': { appId: 100151, slug: 'delta-force-garena', provider: 'delta-force-garena' },
  aniimo: { appId: 999002, slug: 'aniimo', provider: 'aniimo-official' },
  'architect-land-of-exiles': { appId: 6698862298, slug: 'architect-land-of-exiles', provider: 'architect-drimage' },
  architect: { appId: 6698862298, slug: 'architect-land-of-exiles', provider: 'architect-drimage' },
  'dragon-nest-m-classic': { appId: 6743824718, slug: 'dragon-nest-m-classic', provider: 'dnm-classic-mobapay' },
  'dnm-classic': { appId: 6743824718, slug: 'dragon-nest-m-classic', provider: 'dnm-classic-mobapay' },
  'dragon-nest-m': { appId: 6743824718, slug: 'dragon-nest-m-classic', provider: 'dnm-classic-mobapay' },
  'draconia-saga': { appId: 6476590090, slug: 'draconia-saga', provider: 'draconia-sugarfun' },
  draconia: { appId: 6476590090, slug: 'draconia-saga', provider: 'draconia-sugarfun' },
  'draconia-saga-sea': { appId: 6476590090, slug: 'draconia-saga', provider: 'draconia-sugarfun' },
  'destiny-rising': { appId: 1593326563, slug: 'destiny-rising', provider: 'destiny-rising-netease' },
  'destinyrising': { appId: 1593326563, slug: 'destiny-rising', provider: 'destiny-rising-netease' },
  'destiny-rising-mobile': { appId: 1593326563, slug: 'destiny-rising', provider: 'destiny-rising-netease' },
  'crossfire-legends': { appId: 1460001033, slug: 'crossfire-legends', provider: 'cfl-midasbuy' },
  cfl: { appId: 1460001033, slug: 'crossfire-legends', provider: 'cfl-midasbuy' },
  'crossfire-legend': { appId: 1460001033, slug: 'crossfire-legends', provider: 'cfl-midasbuy' },
  'captain-tsubasa-dream-team': { appId: 1293738123, slug: 'captain-tsubasa-dream-team', provider: 'tsubasa-klab' },
  'captain-tsubasa': { appId: 1293738123, slug: 'captain-tsubasa-dream-team', provider: 'tsubasa-klab' },
  'tsubasa-dream-team': { appId: 1293738123, slug: 'captain-tsubasa-dream-team', provider: 'tsubasa-klab' },
  'cabal-infinite-combo': { appId: 0, slug: 'cabal-infinite-combo', provider: 'cabal-combo' },
  cabal: { appId: 0, slug: 'cabal-infinite-combo', provider: 'cabal-combo' },
  'cabal-m': { appId: 0, slug: 'cabal-infinite-combo', provider: 'cabal-combo' },
  'ace-racer': { appId: 1593356371, slug: 'ace-racer', provider: 'aceracer-netease' },
  aceracer: { appId: 1593356371, slug: 'ace-racer', provider: 'aceracer-netease' },
  'bleach-brave-souls': { appId: 1003168863, slug: 'bleach-brave-souls', provider: 'bleach-appstore' },
  'bleach': { appId: 1003168863, slug: 'bleach-brave-souls', provider: 'bleach-appstore' },
  'bleach-bs': { appId: 1003168863, slug: 'bleach-brave-souls', provider: 'bleach-appstore' },
  'brave-souls': { appId: 1003168863, slug: 'bleach-brave-souls', provider: 'bleach-appstore' },
  'bleach-soul-resonance': { appId: 6745081346, slug: 'bleach-soul-resonance', provider: 'bleach-appstore' },
  'bleach-sr': { appId: 6745081346, slug: 'bleach-soul-resonance', provider: 'bleach-appstore' },
  'soul-resonance': { appId: 6745081346, slug: 'bleach-soul-resonance', provider: 'bleach-appstore' },
  'bleach-mirrors-high': { appId: 6758332966, slug: 'bleach-mirrors-high', provider: 'bleach-appstore' },
  'bleach-mh': { appId: 6758332966, slug: 'bleach-mirrors-high', provider: 'bleach-appstore' },
  'mirrors-high': { appId: 6758332966, slug: 'bleach-mirrors-high', provider: 'bleach-appstore' },
  'blood-strike': {
    appId: 1637059453,
    slug: 'blood-strike',
    provider: 'bloodstrike-netease'
  },
  bloodstrike: {
    appId: 1637059453,
    slug: 'blood-strike',
    provider: 'bloodstrike-netease'
  },
  // --- Ragnarok: The New World (OneOne OOC) — country-separated SEA ---
  // Add to GameProvider union:
  //   | 'rtnw-oneone'
  //   | 'rtnw-oneone-my'
  //   | 'rtnw-oneone-id'
  //   | 'rtnw-oneone-ph'
  //   | 'rtnw-oneone-sg'
  //
  // Thailand (default):
  'ragnarok-the-new-world': {
    appId: 174,
    slug: 'ragnarok-the-new-world',
    provider: 'rtnw-oneone'
  },
  'ragnarok-the-new-world-th': {
    appId: 174,
    slug: 'ragnarok-the-new-world',
    provider: 'rtnw-oneone'
  },
  rtnw: {
    appId: 174,
    slug: 'ragnarok-the-new-world',
    provider: 'rtnw-oneone'
  },
  'rtnw-th': {
    appId: 174,
    slug: 'ragnarok-the-new-world',
    provider: 'rtnw-oneone'
  },
  'ragnarok-tnw': {
    appId: 174,
    slug: 'ragnarok-the-new-world',
    provider: 'rtnw-oneone'
  },
  'ragnarok-tnw-th': {
    appId: 174,
    slug: 'ragnarok-the-new-world',
    provider: 'rtnw-oneone'
  },
  // Malaysia:
  'ragnarok-the-new-world-my': {
    appId: 174,
    slug: 'ragnarok-the-new-world-my',
    provider: 'rtnw-oneone-my'
  },
  'rtnw-my': {
    appId: 174,
    slug: 'ragnarok-the-new-world-my',
    provider: 'rtnw-oneone-my'
  },
  'ragnarok-tnw-my': {
    appId: 174,
    slug: 'ragnarok-the-new-world-my',
    provider: 'rtnw-oneone-my'
  },
  // Indonesia:
  'ragnarok-the-new-world-id': {
    appId: 174,
    slug: 'ragnarok-the-new-world-id',
    provider: 'rtnw-oneone-id'
  },
  'rtnw-id': {
    appId: 174,
    slug: 'ragnarok-the-new-world-id',
    provider: 'rtnw-oneone-id'
  },
  'ragnarok-tnw-id': {
    appId: 174,
    slug: 'ragnarok-the-new-world-id',
    provider: 'rtnw-oneone-id'
  },
  // Philippines:
  'ragnarok-the-new-world-ph': {
    appId: 174,
    slug: 'ragnarok-the-new-world-ph',
    provider: 'rtnw-oneone-ph'
  },
  'rtnw-ph': {
    appId: 174,
    slug: 'ragnarok-the-new-world-ph',
    provider: 'rtnw-oneone-ph'
  },
  'ragnarok-tnw-ph': {
    appId: 174,
    slug: 'ragnarok-the-new-world-ph',
    provider: 'rtnw-oneone-ph'
  },
  // Singapore:
  'ragnarok-the-new-world-sg': {
    appId: 174,
    slug: 'ragnarok-the-new-world-sg',
    provider: 'rtnw-oneone-sg'
  },
  'rtnw-sg': {
    appId: 174,
    slug: 'ragnarok-the-new-world-sg',
    provider: 'rtnw-oneone-sg'
  },
  'ragnarok-tnw-sg': {
    appId: 174,
    slug: 'ragnarok-the-new-world-sg',
    provider: 'rtnw-oneone-sg'
  }
}

export function getGameBySlug(slug: string): GameRegistryEntry | undefined {
  return GAME_REGISTRY[slug]
}

/** Human-readable labels for UI; keyed by canonical registry slug. */
const GAME_DISPLAY_NAMES: Record<string, string> = {
  rov: 'RoV',
  freefire: 'Free Fire',
  'delta-force': 'Delta Force',
  'fc-online-m': 'FC Online M',
  'cod-mobile': 'Call of Duty: Mobile',
  'last-war': 'Last War',
  kingshot: 'Kingshot',
  'whiteout-survival': 'Whiteout Survival',
  'whiteout-survival-24buym': 'Whiteout Survival (24buym)',
  'pubg-mobile': 'PUBG Mobile',
  efootball: 'eFootball (iOS)',
  'clash-of-critters': 'Clash of Critters',
  'mobile-legends': 'Mobile Legends',
  'lastwar-24buym': 'Last War (24buym)',
  'cookierun-classic': 'Cookie Run: Classic',
  'cookierun-classic-24buym': 'Cookie Run: Classic (24buym)',
  heartopia: 'Heartopia',
  roblox: 'Roblox',
  'wuthering-waves': 'Wuthering Waves',
  'yulgang-w': 'Yulgang W',
  'blood-strike': 'Blood Strike',
  aniimo: 'Aniimo',
  'architect-land-of-exiles': 'Architect: Land of Exiles',
  'ace-racer': 'Ace Racer',
  'cabal-infinite-combo': 'CABAL: INFINITE COMBO',
  'captain-tsubasa-dream-team': 'Captain Tsubasa: Dream Team',
  'crossfire-legends': 'Crossfire: Legends',
  'destiny-rising': 'Destiny: Rising',
  'draconia-saga': 'Draconia Saga',
  'dragon-nest-m-classic': 'Dragon Nest M: Classic',
  'bleach-brave-souls': 'BLEACH: Brave Souls',
  'bleach-soul-resonance': 'BLEACH: Soul Resonance',
  'bleach-mirrors-high': 'BLEACH Mirrors High',
  'delta-force-garena': 'Delta Force (Garena)',
  'ragnarok-the-new-world': 'Ragnarok: The New World (TH)',
  'ragnarok-the-new-world-my': 'Ragnarok: The New World (MY)',
  'ragnarok-the-new-world-id': 'Ragnarok: The New World (ID)',
  'ragnarok-the-new-world-ph': 'Ragnarok: The New World (PH)',
  'ragnarok-the-new-world-sg': 'Ragnarok: The New World (SG)'
}

export type ListedGame = {
  slug: string
  name: string
  provider: GameProvider
  appId: number
}

function titleizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Unique games for the UI picker. Alias keys (e.g. wos → whiteout-survival)
 * collapse to one row; prefer the registry key that matches entry.slug.
 */
export function listCanonicalGames(): ListedGame[] {
  const groups = new Map<
    string,
    { keys: string[]; entry: GameRegistryEntry }
  >()

  for (const [key, entry] of Object.entries(GAME_REGISTRY)) {
    const id = `${entry.slug}::${entry.provider}`
    const group = groups.get(id)
    if (!group) {
      groups.set(id, { keys: [key], entry })
    } else {
      group.keys.push(key)
    }
  }

  const games: ListedGame[] = []
  for (const { keys, entry } of groups.values()) {
    const slug = keys.includes(entry.slug)
      ? entry.slug
      : [...keys].sort((a, b) => a.length - b.length || a.localeCompare(b))[0]!
    games.push({
      slug,
      name: GAME_DISPLAY_NAMES[entry.slug] ?? titleizeSlug(entry.slug),
      provider: entry.provider,
      appId: entry.appId
    })
  }

  return games.sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

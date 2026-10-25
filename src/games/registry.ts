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

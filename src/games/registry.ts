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

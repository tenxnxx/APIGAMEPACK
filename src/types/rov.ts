export type TermgameUpstream = {
  app_info: {
    app_id: number
    app_name: string
    point_name: string
    point_icon: string
  }
  channels: Array<{
    channel: number
    name: string
    visible: boolean
    status: number
    message: string
    items: Array<{
      id: number
      app_point_amount: number
      currency_amount: number
      currency: string
      promo: { total_promo_amount: number }
    }>
  }>
}

/** @deprecated Prefer TermgameUpstream; kept for compatibility */
export type RovUpstream = TermgameUpstream

export type RovPack = {
  id: number
  name: string
  baseItemAmount: number
  bonusItemAmount: number
  totalItemAmount: number
  price: number
  currency: string
  /** Listed THB from 24buym data-price when dual-currency. */
  price_thb?: number
  /** Official Century Games USD matched by Frost Star amount; null if unmatched. */
  price_usd?: number | null
  /** Convenience dual-currency map; USD is null when unmatched/ambiguous. */
  prices?: { THB: number | null; MYR?: number | null; USD: number | null }
  price_thb_source?: string
  price_usd_source?: string | null
  issues?: string[]
}

export type RovPackCategory = {
  id: number
  name: string
  status: number
  message: string
  packCount: number
  packs: RovPack[]
}

export type RovPackSource = {
  id: string
  role: string
  currency: string
  url: string
}

/** Dual-currency source map used by whiteout-survival-24buym (usd is null when missing). */
export type RovPackDualCurrencySources = {
  thb: string
  usd: string | null
}

export type RovPacksResponse = {
  game: {
    id: number
    slug: string
    name: string
    itemName: string
    itemIcon: string
  }
  categories: RovPackCategory[]
  summary: {
    categoryCount: number
    packCount: number
  }
  fetchedAt: string
  source: string
  sources?: RovPackSource[] | RovPackDualCurrencySources
  notes?: string[]
}

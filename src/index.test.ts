import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { app } from './index'
import { clearPacksCache, setPacksCache } from './lib/packs-cache'

const originalFetch = globalThis.fetch

const upstreamItem = {
  app_id: 100055,
  channel_id: 207074,
  item_id: 9,
  app_point_amount: 10,
  garena_point_amount: 1500,
  currency: 'THB',
  currency_amount: 10,
  rebate_card_id: 0,
  app_item_id: 0,
  priority: 10,
  extra_data: '{}',
  id: 27939,
  user_group: 0,
  customised_tab_id: 0,
  currency_symbol: 'Ã Â¸Â¿ %.2f',
  promo: {
    total_promo_amount: 2,
    fake_promo_amount: 0,
    real_promo_amount: 2,
    onetime_promo_amount: 0,
    firsttime_promo_amount: 0,
    pss_promo_amount: 0,
    gop_one_time_promo_amount: 0,
    discount_currency_amount: 0,
    promo_items: [],
    churn_promo_amount: 0
  },
  backend_channel_ids: [207074],
  original_currency_amount: 10
}

const upstreamChannel = {
  priority: 1,
  channel: 207074,
  category: 213,
  name: 'ShopeePay',
  description: 'Pay with ShopeePay',
  currency: 'THB',
  icon: 'https://example.com/channel.png',
  icon_pc: 'https://example.com/channel-pc.png',
  discount: 1,
  visible: true,
  flag: 18,
  is_new: 0,
  is_hot: 2,
  is_on_sale: 0,
  status: 0,
  message: '',
  backend_channel_ids: [207074],
  extra: {},
  items: [upstreamItem]
}

const upstreamPayload = {
  app_info: {
    app_id: 100055,
    app_name: 'RoV : Mobile MOBA',
    client_share: true,
    icon: 'https://example.com/rov.png',
    point_name: 'Ã Â¸â€žÃ Â¸Â¹Ã Â¸â€ºÃ Â¸Â­Ã Â¸â€¡',
    point_icon: 'https://example.com/coupon.png',
    platforms: [1, 3, 4, 6, 8, 10],
    mshop_header: 'https://example.com/header.png',
    mshop_mb_bg_image: 'https://example.com/mobile-bg.png',
    mshop_pc_bg_image: 'https://example.com/desktop-bg.png',
    open_app_url: null
  },
  channels: [
    upstreamChannel,
    { ...upstreamChannel, channel: 999999, name: 'Hidden', visible: false }
  ],
  invoice_info: {},
  announcements: [],
  announcement_ids_by_position: {
    non_revamp_app_main_page: [],
    non_revamp_channel_page: {},
    non_revamp_successful_txn_page: {},
    revamp_app_main_page: [],
    revamp_channel_page: {},
    revamp_order_page: {},
    revamp_successful_txn_page: {}
  },
  free_items: [],
  tabs: []
}

beforeEach(() => {
  clearPacksCache()
})

afterEach(() => {
  globalThis.fetch = originalFetch
  clearPacksCache()
})

describe('GET /health', () => {
  it('returns the service health', async () => {
    const response = await app.handle(
      new Request('http://localhost/health')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })
})

describe('GET /games/', () => {
  it('returns canonical games without alias duplicates', async () => {
    const response = await app.handle(new Request('http://localhost/games/'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.count).toBe(body.games.length)
    expect(body.games.length).toBeGreaterThan(0)

    const slugs = body.games.map((g: { slug: string }) => g.slug)
    expect(slugs).toContain('whiteout-survival')
    expect(slugs).not.toContain('wos')
    expect(slugs).toContain('pubg-mobile')
    expect(slugs).not.toContain('pubgm')

    for (const game of body.games) {
      expect(game).toMatchObject({
        slug: expect.any(String),
        name: expect.any(String),
        provider: expect.any(String),
        appId: expect.any(Number)
      })
    }
  })
})

describe('GET /', () => {
  it('serves the pack viewer HTML', async () => {
    const response = await app.handle(new Request('http://localhost/'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-cache')
    const html = await response.text()
    expect(html).toContain('APIGAME Pack')
    expect(html).toContain('ดูราคาแพ็คเกม')
  })
})

describe('GET /styles.css and /app.js', () => {
  it('serves assets with short public cache', async () => {
    const css = await app.handle(new Request('http://localhost/styles.css'))
    const js = await app.handle(new Request('http://localhost/app.js'))
    expect(css.status).toBe(200)
    expect(js.status).toBe(200)
    expect(css.headers.get('cache-control')).toBe('public, max-age=3600')
    expect(js.headers.get('cache-control')).toBe('public, max-age=3600')
  })
})

describe('packs response cache', () => {
  it('serves HIT from memory without calling upstream again', async () => {
    let fetches = 0
    globalThis.fetch = (async () => {
      fetches += 1
      return new Response('should not be called', { status: 500 })
    }) as typeof fetch

    setPacksCache('rov', 200, {
      game: { id: 1, slug: 'rov', name: 'RoV', itemName: 'Coupon', itemIcon: '' },
      categories: [],
      summary: { categoryCount: 0, packCount: 0 },
      fetchedAt: '2026-01-01T00:00:00.000Z',
      source: 'cache-test'
    })

    const response = await app.handle(
      new Request('http://localhost/games/rov/packs/')
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('x-packs-cache')).toBe('HIT')
    expect(await response.json()).toMatchObject({ source: 'cache-test' })
    expect(fetches).toBe(0)
  })
})

describe('GET /games/rov/packs/', () => {
  const appStoreThHtml = `<html><script type="application/json">{"shelfMapping":{"information":{"title":"In-App Purchases","items_V3":[
    {"leadingText":"100-Diamond Bundle","trailingText":"฿35.00"},
    {"leadingText":"310-Diamond Bundle","trailingText":"฿99.00"}
  ]}}}</script></html>`

  const appStoreUsHtml = `<html><script type="application/json">{"shelfMapping":{"information":{"title":"In-App Purchases","items_V3":[
    {"leadingText":"100-Diamond Bundle","trailingText":"$0.99"},
    {"leadingText":"310-Diamond Bundle","trailingText":"$2.99"}
  ]}}}</script></html>`

  it('returns visible ROV packs with dual fields; USD from Apple price-tier oracle when THB matches', async () => {
    const urls: string[] = []
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      urls.push(url)
      if (url.includes('termgame.com/api/shop/apps/channels') && url.includes('app_id=100055')) {
        expect(url).toContain('region=IN.TH')
        const headers = new Headers(init?.headers)
        expect(headers.get('accept')).toBe('application/json')
        expect(headers.get('referer')).toBe('https://termgame.com/?app=100055')
        return Response.json(upstreamPayload)
      }
      if (url.includes('apps.apple.com/th/app/free-fire')) {
        return new Response(appStoreThHtml, { status: 200 })
      }
      if (url.includes('apps.apple.com/us/app/free-fire')) {
        return new Response(appStoreUsHtml, { status: 200 })
      }
      throw new Error('unexpected url ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/rov/packs/')
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game).toEqual({
      id: 100055,
      slug: 'rov',
      name: 'RoV : Mobile MOBA',
      itemName: upstreamPayload.app_info.point_name,
      itemIcon: 'https://example.com/coupon.png'
    })
    expect(body.sources.thb).toContain('app_id=100055')
    expect(body.sources.usd).toContain('apps.apple.com/us/app/free-fire')
    expect(body.categories[0].packCount).toBe(1)
    const pack = body.categories[0].packs[0]
    expect(pack.price).toBe(10)
    expect(pack.currency).toBe('THB')
    expect(pack.price_thb).toBe(10)
    // ฿10 is not in oracle tiers (35/99) → null USD, no FX
    expect(pack.price_usd).toBeNull()
    expect(pack.prices).toEqual({ THB: 10, USD: null })
    expect(pack.price_thb_source).toBe('termgame')
    expect(pack.price_usd_source).toBeNull()
    // Must NOT append Free Fire App Store diamond category onto RoV
    expect(body.categories.every((c: { id: number }) => c.id !== 900067)).toBe(true)
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false)
  })

  it('attaches USD via price tier when termgame THB equals App Store tier', async () => {
    const tierItem = {
      ...upstreamItem,
      id: 4601,
      app_point_amount: 83,
      currency_amount: 99,
      original_currency_amount: 99,
      promo: { ...upstreamItem.promo, total_promo_amount: 0, real_promo_amount: 0 }
    }
    const payload = {
      ...upstreamPayload,
      channels: [{ ...upstreamChannel, items: [tierItem] }]
    }

    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('termgame.com')) return Response.json(payload)
      if (url.includes('apps.apple.com/th/app/free-fire')) {
        return new Response(appStoreThHtml, { status: 200 })
      }
      if (url.includes('apps.apple.com/us/app/free-fire')) {
        return new Response(appStoreUsHtml, { status: 200 })
      }
      throw new Error('unexpected url ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/rov/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    const pack = body.categories[0].packs[0]
    expect(pack.price_thb).toBe(99)
    expect(pack.price_usd).toBe(2.99)
    expect(pack.price_usd_source).toBe('appstore')
    expect(pack.prices).toEqual({ THB: 99, USD: 2.99 })
  })

  it('returns 502 when the upstream request fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network unavailable')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/rov/packs/')
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })

  it('returns 502 when the upstream response is not successful', async () => {
    globalThis.fetch = (async () =>
      new Response('maintenance', { status: 503 })) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/rov/packs/')
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })

  it('returns 502 when the upstream payload is malformed', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('termgame.com')) {
        return Response.json({ app_info: null, channels: [] })
      }
      return new Response(appStoreThHtml, { status: 200 })
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/rov/packs/')
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Invalid upstream response'
    })
  })

  it('returns 502 when the upstream body is not JSON', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('termgame.com')) {
        return new Response('not json', { status: 200 })
      }
      return new Response(appStoreThHtml, { status: 200 })
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/rov/packs/')
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Invalid upstream response'
    })
  })
})


describe('GET /games/freefire/packs/', () => {
  const freefireUpstreamItem = {
    ...upstreamItem,
    app_id: 100067,
    id: 38001,
    app_point_amount: 100,
    currency_amount: 35,
    original_currency_amount: 35,
    promo: {
      ...upstreamItem.promo,
      total_promo_amount: 10,
      real_promo_amount: 10
    }
  }

  const freefireUpstreamChannel = {
    ...upstreamChannel,
    channel: 301001,
    name: 'TrueMoney',
    items: [freefireUpstreamItem]
  }

  const freefireUpstreamPayload = {
    ...upstreamPayload,
    app_info: {
      ...upstreamPayload.app_info,
      app_id: 100067,
      app_name: 'Free Fire',
      point_name: 'Diamond',
      point_icon: 'https://example.com/diamond.png'
    },
    channels: [
      freefireUpstreamChannel,
      { ...freefireUpstreamChannel, channel: 888888, name: 'Hidden', visible: false }
    ]
  }

  const freefireUsdPayload = {
    ...freefireUpstreamPayload,
    channels: [
      {
        ...freefireUpstreamChannel,
        channel: 251303,
        name: 'Card Payment USD',
        currency: 'USD',
        items: [
          {
            ...freefireUpstreamItem,
            id: 132675,
            app_point_amount: 100,
            currency: 'USD',
            currency_amount: 0.99,
            original_currency_amount: 0.99,
            promo: { ...freefireUpstreamItem.promo, total_promo_amount: 0, real_promo_amount: 0 }
          }
        ]
      }
    ]
  }

  const appStoreThHtml = `<html><script type="application/json">{"shelfMapping":{"information":{"title":"In-App Purchases","items_V3":[
    {"leadingText":"100-Diamond Bundle","trailingText":"฿35.00"},
    {"leadingText":"310-Diamond Bundle","trailingText":"฿99.00"}
  ]}}}</script></html>`

  const appStoreUsHtml = `<html><script type="application/json">{"shelfMapping":{"information":{"title":"In-App Purchases","items_V3":[
    {"leadingText":"100-Diamond Bundle","trailingText":"$0.99"},
    {"leadingText":"310-Diamond Bundle","trailingText":"$2.99"}
  ]}}}</script></html>`

  it('returns Free Fire packs with dual THB+USD matched by amount + App Store category', async () => {
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      if (url.includes('termgame.com') && url.includes('app_id=100067') && url.includes('region=IN.TH')) {
        const headers = new Headers(init?.headers)
        expect(headers.get('accept')).toBe('application/json')
        expect(headers.get('referer')).toBe('https://termgame.com/?app=100067')
        return Response.json(freefireUpstreamPayload)
      }
      if (url.includes('termgame.com') && url.includes('region=US')) {
        return Response.json(freefireUsdPayload)
      }
      if (url.includes('apps.apple.com/th/app/free-fire')) {
        return new Response(appStoreThHtml, { status: 200 })
      }
      if (url.includes('apps.apple.com/us/app/free-fire')) {
        return new Response(appStoreUsHtml, { status: 200 })
      }
      throw new Error('unexpected url ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/freefire/packs/')
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game).toEqual({
      id: 100067,
      slug: 'freefire',
      name: 'Free Fire',
      itemName: 'Diamond',
      itemIcon: 'https://example.com/diamond.png'
    })
    expect(body.sources.thb).toContain('app_id=100067')
    expect(typeof body.sources.usd).toBe('string')

    const termgameCat = body.categories.find((c: { id: number }) => c.id === 301001)
    expect(termgameCat).toBeTruthy()
    expect(termgameCat.packs[0]).toEqual({
      id: 38001,
      name: 'Diamond 100',
      baseItemAmount: 100,
      bonusItemAmount: 10,
      totalItemAmount: 110,
      price: 35,
      currency: 'THB',
      price_thb: 35,
      price_usd: 0.99,
      prices: { THB: 35, USD: 0.99 },
      price_thb_source: 'termgame',
      price_usd_source: 'appstore'
    })

    const appStoreCat = body.categories.find((c: { id: number }) => c.id === 900067)
    expect(appStoreCat).toBeTruthy()
    expect(appStoreCat.name).toBe('App Store Diamond Bundles')
    expect(appStoreCat.packCount).toBe(2)
    expect(appStoreCat.packs[0].price_usd).toBe(0.99)
    expect(appStoreCat.packs[0].price_thb).toBe(35)
    expect(appStoreCat.packs[1].price_usd).toBe(2.99)
    expect(body.summary.packCount).toBe(3)
  })

  it('still returns termgame THB when App Store/USD enrichment fails', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('termgame.com') && url.includes('region=IN.TH')) {
        return Response.json(freefireUpstreamPayload)
      }
      throw new Error('enrichment down')
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/freefire/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.categories[0].packs[0].price_thb).toBe(35)
    expect(body.categories[0].packs[0].price_usd).toBeNull()
    expect(body.sources.usd).toBeNull()
  })

  it('returns 502 when the upstream request fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network unavailable')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/freefire/packs/')
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })
})



describe('GET /games/delta-force/packs/', () => {
  const deltaUpstreamItem = {
    ...upstreamItem,
    app_id: 100151,
    id: 45001,
    app_point_amount: 60,
    currency_amount: 34,
    original_currency_amount: 34,
    promo: {
      ...upstreamItem.promo,
      total_promo_amount: 0,
      real_promo_amount: 0
    }
  }

  const deltaUpstreamChannel = {
    ...upstreamChannel,
    channel: 401001,
    name: 'TrueMoney',
    items: [deltaUpstreamItem]
  }

  const deltaUpstreamPayload = {
    ...upstreamPayload,
    app_info: {
      ...upstreamPayload.app_info,
      app_id: 100151,
      app_name: 'Delta Force',
      point_name: 'Delta Coin',
      point_icon: 'https://example.com/delta-coin.png'
    },
    channels: [
      deltaUpstreamChannel,
      { ...deltaUpstreamChannel, channel: 777777, name: 'Hidden', visible: false }
    ]
  }

  const deltaAppStoreThHtml = `<html><script type="application/json">{"shelfMapping":{"information":{"title":"In-App Purchases","items_V3":[
    {"leadingText":"60 Delta Coins","trailingText":"฿35.00"},
    {"leadingText":"300 Delta Coins + 20 Bonus","trailingText":"฿175.00"},
    {"leadingText":"680 Delta Coins + 70 Bonus","trailingText":"฿345.00"}
  ]}}}</script></html>`

  const deltaAppStoreUsHtml = `<html><script type="application/json">{"shelfMapping":{"information":{"title":"In-App Purchases","items_V3":[
    {"leadingText":"60 Delta Coins","trailingText":"$0.99"},
    {"leadingText":"300 Delta Coins","trailingText":"$4.99"},
    {"leadingText":"680 Delta Coins","trailingText":"$9.99"},
    {"leadingText":"3280 Delta Coins","trailingText":"$49.99"}
  ]}}}</script></html>`

  it('returns visible Delta Force packs with dual fields; USD by coin amount', async () => {
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      if (url.includes('termgame.com/api/shop/apps/channels') && url.includes('app_id=100151')) {
        expect(url).toContain('region=IN.TH')
        const headers = new Headers(init?.headers)
        expect(headers.get('accept')).toBe('application/json')
        expect(headers.get('referer')).toBe('https://termgame.com/?app=100151')
        return Response.json(deltaUpstreamPayload)
      }
      if (url.includes('apps.apple.com/th/app/garena-delta-force')) {
        return new Response(deltaAppStoreThHtml, { status: 200 })
      }
      if (url.includes('apps.apple.com/us/app/delta-force')) {
        return new Response(deltaAppStoreUsHtml, { status: 200 })
      }
      throw new Error('unexpected url ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/delta-force/packs/')
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game).toEqual({
      id: 100151,
      slug: 'delta-force',
      name: 'Delta Force',
      itemName: 'Delta Coin',
      itemIcon: 'https://example.com/delta-coin.png'
    })
    expect(body.sources.thb).toContain('app_id=100151')
    expect(body.sources.usd).toContain('apps.apple.com/us/app/delta-force')
    expect(body.categories[0].packCount).toBe(1)
    const pack = body.categories[0].packs[0]
    expect(pack.price).toBe(34)
    expect(pack.currency).toBe('THB')
    expect(pack.price_thb).toBe(34)
    expect(pack.price_usd).toBe(0.99)
    expect(pack.prices).toEqual({ THB: 34, USD: 0.99 })
    expect(pack.price_thb_source).toBe('termgame')
    expect(pack.price_usd_source).toBe('appstore')
    const appStoreCat = body.categories.find(
      (c: { id: number }) => c.id === 900151
    )
    expect(appStoreCat).toBeTruthy()
    expect(appStoreCat.packCount).toBeGreaterThanOrEqual(1)
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false)
  })

  it('leaves price_usd null when amount and THB tier do not match', async () => {
    const oddItem = {
      ...deltaUpstreamItem,
      id: 45099,
      app_point_amount: 18,
      currency_amount: 10,
      original_currency_amount: 10
    }
    const payload = {
      ...deltaUpstreamPayload,
      channels: [{ ...deltaUpstreamChannel, items: [oddItem] }]
    }

    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('termgame.com')) return Response.json(payload)
      if (url.includes('apps.apple.com/th/app/garena-delta-force')) {
        return new Response(deltaAppStoreThHtml, { status: 200 })
      }
      if (url.includes('apps.apple.com/us/app/delta-force')) {
        return new Response(deltaAppStoreUsHtml, { status: 200 })
      }
      throw new Error('unexpected url ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/delta-force/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    const pack = body.categories[0].packs[0]
    expect(pack.price_thb).toBe(10)
    expect(pack.price_usd).toBeNull()
    expect(pack.prices).toEqual({ THB: 10, USD: null })
  })

  it('returns 502 when the upstream request fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network unavailable')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/delta-force/packs/')
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })
})


describe('GET /games/fc-online-m/packs/', () => {
  const fcoUpstreamItem = {
    ...upstreamItem,
    app_id: 100071,
    id: 71001,
    app_point_amount: 10000,
    currency_amount: 99,
    original_currency_amount: 99,
    promo: {
      ...upstreamItem.promo,
      total_promo_amount: 0,
      real_promo_amount: 0
    }
  }

  const fcoUpstreamChannel = {
    ...upstreamChannel,
    channel: 501001,
    name: 'TrueMoney',
    items: [fcoUpstreamItem]
  }

  const fcoUpstreamPayload = {
    ...upstreamPayload,
    app_info: {
      ...upstreamPayload.app_info,
      app_id: 100071,
      app_name: 'FC Online M (TH)',
      point_name: 'MC',
      point_icon: 'https://example.com/mc.png'
    },
    channels: [fcoUpstreamChannel]
  }

  const oracleThHtml = `<html><script type="application/json">{"shelfMapping":{"information":{"title":"In-App Purchases","items_V3":[
    {"leadingText":"100-Diamond Bundle","trailingText":"฿35.00"},
    {"leadingText":"310-Diamond Bundle","trailingText":"฿99.00"}
  ]}}}</script></html>`

  const oracleUsHtml = `<html><script type="application/json">{"shelfMapping":{"information":{"title":"In-App Purchases","items_V3":[
    {"leadingText":"100-Diamond Bundle","trailingText":"$0.99"},
    {"leadingText":"310-Diamond Bundle","trailingText":"$2.99"}
  ]}}}</script></html>`

  it('attaches USD via Apple price-tier oracle when THB matches; no FF category append', async () => {
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      if (url.includes('termgame.com') && url.includes('app_id=100071')) {
        expect(url).toContain('region=IN.TH')
        const headers = new Headers(init?.headers)
        expect(headers.get('referer')).toBe('https://termgame.com/?app=100071')
        return Response.json(fcoUpstreamPayload)
      }
      if (url.includes('apps.apple.com/th/app/free-fire')) {
        return new Response(oracleThHtml, { status: 200 })
      }
      if (url.includes('apps.apple.com/us/app/free-fire')) {
        return new Response(oracleUsHtml, { status: 200 })
      }
      throw new Error('unexpected url ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/fc-online-m/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('fc-online-m')
    expect(body.sources.usd).toContain('apps.apple.com/us/app/free-fire')
    const pack = body.categories[0].packs[0]
    expect(pack.price_thb).toBe(99)
    expect(pack.price_usd).toBe(2.99)
    expect(pack.price_usd_source).toBe('appstore')
    expect(body.categories.every((c: { id: number }) => c.id !== 900067)).toBe(
      true
    )
  })

  it('returns 502 when the upstream request fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network unavailable')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/fc-online-m/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })
})


describe('GET /games/cod-mobile/packs/', () => {
  const codUpstreamItem = {
    ...upstreamItem,
    app_id: 100082,
    id: 82001,
    app_point_amount: 220,
    currency_amount: 99,
    original_currency_amount: 99,
    promo: {
      ...upstreamItem.promo,
      total_promo_amount: 0,
      real_promo_amount: 0
    }
  }

  const codUpstreamChannel = {
    ...upstreamChannel,
    channel: 601001,
    name: 'TrueMoney',
    items: [codUpstreamItem]
  }

  const codUpstreamPayload = {
    ...upstreamPayload,
    app_info: {
      ...upstreamPayload.app_info,
      app_id: 100082,
      app_name: 'Call of Duty: Mobile - Garena',
      point_name: 'CP',
      point_icon: 'https://example.com/cp.png'
    },
    channels: [codUpstreamChannel]
  }

  const oracleThHtml = `<html><script type="application/json">{"shelfMapping":{"information":{"title":"In-App Purchases","items_V3":[
    {"leadingText":"100-Diamond Bundle","trailingText":"฿35.00"},
    {"leadingText":"310-Diamond Bundle","trailingText":"฿99.00"}
  ]}}}</script></html>`

  const oracleUsHtml = `<html><script type="application/json">{"shelfMapping":{"information":{"title":"In-App Purchases","items_V3":[
    {"leadingText":"100-Diamond Bundle","trailingText":"$0.99"},
    {"leadingText":"310-Diamond Bundle","trailingText":"$2.99"}
  ]}}}</script></html>`

  it('attaches USD via Apple price-tier oracle when THB matches', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('termgame.com') && url.includes('app_id=100082')) {
        expect(url).toContain('region=IN.TH')
        return Response.json(codUpstreamPayload)
      }
      if (url.includes('apps.apple.com/th/app/free-fire')) {
        return new Response(oracleThHtml, { status: 200 })
      }
      if (url.includes('apps.apple.com/us/app/free-fire')) {
        return new Response(oracleUsHtml, { status: 200 })
      }
      throw new Error('unexpected url ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/cod-mobile/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('cod-mobile')
    const pack = body.categories[0].packs[0]
    expect(pack.price_thb).toBe(99)
    expect(pack.price_usd).toBe(2.99)
    expect(pack.prices).toEqual({ THB: 99, USD: 2.99 })
  })

  it('leaves price_usd null when THB is not an App Store tier', async () => {
    const odd = {
      ...codUpstreamItem,
      currency_amount: 20,
      original_currency_amount: 20,
      app_point_amount: 44
    }
    const payload = {
      ...codUpstreamPayload,
      channels: [{ ...codUpstreamChannel, items: [odd] }]
    }
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('termgame.com')) return Response.json(payload)
      if (url.includes('apps.apple.com/th/app/free-fire')) {
        return new Response(oracleThHtml, { status: 200 })
      }
      if (url.includes('apps.apple.com/us/app/free-fire')) {
        return new Response(oracleUsHtml, { status: 200 })
      }
      throw new Error('unexpected url ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/cod-mobile/packs/')
    )
    expect(response.status).toBe(200)
    const pack = (await response.json()).categories[0].packs[0]
    expect(pack.price_usd).toBeNull()
  })

  it('returns 502 when the upstream request fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network unavailable')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/cod-mobile/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })
})

describe('GET /games/:slug/packs/ unknown slug', () => {
  it('returns 404 for an unknown game slug', async () => {
    const response = await app.handle(
      new Request('http://localhost/games/unknown-game/packs/')
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      error: 'Unknown game'
    })
  })
})
describe('GET /games/last-war/packs/', () => {
  const htmlOfficial =
    '<script type="module" crossorigin src="/assets/js/main-TESTHASH.js"></script>'
  const jsOfficial =
    'defaultGoodsData=[{goods_name:"",amount:"4.99",pay_brick_num:500,currency_symbol:"$",free_brick_num:25,goods_id:"goods_8",currency:"USD",status:2},{goods_name:"",amount:"9.99",pay_brick_num:1e3,currency_symbol:"$",free_brick_num:50,goods_id:"goods_1",currency:"USD",status:1},{goods_name:"",amount:"999.99",pay_brick_num:1e5,currency_symbol:"$",free_brick_num:5000,goods_id:"goods_7",currency:"USD",status:1}]'

  const sampleThHtml = `<!DOCTYPE html><html><body>
<script type="application/json">
{"data":[{"data":{"shelfMapping":{"information":{"items":[
{"title":"In-App Purchases","items":[{"textPairs":[
["Hot Package 5","฿160.00"],
["Hot Package 10","฿320.00"],
["Hot Package1","฿30.00"]
]}],"items_V3":[
{"$kind":"textPair","leadingText":"Hot Package 5","trailingText":"฿160.00"},
{"$kind":"textPair","leadingText":"Hot Package 10","trailingText":"฿320.00"},
{"$kind":"textPair","leadingText":"Hot Package1","trailingText":"฿30.00"}
]}
]}}}}]}
</script>
</body></html>`

  const sampleUsHtml = `<!DOCTYPE html><html><body>
<script type="application/json">
{"data":[{"data":{"shelfMapping":{"information":{"items":[
{"title":"In-App Purchases","items":[{"textPairs":[
["Hot Package 5","$4.99"],
["Hot Package 10","$9.99"],
["Hot Package1","$0.99"]
]}],"items_V3":[
{"$kind":"textPair","leadingText":"Hot Package 5","trailingText":"$4.99"},
{"$kind":"textPair","leadingText":"Hot Package 10","trailingText":"$9.99"},
{"$kind":"textPair","leadingText":"Hot Package1","trailingText":"$0.99"}
]}
]}}}}]}
</script>
</body></html>`

  it('returns official Gold Brick packs with App Store THB + official USD', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url === 'https://store.lastwar.com/' || url.endsWith('store.lastwar.com/')) {
        return new Response(htmlOfficial, { status: 200 })
      }
      if (url.includes('/assets/js/main-')) {
        return new Response(jsOfficial, { status: 200 })
      }
      if (url.includes('apps.apple.com/th/app/last-war-survival')) {
        return new Response(sampleThHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      }
      if (url.includes('apps.apple.com/us/app/last-war-survival')) {
        return new Response(sampleUsHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      }
      throw new Error('unexpected url ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/last-war/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game).toEqual({
      id: 200001,
      slug: 'last-war',
      name: 'Last War',
      itemName: 'Gold Brick',
      itemIcon: ''
    })
    // $999.99 has no App Store THB match → omitted
    expect(body.summary).toEqual({ categoryCount: 1, packCount: 2 })
    expect(body.source).toBe('https://store.lastwar.com/')
    expect(body.sources).toEqual({
      thb: 'https://apps.apple.com/th/app/last-war-survival/id6448786147',
      usd: 'https://store.lastwar.com/'
    })
    expect(body.categories[0].packs).toEqual([
      {
        id: 1,
        name: 'Gold Brick 500',
        baseItemAmount: 500,
        bonusItemAmount: 25,
        totalItemAmount: 525,
        price: 160,
        currency: 'THB',
        price_thb: 160,
        price_usd: 4.99,
        prices: { THB: 160, USD: 4.99 },
        price_thb_source: 'appstore',
        price_usd_source: 'official-store'
      },
      {
        id: 2,
        name: 'Gold Brick 1000',
        baseItemAmount: 1000,
        bonusItemAmount: 50,
        totalItemAmount: 1050,
        price: 320,
        currency: 'THB',
        price_thb: 320,
        price_usd: 9.99,
        prices: { THB: 320, USD: 9.99 },
        price_thb_source: 'appstore',
        price_usd_source: 'official-store'
      }
    ])
  })

  it('returns 502 when official store fetch fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/last-war/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })

  it('returns 502 when App Store TH IAP is empty', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('store.lastwar.com')) {
        return new Response(htmlOfficial, { status: 200 })
      }
      if (url.includes('/assets/js/main-')) {
        return new Response(jsOfficial, { status: 200 })
      }
      if (url.includes('apps.apple.com/th/')) {
        return new Response('<html><body>no iap</body></html>', { status: 200 })
      }
      if (url.includes('apps.apple.com/us/')) {
        return new Response(sampleUsHtml, { status: 200 })
      }
      throw new Error('unexpected url ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/last-war/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Invalid upstream response'
    })
  })
})

describe('GET /games/kingshot/packs/', () => {
  const sampleThHtml = `<!DOCTYPE html><html><body>
<script type="application/json">
{"data":[{"data":{"shelfMapping":{"information":{"items":[
{"title":"In-App Purchases","items":[{"textPairs":[
["Normal Pack 5","฿179.00"],
["Normal Pack 7","฿349.00"],
["Normal Pack 3","฿99.00"],
["Normal Pack 10","฿729.00"]
]}],"items_V3":[
{"$kind":"textPair","leadingText":"Normal Pack 5","trailingText":"฿179.00"},
{"$kind":"textPair","leadingText":"Normal Pack 7","trailingText":"฿349.00"},
{"$kind":"textPair","leadingText":"Normal Pack 3","trailingText":"฿99.00"},
{"$kind":"textPair","leadingText":"Normal Pack 10","trailingText":"฿729.00"}
]}
]}}}}]}
</script>
</body></html>`

  const sampleUsHtml = `<!DOCTYPE html><html><body>
<script type="application/json">
{"data":[{"data":{"shelfMapping":{"information":{"items":[
{"title":"In-App Purchases","items":[{"textPairs":[
["Normal Pack 5","$4.99"],
["Normal Pack 7","$9.99"],
["Normal Pack 3","$2.99"],
["Normal Pack 10","$19.99"]
]}],"items_V3":[
{"$kind":"textPair","leadingText":"Normal Pack 5","trailingText":"$4.99"},
{"$kind":"textPair","leadingText":"Normal Pack 7","trailingText":"$9.99"},
{"$kind":"textPair","leadingText":"Normal Pack 3","trailingText":"$2.99"},
{"$kind":"textPair","leadingText":"Normal Pack 10","trailingText":"$19.99"}
]}
]}}}}]}
</script>
</body></html>`

  const mockPacks = [
    {
      package_display_name: 'Kingdom Special Pack',
      main_number: 1999,
      final_amount: '19.99',
      product_id: 'com.got.kingshot.gem64',
      main_content: 'https://example.com/star.png',
      items: [{ item_number: 100 }]
    },
    {
      package_display_name: '',
      main_number: 999,
      final_amount: '9.99',
      product_id: 'thirdpayment.got.kingshot.gem19',
      main_content: 'https://example.com/star.png',
      items: [{ item_number: 50 }]
    },
    {
      package_display_name: 'Unmatched High Tier',
      main_number: 99990,
      final_amount: '999.9',
      product_id: 'thirdpayment.got.kingshot.gem18',
      main_content: 'https://example.com/star.png',
      items: [{ item_number: 5000 }]
    }
  ]

  it('returns official Kingdom Stars packs with App Store THB + official USD', async () => {
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      if (url.startsWith('https://cg-vip-mall-wos.centurygame.com/api/activity/packages_info?')) {
        expect(url).toContain('game_id=20235')
        expect(url).toContain('currency=USD')
        expect(url).toContain('webVersion=v2.3.8')
        expect(url).toContain('auth=')
        const headers = new Headers(init?.headers)
        expect(headers.get('Auth-Key')).toBeTruthy()
        expect(headers.get('Request-Path')).toBe(
          'https://store.centurygames.com/kingshot'
        )
        expect(headers.get('Origin')).toBe('https://store.centurygames.com')
        return Response.json({
          code: 1,
          data: {
            game_id: '20235',
            game_name: 'Kingshot',
            package_list: { config_list: mockPacks }
          }
        })
      }
      if (url.includes('apps.apple.com/th/app/kingshot')) {
        return new Response(sampleThHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      }
      if (url.includes('apps.apple.com/us/app/kingshot')) {
        return new Response(sampleUsHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      }
      throw new Error('unexpected url ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/kingshot/packs/')
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game).toEqual({
      id: 20235,
      slug: 'kingshot',
      name: 'Kingshot',
      itemName: 'Kingdom Stars',
      itemIcon: 'https://example.com/star.png'
    })
    // $999.9 has no App Store THB match → omitted
    expect(body.summary).toEqual({ categoryCount: 1, packCount: 2 })
    expect(body.source).toBe('https://store.centurygames.com/kingshot')
    expect(body.sources).toEqual({
      thb: 'https://apps.apple.com/th/app/kingshot/id6739554056',
      usd: 'https://store.centurygames.com/kingshot'
    })
    expect(body.categories[0].packs).toEqual([
      {
        id: 1,
        name: 'Kingdom Special Pack',
        baseItemAmount: 1999,
        bonusItemAmount: 100,
        totalItemAmount: 2099,
        price: 729,
        currency: 'THB',
        price_thb: 729,
        price_usd: 19.99,
        prices: { THB: 729, USD: 19.99 },
        price_thb_source: 'appstore',
        price_usd_source: 'official-store'
      },
      {
        id: 2,
        name: 'Kingdom Stars 999',
        baseItemAmount: 999,
        bonusItemAmount: 50,
        totalItemAmount: 1049,
        price: 349,
        currency: 'THB',
        price_thb: 349,
        price_usd: 9.99,
        prices: { THB: 349, USD: 9.99 },
        price_thb_source: 'appstore',
        price_usd_source: 'official-store'
      }
    ])
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false)
  })

  it('returns 502 when Kingshot upstream request fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network unavailable')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/kingshot/packs/')
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })

  it('returns 502 when Kingshot upstream payload is invalid', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('packages_info')) {
        return Response.json({
          code: 101031008,
          data: {},
          msg: 'Need Refresh!'
        })
      }
      if (url.includes('apps.apple.com/th/')) {
        return new Response(sampleThHtml, { status: 200 })
      }
      if (url.includes('apps.apple.com/us/')) {
        return new Response(sampleUsHtml, { status: 200 })
      }
      throw new Error('unexpected url ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/kingshot/packs/')
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Invalid upstream response'
    })
  })

  it('returns 502 when App Store TH IAP is empty', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('packages_info')) {
        return Response.json({
          code: 1,
          data: {
            game_id: '20235',
            game_name: 'Kingshot',
            package_list: { config_list: mockPacks }
          }
        })
      }
      if (url.includes('apps.apple.com/th/')) {
        return new Response('<html><body>no iap</body></html>', { status: 200 })
      }
      if (url.includes('apps.apple.com/us/')) {
        return new Response(sampleUsHtml, { status: 200 })
      }
      throw new Error('unexpected url ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/kingshot/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Invalid upstream response'
    })
  })
})

describe('GET /games/whiteout-survival/packs/', () => {
  const mockUsdPacks = [
    {
      package_display_name: 'Deep Frost Special Pack',
      main_number: 1999,
      final_amount: '19.99',
      product_id: 'com.gof.whiteoutsurvival.gem64',
      main_content: 'https://example.com/frost.png',
      items: [{ item_number: 100 }]
    },
    {
      package_display_name: '',
      main_number: 999,
      final_amount: '9.99',
      product_id: 'thirdpayment.gof.whiteoutsurvival.gem19',
      main_content: 'https://example.com/frost.png',
      items: [{ item_number: 50 }]
    },
    {
      package_display_name: 'Unmatched USD-only Pack',
      main_number: 123,
      final_amount: '1.99',
      product_id: 'thirdpayment.gof.whiteoutsurvival.missing',
      main_content: 'https://example.com/frost.png',
      items: [{ item_number: 0 }]
    }
  ]

  const mockThbPacks = [
    {
      package_display_name: 'Deep Frost Special Pack',
      main_number: 1999,
      final_amount: '729',
      product_id: 'com.gof.whiteoutsurvival.gem64',
      main_content: 'https://example.com/frost.png',
      items: [{ item_number: 100 }]
    },
    {
      package_display_name: '',
      main_number: 999,
      final_amount: '349',
      product_id: 'thirdpayment.gof.whiteoutsurvival.gem19',
      main_content: 'https://example.com/frost.png',
      items: [{ item_number: 50 }]
    }
  ]

  it('returns official Frost Stars packs with Century THB + USD (dual)', async () => {
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      expect(url.startsWith('https://cg-vip-mall-wos.centurygame.com/api/activity/packages_info?')).toBe(true)
      expect(url).toContain('game_id=20121')
      expect(url).toContain('auth=')
      const headers = new Headers(init?.headers)
      expect(headers.get('Auth-Key')).toBeTruthy()
      expect(headers.get('Request-Path')).toBe('https://store.centurygames.com/wos')
      expect(headers.get('Origin')).toBe('https://store.centurygames.com')

      if (url.includes('currency=THB')) {
        return Response.json({
          code: 1,
          data: {
            game_id: '20121',
            game_name: 'Whiteout Survival',
            package_list: { config_list: mockThbPacks }
          }
        })
      }

      expect(url).toContain('currency=USD')
      return Response.json({
        code: 1,
        data: {
          game_id: '20121',
          game_name: 'Whiteout Survival',
          package_list: { config_list: mockUsdPacks }
        }
      })
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/whiteout-survival/packs/')
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game).toEqual({
      id: 20121,
      slug: 'whiteout-survival',
      name: 'Whiteout Survival',
      itemName: 'Frost Stars',
      itemIcon: 'https://example.com/frost.png'
    })
    // unmatched product_id omitted
    expect(body.summary).toEqual({ categoryCount: 1, packCount: 2 })
    expect(body.source).toBe('https://store.centurygames.com/wos')
    expect(body.sources).toEqual({
      thb: 'https://store.centurygames.com/wos',
      usd: 'https://store.centurygames.com/wos'
    })
    expect(body.categories[0].packs).toEqual([
      {
        id: 1,
        name: 'Deep Frost Special Pack',
        baseItemAmount: 1999,
        bonusItemAmount: 100,
        totalItemAmount: 2099,
        price: 729,
        currency: 'THB',
        price_thb: 729,
        price_usd: 19.99,
        prices: { THB: 729, USD: 19.99 },
        price_thb_source: 'official-store',
        price_usd_source: 'official-store'
      },
      {
        id: 2,
        name: 'Frost Stars 999',
        baseItemAmount: 999,
        bonusItemAmount: 50,
        totalItemAmount: 1049,
        price: 349,
        currency: 'THB',
        price_thb: 349,
        price_usd: 9.99,
        prices: { THB: 349, USD: 9.99 },
        price_thb_source: 'official-store',
        price_usd_source: 'official-store'
      }
    ])
    expect(Number.isNaN(Date.parse(body.fetchedAt))).toBe(false)
  })

  it('alias /games/wos/packs/ resolves the same Whiteout Survival game', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      const list = url.includes('currency=THB')
        ? [
            {
              package_display_name: 'Pack',
              main_number: 100,
              final_amount: '35',
              product_id: 'p1',
              items: [{ item_number: 0 }],
              main_content: ''
            }
          ]
        : [
            {
              package_display_name: 'Pack',
              main_number: 100,
              final_amount: '0.99',
              product_id: 'p1',
              items: [{ item_number: 0 }],
              main_content: ''
            }
          ]
      return Response.json({
        code: 1,
        data: {
          game_id: '20121',
          game_name: 'Whiteout Survival',
          package_list: { config_list: list }
        }
      })
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/wos/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('whiteout-survival')
    expect(body.game.id).toBe(20121)
    expect(body.categories[0].packs[0].currency).toBe('THB')
    expect(body.categories[0].packs[0].price_thb).toBe(35)
    expect(body.categories[0].packs[0].price_usd).toBe(0.99)
  })

  it('returns 502 when Whiteout Survival upstream request fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network unavailable')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/whiteout-survival/packs/')
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })

  it('returns 502 when Whiteout Survival upstream payload is invalid', async () => {
    globalThis.fetch = (async () =>
      Response.json({
        code: 101031008,
        data: {},
        msg: 'Need Refresh!'
      })) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/whiteout-survival/packs/')
    )

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Invalid upstream response'
    })
  })
})

describe('GET /games/whiteout-survival-24buym/packs/', () => {
  const sampleHtml = `
<div class="row" id="special-pack-selection-container">
  <div class="card-select-topup-multi"
                         data-id="1360"
                         data-price="37"
                         data-packname="99 Frost Star"
                         data-quantity="0"
                         data-pack-type="special">
    <div class="cash-pay">à¸¿ 37</div>
  </div>
  <div class="card-select-topup-multi"
                         data-id="1361"
                         data-price="110"
                         data-packname="299 Frost Star"
                         data-quantity="0"
                         data-pack-type="special">
    <div class="cash-pay">à¸¿ 110</div>
  </div>
  <div class="card-select-topup-multi"
                         data-id="1368"
                         data-price="6603"
                         data-packname="18495 Frost Star"
                         data-quantity="0"
                         data-pack-type="special">
    <div class="cash-pay">à¸¿ 6603</div>
  </div>
</div>
`

  const centuryUsdPayload = {
    code: 1,
    data: {
      game_id: '20121',
      game_name: 'Whiteout Survival',
      package_list: {
        config_list: [
          {
            package_display_name: 'Frost Stars 299',
            main_number: 299,
            final_amount: '2.99',
            items: [{ item_number: 15 }],
            main_content: ''
          },
          {
            package_display_name: 'Frost Stars 18495',
            main_number: 18495,
            final_amount: '184.95',
            items: [{ item_number: 925 }],
            main_content: ''
          },
          // Ambiguous amount with two different USD prices â€” must NOT map
          {
            package_display_name: 'Special A',
            main_number: 99,
            final_amount: '0.99',
            items: [],
            main_content: ''
          },
          {
            package_display_name: 'Special B',
            main_number: 99,
            final_amount: '1.99',
            items: [],
            main_content: ''
          }
        ]
      }
    }
  }

  it('returns live 24buym THB packs with Century Games USD when reliably matched', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('24buym.com/topup/whiteoutsurvival')) {
        return new Response(sampleHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        })
      }
      if (url.startsWith('https://cg-vip-mall-wos.centurygame.com/api/activity/packages_info?')) {
        expect(url).toContain('game_id=20121')
        expect(url).toContain('currency=USD')
        return Response.json(centuryUsdPayload)
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/whiteout-survival-24buym/packs/')
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game).toEqual({
      id: 20121,
      slug: 'whiteout-survival-24buym',
      name: 'Whiteout Survival',
      itemName: 'Frost Stars',
      itemIcon: ''
    })
    expect(body.summary).toEqual({ categoryCount: 1, packCount: 3 })
    expect(body.source).toBe('https://www.24buym.com/topup/whiteoutsurvival')
    expect(body.sources).toEqual({
      thb: 'https://www.24buym.com/topup/whiteoutsurvival',
      usd: 'https://cg-vip-mall-wos.centurygame.com/api/activity/packages_info'
    })
    expect(body.categories[0].packs).toEqual([
      {
        id: 1360,
        name: '99 Frost Star',
        baseItemAmount: 99,
        bonusItemAmount: 0,
        totalItemAmount: 99,
        price: 37,
        currency: 'THB',
        price_thb: 37,
        price_usd: null,
        prices: { THB: 37, USD: null },
        price_thb_source: '24buym',
        price_usd_source: null,
        issues: [
          'Multiple Century Games USD prices for 99 Frost Stars; price_usd=null (unreliable mapping)'
        ]
      },
      {
        id: 1361,
        name: '299 Frost Star',
        baseItemAmount: 299,
        bonusItemAmount: 0,
        totalItemAmount: 299,
        price: 110,
        currency: 'THB',
        price_thb: 110,
        price_usd: 2.99,
        prices: { THB: 110, USD: 2.99 },
        price_thb_source: '24buym',
        price_usd_source: 'centurygames'
      },
      {
        id: 1368,
        name: '18495 Frost Star',
        baseItemAmount: 18495,
        bonusItemAmount: 0,
        totalItemAmount: 18495,
        price: 6603,
        currency: 'THB',
        price_thb: 6603,
        price_usd: 184.95,
        prices: { THB: 6603, USD: 184.95 },
        price_thb_source: '24buym',
        price_usd_source: 'centurygames'
      }
    ])
  })

  it('still returns THB when Century Games USD enrichment fails', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('24buym.com/topup/whiteoutsurvival')) {
        return new Response(sampleHtml, { status: 200 })
      }
      throw new Error('century down')
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/whiteout-survival-24buym/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.summary.packCount).toBe(3)
    expect(body.sources).toEqual({
      thb: 'https://www.24buym.com/topup/whiteoutsurvival',
      usd: null
    })
    expect(body.categories[0].packs.every((p: { price_usd: unknown }) => p.price_usd === null)).toBe(
      true
    )
    expect(body.categories[0].packs[0].price_thb).toBe(37)
  })

  it('alias /games/wos-24buym/packs/ resolves the same provider', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('24buym.com')) {
        return new Response(sampleHtml, { status: 200 })
      }
      throw new Error('no usd')
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/wos-24buym/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('whiteout-survival-24buym')
  })

  it('returns 502 when 24buym HTML has no special packs', async () => {
    globalThis.fetch = (async () =>
      new Response('<html><body>empty</body></html>', { status: 200 })) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/whiteout-survival-24buym/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Invalid upstream response' })
  })

  it('returns 502 when 24buym fetch fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/whiteout-survival-24buym/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Upstream service unavailable' })
  })
})


describe('GET /games/cookierun-classic/packs/', () => {
  const sampleThHtml = `<!DOCTYPE html><html><head></head><body>
<script type="application/json">
{"data":[{"intent":{},"data":{"shelfMapping":{"information":{"items":[
{"title":"Provider","items":[],"items_V3":[]},
{"title":"In-App Purchases","summary":"Yes","items":[{"textPairs":[
["10 Crystals","\u0e3f35.00"],
["PartyRun Pass","\u0e3f179.00"],
["Treasure Package","\u0e3f279.00"],
["Treasure Package","\u0e3f279.00"],
["120 Crystals","\u0e3f279.00"],
["Super Crystal Package","\u0e3f579.00"],
["Key Bundle Package","\u0e3f69.00"]
]}],"items_V3":[
{"$kind":"textPair","leadingText":"10 Crystals","trailingText":"\u0e3f35.00"},
{"$kind":"textPair","leadingText":"PartyRun Pass","trailingText":"\u0e3f179.00"},
{"$kind":"textPair","leadingText":"Treasure Package","trailingText":"\u0e3f279.00"},
{"$kind":"textPair","leadingText":"Treasure Package","trailingText":"\u0e3f279.00"},
{"$kind":"textPair","leadingText":"120 Crystals","trailingText":"\u0e3f279.00"},
{"$kind":"textPair","leadingText":"Super Crystal Package","trailingText":"\u0e3f579.00"},
{"$kind":"textPair","leadingText":"Key Bundle Package","trailingText":"\u0e3f69.00"},
{"$kind":"button","action":{"title":"Learn More"}}
]}
]}}}}]}
</script>
</body></html>`

  const sampleUsHtml = `<!DOCTYPE html><html><head></head><body>
<script type="application/json">
{"data":[{"intent":{},"data":{"shelfMapping":{"information":{"items":[
{"title":"Provider","items":[],"items_V3":[]},
{"title":"In-App Purchases","summary":"Yes","items":[{"textPairs":[
["120 Crystals","$7.49"],
["PartyRun Pass","$4.99"],
["Treasure Package","$7.49"],
["Treasure Package","$7.49"],
["Super Crystal Package","$15.99"],
["2026 Summer Package","$7.49"]
]}],"items_V3":[
{"$kind":"textPair","leadingText":"120 Crystals","trailingText":"$7.49"},
{"$kind":"textPair","leadingText":"PartyRun Pass","trailingText":"$4.99"},
{"$kind":"textPair","leadingText":"Treasure Package","trailingText":"$7.49"},
{"$kind":"textPair","leadingText":"Treasure Package","trailingText":"$7.49"},
{"$kind":"textPair","leadingText":"Super Crystal Package","trailingText":"$15.99"},
{"$kind":"textPair","leadingText":"2026 Summer Package","trailingText":"$7.49"},
{"$kind":"button","action":{"title":"Learn More"}}
]}
]}}}}]}
</script>
</body></html>`

  const mockAppStoreFetch = () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('apps.apple.com/th/') && url.includes('6759596824')) {
        return new Response(sampleThHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      }
      if (url.includes('apps.apple.com/us/') && url.includes('6759596824')) {
        return new Response(sampleUsHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      }
      throw new Error('unexpected fetch: ' + url)
    }) as typeof fetch
  }

  it('parses live App Store TH+US IAP with THB + USD; no hardcoded catalog', async () => {
    mockAppStoreFetch()

    const response = await app.handle(
      new Request('http://localhost/games/cookierun-classic/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.game).toMatchObject({
      id: 6759596824,
      slug: 'cookierun-classic',
      name: 'Cookie Run Classic',
      itemName: 'Crystals'
    })
    expect(body.sources).toEqual({
      thb: 'https://apps.apple.com/th/app/cookierun-classic/id6759596824',
      usd: 'https://apps.apple.com/us/app/cookierun-classic/id6759596824'
    })
    expect(typeof body.fetchedAt).toBe('string')

    const packs = body.categories[0].packs
    // unique names: 10 Crystals, PartyRun Pass, Treasure Package, 120 Crystals,
    // Super Crystal Package, Key Bundle Package, 2026 Summer Package
    expect(body.summary.packCount).toBe(7)
    expect(packs).toHaveLength(7)

    const ten = packs.find((p: { name: string }) => p.name === '10 Crystals')
    expect(ten).toMatchObject({
      name: '10 Crystals',
      price_thb: 35,
      price_usd: null,
      currency: 'THB',
      price_thb_source: 'appstore',
      price_usd_source: null
    })

    const pass = packs.find((p: { name: string }) => p.name === 'PartyRun Pass')
    expect(pass).toMatchObject({
      price_thb: 179,
      price_usd: 4.99,
      prices: { THB: 179, USD: 4.99 },
      price_thb_source: 'appstore',
      price_usd_source: 'appstore'
    })

    const superPack = packs.find(
      (p: { name: string }) => p.name === 'Super Crystal Package'
    )
    expect(superPack).toMatchObject({
      price_thb: 579,
      price_usd: 15.99,
      prices: { THB: 579, USD: 15.99 }
    })

    const crystals120 = packs.find(
      (p: { name: string }) => p.name === '120 Crystals'
    )
    expect(crystals120).toMatchObject({
      price_thb: 279,
      price_usd: 7.49
    })

    // duplicate Treasure Package collapsed to one
    expect(packs.filter((p: { name: string }) => p.name === 'Treasure Package')).toHaveLength(1)

    const treasure = packs.find(
      (p: { name: string }) => p.name === 'Treasure Package'
    )
    expect(treasure).toMatchObject({
      price_thb: 279,
      price_usd: 7.49
    })
  })

  it('alias /games/crc/packs/ and /games/cookie-run-classic/packs/ resolve same provider', async () => {
    mockAppStoreFetch()

    for (const slug of ['crc', 'cookie-run-classic']) {
      const response = await app.handle(
        new Request(`http://localhost/games/${slug}/packs/`)
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.game.slug).toBe('cookierun-classic')
      expect(body.summary.packCount).toBe(7)
    }
  })

  it('returns 502 when App Store upstream is unavailable', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/cookierun-classic/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })

  it('returns 502 when App Store HTML has no IAP pairs', async () => {
    globalThis.fetch = (async () => {
      return new Response('<html><body>no iap</body></html>', { status: 200 })
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/cookierun-classic/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Invalid upstream response'
    })
  })

  it('returns 502 on non-OK App Store HTTP status', async () => {
    globalThis.fetch = (async () => {
      return new Response('nope', { status: 503 })
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/cookierun-classic/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })
})

describe('GET /games/cookierun-classic-24buym/packs/ (optional 24buym slug)', () => {
  const sampleHtml = `
<div class="row" id="pack-selection-container">
  <div class="card-select-topup-multi"
                     data-id="1789"
                     data-price="132"
                     data-packname="55 Diamond + 50 GP"
                     data-quantity="0"
                     data-pack-type="normal">
  </div>
  <div class="card-select-topup-multi"
                     data-id="1794"
                     data-price="165"
                     data-packname="Party Run Pass"
                     data-quantity="0"
                     data-pack-type="normal">
  </div>
</div>
`

  it('still serves optional 24buym slug', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('24buym.com/topup/cookierun-classic')) {
        return new Response(sampleHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/cookierun-classic-24buym/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('cookierun-classic-24buym')
    expect(body.summary.packCount).toBe(2)
    expect(body.source).toBe('https://www.24buym.com/topup/cookierun-classic')
  })

  it('alias /games/crc-24buym/packs/ still resolves 24buym', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('cookierun-classic')) {
        return new Response(sampleHtml, { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/crc-24buym/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('cookierun-classic-24buym')
  })
})

describe('GET /games/lastwar-24buym/packs/', () => {
  // Packname dual: FULL THB+USD from name `N à¸¿ | X.XX $`; data-price is cheaper sale and must be ignored.
  const sampleHtml = `
<div class="row" id="pack-selection-container">
  <div class="card-select-topup-multi"
                     data-id="1482"
                     data-price="32"
                     data-packname="39 à¸¿ | 0.99 $"
                     data-quantity="0">
  </div>
  <div class="card-select-topup-multi"
                     data-id="1483"
                     data-price="63"
                     data-packname="79 à¸¿ | 1.99 $"
                     data-quantity="0">
  </div>
  <div class="card-select-topup-multi"
                     data-id="1489"
                     data-price="1500"
                     data-packname="1990 à¸¿ | 49.99 $"
                     data-quantity="0">
  </div>
</div>
`

  it('uses FULL packname THB+USD; data-price is sale and ignored as full THB', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('24buym.com/topup/lastwarsurvival')) {
        return new Response(sampleHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/lastwar-24buym/packs/')
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game).toEqual({
      id: 24002,
      slug: 'lastwar-24buym',
      name: 'Last War',
      itemName: 'Gold Brick',
      itemIcon: ''
    })
    expect(body.summary).toEqual({ categoryCount: 1, packCount: 3 })
    expect(body.source).toBe('https://www.24buym.com/topup/lastwarsurvival')
    expect(body.sources).toEqual({
      thb: 'https://www.24buym.com/topup/lastwarsurvival',
      usd: 'https://www.24buym.com/topup/lastwarsurvival'
    })
    expect(typeof body.sources.usd).toBe('string')
    expect(body.sources.usd).not.toBeNull()
    expect(Object.prototype.hasOwnProperty.call(body.sources, 'thb')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(body.sources, 'usd')).toBe(true)

    const packs = body.categories[0].packs
    expect(packs).toEqual([
      {
        id: 1482,
        name: `39 à¸¿ | 0.99 $`,
        baseItemAmount: 0,
        bonusItemAmount: 0,
        totalItemAmount: 0,
        price: 39,
        currency: 'THB',
        price_thb: 39,
        price_usd: 0.99,
        prices: { THB: 39, USD: 0.99 },
        price_thb_source: '24buym',
        price_usd_source: '24buym',
        issues: [
          'data-price=32 is sale; full THB=39 taken from pack name'
        ]
      },
      {
        id: 1483,
        name: `79 à¸¿ | 1.99 $`,
        baseItemAmount: 0,
        bonusItemAmount: 0,
        totalItemAmount: 0,
        price: 79,
        currency: 'THB',
        price_thb: 79,
        price_usd: 1.99,
        prices: { THB: 79, USD: 1.99 },
        price_thb_source: '24buym',
        price_usd_source: '24buym',
        issues: [
          'data-price=63 is sale; full THB=79 taken from pack name'
        ]
      },
      {
        id: 1489,
        name: `1990 à¸¿ | 49.99 $`,
        baseItemAmount: 0,
        bonusItemAmount: 0,
        totalItemAmount: 0,
        price: 1990,
        currency: 'THB',
        price_thb: 1990,
        price_usd: 49.99,
        prices: { THB: 1990, USD: 49.99 },
        price_thb_source: '24buym',
        price_usd_source: '24buym',
        issues: [
          'data-price=1500 is sale; full THB=1990 taken from pack name'
        ]
      }
    ])

    // Explicit: sale data-price must NOT win over packname full THB
    expect(packs[0].price_thb).toBe(39)
    expect(packs[0].price_thb).not.toBe(32)
    expect(packs[0].price_usd).toBe(0.99)
    expect(packs[2].price_thb).toBe(1990)
    expect(packs[2].price_thb).not.toBe(1500)
  })

  it('returns 502 when packs have no packname THB+USD (full prices required from name)', async () => {
    const noUsd = `
<div class="card-select-topup-multi"
                     data-id="9999"
                     data-price="100"
                     data-packname="Mystery Bundle">
</div>
`
    globalThis.fetch = (async () =>
      new Response(noUsd, { status: 200 })) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/lastwar-24buym/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Invalid upstream response' })
  })

  it('alias /games/lw-24buym/packs/ resolves the same provider', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('lastwarsurvival')) {
        return new Response(sampleHtml, { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/lw-24buym/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('lastwar-24buym')
  })

  it('alias /games/last-war-24buym/packs/ resolves the same provider', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('lastwarsurvival')) {
        return new Response(sampleHtml, { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/last-war-24buym/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('lastwar-24buym')
    expect(typeof body.sources.usd).toBe('string')
    expect(body.sources.usd).toBe('https://www.24buym.com/topup/lastwarsurvival')
  })

  it('returns 502 when 24buym HTML has no pack cards', async () => {
    globalThis.fetch = (async () =>
      new Response('<html><body>empty</body></html>', { status: 200 })) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/lastwar-24buym/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Invalid upstream response' })
  })

  it('returns 502 when 24buym fetch fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/lastwar-24buym/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Upstream service unavailable' })
  })
})
describe('GET /games/pubg-mobile/packs/', () => {
  it('returns live Midasbuy VIP UC packs using full/list prices', async () => {
    const shelf = {
      shelf: {
        products: [
          {
            product_id: '30_coins_vip',
            product_type: 'GameCoins',
            game_coins_num: 30,
            prices: [
              {
                payment_channel_id: 'CREDIT_CARD',
                currency: 'THB',
                amount: '15',
                display_amount: '16.5'
              }
            ]
          },
          {
            product_id: '300_coins_vip',
            product_type: 'GameCoins',
            game_coins_num: 300,
            prices: [
              {
                payment_channel_id: 'CREDIT_CARD',
                currency: 'THB',
                amount: '149',
                display_amount: '165'
              }
            ]
          },
          {
            product_id: '91_coins_vip',
            product_type: 'GameCoins',
            game_coins_num: 91,
            prices: []
          }
        ]
      }
    }

    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      if (url.includes('/midasbuy/th/buy/pubgm')) {
        return new Response('<html></html>', { status: 200 })
      }
      expect(url).toContain('/frontend/api/midasbuy/v1/shelves/query')
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body || '{}'))
      expect(body.is_vip_product).toBe(true)
      expect(body.app_id).toBe('1450015065')
      return new Response(JSON.stringify(shelf), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/pubg-mobile/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('pubg-mobile')
    expect(body.summary.packCount).toBe(2)
    expect(body.categories[0].packs).toEqual([
      {
        id: 30,
        name: 'UC 30',
        baseItemAmount: 30,
        bonusItemAmount: 0,
        totalItemAmount: 30,
        price: 16.5,
        currency: 'THB'
      },
      {
        id: 300,
        name: 'UC 300',
        baseItemAmount: 300,
        bonusItemAmount: 0,
        totalItemAmount: 300,
        price: 165,
        currency: 'THB'
      }
    ])
  })

  it('returns 502 when Midasbuy shelves fetch fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/pubg-mobile/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })

  it('alias /games/pubgm/packs/ resolves the same game', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('/midasbuy/th/buy/pubgm')) {
        return new Response('<html></html>', { status: 200 })
      }
      return new Response(
        JSON.stringify({
          shelf: {
            products: [
              {
                product_id: '60_coins_vip',
                product_type: 'GameCoins',
                game_coins_num: 60,
                prices: [
                  {
                    payment_channel_id: 'CREDIT_CARD',
                    currency: 'THB',
                    amount: '29',
                    display_amount: '33'
                  }
                ]
              }
            ]
          }
        }),
        { status: 200 }
      )
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/pubgm/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('pubg-mobile')
    expect(body.summary.packCount).toBe(1)
    expect(body.categories[0].packs[0].price).toBe(33)
  })
})

describe('GET /games/efootball/packs/', () => {
  it('returns Codashop TH iOS eFootball coin packs only', async () => {
    const html = `
      <h2>Limited (iOS/Android)</h2>
      <div capture-custom-sku-id="ignore.android" capture-custom-sku-name="Skip"></div>
      <span>Ã Â¸Â¿ 11.00</span>
      <h2>iOS</h2>
      <div class="sku-card" capture-custom-sku-id="jp.gamestore.efootball.coin_00160_00130_00007_00079" capture-custom-sku-name="eFootballT Coin 137"></div>
      <span>Ã Â¸Â¿ 39.00</span>
      <div class="sku-card" capture-custom-sku-id="jp.gamestore.efootball.coin_00360_00293_00022_00080" capture-custom-sku-name="eFootballT Coin 315"></div>
      <span>Ã Â¸Â¿ 88.00</span>
      <h2>Free Gifts (iOS/Android)</h2>
    `

    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toBe('https://efootball.codashop.com/th-th/efootball')
      const headers = new Headers(init?.headers)
      expect(headers.get('User-Agent') || '').toMatch(/iPhone/)
      return new Response(html, { status: 200 })
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/efootball/packs/')
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game).toEqual({
      id: 317,
      slug: 'efootball',
      name: 'eFootball',
      itemName: 'eFootballT Coin',
      itemIcon: ''
    })
    expect(body.summary).toEqual({ categoryCount: 1, packCount: 2 })
    expect(body.categories[0].name).toBe('Codashop TH iOS')
    expect(body.categories[0].packs).toEqual([
      {
        id: 1,
        name: 'eFootballT Coin 137',
        baseItemAmount: 130,
        bonusItemAmount: 7,
        totalItemAmount: 137,
        price: 39,
        currency: 'THB'
      },
      {
        id: 2,
        name: 'eFootballT Coin 315',
        baseItemAmount: 293,
        bonusItemAmount: 22,
        totalItemAmount: 315,
        price: 88,
        currency: 'THB'
      }
    ])
  })

  it('returns 502 when Codashop iOS section is missing', async () => {
    globalThis.fetch = (async () =>
      new Response('<h2>Android</h2><div></div>', { status: 200 })) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/efootball/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Invalid upstream response'
    })
  })

  it('returns 502 when Codashop page fetch fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/efootball/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })

  it('alias /games/efootball-ios/packs/ works', async () => {
    globalThis.fetch = (async () =>
      new Response(
        `<h2>iOS</h2><div capture-custom-sku-id="jp.gamestore.efootball.coin_00160_00130_00007_00079" capture-custom-sku-name="Coin 137"></div><span>Ã Â¸Â¿ 39.00</span>`,
        { status: 200 }
      )) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/efootball-ios/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('efootball')
    expect(body.summary.packCount).toBe(1)
  })
})


describe('GET /games/clash-of-critters/packs/', () => {
  it('returns Farlight full list prices for Ignis Gems', async () => {
    const payload = {
      code: 0,
      data: {
        currency: 'THA(THB)',
        productList: [
          {
            productId: '123001',
            price: 69,
            currency: 'THA(THB)',
            staticConfig: JSON.stringify({
              name: '200 Ignis Gems',
              summary: '+ 10 Extra Ignis Gems',
              category: 'Ignis Gem'
            })
          },
          {
            productId: '123002',
            price: 179,
            currency: 'THA(THB)',
            staticConfig: JSON.stringify({
              name: '500 Ignis Gems',
              summary: '+ 25 Extra Ignis Gems',
              category: 'Ignis Gem'
            })
          }
        ]
      }
    }

    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('/webpay/mall/detail')) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: { mallId: 45, gameId: 10090, appId: 10088021 }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      }
      expect(url).toContain('/webpay/product/guestProducts')
      expect(url).toContain('mallId=45')
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/clash-of-critters/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game).toEqual({
      id: 10090,
      slug: 'clash-of-critters',
      name: 'Clash of Critters',
      itemName: 'Ignis Gems',
      itemIcon: ''
    })
    expect(body.summary).toEqual({ categoryCount: 1, packCount: 2 })
    expect(body.categories[0].packs).toEqual([
      {
        id: 123001,
        name: '200 Ignis Gems',
        baseItemAmount: 200,
        bonusItemAmount: 10,
        totalItemAmount: 210,
        price: 69,
        currency: 'THB'
      },
      {
        id: 123002,
        name: '500 Ignis Gems',
        baseItemAmount: 500,
        bonusItemAmount: 25,
        totalItemAmount: 525,
        price: 179,
        currency: 'THB'
      }
    ])
  })

  it('returns 502 when Farlight productList is empty', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('/webpay/mall/detail')) {
        return new Response(
          JSON.stringify({ code: 0, data: { mallId: 45 } }),
          { status: 200 }
        )
      }
      return new Response(
        JSON.stringify({ code: 0, data: { productList: [] } }),
        { status: 200 }
      )
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/clash-of-critters/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Invalid upstream response'
    })
  })

  it('returns 502 when Farlight guestProducts fetch fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/clash-of-critters/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })

  it('alias /games/coc/packs/ works', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('/webpay/mall/detail')) {
        return new Response(
          JSON.stringify({ code: 0, data: { mallId: 45 } }),
          { status: 200 }
        )
      }
      return new Response(
        JSON.stringify({
          code: 0,
          data: {
            productList: [
              {
                productId: '123001',
                price: 69,
                currency: 'THA(THB)',
                staticConfig: JSON.stringify({
                  name: '200 Ignis Gems',
                  summary: '+ 10 Extra Ignis Gems'
                })
              }
            ]
          }
        }),
        { status: 200 }
      )
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/coc/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('clash-of-critters')
    expect(body.summary.packCount).toBe(1)
  })
})

describe('GET /games/mobile-legends/packs/', () => {
  const mlbbUpstream = {
    productInfo: {
      id: 52,
      gvtId: 19,
      name: 'Mobile Legends',
      shortName: 'Mobile Legends: Bang Bang',
      thumbnailUrl: 'https://cdn.example/mlbb.png'
    },
    skuCategories: [
      {
        Id: 0,
        SortOrder: 4,
        Name: 'Ã Â¹â‚¬Ã Â¸Å¾Ã Â¸Å Ã Â¸Â£',
        Title: 'Ã Â¹â‚¬Ã Â¸Å¾Ã Â¸Å Ã Â¸Â£',
        SkuCategoryUuid: 'cat-diamonds'
      },
      {
        Id: 1,
        SortOrder: 5,
        Name: 'Ã Â¸ÂªÃ Â¸â€¢Ã Â¸Â²Ã Â¸Â£Ã Â¹Å’Ã Â¹â€žÃ Â¸Â¥Ã Â¸â€”Ã Â¹Å’ Ã Â¹ÂÃ Â¸Â­Ã Â¸â„¢Ã Â¸â€Ã Â¹Å’ Ã Â¸â€”Ã Â¹â€žÃ Â¸Â§Ã Â¹â€žÃ Â¸Â¥Ã Â¸â€”Ã Â¹Å’',
        Title: 'Ã Â¸ÂªÃ Â¸â€¢Ã Â¸Â²Ã Â¸Â£Ã Â¹Å’Ã Â¹â€žÃ Â¸Â¥Ã Â¸â€”Ã Â¹Å’ Ã Â¹ÂÃ Â¸Â­Ã Â¸â„¢Ã Â¸â€Ã Â¹Å’ Ã Â¸â€”Ã Â¹â€žÃ Â¸Â§Ã Â¹â€žÃ Â¸Â¥Ã Â¸â€”Ã Â¹Å’',
        SkuCategoryUuid: 'cat-pass'
      }
    ],
    skus: [
      {
        Id: 'diamond_codashopTHB_10',
        SkuName: '15 Diamonds',
        SkuSubtitle: '(14 + 1 Bonus)',
        Status: 'ACTIVE',
        SortOrderId: 1,
        SkuCategoryId: 0,
        SkuCategoryUuid: 'cat-diamonds',
        pricing: {
          currency: 'THB',
          skuPrices: {
            price: 10,
            priceBeforeTax: 9.35,
            strikethroughPrice: 10.7,
            strikethroughPriceBeforeTax: 10
          }
        }
      },
      {
        Id: 'diamond_codashopTHB_20',
        SkuName: '31 Diamonds',
        SkuSubtitle: '(29 + 2 Bonus)',
        Status: 'ACTIVE',
        SortOrderId: 2,
        SkuCategoryId: 0,
        SkuCategoryUuid: 'cat-diamonds',
        pricing: {
          currency: 'THB',
          skuPrices: {
            price: 20,
            priceBeforeTax: 18.69,
            strikethroughPrice: 21.4,
            strikethroughPriceBeforeTax: 20
          }
        }
      },
      {
        Id: 'growthplan_5_codashopTHB_350',
        SkuName: 'Twilight Pass',
        SkuSubtitle: '',
        Status: 'ACTIVE',
        SortOrderId: 1,
        SkuCategoryId: 1,
        SkuCategoryUuid: 'cat-pass',
        pricing: {
          currency: 'THB',
          skuPrices: {
            price: 350,
            priceBeforeTax: 327.1,
            strikethroughPrice: 374.5,
            strikethroughPriceBeforeTax: 350
          }
        }
      },
      {
        Id: 'disabled_sku',
        SkuName: 'Hidden',
        Status: 'INACTIVE',
        SortOrderId: 99,
        SkuCategoryUuid: 'cat-diamonds',
        pricing: {
          currency: 'THB',
          skuPrices: { strikethroughPriceBeforeTax: 999 }
        }
      }
    ]
  }

  it('returns Codashop TH full list prices by category', async () => {
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toBe('https://shopapi.codashop.com/productPage')
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body || '{}'))
      expect(body).toEqual({
        productPath: '/th/mobile-legends',
        locale: 'th-th',
        whitelabelId: 0
      })
      return new Response(JSON.stringify(mlbbUpstream), { status: 200 })
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/mobile-legends/packs/')
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game).toEqual({
      id: 19,
      slug: 'mobile-legends',
      name: 'Mobile Legends: Bang Bang',
      itemName: 'Diamonds',
      itemIcon: 'https://cdn.example/mlbb.png'
    })
    expect(body.summary).toEqual({ categoryCount: 2, packCount: 3 })
    expect(body.categories[0].name).toBe('Ã Â¹â‚¬Ã Â¸Å¾Ã Â¸Å Ã Â¸Â£')
    expect(body.categories[0].packs).toEqual([
      {
        id: 1,
        name: '15 Diamonds',
        baseItemAmount: 14,
        bonusItemAmount: 1,
        totalItemAmount: 15,
        price: 10,
        currency: 'THB'
      },
      {
        id: 2,
        name: '31 Diamonds',
        baseItemAmount: 29,
        bonusItemAmount: 2,
        totalItemAmount: 31,
        price: 20,
        currency: 'THB'
      }
    ])
    expect(body.categories[1].name).toBe('Ã Â¸ÂªÃ Â¸â€¢Ã Â¸Â²Ã Â¸Â£Ã Â¹Å’Ã Â¹â€žÃ Â¸Â¥Ã Â¸â€”Ã Â¹Å’ Ã Â¹ÂÃ Â¸Â­Ã Â¸â„¢Ã Â¸â€Ã Â¹Å’ Ã Â¸â€”Ã Â¹â€žÃ Â¸Â§Ã Â¹â€žÃ Â¸Â¥Ã Â¸â€”Ã Â¹Å’')
    expect(body.categories[1].packs).toEqual([
      {
        id: 3,
        name: 'Twilight Pass',
        baseItemAmount: 0,
        bonusItemAmount: 0,
        totalItemAmount: 0,
        price: 350,
        currency: 'THB'
      }
    ])
    expect(body.categories[0].packs[0].price).not.toBe(9.35)
  })

  it('returns 502 when Shop API returns errorCode', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ errorCode: 10, errorMessage: 'Invalid Product Path' }),
        { status: 200 }
      )) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/mobile-legends/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Invalid upstream response'
    })
  })

  it('returns 502 when Shop API fetch fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/mobile-legends/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })
})


describe('GET /games/heartopia/packs/', () => {
  const thPayload = {
    code: 200,
    msg: 'ok',
    data: [
      {
        productId: 'Ewt1762774311',
        productName: 'Heart Diamond',
        productType: 'COMMON',
        weight: 10,
        products: [
          {
            productSkuName: '20 Heart Diamond',
            productSkuCode: 'com.xd.xdt.2',
            currency: 'THB',
            region: 'TH',
            costPrice: 15,
            salePrice: 12,
            weight: 100
          },
          {
            productSkuName: '300+20 Heart Diamond',
            productSkuCode: 'com.xd.xdt.30',
            currency: 'THB',
            region: 'TH',
            costPrice: 169,
            salePrice: 169,
            weight: 98
          }
        ]
      },
      {
        productId: 'mOz1762774311',
        productName: 'GAMG Membership: Keep character online',
        productType: 'COMMON',
        weight: 9,
        products: [
          {
            productSkuName: 'GAMG Junior Membership',
            productSkuCode: 'com.xd.xdt.3zhouka',
            currency: 'THB',
            region: 'TH',
            costPrice: 19,
            salePrice: 19,
            weight: 92
          }
        ]
      }
    ]
  }

  const dfPayload = {
    code: 200,
    msg: 'ok',
    data: [
      {
        productId: 'Ewt1762774311',
        productName: 'Heart Diamond',
        productType: 'COMMON',
        weight: 10,
        products: [
          {
            productSkuName: '20 Heart Diamond',
            productSkuCode: 'com.xd.xdt.2',
            currency: 'USD',
            region: 'DF',
            costPrice: 0.39,
            salePrice: 0.39,
            weight: 100
          },
          {
            productSkuName: '300+20 Heart Diamond',
            productSkuCode: 'com.xd.xdt.30',
            currency: 'USD',
            region: 'DF',
            costPrice: 4.99,
            salePrice: 4.99,
            weight: 98
          }
        ]
      },
      {
        productId: 'mOz1762774311',
        productName: 'GAMG Membership: Keep character online',
        productType: 'COMMON',
        weight: 9,
        products: [
          {
            productSkuName: 'GAMG Junior Membership',
            productSkuCode: 'com.xd.xdt.3zhouka',
            currency: 'USD',
            region: 'DF',
            costPrice: 0.49,
            salePrice: 0.49,
            weight: 92
          }
        ]
      }
    ]
  }

  const thUrl =
    'https://xdsdk-intnl-6.xd.com/product/v1/query/game/products?appId=2085001&region=TH&serverId=global-release&lang=th_TH&source=webpay&pt=Linux'
  const dfUrl =
    'https://xdsdk-intnl-6.xd.com/product/v1/query/game/products?appId=2085001&region=DF&serverId=global-release&lang=th_TH&source=webpay&pt=Linux'

  it('merges TH costPrice THB + DF costPrice USD by productSkuCode; sources always present', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('xdsdk-intnl-6.xd.com') && url.includes('region=TH')) {
        return new Response(JSON.stringify(thPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (url.includes('xdsdk-intnl-6.xd.com') && url.includes('region=DF')) {
        return new Response(JSON.stringify(dfPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/heartopia/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.game).toEqual({
      id: 2085001,
      slug: 'heartopia',
      name: 'Heartopia',
      itemName: 'Heart Diamond',
      itemIcon: ''
    })
    expect(body.summary).toEqual({ categoryCount: 2, packCount: 3 })
    expect(body.source).toBe(thUrl)
    expect(body.sources).toEqual({ thb: thUrl, usd: dfUrl })
    expect(Object.prototype.hasOwnProperty.call(body.sources, 'thb')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(body.sources, 'usd')).toBe(true)
    expect(typeof body.sources.usd).toBe('string')
    expect(body.sources.usd).not.toBeNull()

    const diamondPacks = body.categories[0].packs
    expect(body.categories[0].name).toBe('Heart Diamond')
    expect(diamondPacks).toHaveLength(2)

    // Full THB from costPrice=15, NOT salePrice=12
    expect(diamondPacks[0].name).toBe('20 Heart Diamond')
    expect(diamondPacks[0].price).toBe(15)
    expect(diamondPacks[0].price_thb).toBe(15)
    expect(diamondPacks[0].price_thb).not.toBe(12)
    expect(diamondPacks[0].price_usd).toBe(0.39)
    expect(diamondPacks[0].prices).toEqual({ THB: 15, USD: 0.39 })
    expect(diamondPacks[0].price_thb_source).toBe('xd')
    expect(diamondPacks[0].price_usd_source).toBe('xd')
    expect(diamondPacks[0].baseItemAmount).toBe(20)
    expect(diamondPacks[0].bonusItemAmount).toBe(0)
    expect(diamondPacks[0].totalItemAmount).toBe(20)
    expect(diamondPacks[0].issues).toContain(
      'salePrice=12 ignored; full THB=costPrice=15'
    )

    expect(diamondPacks[1].name).toBe('300+20 Heart Diamond')
    expect(diamondPacks[1].price_thb).toBe(169)
    expect(diamondPacks[1].price_usd).toBe(4.99)
    expect(diamondPacks[1].prices).toEqual({ THB: 169, USD: 4.99 })
    expect(diamondPacks[1].baseItemAmount).toBe(300)
    expect(diamondPacks[1].bonusItemAmount).toBe(20)
    expect(diamondPacks[1].totalItemAmount).toBe(320)

    const membership = body.categories[1].packs[0]
    expect(membership.name).toBe('GAMG Junior Membership')
    expect(membership.price_thb).toBe(19)
    expect(membership.price_usd).toBe(0.49)
    expect(membership.prices).toEqual({ THB: 19, USD: 0.49 })
    expect(membership.baseItemAmount).toBe(0)
  })

  it('sets sources.usd=null when DF fetch fails; still returns THB (no FX)', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('region=TH')) {
        return new Response(JSON.stringify(thPayload), { status: 200 })
      }
      if (url.includes('region=DF')) {
        throw new Error('network')
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/heartopia/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.sources).toEqual({ thb: thUrl, usd: null })
    expect(Object.prototype.hasOwnProperty.call(body.sources, 'usd')).toBe(true)
    expect(body.categories[0].packs[0].price_thb).toBe(15)
    expect(body.categories[0].packs[0].price_usd).toBeNull()
    expect(body.categories[0].packs[0].prices.USD).toBeNull()
    expect(body.categories[0].packs[0].price_usd_source).toBeNull()
  })

  it('alias /games/heartopia-xd/packs/ resolves the same provider', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('region=TH')) {
        return new Response(JSON.stringify(thPayload), { status: 200 })
      }
      if (url.includes('region=DF')) {
        return new Response(JSON.stringify(dfPayload), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/heartopia-xd/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('heartopia')
    expect(body.sources.usd).toBe(dfUrl)
  })

  it('returns 502 when TH region has no products', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('region=TH')) {
        return new Response(JSON.stringify({ code: 200, data: [] }), {
          status: 200
        })
      }
      if (url.includes('region=DF')) {
        return new Response(JSON.stringify(dfPayload), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/heartopia/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Invalid upstream response' })
  })

  it('returns 502 when TH region fetch fails', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('region=TH')) {
        throw new Error('network')
      }
      if (url.includes('region=DF')) {
        return new Response(JSON.stringify(dfPayload), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/heartopia/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })
})

describe('GET /games/roblox/packs/', () => {
  const thbPayload = {
    products: [
      {
        productId: 4759,
        mobileProductId: '270_Robux',
        robuxAmount: 270,
        premiumFeatureTypeName: 'Robux',
        isSubscriptionOnly: false,
        defaultDisplayName: '270 Robux',
        price: {
          amount: 120.0,
          usdAmount: 0.0,
          currency: { currencyCode: 'THB' }
        }
      },
      {
        productId: 3242,
        mobileProductId: '500_Robux',
        robuxAmount: 500,
        premiumFeatureTypeName: 'Robux',
        isSubscriptionOnly: false,
        defaultDisplayName: '500 Robux',
        price: {
          amount: 200.0,
          usdAmount: 0.0,
          currency: { currencyCode: 'THB' }
        }
      },
      {
        productId: 3243,
        mobileProductId: '1000_Robux',
        robuxAmount: 1000,
        premiumFeatureTypeName: 'Robux',
        isSubscriptionOnly: false,
        defaultDisplayName: '1000 Robux',
        price: {
          amount: 400.0,
          usdAmount: 0.0,
          currency: { currencyCode: 'THB' }
        }
      },
      {
        productId: 9999,
        mobileProductId: 'sub_only',
        robuxAmount: 0,
        premiumFeatureTypeName: 'Subscription',
        isSubscriptionOnly: true,
        defaultDisplayName: 'Skip Me',
        price: {
          amount: 99.0,
          usdAmount: 0.0,
          currency: { currencyCode: 'THB' }
        }
      }
    ]
  }

  const usdPayload = {
    products: [
      {
        productId: 4759,
        mobileProductId: '270_Robux',
        robuxAmount: 270,
        premiumFeatureTypeName: 'Robux',
        isSubscriptionOnly: false,
        defaultDisplayName: '270 Robux',
        price: {
          amount: 2.99,
          usdAmount: 0.0,
          currency: { currencyCode: 'USD' }
        }
      },
      {
        productId: 3242,
        mobileProductId: '500_Robux',
        robuxAmount: 500,
        premiumFeatureTypeName: 'Robux',
        isSubscriptionOnly: false,
        defaultDisplayName: '500 Robux',
        price: {
          amount: 4.99,
          usdAmount: 0.0,
          currency: { currencyCode: 'USD' }
        }
      },
      {
        productId: 3243,
        mobileProductId: '1000_Robux',
        robuxAmount: 1000,
        premiumFeatureTypeName: 'Robux',
        isSubscriptionOnly: false,
        defaultDisplayName: '1000 Robux',
        price: {
          amount: 9.99,
          usdAmount: 0.0,
          currency: { currencyCode: 'USD' }
        }
      }
    ]
  }

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('merges THB + USD by productId; skips subscriptions; sources point at Roblox origin', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url === 'https://premiumfeatures.roblox.com/v1/products') {
        return new Response(JSON.stringify(thbPayload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (
        url ===
        'https://r.jina.ai/https://premiumfeatures.roblox.com/v1/products'
      ) {
        return new Response(
          `Title:\n\nURL Source: https://premiumfeatures.roblox.com/v1/products\n\nMarkdown Content:\n${JSON.stringify(usdPayload)}`,
          { status: 200, headers: { 'Content-Type': 'text/plain' } }
        )
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/roblox/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.game).toMatchObject({
      slug: 'roblox',
      name: 'Roblox',
      itemName: 'Robux'
    })
    expect(body.summary.packCount).toBe(3)
    expect(body.source).toBe(
      'https://premiumfeatures.roblox.com/v1/products'
    )
    expect(body.sources).toEqual({
      thb: 'https://premiumfeatures.roblox.com/v1/products',
      usd: 'https://premiumfeatures.roblox.com/v1/products'
    })

    const packs = body.categories[0].packs
    expect(packs.map((p: { id: number }) => p.id)).toEqual([4759, 3242, 3243])

    expect(packs[0]).toMatchObject({
      id: 4759,
      name: '270 Robux',
      baseItemAmount: 270,
      totalItemAmount: 270,
      price: 120,
      currency: 'THB',
      price_thb: 120,
      price_usd: 2.99,
      prices: { THB: 120, USD: 2.99 },
      price_thb_source: 'premiumfeatures',
      price_usd_source: 'premiumfeatures'
    })
    expect(packs[1]).toMatchObject({
      id: 3242,
      price_thb: 200,
      price_usd: 4.99
    })
    expect(packs[2]).toMatchObject({
      id: 3243,
      price_thb: 400,
      price_usd: 9.99
    })
  })

  it('alias /games/robux/packs/ resolves the same provider', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('premiumfeatures.roblox.com/v1/products') && !url.includes('jina')) {
        return new Response(JSON.stringify(thbPayload), { status: 200 })
      }
      if (url.includes('r.jina.ai')) {
        return new Response(JSON.stringify(usdPayload), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/robux/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('roblox')
    expect(body.summary.packCount).toBe(3)
  })

  it('leaves price_usd null when USD transport fails but THB succeeds', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url === 'https://premiumfeatures.roblox.com/v1/products') {
        return new Response(JSON.stringify(thbPayload), { status: 200 })
      }
      if (url.includes('r.jina.ai')) {
        throw new Error('jina down')
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/roblox/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.summary.packCount).toBe(3)
    expect(body.sources.usd).toBeNull()
    expect(body.categories[0].packs[1]).toMatchObject({
      price_thb: 200,
      price_usd: null,
      prices: { THB: 200, USD: null }
    })
  })

  it('returns 502 when direct THB fetch fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/roblox/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })

  it('returns 502 when products array is empty', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('premiumfeatures.roblox.com')) {
        return new Response(JSON.stringify({ products: [] }), { status: 200 })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/roblox/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Invalid upstream response'
    })
  })
})

describe('GET /games/wuthering-waves/packs/', () => {
  const thShelf = {
    shelf: {
      products: [
        {
          product_id: 'com.kurogame.aki.pay6',
          name: '60 Lunites',
          product_type: 'GameCoins',
          game_coins_num: 60,
          prices: [
            {
              payment_channel_id: 'CREDIT_CARD',
              currency: 'THB',
              amount: '35',
              display_amount: '0'
            }
          ]
        },
        {
          product_id: 'com.kurogame.aki.pay30',
          name: '300 Lunites',
          product_type: 'GameCoins',
          game_coins_num: 330,
          prices: [
            {
              payment_channel_id: 'CREDIT_CARD',
              currency: 'THB',
              amount: '179',
              display_amount: '0'
            }
          ]
        },
        {
          product_id: 'com.kurogame.aki.pay98',
          name: '980 Lunites',
          product_type: 'GameCoins',
          game_coins_num: 1090,
          prices: [
            {
              payment_channel_id: 'CREDIT_CARD',
              currency: 'THB',
              // amount is discounted; display_amount is full/list
              amount: '499',
              display_amount: '549'
            }
          ]
        }
      ]
    }
  }

  const usShelf = {
    shelf: {
      products: [
        {
          product_id: 'com.kurogame.aki.pay6',
          name: '60 Lunites',
          product_type: 'GameCoins',
          game_coins_num: 60,
          prices: [
            {
              payment_channel_id: 'CREDIT_CARD',
              currency: 'USD',
              amount: '0.99',
              display_amount: '0'
            }
          ]
        },
        {
          product_id: 'com.kurogame.aki.pay30',
          name: '300 Lunites',
          product_type: 'GameCoins',
          game_coins_num: 330,
          prices: [
            {
              payment_channel_id: 'CREDIT_CARD',
              currency: 'USD',
              amount: '4.99',
              display_amount: '0'
            }
          ]
        },
        {
          product_id: 'com.kurogame.aki.pay98',
          name: '980 Lunites',
          product_type: 'GameCoins',
          game_coins_num: 1090,
          prices: [
            {
              payment_channel_id: 'CREDIT_CARD',
              currency: 'USD',
              amount: '14.99',
              display_amount: '0'
            }
          ]
        }
      ]
    }
  }

  it('merges THB + USD by product_id; uses full/list prices', async () => {
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      if (url.includes('/midasbuy/th/shop/wuwa') || url.includes('/midasbuy/us/shop/wuwa')) {
        return new Response('<html></html>', { status: 200 })
      }
      expect(url).toContain('/frontend/api/midasbuy/v1/shelves/query')
      expect(init?.method).toBe('POST')
      const body = JSON.parse(String(init?.body || '{}'))
      expect(body.app_id).toBe('1460000975')
      expect(body.product_types).toEqual(['GameCoins'])
      if (body.region === 'TH') {
        return new Response(JSON.stringify(thShelf), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (body.region === 'US') {
        return new Response(JSON.stringify(usShelf), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      throw new Error('Unexpected region: ' + body.region)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/wuthering-waves/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game).toMatchObject({
      id: 1460000975,
      slug: 'wuthering-waves',
      name: 'Wuthering Waves',
      itemName: 'Lunites'
    })
    expect(body.summary.packCount).toBe(3)
    expect(body.source).toBe('https://www.midasbuy.com/midasbuy/th/shop/wuwa')
    expect(body.sources).toEqual({
      thb: 'https://www.midasbuy.com/midasbuy/th/shop/wuwa',
      usd: 'https://www.midasbuy.com/midasbuy/us/shop/wuwa'
    })
    expect(body.categories[0].packs).toEqual([
      {
        id: 6,
        name: '60 Lunites',
        baseItemAmount: 60,
        bonusItemAmount: 0,
        totalItemAmount: 60,
        price: 35,
        currency: 'THB',
        price_thb: 35,
        price_usd: 0.99,
        prices: { THB: 35, USD: 0.99 },
        price_thb_source: 'midasbuy',
        price_usd_source: 'midasbuy'
      },
      {
        id: 30,
        name: '300 Lunites',
        baseItemAmount: 300,
        bonusItemAmount: 30,
        totalItemAmount: 330,
        price: 179,
        currency: 'THB',
        price_thb: 179,
        price_usd: 4.99,
        prices: { THB: 179, USD: 4.99 },
        price_thb_source: 'midasbuy',
        price_usd_source: 'midasbuy'
      },
      {
        id: 98,
        name: '980 Lunites',
        baseItemAmount: 980,
        bonusItemAmount: 110,
        totalItemAmount: 1090,
        price: 549,
        currency: 'THB',
        price_thb: 549,
        price_usd: 14.99,
        prices: { THB: 549, USD: 14.99 },
        price_thb_source: 'midasbuy',
        price_usd_source: 'midasbuy'
      }
    ])
  })

  it('keeps THB and nulls USD when US shelf fetch fails', async () => {
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      if (url.includes('/shop/wuwa')) {
        return new Response('<html></html>', { status: 200 })
      }
      const body = JSON.parse(String(init?.body || '{}'))
      if (body.region === 'TH') {
        return new Response(JSON.stringify(thShelf), { status: 200 })
      }
      throw new Error('US down')
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/wuthering-waves/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.sources.usd).toBeNull()
    expect(body.categories[0].packs[0]).toMatchObject({
      price_thb: 35,
      price_usd: null,
      prices: { THB: 35, USD: null }
    })
  })

  it('returns 502 when TH shelves fetch fails', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/wuthering-waves/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })

  it('returns 502 when TH shelf products are empty', async () => {
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      if (url.includes('/shop/wuwa')) {
        return new Response('<html></html>', { status: 200 })
      }
      const body = JSON.parse(String(init?.body || '{}'))
      if (body.region === 'TH') {
        return new Response(JSON.stringify({ shelf: { products: [] } }), {
          status: 200
        })
      }
      return new Response(JSON.stringify(usShelf), { status: 200 })
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/wuthering-waves/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Invalid upstream response'
    })
  })

  it('alias /games/wuwa/packs/ resolves the same game', async () => {
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      if (url.includes('/shop/wuwa')) {
        return new Response('<html></html>', { status: 200 })
      }
      const body = JSON.parse(String(init?.body || '{}'))
      if (body.region === 'TH') {
        return new Response(JSON.stringify(thShelf), { status: 200 })
      }
      return new Response(JSON.stringify(usShelf), { status: 200 })
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/wuwa/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('wuthering-waves')
    expect(body.summary.packCount).toBe(3)
  })

  it('alias /games/wuthering-waves-midasbuy/packs/ resolves the same provider', async () => {
    globalThis.fetch = (async (input, init) => {
      const url = String(input)
      if (url.includes('/shop/wuwa')) {
        return new Response('<html></html>', { status: 200 })
      }
      const body = JSON.parse(String(init?.body || '{}'))
      if (body.region === 'TH') {
        return new Response(JSON.stringify(thShelf), { status: 200 })
      }
      return new Response(JSON.stringify(usShelf), { status: 200 })
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/wuthering-waves-midasbuy/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('wuthering-waves')
  })
})


describe('GET /games/yulgang-w/packs/', () => {
  const sampleHtml = `<!DOCTYPE html><html><head></head><body>
<script type="application/json">
{"data":[{"intent":{},"data":{"shelfMapping":{"information":{"items":[
{"title":"Provider","items":[],"items_V3":[]},
{"title":"In-App Purchases","summary":"Yes","items":[{"textPairs":[
["0.99USD Pack","à¸¿35.00"],
["1.99USD Pack","à¸¿69.00"],
["2.99USD Pack","à¸¿99.00"],
["4.99USD Pack","à¸¿179.00"],
["8.99USD Pack","à¸¿329.00"],
["9.99USD Pack","à¸¿349.00"],
["14.99USD Pack","à¸¿549.00"],
["19.99USD Pack","à¸¿729.00"],
["29.99USD Pack","à¸¿1,100.00"],
["49.99USD Pack","à¸¿1,800.00"]
]}],"items_V3":[
{"$kind":"textPair","leadingText":"0.99USD Pack","trailingText":"à¸¿35.00"},
{"$kind":"textPair","leadingText":"1.99USD Pack","trailingText":"à¸¿69.00"},
{"$kind":"textPair","leadingText":"2.99USD Pack","trailingText":"à¸¿99.00"},
{"$kind":"textPair","leadingText":"4.99USD Pack","trailingText":"à¸¿179.00"},
{"$kind":"textPair","leadingText":"8.99USD Pack","trailingText":"à¸¿329.00"},
{"$kind":"textPair","leadingText":"9.99USD Pack","trailingText":"à¸¿349.00"},
{"$kind":"textPair","leadingText":"14.99USD Pack","trailingText":"à¸¿549.00"},
{"$kind":"textPair","leadingText":"19.99USD Pack","trailingText":"à¸¿729.00"},
{"$kind":"textPair","leadingText":"29.99USD Pack","trailingText":"à¸¿1,100.00"},
{"$kind":"textPair","leadingText":"49.99USD Pack","trailingText":"à¸¿1,800.00"},
{"$kind":"button","action":{"title":"Learn More"}}
]}
]}}}}]}
</script>
</body></html>`

  it('parses live App Store IAP list with THB + USD; no hardcoded catalog', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('apps.apple.com') && url.includes('6756002784')) {
        return new Response(sampleHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      }
      throw new Error('unexpected fetch: ' + url)
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/yulgang-w/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()

    expect(body.game).toMatchObject({
      id: 6756002784,
      slug: 'yulgang-w',
      name: 'Yulgang W',
      itemName: 'Pack'
    })
    expect(body.summary.packCount).toBe(10)
    expect(body.sources).toEqual({
      thb: 'https://apps.apple.com/th/app/yulgang-w/id6756002784',
      usd: 'https://apps.apple.com/th/app/yulgang-w/id6756002784'
    })
    expect(typeof body.fetchedAt).toBe('string')

    const packs = body.categories[0].packs
    expect(packs).toHaveLength(10)

    const first = packs.find((p: { name: string }) => p.name === '0.99USD Pack')
    expect(first).toMatchObject({
      name: '0.99USD Pack',
      price_thb: 35,
      price_usd: 0.99,
      prices: { THB: 35, USD: 0.99 },
      currency: 'THB',
      price_thb_source: 'appstore',
      price_usd_source: 'appstore'
    })

    const mid = packs.find((p: { name: string }) => p.name === '29.99USD Pack')
    expect(mid).toMatchObject({
      price_thb: 1100,
      price_usd: 29.99,
      prices: { THB: 1100, USD: 29.99 }
    })

    const last = packs.find((p: { name: string }) => p.name === '49.99USD Pack')
    expect(last).toMatchObject({
      price_thb: 1800,
      price_usd: 49.99
    })

    // every pack has both currencies from live parse
    for (const pack of packs) {
      expect(typeof pack.price_thb).toBe('number')
      expect(typeof pack.price_usd).toBe('number')
      expect(pack.prices.THB).toBe(pack.price_thb)
      expect(pack.prices.USD).toBe(pack.price_usd)
    }
  })

  it('alias /games/yulgangw/packs/ and /games/ygw/packs/ resolve same provider', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('6756002784')) {
        return new Response(sampleHtml, { status: 200 })
      }
      throw new Error('unexpected fetch: ' + url)
    }) as typeof fetch

    for (const slug of ['yulgangw', 'ygw']) {
      const response = await app.handle(
        new Request(`http://localhost/games/${slug}/packs/`)
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.game.slug).toBe('yulgang-w')
      expect(body.summary.packCount).toBe(10)
    }
  })

  it('returns 502 when App Store upstream is unavailable', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/yulgang-w/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })

  it('returns 502 when App Store HTML has no IAP pairs', async () => {
    globalThis.fetch = (async () => {
      return new Response('<html><body>no iap</body></html>', { status: 200 })
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/yulgang-w/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Invalid upstream response'
    })
  })

  it('returns 502 on non-OK App Store HTTP status', async () => {
    globalThis.fetch = (async () => {
      return new Response('nope', { status: 503 })
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/yulgang-w/packs/')
    )
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'Upstream service unavailable'
    })
  })
})

describe('GET /games/ragnarok-the-new-world/packs/ (TH)', () => {
  const rate = 7.045833333333333
  const sampleHtml = `<!DOCTYPE html><html><body>
<div wire:snapshot="{&quot;data&quot;:{&quot;items&quot;:[[],{&quot;s&quot;:&quot;arr&quot;}],&quot;conversions&quot;:[{&quot;SGD&quot;:0.27708333333333335,&quot;THB&quot;:${rate},&quot;MYR&quot;:0.875,&quot;PHP&quot;:13.385416666666666,&quot;IDR&quot;:3862.5},{&quot;s&quot;:&quot;arr&quot;}],&quot;conversion_currency&quot;:null},&quot;memo&quot;:{&quot;id&quot;:&quot;purchase&quot;}}"></div>
</body></html>`

  const expectedThb: Record<number, number> = {
    60: 35, 300: 179, 980: 539, 1980: 1100, 3280: 1800,
    6480: 3590, 12980: 7190, 32980: 18200, 64980: 35500, 129980: 71000
  }
  const expectedOoc: Record<number, number> = {
    35: 4.97, 179: 25.41, 539: 76.5, 1100: 156.13, 1800: 255.48,
    3590: 509.53, 7190: 1020.47, 18200: 2583.09, 35500: 5038.44, 71000: 10076.88
  }
  const expectedUsd: Record<number, number> = {
    60: 0.99, 300: 4.99, 980: 14.99, 1980: 29.99, 3280: 49.99,
    6480: 99.99, 12980: 199.99, 32980: 499.99, 64980: 999.99, 129980: 1999.99
  }

  const pieceFixture = (amount: number, currency = 'THB') => ({
    result: '1',
    code: 0,
    data: {
      paytype_list: [
        {
          name: 'OOC',
          f_pay_type: 'oneverse',
          pay_type: 'ooc',
          currency,
          price_list: [
            {
              TRANS_AMOUNT: String(amount),
              GAME_TRANS_AMOUNT: String(amount),
              SUB_AMOUNT: '0',
              CURRENCY: currency
            }
          ]
        }
      ]
    }
  })

  const thPieceMap = (): Record<string, number> => ({
    'com.ggv.roworldsea.xs1': 35,
    'com.ggv.roworldsea.xs2': 179,
    'com.ggv.roworldsea.xs3': 539,
    'com.ggv.roworldsea.xs4': 1100,
    'com.ggv.roworldsea.xs5': 1800,
    'com.ggv.roworldsea.xs6': 3590,
    'com.ggv.roworldsea.xs7': 7190,
    'com.ggv.roworldsea.xs8': 18200,
    'com.ggv.roworldsea.xs9': 35500,
    'com.ggv.roworldsea.xs10': 71000
  })

  const mockFetchTh = () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('games.oneone.com') && url.includes('ragnarok-the-new-world')) {
        return new Response(sampleHtml, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        })
      }
      if (url.includes('get_piece_list')) {
        const m = url.match(/productId=([^&]+)/)
        const pid = m ? decodeURIComponent(m[1]) : ''
        const thb = thPieceMap()[pid] ?? 35
        expect(url).toContain('location=TH')
        return new Response(JSON.stringify(pieceFixture(thb, 'THB')), { status: 200 })
      }
      if (url.includes('gstore.gnjoy.game')) {
        return new Response(
          JSON.stringify({ result: '1', data: { product_list: [] } }),
          { status: 200 }
        )
      }
      throw new Error('unexpected fetch: ' + url)
    }) as typeof fetch
  }

  it('returns Thailand region + live THB/OOC/USD labels', async () => {
    mockFetchTh()
    const response = await app.handle(
      new Request('http://localhost/games/ragnarok-the-new-world/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.region).toMatchObject({
      code: 'TH',
      name: 'Thailand',
      currency: 'THB'
    })
    expect(body.game).toMatchObject({
      slug: 'ragnarok-the-new-world',
      name: 'Ragnarok: The New World',
      itemName: 'Starstones'
    })
    expect(body.summary.packCount).toBe(10)
    expect(body.rate.source).toBe('live')
    expect(body.rate.thb_per_ooc).toBeCloseTo(rate, 10)
    expect(body.thb.source).toBe('live')
    expect(body.usd.source).toBe('fallback')

    const packs = body.categories[0].packs
    const first = packs.find((p: { id: number }) => p.id === 60)
    expect(first).toMatchObject({
      name: '60 Starstones',
      price_thb: 35,
      price_myr: null,
      price_usd: 0.99,
      price_ooc: 4.97,
      prices: { THB: 35, MYR: null, IDR: null, PHP: null, SGD: null, USD: 0.99, OOC: 4.97 },
      currency: 'THB',
      price_ooc_source: 'oneone-live-rate'
    })
    for (const pack of packs) {
      expect(pack.price_thb).toBe(expectedThb[pack.id])
      expect(pack.price_ooc).toBe(expectedOoc[pack.price_thb])
      expect(pack.price_usd).toBe(expectedUsd[pack.id])
    }
  })

  it('TH aliases rtnw / ragnarok-tnw / ragnarok-the-new-world-th', async () => {
    mockFetchTh()
    for (const slug of ['rtnw', 'ragnarok-tnw', 'ragnarok-the-new-world-th', 'rtnw-th']) {
      const response = await app.handle(
        new Request(`http://localhost/games/${slug}/packs/`)
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.region.code).toBe('TH')
      expect(body.summary.packCount).toBe(10)
      expect(body.categories[0].packs[0].price_thb).toBe(35)
    }
  })

  it('falls back to labeled rate when OneOne upstream is unavailable (still 200)', async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('get_piece_list')) {
        const m = url.match(/productId=([^&]+)/)
        const pid = m ? decodeURIComponent(m[1]) : ''
        return new Response(JSON.stringify(pieceFixture(thPieceMap()[pid] ?? 35, 'THB')), {
          status: 200
        })
      }
      if (url.includes('gstore.gnjoy.game')) {
        return new Response(
          JSON.stringify({ result: '1', data: { product_list: [] } }),
          { status: 200 }
        )
      }
      throw new Error('network')
    }) as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/ragnarok-the-new-world/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.rate.source).toBe('fallback')
    expect(body.rate.thb_per_ooc).toBe(7.045833333333333)
    expect(body.region.code).toBe('TH')
    expect(body.categories[0].packs[0].price_thb).toBe(35)
  })
})

describe('GET /games/ragnarok-the-new-world-my/packs/ (MY)', () => {
  const sampleHtml = `<!DOCTYPE html><html><body>
<div wire:snapshot="{&quot;data&quot;:{&quot;items&quot;:[[],{&quot;s&quot;:&quot;arr&quot;}],&quot;conversions&quot;:[{&quot;THB&quot;:7.045833333333333,&quot;MYR&quot;:0.875,&quot;IDR&quot;:3862.5,&quot;PHP&quot;:13.385416666666666,&quot;SGD&quot;:0.27708333333333335},{&quot;s&quot;:&quot;arr&quot;}]}}"></div>
</body></html>`

  const expectedMyr: Record<number, number> = {
    60: 4.5, 300: 21.99, 980: 66.9, 1980: 132.9, 3280: 224.9,
    6480: 444.9, 12980: 884.9, 32980: 2199, 64980: 4329, 129980: 8599
  }
  const expectedOocMyr: Record<number, number> = {
    4.5: 5.15, 21.99: 25.14, 66.9: 76.46, 132.9: 151.89, 224.9: 257.03,
    444.9: 508.46, 884.9: 1011.32, 2199: 2513.15, 4329: 4947.43, 8599: 9827.43
  }

  const pieceFixture = (amount: number) => ({
    result: '1',
    code: 0,
    data: {
      paytype_list: [
        {
          name: 'OOC',
          f_pay_type: 'oneverse',
          pay_type: 'ooc',
          currency: 'MYR',
          price_list: [
            {
              TRANS_AMOUNT: String(amount),
              GAME_TRANS_AMOUNT: String(amount),
              SUB_AMOUNT: '0',
              CURRENCY: 'MYR'
            }
          ]
        }
      ]
    }
  })

  const myPieceMap = (): Record<string, number> => ({
    'com.ggv.roworldsea.xs1': 4.5,
    'com.ggv.roworldsea.xs2': 21.99,
    'com.ggv.roworldsea.xs3': 66.9,
    'com.ggv.roworldsea.xs4': 132.9,
    'com.ggv.roworldsea.xs5': 224.9,
    'com.ggv.roworldsea.xs6': 444.9,
    'com.ggv.roworldsea.xs7': 884.9,
    'com.ggv.roworldsea.xs8': 2199,
    'com.ggv.roworldsea.xs9': 4329,
    'com.ggv.roworldsea.xs10': 8599
  })

  const mockFetchMy = () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('games.oneone.com')) {
        return new Response(sampleHtml, { status: 200 })
      }
      if (url.includes('get_piece_list')) {
        expect(url).toContain('location=MY')
        const m = url.match(/productId=([^&]+)/)
        const pid = m ? decodeURIComponent(m[1]) : ''
        return new Response(JSON.stringify(pieceFixture(myPieceMap()[pid] ?? 4.5)), {
          status: 200
        })
      }
      if (url.includes('gstore.gnjoy.game')) {
        return new Response(
          JSON.stringify({ result: '1', data: { product_list: [] } }),
          { status: 200 }
        )
      }
      throw new Error('unexpected fetch: ' + url)
    }) as typeof fetch
  }

  it('returns Malaysia region + live MYR/OOC', async () => {
    mockFetchMy()
    const response = await app.handle(
      new Request('http://localhost/games/ragnarok-the-new-world-my/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.region).toMatchObject({
      code: 'MY',
      name: 'Malaysia',
      currency: 'MYR'
    })
    expect(body.game.slug).toBe('ragnarok-the-new-world-my')
    expect(body.rate.source).toBe('live')
    expect(body.rate.myr_per_ooc).toBe(0.875)
    expect(body.myr.source).toBe('live')
    expect(body.summary.packCount).toBe(10)

    const packs = body.categories[0].packs
    const first = packs.find((p: { id: number }) => p.id === 60)
    expect(first).toMatchObject({
      price_myr: 4.5,
      price_thb: null,
      price_usd: 0.99,
      price_ooc: 5.15,
      currency: 'MYR',
      prices: { THB: null, MYR: 4.5, IDR: null, PHP: null, SGD: null, USD: 0.99, OOC: 5.15 },
      price_myr_source: 'gnjoy-get_piece_list-live',
      price_ooc_source: 'oneone-live-rate'
    })
    const big = packs.find((p: { id: number }) => p.id === 129980)
    expect(big.price_myr).toBe(8599)
    expect(big.price_ooc).toBe(9827.43)
    for (const pack of packs) {
      expect(pack.price_myr).toBe(expectedMyr[pack.id])
      expect(pack.price_ooc).toBe(expectedOocMyr[pack.price_myr])
    }
  })

  it('MY aliases rtnw-my and ragnarok-tnw-my', async () => {
    mockFetchMy()
    for (const slug of ['rtnw-my', 'ragnarok-tnw-my']) {
      const response = await app.handle(
        new Request(`http://localhost/games/${slug}/packs/`)
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.region.code).toBe('MY')
      expect(body.categories[0].packs[0].price_myr).toBe(4.5)
    }
  })
})

describe('GET /games/ragnarok-the-new-world-id/packs/ (ID)', () => {
  const sampleHtml = `<!DOCTYPE html><html><body>
<div wire:snapshot="{&quot;data&quot;:{&quot;items&quot;:[[],{&quot;s&quot;:&quot;arr&quot;}],&quot;conversions&quot;:[{&quot;IDR&quot;:3862.5,&quot;THB&quot;:7.045833333333333,&quot;MYR&quot;:0.875,&quot;PHP&quot;:13.385416666666666,&quot;SGD&quot;:0.27708333333333335},{&quot;s&quot;:&quot;arr&quot;}]}}"></div>
</body></html>`

  const expectedIdr: Record<number, number> = {
    60: 20000, 300: 100000, 980: 305000, 1980: 605000, 3280: 1009000,
    6480: 2049000, 12980: 4049000, 32980: 9900000, 64980: 19500000, 129980: 38800000
  }
  const expectedOocIdr: Record<number, number> = {
    20000: 5.18, 100000: 25.89, 305000: 78.97, 605000: 156.64, 1009000: 261.23,
    2049000: 530.49, 4049000: 1048.29, 9900000: 2563.11, 19500000: 5048.55, 38800000: 10045.31
  }

  const pieceFixture = (amount: number) => ({
    result: '1',
    code: 0,
    data: {
      paytype_list: [
        {
          name: 'OOC',
          f_pay_type: 'oneverse',
          pay_type: 'ooc',
          currency: 'IDR',
          price_list: [
            {
              TRANS_AMOUNT: String(amount),
              GAME_TRANS_AMOUNT: String(amount),
              SUB_AMOUNT: '0',
              CURRENCY: 'IDR'
            }
          ]
        }
      ]
    }
  })

  const idPieceMap = (): Record<string, number> => ({
    'com.ggv.roworldsea.xs1': 20000,
    'com.ggv.roworldsea.xs2': 100000,
    'com.ggv.roworldsea.xs3': 305000,
    'com.ggv.roworldsea.xs4': 605000,
    'com.ggv.roworldsea.xs5': 1009000,
    'com.ggv.roworldsea.xs6': 2049000,
    'com.ggv.roworldsea.xs7': 4049000,
    'com.ggv.roworldsea.xs8': 9900000,
    'com.ggv.roworldsea.xs9': 19500000,
    'com.ggv.roworldsea.xs10': 38800000
  })

  const mockFetchId = () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('games.oneone.com')) {
        return new Response(sampleHtml, { status: 200 })
      }
      if (url.includes('get_piece_list')) {
        expect(url).toContain('location=ID')
        const m = url.match(/productId=([^&]+)/)
        const pid = m ? decodeURIComponent(m[1]) : ''
        return new Response(JSON.stringify(pieceFixture(idPieceMap()[pid] ?? 20000)), {
          status: 200
        })
      }
      if (url.includes('gstore.gnjoy.game')) {
        return new Response(
          JSON.stringify({ result: '1', data: { product_list: [] } }),
          { status: 200 }
        )
      }
      throw new Error('unexpected fetch: ' + url)
    }) as typeof fetch
  }

  it('returns Indonesia region + live IDR/OOC', async () => {
    mockFetchId()
    const response = await app.handle(
      new Request('http://localhost/games/ragnarok-the-new-world-id/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.region).toMatchObject({
      code: 'ID',
      name: 'Indonesia',
      currency: 'IDR'
    })
    expect(body.game.slug).toBe('ragnarok-the-new-world-id')
    expect(body.rate.source).toBe('live')
    expect(body.rate.idr_per_ooc).toBe(3862.5)
    expect(body.idr.source).toBe('live')
    expect(body.summary.packCount).toBe(10)

    const packs = body.categories[0].packs
    const first = packs.find((p: { id: number }) => p.id === 60)
    expect(first).toMatchObject({
      price_idr: 20000,
      price_thb: null,
      price_myr: null,
      price_usd: 0.99,
      price_ooc: 5.18,
      currency: 'IDR',
      prices: { THB: null, MYR: null, IDR: 20000, PHP: null, SGD: null, USD: 0.99, OOC: 5.18 },
      price_idr_source: 'gnjoy-get_piece_list-live',
      price_ooc_source: 'oneone-live-rate'
    })
    for (const pack of packs) {
      expect(pack.price_idr).toBe(expectedIdr[pack.id])
      expect(pack.price_ooc).toBe(expectedOocIdr[pack.price_idr])
    }
  })

  it('ID aliases rtnw-id and ragnarok-tnw-id', async () => {
    mockFetchId()
    for (const slug of ['rtnw-id', 'ragnarok-tnw-id']) {
      const response = await app.handle(
        new Request(`http://localhost/games/${slug}/packs/`)
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.region.code).toBe('ID')
      expect(body.categories[0].packs[0].price_idr).toBe(20000)
    }
  })
})

describe('GET /games/ragnarok-the-new-world-ph/packs/ (PH)', () => {
  const sampleHtml = `<!DOCTYPE html><html><body>
<div wire:snapshot="{&quot;data&quot;:{&quot;items&quot;:[[],{&quot;s&quot;:&quot;arr&quot;}],&quot;conversions&quot;:[{&quot;PHP&quot;:13.385416666666666,&quot;IDR&quot;:3862.5,&quot;SGD&quot;:0.27708333333333335,&quot;THB&quot;:7.045833333333333,&quot;MYR&quot;:0.875},{&quot;s&quot;:&quot;arr&quot;}]}}"></div>
</body></html>`

  const expectedPhp: Record<number, number> = {
    60: 69, 300: 345, 980: 1040, 1980: 2090, 3280: 3490,
    6480: 6950, 12980: 13890, 32980: 34500, 64980: 67950, 129980: 135500
  }
  const expectedOocPhp: Record<number, number> = {
    69: 5.16, 345: 25.78, 1040: 77.7, 2090: 156.15, 3490: 260.74,
    6950: 519.23, 13890: 1037.7, 34500: 2577.44, 67950: 5076.43, 135500: 10122.96
  }

  const pieceFixture = (amount: number) => ({
    result: '1',
    code: 0,
    data: {
      paytype_list: [
        {
          name: 'OOC',
          f_pay_type: 'oneverse',
          pay_type: 'ooc',
          currency: 'PHP',
          price_list: [
            {
              TRANS_AMOUNT: String(amount),
              GAME_TRANS_AMOUNT: String(amount),
              SUB_AMOUNT: '0',
              CURRENCY: 'PHP'
            }
          ]
        }
      ]
    }
  })

  const phPieceMap = (): Record<string, number> => ({
    'com.ggv.roworldsea.xs1': 69,
    'com.ggv.roworldsea.xs2': 345,
    'com.ggv.roworldsea.xs3': 1040,
    'com.ggv.roworldsea.xs4': 2090,
    'com.ggv.roworldsea.xs5': 3490,
    'com.ggv.roworldsea.xs6': 6950,
    'com.ggv.roworldsea.xs7': 13890,
    'com.ggv.roworldsea.xs8': 34500,
    'com.ggv.roworldsea.xs9': 67950,
    'com.ggv.roworldsea.xs10': 135500
  })

  const mockFetchPh = () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('games.oneone.com')) {
        return new Response(sampleHtml, { status: 200 })
      }
      if (url.includes('get_piece_list')) {
        expect(url).toContain('location=PH')
        const m = url.match(/productId=([^&]+)/)
        const pid = m ? decodeURIComponent(m[1]) : ''
        return new Response(JSON.stringify(pieceFixture(phPieceMap()[pid] ?? 69)), {
          status: 200
        })
      }
      if (url.includes('gstore.gnjoy.game')) {
        return new Response(
          JSON.stringify({ result: '1', data: { product_list: [] } }),
          { status: 200 }
        )
      }
      throw new Error('unexpected fetch: ' + url)
    }) as typeof fetch
  }

  it('returns Philippines region + live PHP/OOC', async () => {
    mockFetchPh()
    const response = await app.handle(
      new Request('http://localhost/games/ragnarok-the-new-world-ph/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.region).toMatchObject({
      code: 'PH',
      name: 'Philippines',
      currency: 'PHP'
    })
    expect(body.game.slug).toBe('ragnarok-the-new-world-ph')
    expect(body.rate.php_per_ooc).toBe(13.385416666666666)
    expect(body.php.source).toBe('live')
    const packs = body.categories[0].packs
    const first = packs.find((p: { id: number }) => p.id === 60)
    expect(first).toMatchObject({
      price_php: 69,
      price_ooc: 5.16,
      currency: 'PHP',
      prices: { THB: null, MYR: null, IDR: null, PHP: 69, SGD: null, USD: 0.99, OOC: 5.16 }
    })
    for (const pack of packs) {
      expect(pack.price_php).toBe(expectedPhp[pack.id])
      expect(pack.price_ooc).toBe(expectedOocPhp[pack.price_php])
    }
  })

  it('PH aliases rtnw-ph and ragnarok-tnw-ph', async () => {
    mockFetchPh()
    for (const slug of ['rtnw-ph', 'ragnarok-tnw-ph']) {
      const response = await app.handle(
        new Request(`http://localhost/games/${slug}/packs/`)
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.region.code).toBe('PH')
      expect(body.categories[0].packs[0].price_php).toBe(69)
    }
  })
})

describe('GET /games/ragnarok-the-new-world-sg/packs/ (SG)', () => {
  const sampleHtml = `<!DOCTYPE html><html><body>
<div wire:snapshot="{&quot;data&quot;:{&quot;items&quot;:[[],{&quot;s&quot;:&quot;arr&quot;}],&quot;conversions&quot;:[{&quot;SGD&quot;:0.27708333333333335,&quot;IDR&quot;:3862.5,&quot;PHP&quot;:13.385416666666666,&quot;THB&quot;:7.045833333333333,&quot;MYR&quot;:0.875},{&quot;s&quot;:&quot;arr&quot;}]}}"></div>
</body></html>`

  const expectedSgd: Record<number, number> = {
    60: 1.48, 300: 7.08, 980: 21.48, 1980: 42.48, 3280: 70.9,
    6480: 140.98, 12980: 284.98, 32980: 709, 64980: 1390, 129980: 2769
  }
  const expectedOocSgd: Record<number, number> = {
    1.48: 5.35, 7.08: 25.56, 21.48: 77.53, 42.48: 153.32, 70.9: 255.88,
    140.98: 508.8, 284.98: 1028.5, 709: 2558.8, 1390: 5016.55, 2769: 9993.39
  }

  const pieceFixture = (amount: number) => ({
    result: '1',
    code: 0,
    data: {
      paytype_list: [
        {
          name: 'OOC',
          f_pay_type: 'oneverse',
          pay_type: 'ooc',
          currency: 'SGD',
          price_list: [
            {
              TRANS_AMOUNT: String(amount),
              GAME_TRANS_AMOUNT: String(amount),
              SUB_AMOUNT: '0',
              CURRENCY: 'SGD'
            }
          ]
        }
      ]
    }
  })

  const sgPieceMap = (): Record<string, number> => ({
    'com.ggv.roworldsea.xs1': 1.48,
    'com.ggv.roworldsea.xs2': 7.08,
    'com.ggv.roworldsea.xs3': 21.48,
    'com.ggv.roworldsea.xs4': 42.48,
    'com.ggv.roworldsea.xs5': 70.9,
    'com.ggv.roworldsea.xs6': 140.98,
    'com.ggv.roworldsea.xs7': 284.98,
    'com.ggv.roworldsea.xs8': 709,
    'com.ggv.roworldsea.xs9': 1390,
    'com.ggv.roworldsea.xs10': 2769
  })

  const mockFetchSg = () => {
    globalThis.fetch = (async (input) => {
      const url = String(input)
      if (url.includes('games.oneone.com')) {
        return new Response(sampleHtml, { status: 200 })
      }
      if (url.includes('get_piece_list')) {
        expect(url).toContain('location=SG')
        const m = url.match(/productId=([^&]+)/)
        const pid = m ? decodeURIComponent(m[1]) : ''
        return new Response(JSON.stringify(pieceFixture(sgPieceMap()[pid] ?? 1.48)), {
          status: 200
        })
      }
      if (url.includes('gstore.gnjoy.game')) {
        return new Response(
          JSON.stringify({ result: '1', data: { product_list: [] } }),
          { status: 200 }
        )
      }
      throw new Error('unexpected fetch: ' + url)
    }) as typeof fetch
  }

  it('returns Singapore region + live SGD/OOC', async () => {
    mockFetchSg()
    const response = await app.handle(
      new Request('http://localhost/games/ragnarok-the-new-world-sg/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.region).toMatchObject({
      code: 'SG',
      name: 'Singapore',
      currency: 'SGD'
    })
    expect(body.game.slug).toBe('ragnarok-the-new-world-sg')
    expect(body.rate.sgd_per_ooc).toBe(0.27708333333333335)
    expect(body.sgd.source).toBe('live')
    const packs = body.categories[0].packs
    const first = packs.find((p: { id: number }) => p.id === 60)
    expect(first).toMatchObject({
      price_sgd: 1.48,
      price_ooc: 5.35,
      currency: 'SGD',
      prices: { THB: null, MYR: null, IDR: null, PHP: null, SGD: 1.48, USD: 0.99, OOC: 5.35 }
    })
    for (const pack of packs) {
      expect(pack.price_sgd).toBe(expectedSgd[pack.id])
      expect(pack.price_ooc).toBe(expectedOocSgd[pack.price_sgd])
    }
  })

  it('SG aliases rtnw-sg and ragnarok-tnw-sg', async () => {
    mockFetchSg()
    for (const slug of ['rtnw-sg', 'ragnarok-tnw-sg']) {
      const response = await app.handle(
        new Request(`http://localhost/games/${slug}/packs/`)
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(body.region.code).toBe('SG')
      expect(body.categories[0].packs[0].price_sgd).toBe(1.48)
    }
  })
})

describe('GET /games/ragnarok-the-new-world/regions/', () => {
  it('lists TH MY ID PH SG with packs paths', async () => {
    const response = await app.handle(
      new Request('http://localhost/games/ragnarok-the-new-world/regions/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game.slug).toBe('ragnarok-the-new-world')
    expect(body.regions.map((r: { code: string }) => r.code)).toEqual([
      'TH',
      'MY',
      'ID',
      'PH',
      'SG'
    ])
    expect(body.regions[0]).toMatchObject({
      code: 'TH',
      name: 'Thailand',
      currency: 'THB'
    })
    expect(body.regions[1]).toMatchObject({
      code: 'MY',
      name: 'Malaysia',
      currency: 'MYR',
      packsPath: '/games/ragnarok-the-new-world-my/packs/'
    })
    expect(body.regions[2]).toMatchObject({
      code: 'ID',
      name: 'Indonesia',
      currency: 'IDR',
      packsPath: '/games/ragnarok-the-new-world-id/packs/'
    })
    expect(body.regions[3]).toMatchObject({
      code: 'PH',
      currency: 'PHP',
      packsPath: '/games/ragnarok-the-new-world-ph/packs/'
    })
    expect(body.regions[4]).toMatchObject({
      code: 'SG',
      currency: 'SGD',
      packsPath: '/games/ragnarok-the-new-world-sg/packs/'
    })
  })
})


describe('GET /games/blood-strike/packs/', () => {
  const lp = (thb: number, usd: number) =>
    JSON.stringify({
      TH: { 'NetEase Pay': { price: usd, currency: 'USD' }, default: { price: thb, currency: 'THB' } },
      US: { default: { price: usd, currency: 'USD' } }
    })
  const product = (
    goodsid: string,
    en: string,
    usd: string,
    thb: number,
    extra: Record<string, unknown> = {}
  ) => ({
    goodsid,
    goodsinfo: en,
    currency: 'USD',
    price: usd,
    platform: 'ios',
    status: 1,
    permanent_display_flag: 1,
    extra: { unipay: 'true', local_price: lp(thb, Number(usd)) },
    multi_language: { default: { 'en-US': { goodsinfo: en } } },
    ...extra
  })
  const payload = {
    code: '0000',
    msg: null,
    data: [
      product('g83naxx1ena.USD.gold100.ally', '100 Golds', '0.9900', 39),
      product('g83naxx1ena.USD.gold100.ally', '100 Golds', '0.9900', 39, { platform: 'pc' }),
      product('g83naxx1ena.USD.gold5000.ally', '5000 Golds', '49.9900', 1990),
      product('g83naxx1ena.usd.399pass.ally', 'Strike Pass Elite', '3.9900', 159),
      // time-limited event item: excluded
      product('g83naxx1ena.usd.099package.ally', 'Lucky Bag Week', '0.9900', 39, {
        permanent_display_flag: 0
      }),
      // VN-only Funcard item: excluded (not USD)
      {
        goodsid: 'g83naxx1ena.allysdk.funtap.VND.20000.id1',
        goodsinfo: 'gold96',
        currency: 'VND',
        price: '20000.0000',
        status: 1,
        permanent_display_flag: 1,
        extra: { unipay: 'true' }
      }
    ]
  }

  it('maps live NetEase GamesClub products to THB + USD packs', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://pay.neteasegames.com/gameclub/products/bloodstrike')) {
        return new Response(JSON.stringify(payload), { status: 200 })
      }
      throw new Error('unexpected fetch: ' + url)
    }) as unknown as typeof fetch

    const response = await app.handle(
      new Request('http://localhost/games/blood-strike/packs/')
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.game).toMatchObject({ slug: 'blood-strike', name: 'Blood Strike', itemName: 'Gold' })
    expect(body.source).toBe('https://pay.neteasegames.com/BloodStrike/topup')
    expect(body.summary).toEqual({ categoryCount: 2, packCount: 3 })

    const gold = body.categories[0]
    expect(gold.name).toBe('Gold')
    expect(gold.packs.map((p: { name: string }) => p.name)).toEqual(['100 Golds', '5000 Golds'])
    expect(gold.packs[0]).toMatchObject({
      baseItemAmount: 100,
      price_thb: 39,
      price_usd: 0.99,
      prices: { THB: 39, USD: 0.99 },
      currency: 'THB',
      price_thb_source: 'netease-gameclub'
    })
    expect(gold.packs[1]).toMatchObject({ price_thb: 1990, price_usd: 49.99 })
    expect(body.categories[1].packs[0]).toMatchObject({
      name: 'Strike Pass Elite',
      price_thb: 159,
      price_usd: 3.99
    })
  })

  it('alias /games/bloodstrike/packs/ resolves same provider', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch
    const response = await app.handle(new Request('http://localhost/games/bloodstrike/packs/'))
    expect(response.status).toBe(200)
    expect((await response.json()).game.slug).toBe('blood-strike')
  })

  it('returns 502 when upstream is unavailable (no static fallback)', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network')
    }) as unknown as typeof fetch
    const response = await app.handle(new Request('http://localhost/games/blood-strike/packs/'))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Upstream service unavailable' })
  })

  it('returns 502 on non-OK upstream status', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch
    const response = await app.handle(new Request('http://localhost/games/blood-strike/packs/'))
    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'Upstream service unavailable' })
  })

  it('returns 502 when upstream payload is invalid or empty', async () => {
    for (const bad of [{ code: '9999', data: null }, { code: '0000', data: [] }]) {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify(bad), { status: 200 })) as unknown as typeof fetch
      const response = await app.handle(new Request('http://localhost/games/blood-strike/packs/'))
      expect(response.status).toBe(502)
      expect(await response.json()).toEqual({ error: 'Invalid upstream response' })
    }
  })
})
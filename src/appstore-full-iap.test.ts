import { describe, expect, test, afterEach } from 'bun:test'
import {
  appStoreFetch,
  fetchAppStoreFullIap,
  fullIapToPageHtml,
  parseAppStorePageUrl,
  pickLocale,
  parseTopInAppsPage,
  APPSTORE_SOURCE_HEADER
} from './services/appstore-full-iap'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

const item = (i: number, name = `Item ${i}`, price = 29, fmt = `฿${price}.00`) => ({
  id: String(i),
  attributes: { name, offers: [{ price, priceFormatted: fmt, currencyCode: 'THB' }] }
})

function mockApi(total: number, extra: Record<number, ReturnType<typeof item>> = {}, status = 200) {
  const calls: string[] = []
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    if (url.includes('/api/apps/v1/catalog/')) {
      if (status !== 200) return new Response('{}', { status })
      const off = Number(new URL(url).searchParams.get('offset'))
      const data = []
      for (let i = off; i < Math.min(off + 10, total); i++) data.push(extra[i] ?? item(i))
      return new Response(JSON.stringify({ data }), { status: 200 })
    }
    return new Response('<html>page top10</html>', { status: 200 })
  }) as typeof fetch
  return calls
}

describe('appstore-full-iap', () => {
  test('parses page URL and locale', () => {
    expect(parseAppStorePageUrl('https://apps.apple.com/th/app/x/id123?l=en')).toEqual({ cc: 'th', id: '123', l: 'en' })
    expect(parseAppStorePageUrl('https://example.com/x')).toBeNull()
    expect(pickLocale('th', null, 'th-TH')).toBe('th')
    expect(pickLocale('th', null)).toBe('en-GB')
    expect(pickLocale('us', 'en')).toBe('en-US')
    expect(pickLocale('kh', null)).toBeNull()
  })

  test('parseTopInAppsPage skips rows without offers', () => {
    expect(parseTopInAppsPage({ data: [item(1), { id: '2', attributes: { name: 'x' } }] })!.length).toBe(1)
    expect(parseTopInAppsPage({})).toBeNull()
  })

  test('pages with offset until a short page (beyond top 10)', async () => {
    const calls = mockApi(23, { 21: item(21, 'Dreamballs 60', 1190, '฿1,190.00') })
    const rows = await fetchAppStoreFullIap('th', '1293738123', 'en-GB')
    expect(rows.length).toBe(23)
    expect(calls.length).toBe(3)
    expect(rows[21]).toMatchObject({ name: 'Dreamballs 60', price: 1190, priceFormatted: '฿1,190.00' })
  })

  test('retries on 429 then succeeds', async () => {
    let n = 0
    globalThis.fetch = (async () => {
      n++
      if (n === 1) return new Response('{}', { status: 429, headers: { 'retry-after': '0' } })
      return new Response(JSON.stringify({ data: [item(0)] }), { status: 200 })
    }) as unknown as typeof fetch
    const rows = await fetchAppStoreFullIap('th', '1', null)
    expect(rows.length).toBe(1)
    expect(n).toBe(2)
  })

  test('synthetic HTML carries every item in text-pair and items_V3 shapes', () => {
    const html = fullIapToPageHtml([{ id: '1', name: 'A & B', price: 29, priceFormatted: '฿29.00', currency: 'THB' }])
    expect(html).toContain('<span>A &amp; B</span> <span>฿29.00</span>')
    expect(html).toContain('"leadingText":"A & B"')
  })

  test('appStoreFetch returns full list with amp-api source', async () => {
    mockApi(15)
    const r = await appStoreFetch('https://apps.apple.com/th/app/id1', {})
    expect(r.headers.get(APPSTORE_SOURCE_HEADER)).toBe('amp-api')
    expect((await r.text()).match(/class="text-pair/g)!.length).toBe(15)
  })

  test('appStoreFetch falls back to page scrape on API error', async () => {
    const calls = mockApi(0, {}, 500)
    const r = await appStoreFetch('https://apps.apple.com/th/app/id1', {})
    expect(r.headers.get(APPSTORE_SOURCE_HEADER)).toBe('appstore-page')
    expect(await r.text()).toContain('page top10')
    expect(calls[calls.length - 1]).toBe('https://apps.apple.com/th/app/id1')
  })

  test('non App Store URLs pass through', async () => {
    const calls = mockApi(0)
    await appStoreFetch('https://example.com/a', {})
    expect(calls).toEqual(['https://example.com/a'])
  })
})
import { iapNameKey, lookupUnambiguous, iapScope, isFullIapResponse } from './services/appstore-full-iap'
import { parseBleachIap } from './services/bleach-packs.service'

describe('appstore-full-iap matching helpers', () => {
  test('404 just past the end (count multiple of 10) ends paging', async () => {
    let n = 0
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      n++
      const off = Number(new URL(String(input)).searchParams.get('offset'))
      if (off >= 30) return new Response('{}', { status: 404 })
      return new Response(JSON.stringify({ data: Array.from({ length: 10 }, (_, i) => item(off + i)) }), { status: 200 })
    }) as unknown as typeof fetch
    const rows = await fetchAppStoreFullIap('th', '1593356371', 'en-GB')
    expect(rows.length).toBe(30)
    expect(n).toBe(4)
  })

  test('404 on the first page is still an error (falls back)', async () => {
    globalThis.fetch = (async () => new Response('{}', { status: 404 })) as unknown as typeof fetch
    await expect(fetchAppStoreFullIap('us', '1', null)).rejects.toThrow('404')
  })

  test('iapNameKey normalises ×, thousands separators, case and spaces', () => {
    expect(iapNameKey('Premium Spiritual Jade ×1,980')).toBe(iapNameKey('premium  spiritual jade x1980'))
    expect(iapNameKey('Premium Spiritual Jade ×12,800')).toBe(iapNameKey('Premium Spiritual Jade ×12800'))
    expect(iapNameKey('Limited Recruitment Ticket ×10')).toBe('limited recruitment ticket x10')
  })

  test('lookupUnambiguous: same price duplicates ok, different prices ambiguous', () => {
    const rows = [
      { name: 'Private Training', price: 17.99 },
      { name: 'Private Training', price: 17.99 },
      { name: 'Extreme Training', price: 19.99 },
      { name: 'Extreme Training', price: 10 }
    ]
    expect(lookupUnambiguous(rows, 'private training')).toEqual({ row: rows[0] })
    expect(lookupUnambiguous(rows, 'Extreme Training')).toEqual({ ambiguous: [10, 19.99] })
    expect(lookupUnambiguous(rows, 'Nope')).toBeNull()
    expect(lookupUnambiguous(null, 'x')).toBeNull()
  })

  test('iapScope wording and source detection', () => {
    expect(iapScope(true)).toContain('full App Store IAP list checked')
    expect(iapScope(false)).toContain('top 10')
    expect(isFullIapResponse(new Response('', { headers: { 'x-appstore-source': 'amp-api' } }))).toBe(true)
    expect(isFullIapResponse(new Response(''))).toBe(false)
  })

  test('bleach parser reads KH/LA "USD x.xx" and keeps × in names', () => {
    const html = fullIapToPageHtml([
      { id: '1', name: 'Premium Spiritual Jade ×1,980', price: 29.99, priceFormatted: 'USD 29.99', currency: 'USD' },
      { id: '2', name: 'Gacha Box', price: 0.99, priceFormatted: 'USD 0.99', currency: 'USD' }
    ])
    const rows = parseBleachIap(html, 'USD')
    expect(rows).toEqual([
      { name: 'Premium Spiritual Jade ×1,980', amount: 1980, price: 29.99 },
      { name: 'Gacha Box', amount: null, price: 0.99 }
    ] as any)
  })
})
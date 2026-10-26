/**
 * Full App Store in-app purchase list (not just the top 10 shown on apps.apple.com).
 *
 * Source: the App Store web's own catalog data API, reached through apps.apple.com's public
 * same-origin proxy (/api/apps/v1/catalog/{cc}/apps/{id}/top-in-apps, paged 10 at a time with offset),
 * the same data the apps.apple.com page itself renders. No bearer token, no login, live on every request
 * (no price caching). Prices are Apple's own storefront prices (THB for th, USD for us/kh/la) — no FX.
 *
 * `appStoreFetch(url, init)` is a drop-in for `fetch(url, init)` on an apps.apple.com/{cc}/app/...id{N}
 * product page: when the full list loads it returns a synthetic 200 HTML response whose In-App Purchases
 * section contains EVERY item (both the `text-pair` div markup and the embedded JSON `items_V3` shape),
 * so existing page parsers work unchanged. Header `x-appstore-source` = 'amp-api'. If the API fails or is
 * empty it falls back to the real page fetch (top 10 only), header 'appstore-page'.
 */

export const APPSTORE_IAP_API_BASE = 'https://apps.apple.com/api/apps/v1/catalog'
export const APPSTORE_SOURCE_HEADER = 'x-appstore-source'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const PAGE = 10
const MAX_PAGES = 100
const RETRIES_429 = 3
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export type AppStoreFullIapRow = { id: string; name: string; price: number; priceFormatted: string; currency: string }

export function parseAppStorePageUrl(url: string): { cc: string; id: string; l: string | null } | null {
  const m = url.match(/apps\.apple\.com\/([a-z]{2})\/app\/(?:[^/?#]+\/)?id(\d+)/i)
  if (!m) return null
  const l = url.match(/[?&]l=([A-Za-z-]+)/)
  return { cc: m[1].toLowerCase(), id: m[2], l: l ? l[1] : null }
}

/** Language for item names: match what the page scrape used (th-TH Accept-Language -> Thai names on th). */
export function pickLocale(cc: string, explicit: string | null, acceptLanguage?: string): string | null {
  if (explicit) return explicit === 'en' ? (cc === 'us' ? 'en-US' : 'en-GB') : explicit
  const lang = (acceptLanguage ?? '').toLowerCase()
  if (cc === 'th') return lang.startsWith('th') ? 'th' : 'en-GB'
  if (cc === 'us') return 'en-US'
  return null
}

export function parseTopInAppsPage(json: unknown): AppStoreFullIapRow[] | null {
  const data = (json as { data?: unknown })?.data
  if (!Array.isArray(data)) return null
  const out: AppStoreFullIapRow[] = []
  for (const d of data) {
    const a = (d as { attributes?: Record<string, unknown> })?.attributes
    const offer = Array.isArray(a?.offers) ? (a!.offers as Array<Record<string, unknown>>)[0] : undefined
    const name = typeof a?.name === 'string' ? a.name.replace(/\s+/g, ' ').trim() : ''
    if (!name || !offer || typeof offer.price !== 'number' || typeof offer.priceFormatted !== 'string') continue
    out.push({
      id: String((d as { id?: unknown }).id ?? ''),
      name,
      price: offer.price,
      priceFormatted: offer.priceFormatted,
      currency: typeof offer.currencyCode === 'string' ? offer.currencyCode : ''
    })
  }
  return out
}

async function getPage(cc: string, id: string, l: string | null, offset: number, signal?: AbortSignal) {
  const qs = `platform=iphone&limit=${PAGE}&offset=${offset}` + (l ? `&l=${encodeURIComponent(l)}` : '')
  let r: Response
  for (let attempt = 0; ; attempt++) {
    r = await fetch(`${APPSTORE_IAP_API_BASE}/${cc}/apps/${id}/top-in-apps?${qs}`, {
      signal: signal ?? AbortSignal.timeout(20_000),
      headers: { 'User-Agent': UA, Accept: 'application/json', Origin: 'https://apps.apple.com', Referer: 'https://apps.apple.com/' }
    })
    if (r.status !== 429 || attempt >= RETRIES_429) break
    const ra = Number(r.headers.get('retry-after'))
    await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 5) * 1000 : 800 * (attempt + 1))
  }
  if (!r.ok) throw new Error('App Store IAP API HTTP ' + r.status)
  const rows = parseTopInAppsPage(await r.json())
  if (!rows) throw new Error('App Store IAP API: bad shape')
  return rows
}

/** Every IAP of an app on one storefront, in Apple's order. Throws on API failure. */
export async function fetchAppStoreFullIap(
  cc: string,
  id: string,
  l: string | null,
  signal?: AbortSignal
): Promise<AppStoreFullIapRow[]> {
  const all: AppStoreFullIapRow[] = []
  // Sequential paging: Apple rate-limits (HTTP 429) bursts of parallel requests.
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await getPage(cc, id, l, page * PAGE, signal)
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  if (all.length === 0) throw new Error('App Store IAP API: empty list')
  return all
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Synthetic page HTML in both App Store page shapes so existing parsers read the full list. */
export function fullIapToPageHtml(rows: AppStoreFullIapRow[]): string {
  const pairs = rows.map((r) => `<div class="text-pair svelte-x"><span>${esc(r.name)}</span> <span>${esc(r.priceFormatted)}</span></div>`)
  const json = {
    data: [{ data: { shelfMapping: { information: { items: [{
      title: 'In-App Purchases',
      items: [{ textPairs: rows.map((r) => [r.name, r.priceFormatted]) }],
      items_V3: rows.map((r) => ({ $kind: 'textPair', leadingText: r.name, trailingText: r.priceFormatted }))
    }] } } } }]
  }
  return `<!DOCTYPE html><html><body><script type="application/json">${JSON.stringify(json).replace(/</g, '\\u003c')}</script>${pairs.join('\n')}</body></html>`
}

/**
 * Drop-in for fetch() on an App Store product page URL: full IAP list via the catalog API,
 * else the real page (top 10). Non-App-Store URLs pass straight through.
 */
export async function appStoreFetch(url: string, init?: RequestInit): Promise<Response> {
  const p = parseAppStorePageUrl(url)
  if (p) {
    const lang = new Headers(init?.headers).get('Accept-Language') ?? undefined
    try {
      const rows = await fetchAppStoreFullIap(p.cc, p.id, pickLocale(p.cc, p.l, lang), init?.signal ?? undefined)
      return new Response(fullIapToPageHtml(rows), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', [APPSTORE_SOURCE_HEADER]: 'amp-api' }
      })
    } catch {
      /* fall back to the page scrape */
    }
  }
  const r = await fetch(url, init)
  const headers = new Headers(r.headers)
  headers.set(APPSTORE_SOURCE_HEADER, 'appstore-page')
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers })
}

export const APPSTORE_FULL_IAP_NOTE =
  'App Store prices: full in-app purchase list from the App Store web catalog API (apps.apple.com/api/apps/v1/catalog/{cc}/apps/{id}/top-in-apps, paged); falls back to the product page (top 10 only) if that API fails.'

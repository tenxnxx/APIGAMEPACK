export type PacksCacheEntry = {
  expiresAt: number
  status: number
  body: unknown
}

const store = new Map<string, PacksCacheEntry>()

/** Default 3 minutes; override with PACKS_CACHE_TTL_MS. */
export const PACKS_CACHE_TTL_MS = Number(process.env.PACKS_CACHE_TTL_MS) || 3 * 60 * 1000

export function packsCacheKey(slug: string): string {
  return slug.toLowerCase()
}

export function getPacksCache(slug: string): PacksCacheEntry | null {
  const key = packsCacheKey(slug)
  const hit = store.get(key)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    store.delete(key)
    return null
  }
  return hit
}

export function setPacksCache(slug: string, status: number, body: unknown): void {
  if (status !== 200) return
  store.set(packsCacheKey(slug), {
    expiresAt: Date.now() + PACKS_CACHE_TTL_MS,
    status,
    body
  })
}

/** Test helper */
export function clearPacksCache(): void {
  store.clear()
}

export function matchPacksPath(
  pathname: string
): { slug: string } | null {
  const match = pathname.match(/^\/games\/([^/]+)\/packs\/?$/)
  if (!match) return null
  try {
    return { slug: decodeURIComponent(match[1]!) }
  } catch {
    return { slug: match[1]! }
  }
}

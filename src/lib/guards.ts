import type { TermgameUpstream } from '../types/rov'

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export const isTermgameUpstream = (value: unknown): value is TermgameUpstream => {
  if (
    !isRecord(value) ||
    !isRecord(value.app_info) ||
    !Array.isArray(value.channels)
  ) {
    return false
  }

  const appInfo = value.app_info
  if (
    !isFiniteNumber(appInfo.app_id) ||
    typeof appInfo.app_name !== 'string' ||
    typeof appInfo.point_name !== 'string' ||
    typeof appInfo.point_icon !== 'string'
  ) {
    return false
  }

  return value.channels.every((channel) => {
    if (
      !isRecord(channel) ||
      !isFiniteNumber(channel.channel) ||
      typeof channel.name !== 'string' ||
      typeof channel.visible !== 'boolean' ||
      !isFiniteNumber(channel.status) ||
      typeof channel.message !== 'string' ||
      !Array.isArray(channel.items)
    ) {
      return false
    }

    return channel.items.every(
      (item) =>
        isRecord(item) &&
        isFiniteNumber(item.id) &&
        isFiniteNumber(item.app_point_amount) &&
        isFiniteNumber(item.currency_amount) &&
        typeof item.currency === 'string' &&
        isRecord(item.promo) &&
        isFiniteNumber(item.promo.total_promo_amount)
    )
  })
}

/** @deprecated Prefer isTermgameUpstream; kept for compatibility */
export const isRovUpstream = isTermgameUpstream
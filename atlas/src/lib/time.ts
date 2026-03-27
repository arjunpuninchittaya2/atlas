export function formatRelativeTime(iso: string | null) {
  if (!iso) {
    return 'Never synced'
  }

  const input = new Date(iso).getTime()
  if (Number.isNaN(input)) {
    return 'Never synced'
  }

  const diffMs = Date.now() - input
  if (diffMs < 60_000) return 'Last synced just now'

  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return `Last synced ${minutes} minute${minutes === 1 ? '' : 's'} ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Last synced ${hours} hour${hours === 1 ? '' : 's'} ago`

  const days = Math.floor(hours / 24)
  return `Last synced ${days} day${days === 1 ? '' : 's'} ago`
}

const bytes = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** "1.2 MB" style sizes (1000-based, like file managers on Linux). */
export function formatBytes(size: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let value = size
  let unit = 0
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000
    unit++
  }
  return `${bytes.format(value)} ${units[unit]}`
}

export function formatDate(epochMs: number): string {
  return date.format(new Date(epochMs))
}

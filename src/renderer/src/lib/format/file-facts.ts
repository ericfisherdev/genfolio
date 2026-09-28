export { formatBytes } from '@shared/format-bytes'

const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function formatDate(epochMs: number): string {
  return date.format(new Date(epochMs))
}

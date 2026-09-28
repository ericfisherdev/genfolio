const FOOOCUS_NAME = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_\d+\./

/**
 * Local generation time encoded in a Fooocus output name (`YYYY-MM-DD_HH-MM-SS_NNNN.ext`),
 * or `undefined` when the name does not follow that pattern or the date is impossible.
 */
export function parseFooocusTimestamp(fileName: string): number | undefined {
  const match = FOOOCUS_NAME.exec(fileName)
  if (!match) return undefined
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number
  ]
  const date = new Date(year, month - 1, day, hour, minute, second)
  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === second
  return valid ? date.getTime() : undefined
}

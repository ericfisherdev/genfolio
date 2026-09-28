/**
 * `count` increasing positions strictly between `lower` and `upper` (either may be absent:
 * the start or the end of the album), or `undefined` when the gap has run out of floating-
 * point precision and the album must be renumbered.
 */
export function spreadPositions(
  lower: number | undefined,
  upper: number | undefined,
  count: number
): number[] | undefined {
  const steps = Array.from({ length: count }, (_, index) => index + 1)
  if (lower === undefined && upper === undefined) return steps
  if (lower === undefined) return steps.map((step) => (upper as number) - count - 1 + step)
  if (upper === undefined) return steps.map((step) => lower + step)
  const gap = (upper - lower) / (count + 1)
  const positions = steps.map((step) => lower + gap * step)
  const increasing = positions.every(
    (position, index) => position > (index === 0 ? lower : (positions[index - 1] as number))
  )
  return increasing && (positions.at(-1) as number) < upper ? positions : undefined
}

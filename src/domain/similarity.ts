/**
 * The `app_settings` key holding `'1'` while some image's group is out of date: a grouped
 * image changed or was deleted since the last regroup. Written by triggers, cleared by regroup.
 */
export const SIMILAR_GROUPS_STALE_KEY = 'similarity.groupsStale'

/** Two images whose hashes are `distance` bits apart (a < b). */
export interface SimilarPair {
  readonly a: number
  readonly b: number
  readonly distance: number
}

/** A 64-bit hash as two 32-bit halves, so many can be compared fast in typed arrays. */
export interface SplitHash {
  readonly hi: number
  readonly lo: number
}

export function splitHash(hash: bigint): SplitHash {
  const unsigned = BigInt.asUintN(64, hash)
  return { hi: Number(unsigned >> 32n), lo: Number(unsigned & 0xffffffffn) }
}

/** Set bits in a 32-bit value (SWAR). */
export function popcount32(value: number): number {
  let v = value - ((value >>> 1) & 0x55555555)
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333)
  return (Math.imul((v + (v >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24) & 0xff
}

/**
 * Groups images linked by pairs at or below `threshold`, closest pairs first. Two groups merge
 * only while their representatives (each group's smallest id) are themselves within the
 * threshold, so a chain of small steps (A~B~C with A and C far apart) can't grow one
 * sprawling group. Returns each grouped image's group id (its representative); images
 * without a close enough partner are left out.
 */
export function groupSimilar(
  pairs: readonly SimilarPair[],
  threshold: number
): Map<number, number> {
  const close = pairs
    .filter((pair) => pair.distance <= threshold)
    .sort((x, y) => x.distance - y.distance || x.a - y.a || x.b - y.b)
  const distances = new Map(close.map((pair) => [key(pair.a, pair.b), pair.distance]))
  const parent = new Map<number, number>()
  const find = (id: number): number => {
    let root = id
    while ((parent.get(root) ?? root) !== root) root = parent.get(root) ?? root
    // Path compression.
    let node = id
    while (node !== root) {
      const next = parent.get(node) ?? root
      parent.set(node, root)
      node = next
    }
    return root
  }
  for (const pair of close) {
    if (!parent.has(pair.a)) parent.set(pair.a, pair.a)
    if (!parent.has(pair.b)) parent.set(pair.b, pair.b)
    const [x, y] = [find(pair.a), find(pair.b)]
    if (x === y) continue
    const [low, high] = x < y ? [x, y] : [y, x]
    // Anti-chaining: the representatives must be within the threshold of each other.
    if (low !== pair.a || high !== pair.b) {
      const between = distances.get(key(low, high))
      if (between === undefined) continue
    }
    parent.set(high, low)
  }
  const roots = new Map<number, number>()
  const sizes = new Map<number, number>()
  for (const id of parent.keys()) {
    const root = find(id)
    roots.set(id, root)
    sizes.set(root, (sizes.get(root) ?? 0) + 1)
  }
  // An image whose pairs were all refused by the guard is on its own, not in a group.
  return new Map([...roots].filter(([, root]) => (sizes.get(root) ?? 0) > 1))
}

const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`)

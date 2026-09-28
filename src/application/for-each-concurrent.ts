/**
 * Runs `task` over `items` with at most `limit` in flight, starting items in input order.
 * Checks `signal` before starting each item. The first rejection (or abort) rejects the run
 * and no further items start; tasks already in flight finish on their own.
 */
export async function forEachConcurrent<T>(
  items: readonly T[],
  limit: number,
  signal: AbortSignal,
  task: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  let failed = false
  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      signal.throwIfAborted()
      try {
        await task(items[next++] as T)
      } catch (error) {
        failed = true
        throw error
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

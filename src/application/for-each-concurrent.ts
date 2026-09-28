/**
 * Runs `task` over `items` with at most `limit` in flight, starting items in input order.
 * Checks `signal` before starting each item; the first rejection (or abort) rejects the run.
 */
export async function forEachConcurrent<T>(
  items: readonly T[],
  limit: number,
  signal: AbortSignal,
  task: (item: T) => Promise<void>
): Promise<void> {
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      signal.throwIfAborted()
      await task(items[next++] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

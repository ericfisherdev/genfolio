/**
 * Sizing of the library service's libuv thread pool, which runs `@napi-rs/image` decode,
 * resize and encode work as well as file I/O. Node reads `UV_THREADPOOL_SIZE` from the
 * environment when the pool first starts, so the size is decided when the service is forked.
 */

/** libuv's own default. */
export const DEFAULT_THREAD_POOL_SIZE = 4

/** Beyond this, more threads mostly contend for memory bandwidth on image decodes. */
export const MAX_THREAD_POOL_SIZE = 16

export const THREAD_POOL_SIZE_VARIABLE = 'UV_THREADPOOL_SIZE'

/** The pool size for a machine with `parallelism` hardware threads. */
export function threadPoolSizeFor(parallelism: number): number {
  if (!Number.isFinite(parallelism)) return DEFAULT_THREAD_POOL_SIZE
  return Math.min(MAX_THREAD_POOL_SIZE, Math.max(DEFAULT_THREAD_POOL_SIZE, Math.trunc(parallelism)))
}

/** The size the running process's pool has, from its environment; libuv's default otherwise. */
export function threadPoolSizeFromEnv(env: Readonly<Record<string, string | undefined>>): number {
  const value = Number(env[THREAD_POOL_SIZE_VARIABLE])
  return Number.isInteger(value) && value > 0 ? value : DEFAULT_THREAD_POOL_SIZE
}

export interface ImageWorkConcurrency {
  /** Grid renditions made at once; they answer requests the user is waiting on. */
  readonly displayCopies: number
  /** Hashing runs in the background and leaves room for renditions and file I/O. */
  readonly hashing: number
}

/** How much of a pool of `poolSize` threads each kind of image work may take at once. */
export function imageWorkConcurrency(poolSize: number): ImageWorkConcurrency {
  return {
    displayCopies: Math.max(4, Math.floor(poolSize / 2)),
    hashing: Math.max(2, Math.floor(poolSize / 4))
  }
}

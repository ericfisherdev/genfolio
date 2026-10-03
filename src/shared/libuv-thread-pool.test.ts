import { describe, expect, it } from 'vitest'
import { imageWorkConcurrency, threadPoolSizeFor, threadPoolSizeFromEnv } from './libuv-thread-pool'

describe('threadPoolSizeFor', () => {
  it('follows the hardware threads between libuv’s default and the cap', () => {
    expect(threadPoolSizeFor(2)).toBe(4)
    expect(threadPoolSizeFor(4)).toBe(4)
    expect(threadPoolSizeFor(8)).toBe(8)
    expect(threadPoolSizeFor(16)).toBe(16)
    expect(threadPoolSizeFor(64)).toBe(16)
    expect(threadPoolSizeFor(Number.NaN)).toBe(4)
  })
})

describe('threadPoolSizeFromEnv', () => {
  it('reads UV_THREADPOOL_SIZE and falls back to the default', () => {
    expect(threadPoolSizeFromEnv({ UV_THREADPOOL_SIZE: '12' })).toBe(12)
    expect(threadPoolSizeFromEnv({})).toBe(4)
    expect(threadPoolSizeFromEnv({ UV_THREADPOOL_SIZE: 'lots' })).toBe(4)
    expect(threadPoolSizeFromEnv({ UV_THREADPOOL_SIZE: '0' })).toBe(4)
  })
})

describe('imageWorkConcurrency', () => {
  it('keeps today’s limits on a 4-thread pool and scales with larger pools', () => {
    expect(imageWorkConcurrency(4)).toEqual({ displayCopies: 4, hashing: 2 })
    expect(imageWorkConcurrency(8)).toEqual({ displayCopies: 4, hashing: 2 })
    expect(imageWorkConcurrency(16)).toEqual({ displayCopies: 8, hashing: 4 })
  })
})

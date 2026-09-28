import { describe, expect, it } from 'vitest'
import { ByteLruCache } from './byte-lru-cache'

const bytes = (n: number): Uint8Array<ArrayBuffer> => new Uint8Array(n)

describe('ByteLruCache', () => {
  it('evicts least recently used entries to stay within the byte budget', () => {
    const cache = new ByteLruCache<string>(10)
    cache.set('a', bytes(4))
    cache.set('b', bytes(4))
    cache.get('a')
    cache.set('c', bytes(4))
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBeDefined()
    expect(cache.get('c')).toBeDefined()
    expect(cache.bytes).toBe(8)
  })

  it('replaces an existing key without double counting and skips oversized values', () => {
    const cache = new ByteLruCache<string>(10)
    cache.set('a', bytes(4))
    cache.set('a', bytes(6))
    expect(cache.bytes).toBe(6)
    cache.set('huge', bytes(11))
    expect(cache.get('huge')).toBeUndefined()
    expect(cache.size).toBe(1)
  })
})

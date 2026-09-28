/** Least-recently-used cache bounded by the total byte size of its values. */
export class ByteLruCache<K> {
  private readonly entries = new Map<K, Uint8Array<ArrayBuffer>>()
  private totalBytes = 0

  constructor(private readonly maxBytes: number) {}

  get(key: K): Uint8Array<ArrayBuffer> | undefined {
    const value = this.entries.get(key)
    if (value === undefined) return undefined
    this.entries.delete(key)
    this.entries.set(key, value)
    return value
  }

  /** Values larger than the whole budget are not cached. */
  set(key: K, value: Uint8Array<ArrayBuffer>): void {
    this.delete(key)
    if (value.byteLength > this.maxBytes) return
    this.entries.set(key, value)
    this.totalBytes += value.byteLength
    for (const [oldest, oldValue] of this.entries) {
      if (this.totalBytes <= this.maxBytes) break
      this.entries.delete(oldest)
      this.totalBytes -= oldValue.byteLength
    }
  }

  get size(): number {
    return this.entries.size
  }

  get bytes(): number {
    return this.totalBytes
  }

  private delete(key: K): void {
    const existing = this.entries.get(key)
    if (existing === undefined) return
    this.entries.delete(key)
    this.totalBytes -= existing.byteLength
  }
}

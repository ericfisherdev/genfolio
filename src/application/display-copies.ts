import type { ImageResizer } from '@domain/image-resizer'
import type { ImageId } from '@domain/library'
import type { ByteLruCache } from './byte-lru-cache'
import type { ConcurrencyLimiter } from './concurrency-limiter'
import type { ImageFileResolver } from './image-file-resolver'

/**
 * Downscaled display copies of large images, made on demand and kept only in memory.
 * Cached per image, width and mtime, so a changed file never serves a stale copy.
 */
export class DisplayCopies {
  constructor(
    private readonly files: ImageFileResolver,
    private readonly resizer: ImageResizer,
    private readonly cache: ByteLruCache<string>,
    private readonly limiter: ConcurrencyLimiter
  ) {}

  /** Resolves `null` when the image is unknown or its file is missing or outside its root. */
  async render(imageId: ImageId, maxWidth: number): Promise<Uint8Array<ArrayBuffer> | null> {
    const file = await this.files.resolve(imageId)
    if (!file) return null
    const key = `${imageId}:${maxWidth}:${file.mtimeMs}`
    const cached = this.cache.get(key)
    if (cached) return cached
    const copy = await this.limiter.run(() => this.resizer.resizeToWebp(file.path, maxWidth))
    this.cache.set(key, copy)
    return copy
  }
}

import type { ImageResizer } from '@domain/image-resizer'
import type { ImageId } from '@domain/library'
import type { ByteLruCache } from './byte-lru-cache'
import type { ConcurrencyLimiter } from './concurrency-limiter'
import type { ImageFileResolver } from './image-file-resolver'

/**
 * Downscaled display copies of large images, made on demand and kept only in memory.
 * Cached per image, width and the file's current mtime, so an edited file never serves a
 * stale copy.
 */
export class DisplayCopies {
  constructor(
    private readonly files: Pick<ImageFileResolver, 'open'>,
    private readonly resizer: ImageResizer,
    private readonly cache: ByteLruCache<string>,
    private readonly limiter: ConcurrencyLimiter
  ) {}

  /** Resolves `null` when the image is unknown or its file is missing or outside its root. */
  async render(imageId: ImageId, maxWidth: number): Promise<Uint8Array<ArrayBuffer> | null> {
    const file = await this.files.open(imageId)
    if (!file) return null
    let source: Uint8Array
    const key = `${imageId}:${maxWidth}:${file.mtimeMs}`
    try {
      const cached = this.cache.get(key)
      if (cached) return cached
      source = await file.handle.readFile()
    } finally {
      await file.handle.close()
    }
    const copy = await this.limiter.run(() => this.resizer.resizeToWebp(source, maxWidth))
    this.cache.set(key, copy)
    return copy
  }
}

import type { ImageResizer } from '@domain/image-resizer'
import type { ImageId } from '@domain/library'
import type { ByteLruCache } from './byte-lru-cache'
import type { ConcurrencyLimiter } from './concurrency-limiter'
import type { ImageFileResolver, OpenImageFile } from './image-file-resolver'

type Copy = Uint8Array<ArrayBuffer>

/**
 * Downscaled WebP renditions of images for the grid, made on demand and kept only in
 * memory. Cached per image, width and the file's current mtime, so an edited file never
 * serves a stale copy. Concurrent requests for one rendition share a single read and
 * resize, and the file is read only once a resize slot is free, so no more originals sit in
 * memory than can be worked on.
 */
export class DisplayCopies {
  private readonly inFlight = new Map<string, Promise<Copy>>()

  constructor(
    private readonly files: Pick<ImageFileResolver, 'open'>,
    private readonly resizer: ImageResizer,
    private readonly cache: ByteLruCache<string>,
    private readonly limiter: ConcurrencyLimiter
  ) {}

  /** Resolves `null` when the image is unknown or its file is missing or outside its root. */
  async render(imageId: ImageId, maxWidth: number): Promise<Copy | null> {
    const file = await this.files.open(imageId)
    if (!file) return null
    const key = `${imageId}:${maxWidth}:${file.mtimeMs}`
    const ready = this.cache.get(key) ?? this.inFlight.get(key)
    if (ready) {
      await file.handle.close()
      return ready
    }
    const making = this.make(file, maxWidth, key).finally(() => this.inFlight.delete(key))
    this.inFlight.set(key, making)
    return making
  }

  private async make(file: OpenImageFile, maxWidth: number, key: string): Promise<Copy> {
    const copy = await this.limiter.run(async () => {
      let source: Uint8Array
      try {
        source = await file.handle.readFile()
      } finally {
        await file.handle.close()
      }
      return this.resizer.resizeToWebp(source, maxWidth)
    })
    this.cache.set(key, copy)
    return copy
  }
}

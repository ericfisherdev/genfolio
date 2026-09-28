import type { ImageHasher, ImageHashes } from '@domain/image-hashes'
import type { ImageId } from '@domain/library'
import { HASH_VERSION } from '@domain/perceptual-hash'
import type { ImageHashRepository, ImageVersion } from '@domain/repositories'
import type { TransactionRunner } from '@domain/transactions'
import { forEachConcurrent } from './for-each-concurrent'
import type { ImageFileResolver } from './image-file-resolver'

export interface HashIndexerOptions {
  readonly batchSize: number
  readonly concurrency: number
}

export const DEFAULT_HASH_OPTIONS: HashIndexerOptions = { batchSize: 200, concurrency: 4 }

/**
 * Hashes every image not yet hashed at HASH_VERSION: reads the verified file once, then
 * stores its SHA-256, dHash and pHash, in batches, each in one transaction. A file that
 * can't be read or decoded is stored without hashes so it isn't retried until it changes.
 * Rejects with the signal's reason when aborted, or with a database error.
 */
export class HashIndexer {
  constructor(
    private readonly hashes: ImageHashRepository,
    private readonly files: Pick<ImageFileResolver, 'open'>,
    private readonly hasher: ImageHasher,
    private readonly transactions: TransactionRunner,
    private readonly options: HashIndexerOptions = DEFAULT_HASH_OPTIONS
  ) {}

  /** Resolves the ids hashed (with or without hashes) in this pass. */
  async run(
    signal: AbortSignal,
    onProgress: (done: number, total: number) => void
  ): Promise<ImageId[]> {
    const total = this.hashes.pendingCount(HASH_VERSION)
    const hashed: ImageId[] = []
    let processed = 0
    let afterId = 0
    onProgress(0, total)
    for (;;) {
      signal.throwIfAborted()
      const batch = this.hashes.pending(HASH_VERSION, afterId, this.options.batchSize)
      if (batch.length === 0) break
      afterId = batch.at(-1)?.id ?? afterId
      const results = new Map<ImageVersion, ImageHashes | null>()
      await forEachConcurrent(batch, this.options.concurrency, signal, async (version) => {
        results.set(version, await this.hashOf(version.id))
      })
      signal.throwIfAborted()
      this.transactions.run(() => {
        for (const version of batch) {
          const result = results.get(version) ?? null
          if (this.hashes.store(version, result, HASH_VERSION)) hashed.push(version.id)
        }
      })
      // Images changed or added meanwhile can make the pass longer than first counted.
      processed += batch.length
      onProgress(processed, Math.max(total, processed))
    }
    const end = Math.max(total, processed)
    onProgress(end, end)
    return hashed
  }

  private async hashOf(imageId: ImageId): Promise<ImageHashes | null> {
    const file = await this.files.open(imageId)
    if (!file) return null
    let bytes: Uint8Array
    try {
      bytes = await file.handle.readFile()
    } catch {
      return null
    } finally {
      await file.handle.close()
    }
    try {
      return await this.hasher.hash(bytes)
    } catch {
      return null
    }
  }
}

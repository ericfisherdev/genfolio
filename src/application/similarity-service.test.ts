import { beforeEach, describe, expect, it } from 'vitest'
import type { ImageId } from '@domain/library'
import { createImageSelector } from '@infrastructure/db/search/create-image-selector'
import { SqliteSimilarityRepository } from '@infrastructure/db/repositories/sqlite-similarity-repository'
import { SqliteGalleryReader } from '@infrastructure/db/sqlite-gallery-reader'
import { searchLibrary, type SearchLibrary } from '@infrastructure/db/testing/search-library'
import { DEFAULT_SIMILARITY_THRESHOLD } from '@shared/similarity-kinds'
import { SimilarityService } from './similarity-service'

let library: SearchLibrary
let similarity: SimilarityService
const image = (n: number): ImageId => library.ids.get(n) ?? (0 as ImageId)

/** Sets an image's hashes: `bits` low bits set in both, so distances are easy to read. */
function hash(n: number, bits: number, sha = n): void {
  const pattern = (1n << BigInt(bits)) - 1n
  library.db
    .prepare(
      'UPDATE images SET dhash = ?, phash = ?, content_sha256 = ?, hash_version = 1 WHERE id = ?'
    )
    .run(pattern, pattern, Buffer.alloc(32, sha), image(n))
}

const groupOf = (n: number): number | null =>
  library.db.prepare('SELECT similar_group_id FROM images WHERE id = ?').pluck().get(image(n)) as
    number | null

const pairs = (): unknown[] =>
  library.db.prepare('SELECT a_id, b_id, distance FROM similar_pairs ORDER BY a_id, b_id').all()

beforeEach(() => {
  library = searchLibrary()
  similarity = new SimilarityService(
    new SqliteSimilarityRepository(library.db),
    async () => undefined
  )
})

describe('SimilarityService', () => {
  it('stores pairs within the maximum distance and groups at the threshold', async () => {
    hash(1, 0)
    hash(2, 3) // 3 from 1
    hash(3, 20) // 20 from 1, 17 from 2: too far to store
    hash(4, 3, 2) // same bytes as 2
    await similarity.index([1, 2, 3, 4].map(image))
    expect(pairs()).toEqual([
      { a_id: image(1), b_id: image(2), distance: 3 },
      { a_id: image(1), b_id: image(4), distance: 3 },
      { a_id: image(2), b_id: image(4), distance: 0 }
    ])
    expect([1, 2, 4].map(groupOf)).toEqual([image(1), image(1), image(1)])
    expect(groupOf(3)).toBeNull()
  })

  it('regroups when the threshold changes and remembers it', async () => {
    hash(1, 0)
    hash(2, 8)
    await similarity.index([image(1), image(2)])
    expect(similarity.threshold()).toBe(DEFAULT_SIMILARITY_THRESHOLD)
    expect(groupOf(2)).toBe(image(1))
    similarity.setThreshold(4)
    expect(groupOf(2)).toBeNull()
    expect(
      new SimilarityService(
        new SqliteSimilarityRepository(library.db),
        async () => undefined
      ).threshold()
    ).toBe(4)
  })

  it('counts the other members on each card', async () => {
    hash(1, 0)
    hash(2, 1)
    hash(3, 2)
    await similarity.index([1, 2, 3].map(image))
    const cards = new SqliteGalleryReader(library.db, createImageSelector(library.db)).images(
      [1, 2, 5].map(image)
    )
    expect(cards.map((card) => [card.similarGroupId, card.similarCount])).toEqual([
      [image(1), 2],
      [image(1), 2],
      [null, 0]
    ])
  })

  it('replaces the pairs of re-hashed images and computes all pairs once per hashing version', async () => {
    hash(1, 0)
    hash(2, 2)
    await similarity.ensureCurrent()
    expect(pairs()).toHaveLength(1)
    hash(2, 30)
    await similarity.index([image(2)])
    expect(pairs()).toEqual([])
    hash(2, 2)
    await similarity.ensureCurrent()
    expect(pairs()).toEqual([])
  })

  it('lists groups largest first with the keeper (most pixels) first', async () => {
    hash(1, 0)
    hash(2, 1)
    hash(3, 2)
    hash(5, 30)
    hash(6, 31)
    library.db.prepare('UPDATE images SET width = 20 WHERE id = ?').run(image(3))
    await similarity.index([1, 2, 3, 5, 6].map(image))
    expect(similarity.groups(0, 10)).toEqual({
      total: 2,
      groups: [
        { groupId: image(1), count: 3, imageIds: [image(3), image(1), image(2)] },
        { groupId: image(5), count: 2, imageIds: [image(5), image(6)] }
      ]
    })
    expect(similarity.groups(1, 10).groups.map((group) => group.groupId)).toEqual([image(5)])
  })
})

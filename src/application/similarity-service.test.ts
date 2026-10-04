import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DirectoryId, ImageId } from '@domain/library'
import { createImageSelector } from '@infrastructure/db/search/create-image-selector'
import { SqliteImageRepository } from '@infrastructure/db/repositories/sqlite-image-repository'
import { SqliteSimilarityRepository } from '@infrastructure/db/repositories/sqlite-similarity-repository'
import { SqliteGalleryReader } from '@infrastructure/db/sqlite-gallery-reader'
import { searchLibrary, type SearchLibrary } from '@infrastructure/db/testing/search-library'
import type { ImageFormat } from '@shared/image-format'
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

  it('does not regroup when comparing found and removed no pairs', async () => {
    hash(1, 0)
    hash(2, 30)
    similarity.regroup() // a new database starts with its groups marked out of date
    const writeGroups = vi.spyOn(SqliteSimilarityRepository.prototype, 'writeGroups')
    await similarity.index([image(1), image(2)])
    expect(pairs()).toEqual([])
    expect(writeGroups).not.toHaveBeenCalled()
  })

  it('regroups when comparing replaces pairs that existed', async () => {
    hash(1, 0)
    hash(2, 2)
    await similarity.index([image(1), image(2)])
    expect(groupOf(2)).toBe(image(1))
    hash(2, 30)
    await similarity.index([image(2)])
    expect(groupOf(1)).toBeNull()
    expect(groupOf(2)).toBeNull()
  })

  it('regroups when a grouped image was deleted, and only then', async () => {
    hash(1, 0)
    hash(2, 2)
    hash(3, 40)
    await similarity.index([1, 2, 3].map(image))
    const writeGroups = vi.spyOn(SqliteSimilarityRepository.prototype, 'writeGroups')

    similarity.regroupIfStale()
    expect(writeGroups).not.toHaveBeenCalled()

    library.db.prepare('DELETE FROM images WHERE id = ?').run(image(3))
    similarity.regroupIfStale()
    expect(writeGroups).not.toHaveBeenCalled()

    library.db.prepare('DELETE FROM images WHERE id = ?').run(image(2))
    similarity.regroupIfStale()
    expect(writeGroups).toHaveBeenCalledTimes(1)
    expect(groupOf(1)).toBeNull()

    similarity.regroupIfStale()
    expect(writeGroups).toHaveBeenCalledTimes(1)
  })

  it('regroups when a grouped image was deleted by cascade with its folder', async () => {
    hash(1, 0)
    hash(2, 2)
    await similarity.index([1, 2].map(image))
    library.db.exec('DELETE FROM library_roots')
    similarity.regroupIfStale()
    expect(library.db.prepare('SELECT COUNT(*) FROM images').pluck().get()).toBe(0)
    expect(similarity.groups(0, 10)).toEqual({ total: 0, groups: [] })
  })

  it('heals the groups of a scan that stopped after storing a changed image', async () => {
    hash(1, 0)
    hash(2, 2)
    await similarity.index([1, 2].map(image))
    expect(groupOf(1)).toBe(image(1))
    // A scan stored image 2 as changed (its pairs and hashes reset) and stopped before the
    // scan finished, so nothing regrouped; image 1 still points at a group of one.
    const row = library.db
      .prepare(
        `SELECT directory_id, file_name, format, size_bytes, mtime_ms, width, height, created_at
         FROM images WHERE id = ?`
      )
      .get(image(2)) as Record<string, number | string>
    new SqliteImageRepository(library.db).upsertMany(
      [
        {
          directoryId: row['directory_id'] as DirectoryId,
          fileName: row['file_name'] as string,
          format: row['format'] as ImageFormat,
          sizeBytes: row['size_bytes'] as number,
          mtimeMs: (row['mtime_ms'] as number) + 1,
          width: row['width'] as number,
          height: row['height'] as number,
          createdAt: row['created_at'] as number
        }
      ],
      1
    )
    expect(pairs()).toEqual([])
    expect(groupOf(1)).toBe(image(1))

    hash(2, 40)
    await similarity.index([image(2)])

    expect(groupOf(1)).toBeNull()
    expect(groupOf(2)).toBeNull()
  })

  it('rewrites only the images whose group changed', async () => {
    hash(1, 0)
    hash(2, 2)
    hash(3, 4)
    hash(4, 40)
    hash(5, 42)
    await similarity.index([1, 2, 3, 4, 5].map(image))
    const before = new Map([1, 2, 3, 4, 5].map((n) => [n, groupOf(n)]))
    const updates: string[] = []
    library.db.function('record_group_write', (id: number) => {
      updates.push(String(id))
      return 0
    })
    library.db.exec(
      `CREATE TEMP TRIGGER group_writes AFTER UPDATE OF similar_group_id ON images
       BEGIN SELECT record_group_write(NEW.id); END`
    )

    similarity.regroup()
    expect(updates).toEqual([])

    similarity.setThreshold(3)
    expect([1, 2, 3, 4, 5].map(groupOf)).toEqual(
      [...before.values()].map((g, i) => (i === 2 ? null : g))
    )
    expect(updates).toEqual([String(image(3))])
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

  it('lists every member of a group with the keeper first: most pixels, largest, oldest', async () => {
    hash(1, 0)
    hash(2, 1)
    hash(3, 2)
    library.db.prepare('UPDATE images SET size_bytes = 5 WHERE id = ?').run(image(2))
    await similarity.index([1, 2, 3].map(image))
    expect(similarity.members(image(1))).toEqual([image(2), image(1), image(3)])
    library.db.prepare('UPDATE images SET width = 30 WHERE id = ?').run(image(3))
    expect(similarity.members(image(1))[0]).toBe(image(3))
    expect(similarity.members(999)).toEqual([])
  })
})

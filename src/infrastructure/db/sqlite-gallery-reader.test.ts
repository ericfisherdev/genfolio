import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import type { DirectoryId, ImageFile, LibraryRoot, RootId } from '@domain/library'
import { GalleryScopeKind, SortOrder, type GalleryQuery } from '@shared/gallery'
import { ImageFormat } from '@shared/image-format'
import { SqliteDirectoryRepository } from './repositories/sqlite-directory-repository'
import { SqliteImageRepository } from './repositories/sqlite-image-repository'
import { SqliteLibraryRootRepository } from './repositories/sqlite-library-root-repository'
import { SqliteGalleryReader } from './sqlite-gallery-reader'
import { migratedMemoryDb } from './testing/migrated-memory-db'

let db: Database.Database
let root: LibraryRoot
let directories: SqliteDirectoryRepository
let images: SqliteImageRepository
let reader: SqliteGalleryReader
const dirIds = new Map<string, DirectoryId>()

function add(relDir: string, fileName: string, createdAt: number, addedAt: number): void {
  let directoryId = dirIds.get(relDir)
  if (directoryId === undefined) {
    directoryId = directories.ensure(root.id, relDir)
    dirIds.set(relDir, directoryId)
  }
  const image: ImageFile = {
    directoryId,
    fileName,
    format: ImageFormat.Png,
    sizeBytes: 100,
    mtimeMs: createdAt,
    width: 800 + fileName.length,
    height: 1200,
    createdAt
  }
  images.upsertMany([image], addedAt)
}

/** File names in layout order, resolved through the cards. */
function namesFor(query: GalleryQuery): string[] {
  const layout = reader.layout(query)
  const ids = Array.from(layout.filter((_, index) => index % 3 === 0))
  const names = new Map(reader.images(ids).map((card) => [card.id, card.fileName]))
  return ids.map((id) => names.get(id) as string)
}

const all = (sort: SortOrder): GalleryQuery => ({ scope: { kind: GalleryScopeKind.All }, sort })

beforeEach(() => {
  db = migratedMemoryDb()
  root = new SqliteLibraryRootRepository(db).add('/lib', 1)
  directories = new SqliteDirectoryRepository(db)
  images = new SqliteImageRepository(db)
  reader = new SqliteGalleryReader(db)
  dirIds.clear()
  // insertion order = id order
  add('', 'top.png', 300, 10)
  add('a', 'b-first.png', 100, 30)
  add('a/b', 'deep.png', 200, 20)
  add('a/b', 'same-time.png', 200, 40)
  add('c', 'c.png', 400, 5)
  directories.ensure(root.id, 'empty/deeper')
})

describe('SqliteGalleryReader.layout', () => {
  it('returns [id, width, height] triples', () => {
    const layout = reader.layout(all(SortOrder.Oldest))
    expect(layout).toBeInstanceOf(Int32Array)
    expect(layout.length).toBe(5 * 3)
    const [card] = reader.images([layout[0] as number])
    expect([layout[1], layout[2]]).toEqual([card?.width, card?.height])
  })

  it.each([
    [SortOrder.Newest, ['c.png', 'top.png', 'same-time.png', 'deep.png', 'b-first.png']],
    [SortOrder.Oldest, ['b-first.png', 'deep.png', 'same-time.png', 'top.png', 'c.png']],
    [SortOrder.RecentlyAdded, ['same-time.png', 'b-first.png', 'deep.png', 'top.png', 'c.png']],
    [SortOrder.FileName, ['b-first.png', 'c.png', 'deep.png', 'same-time.png', 'top.png']]
  ])('orders by %s, breaking ties by id', (sort, expected) => {
    expect(namesFor(all(sort))).toEqual(expected)
  })

  it('limits a directory scope to that folder, or its whole subtree when recursive', () => {
    const scope = (recursive: boolean): GalleryQuery => ({
      scope: {
        kind: GalleryScopeKind.Directory,
        directoryId: dirIds.get('a') as number,
        recursive
      },
      sort: SortOrder.Oldest
    })
    expect(namesFor(scope(false))).toEqual(['b-first.png'])
    expect(namesFor(scope(true))).toEqual(['b-first.png', 'deep.png', 'same-time.png'])
  })

  it('returns an empty layout for an unknown directory', () => {
    const query: GalleryQuery = {
      scope: { kind: GalleryScopeKind.Directory, directoryId: 9_999, recursive: true },
      sort: SortOrder.Newest
    }
    expect(reader.layout(query).length).toBe(0)
  })
})

describe('SqliteGalleryReader.images', () => {
  it('returns cards with folder and root, ignoring unknown ids', () => {
    const [id] = reader.layout(all(SortOrder.Oldest))
    const cards = reader.images([id as number, 12_345])
    expect(cards).toEqual([
      expect.objectContaining({
        id,
        rootId: root.id,
        fileName: 'b-first.png',
        relDir: 'a',
        format: ImageFormat.Png,
        sizeBytes: 100,
        createdAt: 100,
        addedAt: 30
      })
    ])
  })
})

describe('SqliteGalleryReader.directoryTree', () => {
  it('counts direct and total images and omits folders with none below them', () => {
    const tree = reader.directoryTree(root.id)
    expect(tree).toMatchObject({ relPath: '', name: '', imageCount: 1, totalImageCount: 5 })
    const summary = (node: NonNullable<typeof tree>): unknown => ({
      name: node.name,
      own: node.imageCount,
      total: node.totalImageCount,
      children: node.children.map(summary)
    })
    expect(summary(tree as NonNullable<typeof tree>)).toEqual({
      name: '',
      own: 1,
      total: 5,
      children: [
        {
          name: 'a',
          own: 1,
          total: 3,
          children: [{ name: 'b', own: 2, total: 2, children: [] }]
        },
        { name: 'c', own: 1, total: 1, children: [] }
      ]
    })
  })

  it('returns undefined for an unknown root', () => {
    expect(reader.directoryTree(999 as RootId)).toBeUndefined()
  })
})

describe.skipIf(process.env['GENFOLIO_PERF'] !== '1')('SqliteGalleryReader performance', () => {
  it('builds the layout for 110k images in under 150 ms', () => {
    const directoryId = directories.ensure(root.id, 'bulk')
    const batch: ImageFile[] = Array.from({ length: 110_000 }, (_, i) => ({
      directoryId,
      fileName: `${i}.png`,
      format: ImageFormat.Png,
      sizeBytes: 1,
      mtimeMs: i,
      width: 832,
      height: 1216,
      createdAt: i
    }))
    images.upsertMany(batch, 1)
    for (const sort of Object.values(SortOrder)) {
      const started = performance.now()
      const layout = reader.layout(all(sort))
      const elapsed = performance.now() - started
      console.info(`[perf] layout ${sort}: ${elapsed.toFixed(1)} ms`)
      expect(layout.length).toBe((110_000 + 5) * 3)
      expect(elapsed).toBeLessThan(150)
    }
  }, 60_000)
})

import BetterSqlite from 'better-sqlite3'
import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import type { ImageId } from '@domain/library'
import { ImageFormat } from '@shared/image-format'
import { LazyImageLocator } from './lazy-image-locator'
import { SqliteDirectoryRepository } from './repositories/sqlite-directory-repository'
import { SqliteImageRepository } from './repositories/sqlite-image-repository'
import { SqliteLibraryRootRepository } from './repositories/sqlite-library-root-repository'
import { SqliteImageLocator } from './sqlite-image-locator'
import { migratedMemoryDb } from './testing/migrated-memory-db'

function libraryWithOneImage(): { db: Database.Database; id: ImageId } {
  const db = migratedMemoryDb()
  const root = new SqliteLibraryRootRepository(db).add('/lib', 1)
  const directoryId = new SqliteDirectoryRepository(db).ensure(root.id, '2026/09')
  new SqliteImageRepository(db).upsertMany(
    [
      {
        directoryId,
        fileName: 'a.png',
        format: ImageFormat.Png,
        sizeBytes: 1,
        mtimeMs: 77,
        width: 832,
        height: 1216,
        createdAt: 1
      }
    ],
    1
  )
  const id = (db.prepare('SELECT id FROM images').get() as { id: number }).id as ImageId
  return { db, id }
}

describe('SqliteImageLocator', () => {
  it('locates an image by id with its root, folder and dimensions', () => {
    const { db, id } = libraryWithOneImage()
    expect(new SqliteImageLocator(db).locate(id)).toEqual({
      rootPath: '/lib',
      relDir: '2026/09',
      fileName: 'a.png',
      width: 832,
      height: 1216,
      mtimeMs: 77
    })
    expect(new SqliteImageLocator(db).locate(999 as ImageId)).toBeUndefined()
  })
})

describe('LazyImageLocator', () => {
  it('treats every image as unknown until the database opens, then connects once', () => {
    const { db, id } = libraryWithOneImage()
    let attempts = 0
    const locator = new LazyImageLocator(() => {
      attempts++
      if (attempts === 1) throw new Error('SQLITE_CANTOPEN')
      return db
    })
    expect(locator.locate(id)).toBeUndefined()
    expect(locator.locate(id)?.fileName).toBe('a.png')
    locator.locate(id)
    expect(attempts).toBe(2)
  })

  it('closes a connection whose schema is not ready yet before retrying', () => {
    const opened: Database.Database[] = []
    const locator = new LazyImageLocator(() => {
      const db = new BetterSqlite(':memory:')
      opened.push(db)
      return db
    })
    expect(locator.locate(1 as ImageId)).toBeUndefined()
    expect(locator.locate(1 as ImageId)).toBeUndefined()
    expect(opened).toHaveLength(2)
    expect(opened.every((db) => !db.open)).toBe(true)
  })
})

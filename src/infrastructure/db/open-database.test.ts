import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DirectoryId } from '@domain/library'
import { ImageFormat } from '@shared/image-format'
import { MigrationRunner } from './migration-runner'
import { migrations } from './migrations'
import { DatabaseMode, openLibraryDatabase } from './open-database'
import { SqliteDirectoryRepository } from './repositories/sqlite-directory-repository'
import { SqliteImageRepository } from './repositories/sqlite-image-repository'
import { SqliteLibraryRootRepository } from './repositories/sqlite-library-root-repository'

let dir: string
let dbPath: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genfolio-db-'))
  dbPath = join(dir, 'genfolio.db')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('openLibraryDatabase', () => {
  it('enables WAL and foreign keys on the writer', () => {
    const db = openLibraryDatabase(dbPath, DatabaseMode.ReadWrite)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    db.close()
  })

  it('lets a read-only connection see rows committed by the writer', () => {
    const writer = openLibraryDatabase(dbPath, DatabaseMode.ReadWrite)
    new MigrationRunner(writer, migrations).migrate()
    const reader = openLibraryDatabase(dbPath, DatabaseMode.ReadOnly)

    const root = new SqliteLibraryRootRepository(writer).add('/library', 1)
    const directoryId: DirectoryId = new SqliteDirectoryRepository(writer).ensure(root.id, '')
    new SqliteImageRepository(writer).upsertMany(
      [
        {
          directoryId,
          fileName: 'a.png',
          format: ImageFormat.Png,
          sizeBytes: 10,
          mtimeMs: 1,
          width: 8,
          height: 8,
          createdAt: 1
        }
      ],
      2
    )

    expect(new SqliteImageRepository(reader).countByRoot(root.id)).toBe(1)
    expect(() => reader.prepare('DELETE FROM images').run()).toThrow(/readonly/)
    reader.close()
    writer.close()
  })

  it('refuses to create a missing file in read-only mode', () => {
    expect(() => openLibraryDatabase(dbPath, DatabaseMode.ReadOnly)).toThrow()
  })
})

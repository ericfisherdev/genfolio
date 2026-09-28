import type Database from 'better-sqlite3'
import type { LibraryRoot, RootId } from '@domain/library'
import { DuplicateRootError, type LibraryRootRepository } from '@domain/repositories'

interface RootRow {
  id: number
  path: string
  added_at: number
}

const toRoot = (row: RootRow): LibraryRoot => ({
  id: row.id as RootId,
  path: row.path,
  addedAt: row.added_at
})

export class SqliteLibraryRootRepository implements LibraryRootRepository {
  private readonly insert: Database.Statement<[string, number], RootRow>
  private readonly selectAll: Database.Statement<[], RootRow>
  private readonly deleteById: Database.Statement<[number]>
  private readonly selectById: Database.Statement<[number], RootRow>

  constructor(db: Database.Database) {
    this.insert = db.prepare(
      'INSERT INTO library_roots (path, added_at) VALUES (?, ?) ON CONFLICT (path) DO NOTHING RETURNING id, path, added_at'
    )
    this.selectAll = db.prepare('SELECT id, path, added_at FROM library_roots ORDER BY path')
    this.deleteById = db.prepare('DELETE FROM library_roots WHERE id = ?')
    this.selectById = db.prepare('SELECT id, path, added_at FROM library_roots WHERE id = ?')
  }

  add(path: string, addedAt: number): LibraryRoot {
    const row = this.insert.get(path, addedAt)
    if (!row) throw new DuplicateRootError(path)
    return toRoot(row)
  }

  list(): LibraryRoot[] {
    return this.selectAll.all().map(toRoot)
  }

  findById(id: RootId): LibraryRoot | undefined {
    const row = this.selectById.get(id)
    return row ? toRoot(row) : undefined
  }

  remove(id: RootId): boolean {
    return this.deleteById.run(id).changes > 0
  }
}

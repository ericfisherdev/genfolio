import type Database from 'better-sqlite3'
import type { Directory, DirectoryId, RootId } from '@domain/library'
import type { DirectoryRepository } from '@domain/repositories'

interface DirectoryRow {
  id: number
  root_id: number
  parent_id: number | null
  rel_path: string
}

/** Every ancestor path of `relPath`, root first: `a/b/c` → `['', 'a', 'a/b', 'a/b/c']`. */
export function ancestorPaths(relPath: string): string[] {
  const segments = relPath.split('/').filter((segment) => segment.length > 0)
  return ['', ...segments.map((_, index) => segments.slice(0, index + 1).join('/'))]
}

export class SqliteDirectoryRepository implements DirectoryRepository {
  private readonly insert: Database.Statement<[number, number | null, string]>
  private readonly selectId: Database.Statement<[number, string], { id: number }>
  private readonly selectByRoot: Database.Statement<[number], DirectoryRow>

  constructor(private readonly db: Database.Database) {
    this.insert = db.prepare(
      'INSERT INTO directories (root_id, parent_id, rel_path) VALUES (?, ?, ?) ON CONFLICT (root_id, rel_path) DO NOTHING'
    )
    this.selectId = db.prepare('SELECT id FROM directories WHERE root_id = ? AND rel_path = ?')
    this.selectByRoot = db.prepare(
      'SELECT id, root_id, parent_id, rel_path FROM directories WHERE root_id = ? ORDER BY rel_path'
    )
  }

  ensure(rootId: RootId, relPath: string): DirectoryId {
    return this.db.transaction(() => {
      let parentId: number | null = null
      for (const path of ancestorPaths(relPath)) {
        this.insert.run(rootId, parentId, path)
        parentId = this.idOf(rootId, path)
      }
      return parentId as DirectoryId
    })()
  }

  listByRoot(rootId: RootId): Directory[] {
    return this.selectByRoot.all(rootId).map((row) => ({
      id: row.id as DirectoryId,
      rootId: row.root_id as RootId,
      parentId: row.parent_id as DirectoryId | null,
      relPath: row.rel_path
    }))
  }

  private idOf(rootId: RootId, relPath: string): number {
    const row = this.selectId.get(rootId, relPath)
    if (!row) throw new Error(`Directory "${relPath}" missing right after insert`)
    return row.id
  }
}

import { posix } from 'node:path'
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
  private readonly deleteEmptyLeaves: Database.Statement<[number]>
  private readonly moveAll: Database.Statement<{ from: number; to: number; prefix: string }>
  private readonly setParent: Database.Statement<[number, number, string]>

  constructor(private readonly db: Database.Database) {
    this.insert = db.prepare(
      'INSERT INTO directories (root_id, parent_id, rel_path) VALUES (?, ?, ?) ON CONFLICT (root_id, rel_path) DO NOTHING'
    )
    this.selectId = db.prepare('SELECT id FROM directories WHERE root_id = ? AND rel_path = ?')
    this.selectByRoot = db.prepare(
      'SELECT id, root_id, parent_id, rel_path FROM directories WHERE root_id = ? ORDER BY rel_path'
    )
    this.moveAll = db.prepare(`
      UPDATE directories
      SET root_id = @to,
          rel_path = CASE rel_path WHEN '' THEN @prefix ELSE @prefix || '/' || rel_path END
      WHERE root_id = @from
    `)
    this.setParent = db.prepare(
      'UPDATE directories SET parent_id = ? WHERE root_id = ? AND rel_path = ?'
    )
    this.deleteEmptyLeaves = db.prepare(`
      DELETE FROM directories
      WHERE root_id = ? AND rel_path != ''
        AND NOT EXISTS (SELECT 1 FROM images WHERE images.directory_id = directories.id)
        AND NOT EXISTS (SELECT 1 FROM directories AS child WHERE child.parent_id = directories.id)
    `)
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

  moveRoot(from: RootId, to: RootId, prefix: string): void {
    this.db.transaction(() => {
      const parentPath = posix.dirname(prefix) === '.' ? '' : posix.dirname(prefix)
      const parentId = this.ensure(to, parentPath)
      this.moveAll.run({ from, to, prefix })
      this.setParent.run(parentId, to, prefix)
    })()
  }

  pruneEmpty(rootId: RootId): number {
    return this.db.transaction(() => {
      let removed = 0
      for (let changes = 1; changes > 0; removed += changes) {
        changes = this.deleteEmptyLeaves.run(rootId).changes
      }
      return removed
    })()
  }

  private idOf(rootId: RootId, relPath: string): number {
    const row = this.selectId.get(rootId, relPath)
    if (!row) throw new Error(`Directory "${relPath}" missing right after insert`)
    return row.id
  }
}

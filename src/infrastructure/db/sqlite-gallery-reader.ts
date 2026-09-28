import type Database from 'better-sqlite3'
import type { GalleryReader } from '@domain/gallery-reader'
import type { RootId } from '@domain/library'
import {
  GalleryScopeKind,
  LAYOUT_STRIDE,
  SortOrder,
  type DirectoryNode,
  type GalleryQuery,
  type ImageCard
} from '@shared/gallery'
import type { ImageFormat } from '@shared/image-format'

/** Fixed ORDER BY clauses (never built from input); `id` breaks ties so order is stable. */
const ORDER_BY: Readonly<Record<SortOrder, string>> = {
  [SortOrder.Newest]: 'created_at DESC, id DESC',
  [SortOrder.Oldest]: 'created_at ASC, id ASC',
  [SortOrder.RecentlyAdded]: 'added_at DESC, id DESC',
  [SortOrder.FileName]: 'file_name ASC, id ASC'
}

const SUBTREE = `
  WITH RECURSIVE subtree(id) AS (
    SELECT ?
    UNION ALL
    SELECT directories.id FROM directories JOIN subtree ON directories.parent_id = subtree.id
  )`

interface CardRow {
  id: number
  root_id: number
  directory_id: number
  file_name: string
  rel_path: string
  format: string
  width: number
  height: number
  size_bytes: number
  created_at: number
  added_at: number
}

interface DirectoryRow {
  id: number
  parent_id: number | null
  rel_path: string
  image_count: number
}

type LayoutRow = [number, number, number]

export class SqliteGalleryReader implements GalleryReader {
  private readonly layoutStatements = new Map<string, Database.Statement<unknown[], LayoutRow>>()
  private readonly cardsByIds: Database.Statement<[string], CardRow>
  private readonly directoriesOfRoot: Database.Statement<[number], DirectoryRow>

  constructor(private readonly db: Database.Database) {
    this.cardsByIds = db.prepare(`
      SELECT images.id, directories.root_id, images.directory_id, images.file_name,
             directories.rel_path, images.format, images.width, images.height,
             images.size_bytes, images.created_at, images.added_at
      FROM images JOIN directories ON directories.id = images.directory_id
      WHERE images.id IN (SELECT value FROM json_each(?))
    `)
    this.directoriesOfRoot = db.prepare(`
      SELECT directories.id, directories.parent_id, directories.rel_path,
             COUNT(images.id) AS image_count
      FROM directories LEFT JOIN images ON images.directory_id = directories.id
      WHERE directories.root_id = ?
      GROUP BY directories.id
    `)
  }

  layout(query: GalleryQuery): Int32Array<ArrayBuffer> {
    const { scope } = query
    const rows =
      scope.kind === GalleryScopeKind.All
        ? this.layoutStatement(query).all()
        : this.layoutStatement(query).all(scope.directoryId)
    const layout = new Int32Array(rows.length * LAYOUT_STRIDE)
    rows.forEach(([id, width, height], index) => {
      layout.set([id, width, height], index * LAYOUT_STRIDE)
    })
    return layout
  }

  images(ids: readonly number[]): ImageCard[] {
    return this.cardsByIds.all(JSON.stringify(ids)).map((row) => ({
      id: row.id,
      rootId: row.root_id,
      directoryId: row.directory_id,
      fileName: row.file_name,
      relDir: row.rel_path,
      format: row.format as ImageFormat,
      width: row.width,
      height: row.height,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
      addedAt: row.added_at
    }))
  }

  directoryTree(rootId: RootId): DirectoryNode | undefined {
    const rows = this.directoriesOfRoot.all(rootId)
    const childrenOf = new Map<number | null, DirectoryRow[]>()
    for (const row of rows) {
      const siblings = childrenOf.get(row.parent_id) ?? []
      siblings.push(row)
      childrenOf.set(row.parent_id, siblings)
    }
    const root = childrenOf.get(null)?.[0]
    return root ? buildNode(root, childrenOf) : undefined
  }

  private layoutStatement(query: GalleryQuery): Database.Statement<unknown[], LayoutRow> {
    const { scope, sort } = query
    const key =
      scope.kind === GalleryScopeKind.All ? `all:${sort}` : `dir:${scope.recursive}:${sort}`
    let statement = this.layoutStatements.get(key)
    if (!statement) {
      statement = this.db
        .prepare<unknown[], LayoutRow>(layoutSql(query))
        .raw(true) as Database.Statement<unknown[], LayoutRow>
      this.layoutStatements.set(key, statement)
    }
    return statement
  }
}

function layoutSql({ scope, sort }: GalleryQuery): string {
  const select = 'SELECT id, width, height FROM images'
  const orderBy = `ORDER BY ${ORDER_BY[sort]}`
  if (scope.kind === GalleryScopeKind.All) return `${select} ${orderBy}`
  if (!scope.recursive) return `${select} WHERE directory_id = ? ${orderBy}`
  return `${SUBTREE} ${select} WHERE directory_id IN (SELECT id FROM subtree) ${orderBy}`
}

/** Builds a node with total counts, dropping child folders with no images below them. */
function buildNode(
  row: DirectoryRow,
  childrenOf: ReadonlyMap<number | null, DirectoryRow[]>
): DirectoryNode {
  const children = (childrenOf.get(row.id) ?? [])
    .map((child) => buildNode(child, childrenOf))
    .filter((child) => child.totalImageCount > 0)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return {
    id: row.id,
    name: row.rel_path.slice(row.rel_path.lastIndexOf('/') + 1),
    relPath: row.rel_path,
    imageCount: row.image_count,
    totalImageCount:
      row.image_count + children.reduce((sum, child) => sum + child.totalImageCount, 0),
    children
  }
}

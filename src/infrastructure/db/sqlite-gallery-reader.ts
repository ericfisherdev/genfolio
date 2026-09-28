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
import { AlbumKind } from '@shared/album-kinds'
import type { ImageSelector } from './search/image-selection'

const NEWEST = 'created_at DESC, id DESC'

/** Fixed ORDER BY clauses (never built from input); `id` breaks ties so order is stable. */
const ORDER_BY: Readonly<Record<Exclude<SortOrder, SortOrder.AlbumOrder>, string>> = {
  [SortOrder.Newest]: NEWEST,
  [SortOrder.Oldest]: 'created_at ASC, id ASC',
  [SortOrder.RecentlyAdded]: 'added_at DESC, id DESC',
  [SortOrder.FileName]: 'file_name COLLATE NOCASE ASC, id ASC',
  [SortOrder.Rating]: 'rating DESC, created_at DESC, id DESC'
}

/** Positions can be equal (two moves into one gap before a renumber), so `id` breaks ties. */
const ALBUM_ORDER = `(SELECT position FROM album_images
  WHERE album_images.album_id = ? AND album_images.image_id = images.id) ASC, id ASC`

/** The ORDER BY clause and its parameters; album order outside a manual album is newest. */
function orderBy(
  query: GalleryQuery,
  isManualAlbum: (albumId: number) => boolean
): { sql: string; params: readonly unknown[] } {
  if (query.sort !== SortOrder.AlbumOrder) return { sql: ORDER_BY[query.sort], params: [] }
  return query.scope.kind === GalleryScopeKind.Album && isManualAlbum(query.scope.albumId)
    ? { sql: ALBUM_ORDER, params: [query.scope.albumId] }
    : { sql: NEWEST, params: [] }
}

/** Folder names in natural, case-insensitive order: `2` before `10`, `a` next to `B`. */
const FOLDER_ORDER = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

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
  is_favorite: number
  rating: number
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

  /** `selector` turns a query's scope and filters into the images it selects. */
  constructor(
    private readonly db: Database.Database,
    private readonly selector: ImageSelector
  ) {
    this.cardsByIds = db.prepare(`
      SELECT images.id, directories.root_id, images.directory_id, images.file_name,
             directories.rel_path, images.format, images.width, images.height,
             images.size_bytes, images.created_at, images.added_at, images.is_favorite,
             images.rating
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
    const selection = this.selector.select(query)
    const order = orderBy(query, (id) => this.selector.albumKind(id) === AlbumKind.Manual)
    const sql = `${selection.prefix} SELECT id, width, height FROM images ${selection.where}
      ORDER BY ${order.sql}`
    const rows = this.layoutStatement(sql).all(...selection.params, ...order.params)
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
      addedAt: row.added_at,
      favorite: row.is_favorite === 1,
      rating: row.rating
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

  /**
   * Statements are cached by their text. Filters write fixed text (lists bind as one JSON
   * parameter), so the number of shapes is bounded by the combinations of filters in use.
   */
  private layoutStatement(sql: string): Database.Statement<unknown[], LayoutRow> {
    let statement = this.layoutStatements.get(sql)
    if (!statement) {
      statement = this.db.prepare<unknown[], LayoutRow>(sql).raw(true) as Database.Statement<
        unknown[],
        LayoutRow
      >
      this.layoutStatements.set(sql, statement)
    }
    return statement
  }
}

/** Builds a node with total counts, dropping child folders with no images below them. */
function buildNode(
  row: DirectoryRow,
  childrenOf: ReadonlyMap<number | null, DirectoryRow[]>
): DirectoryNode {
  const children = (childrenOf.get(row.id) ?? [])
    .map((child) => buildNode(child, childrenOf))
    .filter((child) => child.totalImageCount > 0)
    .sort((a, b) => FOLDER_ORDER.compare(a.name, b.name))
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

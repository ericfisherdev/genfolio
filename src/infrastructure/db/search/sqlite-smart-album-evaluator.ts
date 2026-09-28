import type Database from 'better-sqlite3'
import type { SmartAlbumContents, SmartAlbumEvaluator } from '@domain/albums'
import type { ImageId } from '@domain/library'
import { GalleryScopeKind } from '@shared/gallery'
import type { ImageSelector } from './image-selection'

/** Counts a smart album's matches and finds its newest, through the same selector as the gallery. */
export class SqliteSmartAlbumEvaluator implements SmartAlbumEvaluator {
  private readonly statements = new Map<string, Database.Statement<unknown[], unknown>>()

  constructor(
    private readonly db: Database.Database,
    private readonly selector: ImageSelector
  ) {}

  contents(albumId: number): SmartAlbumContents {
    const selection = this.selector.select({ scope: { kind: GalleryScopeKind.Album, albumId } })
    const row = this.statement(
      `${selection.prefix}
      SELECT COUNT(*) AS image_count,
        (SELECT id FROM images ${selection.where} ORDER BY created_at DESC, id DESC LIMIT 1)
          AS first_id
      FROM images ${selection.where}`
    ).get(...selection.params, ...selection.params) as {
      image_count: number
      first_id: number | null
    }
    return { imageCount: row.image_count, firstImageId: row.first_id as ImageId | null }
  }

  /** Cached by text, which depends only on which filters the album's search uses. */
  private statement(sql: string): Database.Statement<unknown[], unknown> {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = this.db.prepare(sql)
      this.statements.set(sql, statement)
    }
    return statement
  }
}

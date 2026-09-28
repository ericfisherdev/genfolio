import type Database from 'better-sqlite3'
import type { ImageId } from '@domain/library'
import type { ImageMarkRepository } from '@domain/repositories'

export class SqliteImageMarkRepository implements ImageMarkRepository {
  private readonly favorite: Database.Statement<[number, string]>
  private readonly rating: Database.Statement<[number, string]>

  constructor(db: Database.Database) {
    // Ids bind as one JSON list, so one statement serves any selection size.
    this.favorite = db.prepare(
      'UPDATE images SET is_favorite = ? WHERE id IN (SELECT value FROM json_each(?))'
    )
    this.rating = db.prepare(
      'UPDATE images SET rating = ? WHERE id IN (SELECT value FROM json_each(?))'
    )
  }

  setFavorite(ids: readonly ImageId[], favorite: boolean): number {
    return this.favorite.run(favorite ? 1 : 0, JSON.stringify(ids)).changes
  }

  setRating(ids: readonly ImageId[], rating: number): number {
    return this.rating.run(rating, JSON.stringify(ids)).changes
  }
}

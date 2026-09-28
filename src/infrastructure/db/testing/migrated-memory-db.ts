import Database from 'better-sqlite3'
import { MigrationRunner } from '../migration-runner'
import { migrations } from '../migrations'

/** An in-memory library database at the latest schema, for tests. */
export function migratedMemoryDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  new MigrationRunner(db, migrations).migrate()
  return db
}

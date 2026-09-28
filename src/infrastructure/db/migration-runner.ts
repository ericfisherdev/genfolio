import type Database from 'better-sqlite3'
import type { Migration } from './migrations/migration'

/** The migration list is malformed, or the database was written by a newer app. */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}

/** Applies pending migrations, each in its own transaction, tracked by `PRAGMA user_version`. */
export class MigrationRunner {
  constructor(
    private readonly db: Database.Database,
    private readonly migrations: readonly Migration[]
  ) {}

  /**
   * Brings the schema to the latest version and returns it.
   * Throws {@link MigrationError} for a gapped list or a database newer than the app;
   * a failing migration's SQL error propagates after its transaction rolls back.
   */
  migrate(): number {
    this.assertSequential()
    const latest = this.migrations.length
    const current = this.currentVersion()
    if (current > latest) {
      throw new MigrationError(
        `Database schema v${current} is newer than this app supports (v${latest})`
      )
    }
    for (const migration of this.migrations.slice(current)) this.apply(migration)
    return latest
  }

  private assertSequential(): void {
    this.migrations.forEach((migration, index) => {
      if (migration.version !== index + 1) {
        throw new MigrationError(
          `Migration "${migration.name}" has version ${migration.version}, expected ${index + 1}`
        )
      }
    })
  }

  private currentVersion(): number {
    return this.db.pragma('user_version', { simple: true }) as number
  }

  private apply(migration: Migration): void {
    this.db.transaction(() => {
      this.db.exec(migration.sql)
      this.db.pragma(`user_version = ${migration.version}`)
    })()
  }
}

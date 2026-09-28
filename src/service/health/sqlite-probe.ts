import type Database from 'better-sqlite3'
import type { ServiceHealth } from '@shared/service-health'
import type { HealthProbe } from './health-probe'

/** Reports the SQLite version, FTS5 support and schema version of the library database. */
export class SqliteProbe implements HealthProbe {
  constructor(private readonly db: Database.Database) {}

  async probe(): Promise<Partial<ServiceHealth>> {
    const { version } = this.db.prepare('SELECT sqlite_version() AS version').get() as {
      version: string
    }
    return {
      sqlite: version,
      fts5: this.supportsFts5(),
      schemaVersion: this.db.pragma('user_version', { simple: true }) as number
    }
  }

  private supportsFts5(): boolean {
    const option = this.db
      .prepare("SELECT 1 FROM pragma_compile_options WHERE compile_options = 'ENABLE_FTS5'")
      .get()
    return option !== undefined
  }
}

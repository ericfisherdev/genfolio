import type Database from 'better-sqlite3'
import type { ServiceHealth } from '@shared/service-health'
import type { HealthProbe } from './health-probe'

export type DatabaseFactory = () => Database.Database

/** Opens a scratch database to confirm the native driver loads and FTS5 is compiled in. */
export class SqliteProbe implements HealthProbe {
  constructor(private readonly openDatabase: DatabaseFactory) {}

  async probe(): Promise<Partial<ServiceHealth>> {
    const db = this.openDatabase()
    try {
      const { version } = db.prepare('SELECT sqlite_version() AS version').get() as {
        version: string
      }
      return { sqlite: version, fts5: this.supportsFts5(db) }
    } finally {
      db.close()
    }
  }

  private supportsFts5(db: Database.Database): boolean {
    const option = db
      .prepare("SELECT 1 FROM pragma_compile_options WHERE compile_options = 'ENABLE_FTS5'")
      .get()
    return option !== undefined
  }
}

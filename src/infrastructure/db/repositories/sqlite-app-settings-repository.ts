import type Database from 'better-sqlite3'
import type { AppSettingsRepository } from '@domain/repositories'

export class SqliteAppSettingsRepository implements AppSettingsRepository {
  private readonly select: Database.Statement<[string], { value: string }>
  private readonly upsert: Database.Statement<[string, string]>
  private readonly delete: Database.Statement<[string]>

  constructor(db: Database.Database) {
    this.select = db.prepare('SELECT value FROM app_settings WHERE key = ?')
    this.upsert = db.prepare(`
      INSERT INTO app_settings (key, value) VALUES (?, ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
    this.delete = db.prepare('DELETE FROM app_settings WHERE key = ?')
  }

  get(key: string): string | undefined {
    return this.select.get(key)?.value
  }

  set(key: string, value: string): void {
    this.upsert.run(key, value)
  }

  remove(key: string): void {
    this.delete.run(key)
  }
}

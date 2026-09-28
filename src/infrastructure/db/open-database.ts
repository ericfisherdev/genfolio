import Database from 'better-sqlite3'

export enum DatabaseMode {
  /** The library service's single writer connection. */
  ReadWrite = 'read-write',
  /** Main-process lookups; requires the file to exist. */
  ReadOnly = 'read-only'
}

/** Opens the library database with the pragmas every connection needs. */
export function openLibraryDatabase(path: string, mode: DatabaseMode): Database.Database {
  const readonly = mode === DatabaseMode.ReadOnly
  const db = new Database(path, { readonly, fileMustExist: readonly })
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  if (!readonly) {
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
  }
  return db
}

import type Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { SqliteDirectoryRepository } from '@infrastructure/db/repositories/sqlite-directory-repository'
import { SqliteImageRepository } from '@infrastructure/db/repositories/sqlite-image-repository'
import { SqliteLibraryRootRepository } from '@infrastructure/db/repositories/sqlite-library-root-repository'
import { migratedMemoryDb } from '@infrastructure/db/testing/migrated-memory-db'
import { createScanRoot } from '../service/scan-root-factory'

// Local-only check against a folder of real images. Skipped unless GENFOLIO_SAMPLE_DIR is set,
// so it never runs in CI and the folder is never named in the repository. It prints counts
// only: no file names, prompts or other metadata text.
const sampleDir = process.env['GENFOLIO_SAMPLE_DIR']

const counts = (db: Database.Database, sql: string): Record<string, number> =>
  Object.fromEntries(
    (db.prepare(sql).all() as { key: string | null; n: number }[]).map((row) => [
      row.key ?? '(none)',
      row.n
    ])
  )

describe.skipIf(!sampleDir)('metadata indexing against GENFOLIO_SAMPLE_DIR', () => {
  it('indexes every image and parses its metadata without errors', async () => {
    const db = migratedMemoryDb()
    const images = new SqliteImageRepository(db)
    const root = new SqliteLibraryRootRepository(db).add(sampleDir as string, 1)
    const warn = vi.fn()
    const started = performance.now()
    const report = await createScanRoot(db, {
      directories: new SqliteDirectoryRepository(db),
      images,
      logger: { warn },
      fileRef: () => '(file)',
      now: () => Date.now()
    }).run(root, new AbortController().signal)
    const seconds = ((performance.now() - started) / 1000).toFixed(1)

    const summary = {
      seconds,
      images: report.added,
      failed: report.failed,
      withGeneration: db.prepare('SELECT COUNT(*) FROM generations').pluck().get(),
      byGenerator: counts(db, 'SELECT generator AS key, COUNT(*) AS n FROM generations GROUP BY 1'),
      byWinningOrigin: counts(
        db,
        'SELECT origin AS key, COUNT(*) AS n FROM generations GROUP BY 1'
      ),
      recordsByOrigin: counts(
        db,
        'SELECT origin AS key, COUNT(DISTINCT image_id) AS n FROM metadata_raw GROUP BY 1'
      ),
      withLoras: db.prepare('SELECT COUNT(DISTINCT image_id) FROM generation_loras').pluck().get(),
      lorasWithoutWeight: db
        .prepare('SELECT COUNT(*) FROM generation_loras WHERE weight IS NULL')
        .pluck()
        .get(),
      models: counts(db, 'SELECT kind AS key, COUNT(*) AS n FROM models GROUP BY 1'),
      embeddedSchemes: counts(
        db,
        `SELECT value AS key, COUNT(*) AS n FROM metadata_raw
         WHERE key IN ('fooocus_scheme', 'MakerNote') GROUP BY 1`
      )
    }
    console.info(`[samples] ${JSON.stringify(summary, null, 2)}`)
    expect(report.added).toBeGreaterThan(0)
    expect(report.failed).toBe(0)
    expect(warn).not.toHaveBeenCalled()
  }, 600_000)
})

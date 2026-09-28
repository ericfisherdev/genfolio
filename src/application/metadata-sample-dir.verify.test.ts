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

/** Images with a record of this kind but no generation: records no parser accepted. */
const unparsedSql = (where: string): string =>
  `SELECT COUNT(DISTINCT r.image_id) FROM metadata_raw r
   LEFT JOIN generations g ON g.image_id = r.image_id
   WHERE g.image_id IS NULL AND ${where}`

describe.skipIf(!sampleDir)('metadata indexing against GENFOLIO_SAMPLE_DIR', () => {
  it('indexes every image, and every PNG parameters chunk yields a generation', async () => {
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
      // Only the scheme names Fooocus writes are printed; any other MakerNote (a camera's
      // vendor block, serial numbers) is counted as "other" so no metadata text leaks.
      embeddedSchemes: counts(
        db,
        `SELECT CASE WHEN value IN ('fooocus', 'a1111') THEN value ELSE 'other' END AS key,
           COUNT(*) AS n
         FROM metadata_raw WHERE key IN ('fooocus_scheme', 'MakerNote') GROUP BY 1`
      ),
      unparsedPngParameters: db
        .prepare(unparsedSql(`r.origin = 'png-text' AND r.key = 'parameters'`))
        .pluck()
        .get(),
      unparsedExifText: db
        .prepare(unparsedSql(`r.origin IN ('exif-user-comment', 'exif-image-description')`))
        .pluck()
        .get()
    }
    console.info(`[samples] ${JSON.stringify(summary, null, 2)}`)
    expect(report.added).toBeGreaterThan(0)
    expect(report.failed).toBe(0)
    expect(warn).not.toHaveBeenCalled()
    // Only generators write a PNG `parameters` chunk, so one that yields no generation is a
    // parse failure. EXIF text can be ordinary camera text, so it is only reported.
    expect(summary.unparsedPngParameters).toBe(0)
  }, 600_000)
})

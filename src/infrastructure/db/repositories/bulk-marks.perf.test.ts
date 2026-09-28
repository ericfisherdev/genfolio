import { describe, expect, it } from 'vitest'
import type { ImageId } from '@domain/library'
import { migratedMemoryDb } from '../testing/migrated-memory-db'
import { SqliteImageMarkRepository } from './sqlite-image-mark-repository'
import { SqliteTagRepository } from './sqlite-tag-repository'

const SELECTED = 5_000
/** Favourite, rate and tag together, as one bulk-bar session would. */
const BUDGET_MS = 1_000

describe.skipIf(process.env['GENFOLIO_PERF'] !== '1')('bulk marks on 5,000 images', () => {
  it('favourite, rate and tag the selection within budget', () => {
    const db = migratedMemoryDb()
    db.transaction(() => {
      db.prepare("INSERT INTO library_roots (id, path, added_at) VALUES (1, '/lib', 1)").run()
      db.prepare(
        "INSERT INTO directories (id, root_id, parent_id, rel_path) VALUES (1, 1, NULL, '')"
      ).run()
      const image = db.prepare(
        `INSERT INTO images (id, directory_id, file_name, format, size_bytes, mtime_ms, width,
          height, created_at, added_at, metadata_version) VALUES (?, 1, ?, 'png', 1, 1, 1, 1, ?, 1, 1)`
      )
      for (let id = 1; id <= SELECTED * 2; id++) image.run(id, `${id}.png`, id)
    })()
    const marks = new SqliteImageMarkRepository(db)
    const tags = new SqliteTagRepository(db)
    const ids = Array.from({ length: SELECTED }, (_, index) => (index * 2 + 1) as ImageId)

    const started = performance.now()
    expect(marks.setFavorite(ids, true)).toBe(SELECTED)
    expect(marks.setRating(ids, 4)).toBe(SELECTED)
    const tag = tags.create('keeper', 1)
    expect(tags.apply([tag.id], ids)).toBe(SELECTED)
    const elapsed = performance.now() - started

    console.info(`bulk favourite + rate + tag of ${SELECTED} images: ${elapsed.toFixed(1)} ms`)
    expect(elapsed).toBeLessThan(BUDGET_MS)
  })
})

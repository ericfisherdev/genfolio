import type Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { ModelStatsService } from '@application/model-stats-service'
import { GalleryScopeKind, LAYOUT_STRIDE, SortOrder } from '@shared/gallery'
import { filtersFor } from '@shared/model-stats-filters'
import { createImageSelector } from './search/create-image-selector'
import { SqliteFacetReader } from './search/sqlite-facet-reader'
import { SqliteChangeCounter } from './sqlite-change-counter'
import { SqliteGalleryReader } from './sqlite-gallery-reader'
import { SqliteModelStatsReader } from './sqlite-model-stats-reader'
import { migratedMemoryDb } from './testing/migrated-memory-db'
import { buildPerfLibrary, PERF_IMAGES, type PerfLibraryOptions } from './testing/perf-library'

/**
 * Per query, measured on the reference machine (i7-11800H, 8 cores, Node 24 in Electron's
 * runtime). The service is single-threaded, so each is time every request waits behind.
 */
const BUDGET_MS = {
  checkpoints: 50,
  loras: 50,
  checkpointLoraPairs: 200,
  loraPairs: 350,
  overviewCold: 500,
  overviewTagged: 250,
  overviewMemoHit: 5,
  drillDown: 50
}

/** The four overview queries run in this order. */
const OVERVIEW_QUERIES = ['checkpoints', 'loras', 'checkpointLoraPairs', 'loraPairs'] as const

/** Library shapes: LoRAs per image (1 up to the maximum) and how many images name a refiner. */
const LIBRARIES: Record<string, PerfLibraryOptions> = {
  'realistic (1-2 LoRAs)': { maxLorasPerImage: 2, refinerShare: 0.3 },
  'heavy (1-5 LoRAs)': { maxLorasPerImage: 5, refinerShare: 0.3 }
}

const fastest = (runs: number, run: () => unknown): number => {
  let best = Infinity
  for (let round = 0; round < runs; round++) {
    const started = performance.now()
    run()
    best = Math.min(best, performance.now() - started)
  }
  return best
}

/** A database whose statements record how long each `all()` takes, in the order they run. */
function timed(db: Database.Database, timings: number[]): Database.Database {
  return new Proxy(db, {
    get(target, property) {
      if (property === 'prepare') {
        return (sql: string) => {
          const statement = target.prepare(sql)
          return new Proxy(statement, {
            get(inner, name) {
              if (name === 'all') {
                return (...args: unknown[]) => {
                  const started = performance.now()
                  const rows = inner.all(...args)
                  timings.push(performance.now() - started)
                  return rows
                }
              }
              const value = Reflect.get(inner, name)
              return typeof value === 'function' ? value.bind(inner) : value
            }
          })
        }
      }
      const value = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

describe.skipIf(process.env['GENFOLIO_PERF'] !== '1')(
  `model stats performance at ${PERF_IMAGES} images`,
  () => {
    for (const [name, options] of Object.entries(LIBRARIES)) {
      it(`answers every query within the budget: ${name}`, () => {
        const db = migratedMemoryDb()
        const built = performance.now()
        buildPerfLibrary(db, options)
        const links = db.prepare('SELECT COUNT(*) FROM generation_loras').pluck().get()
        console.info(
          `[perf] built ${PERF_IMAGES} images, ${String(links)} LoRA links in ${((performance.now() - built) / 1000).toFixed(1)} s`
        )
        const rows: string[] = []
        const slow: string[] = []
        const check = (label: string, ms: number, budget: number): void => {
          rows.push(`${label.padEnd(34)} ${ms.toFixed(1).padStart(7)} ms  (budget ${budget})`)
          if (ms >= budget) slow.push(`${label} ${ms.toFixed(1)} ms`)
        }

        const request = { modelTagId: null, limit: 200 }
        const timings: number[] = []
        const reader = new SqliteModelStatsReader(timed(db, timings))
        reader.overview(request) // prepares the statements
        const cold = OVERVIEW_QUERIES.map(() => Infinity)
        for (let round = 0; round < 3; round++) {
          timings.length = 0
          reader.overview(request)
          timings.forEach((ms, index) => (cold[index] = Math.min(cold[index] ?? Infinity, ms)))
        }
        OVERVIEW_QUERIES.forEach((query, index) =>
          check(query, cold[index] ?? NaN, BUDGET_MS[query])
        )
        check(
          'overview, cold (sum)',
          fastest(3, () => reader.overview(request)),
          BUDGET_MS.overviewCold
        )

        const tags = db
          .prepare('SELECT DISTINCT tag_id FROM model_tag_links ORDER BY tag_id')
          .pluck()
          .all() as number[]
        for (const tag of tags.slice(0, 2)) {
          check(
            `overview, tagged ${tag}`,
            fastest(3, () => reader.overview({ modelTagId: tag, limit: 200 })),
            BUDGET_MS.overviewTagged
          )
        }

        const counter = new SqliteChangeCounter(
          db,
          new SqliteFacetReader(db, createImageSelector(db))
        )
        const service = new ModelStatsService(new SqliteModelStatsReader(db), counter)
        service.overview()
        check(
          'overview, memo hit',
          fastest(5, () => service.overview()),
          BUDGET_MS.overviewMemoHit
        )

        const { checkpoints, loras } = reader.overview({ modelTagId: null, limit: 200 })
        const busiest = [checkpoints[0], loras[0]].flatMap((stat) => (stat ? [stat] : []))
        for (const { kind, identity, name } of busiest) {
          check(
            `drill-down, ${kind} ${name}`,
            fastest(3, () => reader.usage({ kind, identity }, 200)),
            BUDGET_MS.drillDown
          )
        }

        const gallery = new SqliteGalleryReader(db, createImageSelector(db))
        const top = reader.overview({ modelTagId: null, limit: 5 })
        const sampled = [
          ...top.checkpoints,
          ...top.loras,
          ...top.checkpointLoraPairs,
          ...top.loraPairs
        ]
        const mismatched = sampled.filter(
          (row) =>
            gallery.layout({
              scope: { kind: GalleryScopeKind.All },
              sort: SortOrder.Newest,
              filters: filtersFor(row)
            }).length /
              LAYOUT_STRIDE !==
            row.imageCount
        )

        console.info(`[perf] model stats, ${name}\n${rows.join('\n')}`)
        expect(slow).toEqual([])
        expect(mismatched).toEqual([])
      }, 600_000)
    }
  }
)

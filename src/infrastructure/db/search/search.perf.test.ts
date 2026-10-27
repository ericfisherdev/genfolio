import type Database from 'better-sqlite3'
import { beforeAll, describe, expect, it } from 'vitest'
import { GalleryScopeKind, SortOrder, type GalleryQuery } from '@shared/gallery'
import { GeneratorKind } from '@shared/generation-kinds'
import { KeywordScope, SetMatchMode, type SearchFilters } from '@shared/search'
import { SqliteGalleryReader } from '../sqlite-gallery-reader'
import { migratedMemoryDb } from '../testing/migrated-memory-db'
import { buildPerfLibrary, PERF_CHECKPOINTS, PERF_IMAGES } from '../testing/perf-library'
import { createImageSelector } from './create-image-selector'
import { SqliteFacetReader } from './sqlite-facet-reader'

/**
 * Per query, measured on the reference machine (i7-11800H, 8 cores, Node 24 in Electron's
 * runtime). Slower machines scale roughly linearly, so this gate is meaningful there only.
 */
const BUDGET_MS = 200

const lora = (n: number): number => PERF_CHECKPOINTS + n

/**
 * Reported, not held to the budget: `word1*` expands to 111 of the 200 synthetic words, so it
 * matches almost every prompt and the facets count ~90k images through FTS. Real prompt words
 * rarely share a prefix that widely; the budgeted prefix case (`word19*`) expands to 11.
 */
const REPORT_ONLY: Record<string, SearchFilters> = {
  'very broad prefix + exclusion': {
    keywords: { query: 'word1* -word2', scope: KeywordScope.Both }
  }
}

const CASES: Record<string, SearchFilters> = {
  'no filters': {},
  checkpoint: { checkpointIds: [7] },
  'LoRA any of 2': { loras: { ids: [lora(3), lora(9)], mode: SetMatchMode.Any } },
  'LoRA all of 2': { loras: { ids: [lora(3), lora(9)], mode: SetMatchMode.All } },
  'LoRA with weight range': {
    loras: { ids: [lora(3)], mode: SetMatchMode.Any, minWeight: 0.5, maxWeight: 1 }
  },
  'keywords (2 words)': { keywords: { query: 'word1 word2', scope: KeywordScope.Positive } },
  'keyword prefix + exclusion': {
    keywords: { query: 'word19* -word2', scope: KeywordScope.Both }
  },
  'exclusion only': { keywords: { query: '-word1', scope: KeywordScope.Positive } },
  generator: { generators: [GeneratorKind.Fooocus] },
  seed: { seed: '42' },
  'tag any of 2': { tags: { ids: [3, 9], mode: SetMatchMode.Any } },
  'tag all of 2': { tags: { ids: [3, 9], mode: SetMatchMode.All } },
  'without a tag': { tags: { mode: SetMatchMode.Any, excludeIds: [3] } },
  'model tag': { modelTagIds: [2] },
  'model tag any of 2 + keyword': {
    modelTagIds: [2, 3],
    keywords: { query: 'word1', scope: KeywordScope.Positive }
  },
  favourites: { favoritesOnly: true },
  'rating 4+': { minRating: 4 },
  'favourites + tag + checkpoint': {
    favoritesOnly: true,
    tags: { ids: [3], mode: SetMatchMode.Any },
    checkpointIds: [7]
  },
  'checkpoint + LoRA + keyword': {
    checkpointIds: [7],
    loras: { ids: [lora(3), lora(9)], mode: SetMatchMode.Any },
    keywords: { query: 'word1', scope: KeywordScope.Positive }
  }
}

/** The fastest of three runs, after the statement is prepared. */
function timeMs(run: () => unknown): number {
  run()
  let best = Infinity
  for (let round = 0; round < 3; round++) {
    const started = performance.now()
    run()
    best = Math.min(best, performance.now() - started)
  }
  return best
}

describe.skipIf(process.env['GENFOLIO_PERF'] !== '1')('search performance at 100k images', () => {
  let db: Database.Database
  let gallery: SqliteGalleryReader
  let facets: SqliteFacetReader

  beforeAll(() => {
    db = migratedMemoryDb()
    const started = performance.now()
    buildPerfLibrary(db)
    console.info(
      `[perf] built ${PERF_IMAGES} images in ${((performance.now() - started) / 1000).toFixed(1)} s`
    )
    const selector = createImageSelector(db)
    gallery = new SqliteGalleryReader(db, selector)
    facets = new SqliteFacetReader(db, selector)
  }, 600_000)

  const query = (filters: SearchFilters, sort = SortOrder.Newest): GalleryQuery => ({
    scope: { kind: GalleryScopeKind.All },
    sort,
    ...(Object.keys(filters).length > 0 ? { filters } : {})
  })

  it('answers every filter and the facets within the budget', () => {
    const rows: string[] = []
    const slow: string[] = []
    const measured = [
      ...Object.entries(CASES).map(([name, filters]) => ({ name, filters, budgeted: true })),
      ...Object.entries(REPORT_ONLY).map(([name, filters]) => ({ name, filters, budgeted: false }))
    ]
    for (const { name, filters, budgeted } of measured) {
      let count = 0
      const layout = timeMs(() => (count = gallery.layout(query(filters)).length / 3))
      const facetMs = timeMs(() => facets.facets(query(filters)))
      rows.push(
        `${(budgeted ? name : `${name} *`).padEnd(32)} ${String(count).padStart(6)} images  layout ${layout.toFixed(1).padStart(6)} ms  facets ${facetMs.toFixed(1).padStart(6)} ms`
      )
      if (budgeted && layout >= BUDGET_MS) slow.push(`${name} layout`)
      if (budgeted && facetMs >= BUDGET_MS) slow.push(`${name} facets`)
    }
    const folder: GalleryQuery = {
      scope: { kind: GalleryScopeKind.Directory, directoryId: 1, recursive: true },
      sort: SortOrder.FileName,
      filters: CASES['checkpoint + LoRA + keyword'] ?? {}
    }
    const rootOnly: GalleryQuery = { scope: folder.scope, sort: SortOrder.FileName }
    for (const [name, scoped] of [
      ['recursive root, no filters', rootOnly],
      ['recursive root + 3 filters', folder]
    ] as const) {
      const layoutMs = timeMs(() => gallery.layout(scoped))
      const facetMs = timeMs(() => facets.facets(scoped))
      rows.push(
        `${name.padEnd(32)} ${''.padStart(13)}  layout ${layoutMs.toFixed(1).padStart(6)} ms  facets ${facetMs.toFixed(1).padStart(6)} ms`
      )
      if (layoutMs >= BUDGET_MS) slow.push(`${name} layout`)
      if (facetMs >= BUDGET_MS) slow.push(`${name} facets`)
    }
    console.info(`[perf] search at ${PERF_IMAGES} images (* not budgeted)\n${rows.join('\n')}`)
    expect(slow).toEqual([])
  }, 600_000)
})

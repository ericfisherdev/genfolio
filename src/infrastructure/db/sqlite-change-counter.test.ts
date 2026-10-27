import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelStatsService } from '@application/model-stats-service'
import { GalleryScopeKind, SortOrder, type GalleryQuery } from '@shared/gallery'
import { ModelKind } from '@shared/generation-kinds'
import { SetMatchMode } from '@shared/search-kinds'
import { SqliteModelTagRepository } from './repositories/sqlite-model-tag-repository'
import { createImageSelector } from './search/create-image-selector'
import { SqliteFacetReader } from './search/sqlite-facet-reader'
import { SqliteChangeCounter } from './sqlite-change-counter'
import { SqliteModelStatsReader } from './sqlite-model-stats-reader'
import { searchLibrary, type SearchLibrary } from './testing/search-library'

let library: SearchLibrary
let facets: SqliteFacetReader
let counter: SqliteChangeCounter
let stats: ModelStatsService
let reader: SqliteModelStatsReader

beforeEach(() => {
  library = searchLibrary()
  facets = new SqliteFacetReader(library.db, createImageSelector(library.db))
  counter = new SqliteChangeCounter(library.db, facets)
  reader = new SqliteModelStatsReader(library.db)
  stats = new ModelStatsService(reader, counter)
})

const totalChanges = (): number =>
  library.db.prepare('SELECT total_changes()').pluck().get() as number

const filteredFacets = (): void => {
  const query: GalleryQuery = {
    scope: { kind: GalleryScopeKind.All },
    sort: SortOrder.Newest,
    filters: { loras: { ids: [library.modelId('lora', 'detail')], mode: SetMatchMode.Any } }
  }
  facets.facets(query)
}

describe('SqliteChangeCounter', () => {
  it('does not move for the facet reader scratch table, which total_changes does', () => {
    const before = { counted: counter.current(), raw: totalChanges() }
    filteredFacets()
    expect(totalChanges()).toBeGreaterThan(before.raw)
    expect(counter.current()).toBe(before.counted)
  })

  it('moves for a write to a library table', () => {
    const before = counter.current()
    library.db
      .prepare('DELETE FROM generation_loras WHERE model_id = ?')
      .run(library.modelId('lora', 'detail'))
    expect(counter.current()).toBeGreaterThan(before)
  })
})

describe('model stats memory over the library database', () => {
  it('survives gallery facet reads', () => {
    const first = stats.overview()
    filteredFacets()
    filteredFacets()
    expect(stats.overview()).toBe(first)
  })

  it('forgets after a generation is removed', () => {
    const before = stats.overview()
    library.db.prepare('DELETE FROM generations WHERE image_id = ?').run(library.ids.get(1))
    const after = stats.overview()
    expect(after).not.toBe(before)
    expect(after.checkpoints.map((stat) => stat.imageCount)).toEqual([3, 2])
  })

  it('forgets after a LoRA link is removed', () => {
    const detail = { kind: ModelKind.Lora, identity: 'detail' }
    expect(stats.usage(detail)?.model.imageCount).toBe(2)
    library.db
      .prepare('DELETE FROM generation_loras WHERE image_id = ? AND model_id = ?')
      .run(library.ids.get(2), library.modelId('lora', 'detail'))
    expect(stats.usage(detail)?.model.imageCount).toBe(1)
  })

  it('forgets after a model tag is applied, renamed and deleted', () => {
    const tags = new SqliteModelTagRepository(library.db)
    const detail = { kind: ModelKind.Lora, identity: 'detail' }
    const tag = tags.create('lighting', 1)
    const tagsOf = (): string[] =>
      (stats.overview().loras.find((stat) => stat.name === 'detail')?.tags ?? []).map(
        (entry) => entry.name
      )
    expect(tagsOf()).toEqual([])
    tags.apply(tag.id, detail, 1)
    expect(tagsOf()).toEqual(['lighting'])
    tags.rename(tag.id, 'lights')
    expect(tagsOf()).toEqual(['lights'])
    tags.delete(tag.id)
    expect(tagsOf()).toEqual([])
  })

  it('answers a repeated overview without querying again', () => {
    stats.overview()
    const overview = vi.spyOn(reader, 'overview')
    stats.overview()
    expect(overview).not.toHaveBeenCalled()
  })
})

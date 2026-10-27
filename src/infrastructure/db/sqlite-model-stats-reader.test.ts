import { beforeEach, describe, expect, it } from 'vitest'
import type { StoredGeneration } from '@domain/generation'
import { GalleryScopeKind, LAYOUT_STRIDE, SortOrder } from '@shared/gallery'
import { GeneratorKind, ModelKind } from '@shared/generation-kinds'
import { MetadataOrigin } from '@shared/metadata-kinds'
import type { ModelPair, ModelStat, ModelStatsOverview } from '@shared/model-stats'
import { filtersFor } from '@shared/model-stats-filters'
import type { ModelKey } from '@shared/models'
import { SqliteModelTagRepository } from './repositories/sqlite-model-tag-repository'
import { createImageSelector } from './search/create-image-selector'
import { SqliteGalleryReader } from './sqlite-gallery-reader'
import { SqliteModelStatsReader } from './sqlite-model-stats-reader'
import { searchLibrary, SEARCH_LIBRARY, type SearchLibrary } from './testing/search-library'

const generation = (fields: Partial<StoredGeneration>): StoredGeneration => ({
  generator: GeneratorKind.A1111,
  origin: MetadataOrigin.PngText,
  params: {},
  ...fields
})
const model = (name: string): { name: string; hash: null } => ({ name, hash: null })
const lora = (name: string): { name: string; weight: number; hash: null } => ({
  name,
  weight: 1,
  hash: null
})

/**
 * Seven images over checkpoints alpha and beta and LoRAs detail, style and pose, for the
 * refiner and pairing edge cases: image 1 has alpha as both model and refiner, image 5 has
 * only a refiner, image 6 has no generation data and image 7 no LoRA.
 */
const STATS_LIBRARY: Record<number, StoredGeneration | null> = {
  1: generation({
    checkpoint: model('alpha'),
    refiner: model('alpha'),
    loras: [lora('detail'), lora('style'), lora('pose')]
  }),
  2: generation({
    checkpoint: model('alpha'),
    refiner: model('beta'),
    loras: [lora('detail'), lora('style')]
  }),
  3: generation({ checkpoint: model('beta'), loras: [lora('detail')] }),
  4: generation({
    checkpoint: model('beta'),
    refiner: model('alpha'),
    loras: [lora('style'), lora('pose')]
  }),
  5: generation({ refiner: model('beta'), loras: [lora('pose')] }),
  6: null,
  7: generation({ checkpoint: model('alpha') })
}

const LIMIT = 50
const everyModel = { modelTagId: null, limit: LIMIT }

const key = (kind: ModelKind, identity: string): ModelKey => ({ kind, identity })

let library: SearchLibrary
let reader: SqliteModelStatsReader
let tags: SqliteModelTagRepository

function open(source?: Record<number, StoredGeneration | null>): void {
  library = searchLibrary(source)
  reader = new SqliteModelStatsReader(library.db)
  tags = new SqliteModelTagRepository(library.db)
}

const tag = (name: string, ...tagged: ModelKey[]): number => {
  const { id } = tags.create(name, 1)
  for (const model of tagged) tags.apply(id, model, 1)
  return id
}

const counts = (stats: readonly ModelStat[]): [string, number][] =>
  stats.map((stat) => [stat.name, stat.imageCount])
const pairs = (rows: readonly ModelPair[]): [string, string, number][] =>
  rows.map((row) => [row.first.name, row.second.name, row.imageCount])

describe('SqliteModelStatsReader on the search library', () => {
  beforeEach(() => open())

  it('ranks checkpoints as model or refiner and LoRAs, then name', () => {
    const { checkpoints, loras } = reader.overview(everyModel)
    expect(counts(checkpoints)).toEqual([
      ['alpha', 3],
      ['beta', 3]
    ])
    expect(counts(loras)).toEqual([
      ['detail', 2],
      ['style', 2]
    ])
    expect(checkpoints[0]).toMatchObject({
      id: library.modelId('checkpoint', 'alpha'),
      kind: ModelKind.Checkpoint,
      identity: 'alpha',
      tags: []
    })
  })

  it('pairs each checkpoint with the LoRAs of its images, the checkpoint first', () => {
    const { checkpointLoraPairs, loraPairs } = reader.overview(everyModel)
    expect(pairs(checkpointLoraPairs)).toEqual([
      ['alpha', 'detail', 2],
      ['alpha', 'style', 1],
      ['beta', 'style', 1]
    ])
    expect(pairs(loraPairs)).toEqual([['detail', 'style', 1]])
  })

  it('shows a model its tags, in name order', () => {
    tag('lighting', key(ModelKind.Lora, 'detail'))
    tag('b-roll', key(ModelKind.Lora, 'detail'))
    const detail = reader.overview(everyModel).loras.find((stat) => stat.name === 'detail')
    expect(detail?.tags.map((entry) => entry.name)).toEqual(['b-roll', 'lighting'])
  })

  it('cuts every list to the limit', () => {
    const overview = reader.overview({ modelTagId: null, limit: 1 })
    expect(overview.checkpoints).toHaveLength(1)
    expect(overview.loras).toHaveLength(1)
    expect(overview.checkpointLoraPairs).toHaveLength(1)
    expect(overview.loraPairs).toHaveLength(1)
    expect(pairs(overview.checkpointLoraPairs)).toEqual([['alpha', 'detail', 2]])
  })

  it('keeps tagged models and the pairs with a tagged side', () => {
    const styled = tag('look', key(ModelKind.Lora, 'style'))
    const overview = reader.overview({ modelTagId: styled, limit: LIMIT })
    expect(overview.checkpoints).toEqual([])
    expect(counts(overview.loras)).toEqual([['style', 2]])
    expect(pairs(overview.checkpointLoraPairs)).toEqual([
      ['alpha', 'style', 1],
      ['beta', 'style', 1]
    ])
    expect(pairs(overview.loraPairs)).toEqual([['detail', 'style', 1]])
  })

  it('lists a tagged checkpoint, and its pairs whichever LoRA they hold', () => {
    const base = tag('base', key(ModelKind.Checkpoint, 'beta'))
    const overview = reader.overview({ modelTagId: base, limit: LIMIT })
    expect(counts(overview.checkpoints)).toEqual([['beta', 3]])
    expect(overview.loras).toEqual([])
    expect(pairs(overview.checkpointLoraPairs)).toEqual([['beta', 'style', 1]])
    expect(overview.loraPairs).toEqual([])
  })

  it('is empty for a tag no model carries or that does not exist', () => {
    const empty = tag('unused')
    const none: ModelStatsOverview = {
      checkpoints: [],
      loras: [],
      checkpointLoraPairs: [],
      loraPairs: []
    }
    expect(reader.overview({ modelTagId: empty, limit: LIMIT })).toEqual(none)
    expect(reader.overview({ modelTagId: 999, limit: LIMIT })).toEqual(none)
  })

  it('has no usage for an unknown model or one added by hand', () => {
    expect(reader.usage(key(ModelKind.Lora, 'nothing'), LIMIT)).toBeNull()
    library.db
      .prepare(
        `INSERT INTO model_info (kind, identity, display_name, created_at, updated_at)
         VALUES ('lora', 'by-hand', 'By Hand', 1, 1)`
      )
      .run()
    expect(reader.usage(key(ModelKind.Lora, 'by-hand'), LIMIT)).toBeNull()
  })

  it('has no usage for a model no image uses any more', () => {
    library.db.prepare('DELETE FROM generation_loras').run()
    expect(reader.usage(key(ModelKind.Lora, 'detail'), LIMIT)).toBeNull()
  })

  it('shows a LoRA its partner LoRAs and its checkpoints', () => {
    const usage = reader.usage(key(ModelKind.Lora, 'detail'), LIMIT)
    expect(usage?.model).toMatchObject({ name: 'detail', kind: ModelKind.Lora, imageCount: 2 })
    expect(pairs(usage?.loras ?? [])).toEqual([['detail', 'style', 1]])
    expect(pairs(usage?.checkpoints ?? [])).toEqual([['alpha', 'detail', 2]])
  })

  it('shows a checkpoint its LoRAs and no checkpoints', () => {
    const usage = reader.usage(key(ModelKind.Checkpoint, 'alpha'), LIMIT)
    expect(usage?.model).toMatchObject({ name: 'alpha', imageCount: 3 })
    expect(pairs(usage?.loras ?? [])).toEqual([
      ['alpha', 'detail', 2],
      ['alpha', 'style', 1]
    ])
    expect(usage?.checkpoints).toEqual([])
  })
})

describe('SqliteModelStatsReader on the refiner and pairing library', () => {
  beforeEach(() => open(STATS_LIBRARY))

  it('counts an image once for a checkpoint that is also its refiner', () => {
    expect(counts(reader.overview(everyModel).checkpoints)).toEqual([
      ['alpha', 4],
      ['beta', 4]
    ])
  })

  it('counts a refiner-only image for its refiner', () => {
    const usage = reader.usage(key(ModelKind.Checkpoint, 'beta'), LIMIT)
    expect(pairs(usage?.loras ?? [])).toEqual([
      ['beta', 'detail', 2],
      ['beta', 'pose', 2],
      ['beta', 'style', 2]
    ])
  })

  it('lists each pair once, the checkpoint first and the lower LoRA id first', () => {
    const { checkpointLoraPairs, loraPairs } = reader.overview(everyModel)
    expect(pairs(checkpointLoraPairs)).toEqual([
      ['alpha', 'style', 3],
      ['alpha', 'detail', 2],
      ['alpha', 'pose', 2],
      ['beta', 'detail', 2],
      ['beta', 'style', 2],
      ['beta', 'pose', 2]
    ])
    expect(pairs(loraPairs)).toEqual([
      ['detail', 'style', 2],
      ['style', 'pose', 2],
      ['detail', 'pose', 1]
    ])
    for (const { first, second } of loraPairs) expect(first.id).toBeLessThan(second.id)
  })

  it('counts a pair of tagged LoRAs once when both are tagged', () => {
    const both = tag('both', key(ModelKind.Lora, 'detail'), key(ModelKind.Lora, 'style'))
    const overview = reader.overview({ modelTagId: both, limit: LIMIT })
    expect(pairs(overview.loraPairs)).toEqual([
      ['detail', 'style', 2],
      ['style', 'pose', 2],
      ['detail', 'pose', 1]
    ])
    expect(counts(overview.loras)).toEqual([
      ['detail', 3],
      ['style', 3]
    ])
  })

  it('counts a checkpoint pair once when its checkpoint and LoRA are both tagged', () => {
    const both = tag('both', key(ModelKind.Checkpoint, 'alpha'), key(ModelKind.Lora, 'style'))
    const overview = reader.overview({ modelTagId: both, limit: LIMIT })
    expect(pairs(overview.checkpointLoraPairs)).toEqual([
      ['alpha', 'style', 3],
      ['alpha', 'detail', 2],
      ['alpha', 'pose', 2],
      ['beta', 'style', 2]
    ])
  })

  it('shows a LoRA the other LoRAs and checkpoints of its images', () => {
    const usage = reader.usage(key(ModelKind.Lora, 'pose'), LIMIT)
    expect(pairs(usage?.loras ?? [])).toEqual([
      ['style', 'pose', 2],
      ['detail', 'pose', 1]
    ])
    expect(pairs(usage?.checkpoints ?? [])).toEqual([
      ['alpha', 'pose', 2],
      ['beta', 'pose', 2]
    ])
  })

  it('cuts usage lists to the limit', () => {
    const usage = reader.usage(key(ModelKind.Checkpoint, 'alpha'), 2)
    expect(usage?.loras).toHaveLength(2)
  })
})

describe('the gallery behind every stats row', () => {
  const sources: [string, Record<number, StoredGeneration | null> | undefined][] = [
    ['the search library', SEARCH_LIBRARY],
    ['the refiner and pairing library', STATS_LIBRARY]
  ]

  describe.each(sources)('on %s', (_name, source) => {
    beforeEach(() => open(source))

    const galleryCount = (row: Parameters<typeof filtersFor>[0]): number => {
      const gallery = new SqliteGalleryReader(library.db, createImageSelector(library.db))
      const layout = gallery.layout({
        scope: { kind: GalleryScopeKind.All },
        sort: SortOrder.Newest,
        filters: filtersFor(row)
      })
      return layout.length / LAYOUT_STRIDE
    }

    const allRows = (overview: ModelStatsOverview): (ModelStat | ModelPair)[] => [
      ...overview.checkpoints,
      ...overview.loras,
      ...overview.checkpointLoraPairs,
      ...overview.loraPairs
    ]

    it('holds exactly the images each overview row counts', () => {
      const rows = allRows(reader.overview(everyModel))
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) expect(galleryCount(row)).toBe(row.imageCount)
    })

    it('holds exactly the images each tagged overview row counts', () => {
      const tagged = tag(
        'some',
        key(ModelKind.Lora, 'style'),
        key(ModelKind.Lora, 'detail'),
        key(ModelKind.Checkpoint, 'beta')
      )
      const rows = allRows(reader.overview({ modelTagId: tagged, limit: LIMIT }))
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) expect(galleryCount(row)).toBe(row.imageCount)
    })

    it('holds exactly the images each usage row counts', () => {
      const models = allRows(reader.overview(everyModel)).filter(
        (row): row is ModelStat => 'identity' in row
      )
      for (const { kind, identity, imageCount } of models) {
        const usage = reader.usage(key(kind, identity), LIMIT)
        expect(usage?.model.imageCount).toBe(imageCount)
        for (const row of [...(usage?.loras ?? []), ...(usage?.checkpoints ?? [])]) {
          expect(galleryCount(row)).toBe(row.imageCount)
        }
      }
    })
  })
})

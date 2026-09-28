import { beforeEach, describe, expect, it } from 'vitest'
import { AlbumService } from '@application/album-service'
import type { ImageId } from '@domain/library'
import { GalleryScopeKind, LAYOUT_STRIDE, SortOrder, type GalleryQuery } from '@shared/gallery'
import { GeneratorKind } from '@shared/generation-kinds'
import { ImageFormat } from '@shared/image-format'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { ChangeOutcome } from '@shared/albums'
import { KeywordScope, SetMatchMode, type SearchFilters } from '@shared/search'
import { SqliteAlbumRepository } from '../repositories/sqlite-album-repository'
import { SqliteGenerationRepository } from '../repositories/sqlite-generation-repository'
import { SqliteImageRepository } from '../repositories/sqlite-image-repository'
import { SqliteImageVersionCheck } from '../repositories/sqlite-image-version-check'
import { SqliteModelCatalog } from '../repositories/sqlite-model-catalog'
import { SqliteTagRepository } from '../repositories/sqlite-tag-repository'
import { SqliteGalleryReader } from '../sqlite-gallery-reader'
import { searchLibrary, type SearchLibrary } from '../testing/search-library'
import { createImageSelector } from './create-image-selector'
import { SqliteFacetReader } from './sqlite-facet-reader'
import { SqliteSmartAlbumEvaluator } from './sqlite-smart-album-evaluator'
import { SqliteStoredFilterCodec } from './stored-filter-codec'

let library: SearchLibrary
let codec: SqliteStoredFilterCodec
let albums: AlbumService
const image = (n: number): ImageId => library.ids.get(n) ?? (0 as ImageId)
const alpha = (): number => library.modelId('checkpoint', 'alpha')
const lora = (name: string): number => library.modelId('lora', name)

beforeEach(() => {
  library = searchLibrary()
  codec = new SqliteStoredFilterCodec(library.db)
  const selector = createImageSelector(library.db)
  albums = new AlbumService(
    new SqliteAlbumRepository(library.db),
    codec,
    new SqliteSmartAlbumEvaluator(library.db, selector),
    () => 1
  )
})

/** The library's image numbers a query shows, in order. */
function numbers(query: GalleryQuery): number[] {
  const layout = new SqliteGalleryReader(library.db, createImageSelector(library.db)).layout(query)
  const byId = new Map([...library.ids].map(([n, id]) => [id as number, n]))
  const found: number[] = []
  for (let index = 0; index < layout.length; index += LAYOUT_STRIDE) {
    found.push(byId.get(layout[index] ?? 0) ?? 0)
  }
  return found
}

function smartAlbum(filters: SearchFilters): number {
  const change = albums.createSmart('Saved', filters)
  if (change.outcome !== ChangeOutcome.Done) throw new Error('smart album not created')
  return change.album.id
}

const inAlbum = (albumId: number, extra: Partial<GalleryQuery> = {}): GalleryQuery => ({
  scope: { kind: GalleryScopeKind.Album, albumId },
  sort: SortOrder.AlbumOrder,
  ...extra
})

describe('SqliteStoredFilterCodec', () => {
  it('stores models, tags and the prompt by name and resolves them back to ids', () => {
    const tags = new SqliteTagRepository(library.db)
    const red = tags.create('Red', 1)
    const draft = tags.create('draft', 1)
    const filters: SearchFilters = {
      checkpointIds: [alpha()],
      loras: { ids: [lora('detail')], mode: SetMatchMode.All, minWeight: 0.5 },
      keywords: { query: 'girl', scope: KeywordScope.Positive },
      generators: [GeneratorKind.A1111],
      samePromptAs: image(1),
      tags: { ids: [red.id], mode: SetMatchMode.Any, excludeIds: [draft.id] },
      favoritesOnly: true,
      minRating: 2
    }
    const stored = codec.store(filters)
    expect(stored).toEqual({
      checkpoints: [{ identity: 'alpha' }],
      loras: { models: [{ identity: 'detail' }], mode: SetMatchMode.All, minWeight: 0.5 },
      keywords: { query: 'girl', scope: KeywordScope.Positive },
      generators: [GeneratorKind.A1111],
      samePrompt: 'red hair girl, cyberpunk city',
      tags: { names: ['Red'], mode: SetMatchMode.Any, excludeNames: ['draft'] },
      favoritesOnly: true,
      minRating: 2
    })
    expect(JSON.stringify(stored)).not.toMatch(/"(ids|checkpointIds|samePromptAs)"/)
    // "Same prompt" comes back as the first image with that prompt, which matches the same set.
    expect(codec.resolve(stored)).toEqual({ ...filters, samePromptAs: image(1) })
  })

  it('matches nothing when a name that must match is gone, and drops gone exclusions', () => {
    const detail = [{ identity: 'detail' }, { identity: 'gone' }]
    expect(codec.resolve({ loras: { models: detail, mode: SetMatchMode.All } })).toBeUndefined()
    expect(codec.resolve({ loras: { models: detail, mode: SetMatchMode.Any } })).toEqual({
      loras: { ids: [lora('detail')], mode: SetMatchMode.Any }
    })
    expect(codec.resolve({ checkpoints: [{ identity: 'gone' }] })).toBeUndefined()
    expect(codec.resolve({ samePrompt: 'no such prompt' })).toBeUndefined()
    expect(codec.resolve({ tags: { names: ['gone'], mode: SetMatchMode.Any } })).toBeUndefined()
    expect(codec.resolve({ tags: { excludeNames: ['gone'], mode: SetMatchMode.Any } })).toEqual({})
  })
})

describe('smart albums', () => {
  it('show what matches their search, newest first, and count it', () => {
    const albumId = smartAlbum({ checkpointIds: [alpha()] })
    expect(numbers(inAlbum(albumId))).toEqual([6, 2, 1])
    expect(albums.list()[0]).toMatchObject({ imageCount: 3, coverImageId: image(6) })
  })

  it('re-evaluate on open, so a newly indexed match appears', () => {
    const albumId = smartAlbum({ checkpointIds: [alpha()] })
    const [version] = new SqliteImageRepository(library.db).upsertMany(
      [
        {
          directoryId: library.folderA,
          fileName: 'new.png',
          format: ImageFormat.Png,
          sizeBytes: 1,
          mtimeMs: 1,
          width: 10,
          height: 10,
          createdAt: 100
        }
      ],
      1
    )
    if (!version) throw new Error('no version')
    new SqliteGenerationRepository(
      library.db,
      new SqliteModelCatalog(library.db),
      new SqliteImageVersionCheck(library.db)
    ).replace(version, {
      generator: GeneratorKind.A1111,
      origin: MetadataOrigin.PngText,
      params: {},
      checkpoint: { name: 'alpha', hash: null }
    })
    const layout = new SqliteGalleryReader(library.db, createImageSelector(library.db)).layout(
      inAlbum(albumId)
    )
    expect(layout[0]).toBe(version.id)
    expect(albums.list()[0]?.imageCount).toBe(4)
  })

  it('compose with the route filters and the facets', () => {
    const albumId = smartAlbum({ checkpointIds: [alpha()] })
    const query = inAlbum(albumId, { filters: { seed: '1' } })
    expect(numbers(query)).toEqual([1])
    const facets = new SqliteFacetReader(library.db, createImageSelector(library.db)).facets(query)
    // The seed facet isn't a picker; the checkpoint facet counts within the album and seed.
    expect(facets.checkpoints.find((value) => value.id === alpha())?.count).toBe(1)
  })

  it('match nothing when the saved search is not valid', () => {
    const albumId = smartAlbum({ checkpointIds: [alpha()] })
    library.db
      .prepare('UPDATE albums SET filters_json = ? WHERE id = ?')
      .run('{"bogus":1}', albumId)
    expect(numbers(inAlbum(albumId))).toEqual([])
    expect(albums.list()[0]?.imageCount).toBe(0)
  })

  it('take no entries or moves, and take any image as the cover', () => {
    const albumId = smartAlbum({ checkpointIds: [alpha()] })
    expect(albums.add(albumId, [image(3)])).toBe(0)
    expect(albums.move(albumId, [image(1)], null)).toBe(0)
    const change = albums.setCover(albumId, image(3))
    expect(change).toMatchObject({ album: { coverImageId: image(3) } })
  })
})

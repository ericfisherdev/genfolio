import { beforeEach, describe, expect, it } from 'vitest'
import type { ImageId } from '@domain/library'
import { DuplicateAlbumError, UnknownAlbumError } from '@domain/repositories'
import { AlbumKind } from '@shared/album-kinds'
import { GalleryScopeKind, LAYOUT_STRIDE, SortOrder } from '@shared/gallery'
import { createImageSelector } from '../search/create-image-selector'
import { SqliteFacetReader } from '../search/sqlite-facet-reader'
import { SqliteGalleryReader } from '../sqlite-gallery-reader'
import { searchLibrary, type SearchLibrary } from '../testing/search-library'
import { SqliteAlbumRepository } from './sqlite-album-repository'

let library: SearchLibrary
let albums: SqliteAlbumRepository
const image = (n: number): ImageId => library.ids.get(n) ?? (0 as ImageId)
/** The library's image numbers (1–6) of an album, in album order. */
function numbersIn(albumId: number, sort = SortOrder.AlbumOrder): number[] {
  const layout = new SqliteGalleryReader(library.db, createImageSelector(library.db)).layout({
    scope: { kind: GalleryScopeKind.Album, albumId },
    sort
  })
  const byId = new Map([...library.ids].map(([n, id]) => [id as number, n]))
  const numbers: number[] = []
  for (let index = 0; index < layout.length; index += LAYOUT_STRIDE) {
    numbers.push(byId.get(layout[index] ?? 0) ?? 0)
  }
  return numbers
}

beforeEach(() => {
  library = searchLibrary()
  albums = new SqliteAlbumRepository(library.db)
})

describe('SqliteAlbumRepository', () => {
  it('creates manual albums and rejects a name that folds to an existing one', () => {
    const trip = albums.create('Trip', 1)
    expect(trip).toMatchObject({ name: 'Trip', kind: AlbumKind.Manual, imageCount: 0 })
    expect(trip.coverImageId).toBeNull()
    expect(() => albums.create(' trip ', 1)).toThrow(DuplicateAlbumError)
  })

  it('renames, allowing a new spelling of the same key, and deletes', () => {
    const trip = albums.create('Trip', 1)
    const other = albums.create('Other', 1)
    expect(albums.rename(trip.id, 'TRIP').name).toBe('TRIP')
    expect(() => albums.rename(other.id, 'trip')).toThrow(DuplicateAlbumError)
    expect(() => albums.rename(999, 'x')).toThrow(UnknownAlbumError)
    expect(albums.delete(trip.id)).toBe(true)
    expect(albums.delete(trip.id)).toBe(false)
    expect(albums.list().map((album) => album.name)).toEqual(['Other'])
  })

  it('appends in the given order, ignoring members and unknown ids', () => {
    const trip = albums.create('Trip', 1)
    expect(albums.add(trip.id, [image(3), image(1)])).toBe(2)
    expect(albums.add(trip.id, [image(1), image(5), 999_999 as ImageId])).toBe(1)
    expect(albums.add(999, [image(2)])).toBe(0)
    expect(numbersIn(trip.id)).toEqual([3, 1, 5])
    expect(albums.find(trip.id)).toMatchObject({ imageCount: 3, coverImageId: image(3) })
  })

  it('removes entries and deleting an image drops it from the album', () => {
    const trip = albums.create('Trip', 1)
    albums.add(trip.id, [image(1), image(2), image(3)])
    expect(albums.remove(trip.id, [image(2), image(4)])).toBe(1)
    library.db.prepare('DELETE FROM images WHERE id = ?').run(image(1))
    expect(numbersIn(trip.id)).toEqual([3])
  })

  it('moves one or several images before another, to the start or to the end', () => {
    const trip = albums.create('Trip', 1)
    albums.add(trip.id, [image(1), image(2), image(3), image(4), image(5)])
    expect(albums.move(trip.id, [image(5)], image(2))).toBe(1)
    expect(numbersIn(trip.id)).toEqual([1, 5, 2, 3, 4])
    albums.move(trip.id, [image(4), image(1)], image(1))
    expect(numbersIn(trip.id)).toEqual([1, 4, 5, 2, 3])
    albums.move(trip.id, [image(3)], image(1))
    expect(numbersIn(trip.id)).toEqual([3, 1, 4, 5, 2])
    albums.move(trip.id, [image(3), image(1)], null)
    expect(numbersIn(trip.id)).toEqual([4, 5, 2, 3, 1])
    expect(albums.move(trip.id, [image(6)], null)).toBe(0)
  })

  it('keeps a stable order through many moves into the same gap', () => {
    const trip = albums.create('Trip', 1)
    albums.add(trip.id, [image(1), image(2), image(3), image(4)])
    // Each move lands between 1 and the image moved last, halving that gap every time.
    const expected = [1, 2, 3, 4]
    for (let round = 0; round < 200; round++) {
      const mover = round % 2 === 0 ? 4 : 3
      const before = expected[1] === mover ? (expected[2] as number) : (expected[1] as number)
      albums.move(trip.id, [image(mover)], image(before))
      expected.splice(expected.indexOf(mover), 1)
      expected.splice(expected.indexOf(before), 0, mover)
      expect(numbersIn(trip.id)).toEqual(expected)
    }
    const positions = library.db
      .prepare('SELECT position FROM album_images WHERE album_id = ? ORDER BY position')
      .pluck()
      .all(trip.id) as number[]
    expect(new Set(positions).size).toBe(positions.length)
  })

  it('keeps a chosen cover while it is in the album, else uses the first image', () => {
    const trip = albums.create('Trip', 1)
    albums.add(trip.id, [image(1), image(2)])
    expect(albums.setCover(trip.id, image(2)).coverImageId).toBe(image(2))
    expect(albums.setCover(trip.id, image(5)).coverImageId).toBe(image(2))
    albums.remove(trip.id, [image(2)])
    expect(albums.find(trip.id).coverImageId).toBe(image(1))
    expect(() => albums.setCover(999, null)).toThrow(UnknownAlbumError)
  })

  it('sorts an album by the other orders and newest outside an album', () => {
    const trip = albums.create('Trip', 1)
    albums.add(trip.id, [image(1), image(6), image(3)])
    const newest = numbersIn(trip.id, SortOrder.Newest)
    expect([...newest].sort()).toEqual([1, 3, 6])
    const reader = new SqliteGalleryReader(library.db, createImageSelector(library.db))
    const all = { scope: { kind: GalleryScopeKind.All } as const }
    expect(reader.layout({ ...all, sort: SortOrder.AlbumOrder })).toEqual(
      reader.layout({ ...all, sort: SortOrder.Newest })
    )
  })

  it('composes the album scope with filters and facets', () => {
    const trip = albums.create('Trip', 1)
    albums.add(trip.id, [image(1), image(2), image(3)])
    const query = {
      scope: { kind: GalleryScopeKind.Album, albumId: trip.id },
      sort: SortOrder.AlbumOrder,
      filters: { hasMetadata: false }
    } as const
    const reader = new SqliteGalleryReader(library.db, createImageSelector(library.db))
    const facets = new SqliteFacetReader(library.db, createImageSelector(library.db)).facets(query)
    const inAlbum = reader.layout({ ...query, filters: {} }).length / LAYOUT_STRIDE
    const withoutMetadata = reader.layout(query).length / LAYOUT_STRIDE
    expect(inAlbum).toBe(3)
    expect(facets.withoutMetadata).toBe(withoutMetadata)
  })
})

import { describe, expect, it } from 'vitest'
import type { ImageId } from '@domain/library'
import { SqliteAlbumRepository } from '@infrastructure/db/repositories/sqlite-album-repository'
import { searchLibrary } from '@infrastructure/db/testing/search-library'
import { ChangeOutcome } from '@shared/albums'
import { AlbumService } from './album-service'

function service(): AlbumService {
  return new AlbumService(new SqliteAlbumRepository(searchLibrary().db), () => 42)
}

describe('AlbumService', () => {
  it('reports duplicates and missing albums as outcomes', () => {
    const albums = service()
    const created = albums.create('Trip')
    expect(created).toMatchObject({ outcome: ChangeOutcome.Done, album: { name: 'Trip' } })
    const id = created.outcome === ChangeOutcome.Done ? created.album.id : 0
    expect(albums.create('trip')).toMatchObject({
      outcome: ChangeOutcome.Duplicate,
      existing: { id }
    })
    expect(albums.rename(999, 'x')).toEqual({ outcome: ChangeOutcome.Missing })
    expect(albums.setCover(999, null)).toEqual({ outcome: ChangeOutcome.Missing })
  })

  it('adds, moves and removes by id lists', () => {
    const albums = service()
    const created = albums.create('Trip')
    const id = created.outcome === ChangeOutcome.Done ? created.album.id : 0
    const [one, two] = [1 as ImageId, 2 as ImageId]
    expect(albums.add(id, [one, two])).toBe(2)
    expect(albums.move(id, [two], one)).toBe(1)
    expect(albums.list()[0]).toMatchObject({ imageCount: 2, coverImageId: two })
    expect(albums.remove(id, [one])).toBe(1)
    expect(albums.delete(id)).toBe(true)
  })
})

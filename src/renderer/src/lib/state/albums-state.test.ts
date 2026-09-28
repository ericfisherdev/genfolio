import { describe, expect, it, vi, type Mock } from 'vitest'
import { AlbumKind, ChangeOutcome, MAX_IDS_PER_ALBUM_EDIT, type Album } from '@shared/albums'
import { AlbumsState } from './albums.svelte'

const TRIP: Album = {
  id: 3,
  name: 'Trip',
  kind: AlbumKind.Manual,
  imageCount: 0,
  coverImageId: null
}

interface Harness {
  readonly api: {
    readonly listAlbums: Mock<() => Promise<Album[]>>
    readonly addToAlbum: Mock<(albumId: number, ids: readonly number[]) => Promise<number>>
    readonly moveInAlbum: Mock<
      (albumId: number, ids: readonly number[], beforeId: number | null) => Promise<number>
    >
  }
  readonly notices: { notify: Mock<(message: string) => void> }
  readonly onchange: Mock<() => void>
  readonly albums: AlbumsState
}

function setup(): Harness {
  const api = {
    listAlbums: vi.fn(async () => [TRIP]),
    createAlbum: vi.fn(async () => ({ outcome: ChangeOutcome.Duplicate, existing: TRIP }) as const),
    createSmartAlbum: vi.fn(
      async () => ({ outcome: ChangeOutcome.Duplicate, existing: TRIP }) as const
    ),
    renameAlbum: vi.fn(async () => ({ outcome: ChangeOutcome.Missing }) as const),
    deleteAlbum: vi.fn(async () => true),
    setAlbumCover: vi.fn(async () => ({ outcome: ChangeOutcome.Done, album: TRIP }) as const),
    addToAlbum: vi.fn(async (_album: number, ids: readonly number[]) => ids.length),
    removeFromAlbum: vi.fn(async (): Promise<number> => {
      throw new Error('service down')
    }),
    moveInAlbum: vi.fn<
      (albumId: number, ids: readonly number[], beforeId: number | null) => Promise<number>
    >(async (_album, ids) => ids.length)
  }
  const notices = { notify: vi.fn<(message: string) => void>() }
  const onchange = vi.fn<() => void>()
  return { api, notices, onchange, albums: new AlbumsState(api, notices, onchange) }
}

describe('AlbumsState', () => {
  it('returns the existing album for a taken name and reloads after each change', async () => {
    const { albums, api, onchange } = setup()
    expect(await albums.ensure('trip')).toEqual(TRIP)
    expect(albums.find(3)).toEqual(TRIP)
    expect(albums.loaded).toBe(true)
    expect(api.listAlbums).toHaveBeenCalledTimes(1)
    expect(onchange).toHaveBeenCalledTimes(1)
  })

  it('does not save a smart album over a taken name', async () => {
    const { albums, notices } = setup()
    expect(await albums.createSmart('Trip', { favoritesOnly: true })).toBeUndefined()
    expect(notices.notify).toHaveBeenCalledWith('An album named “Trip” already exists.')
  })

  it('says when an album is gone or a command fails', async () => {
    const { albums, notices } = setup()
    await albums.rename(TRIP, 'Holiday')
    expect(notices.notify).toHaveBeenCalledWith('That album no longer exists.')
    expect(await albums.remove(TRIP, [1])).toBeUndefined()
    expect(notices.notify).toHaveBeenLastCalledWith('Could not remove from the album: service down')
  })

  it('adds and moves large selections in chunks', async () => {
    const { albums, api } = setup()
    const ids = Array.from({ length: MAX_IDS_PER_ALBUM_EDIT + 2 }, (_, index) => index + 1)
    expect(await albums.add(TRIP, ids)).toBe(ids.length)
    expect(api.addToAlbum.mock.calls.map(([, chunk]) => chunk.length)).toEqual([
      MAX_IDS_PER_ALBUM_EDIT,
      2
    ])
    await albums.move(TRIP, ids, 7)
    expect(api.moveInAlbum.mock.calls.map(([, chunk, before]) => [chunk.length, before])).toEqual([
      [MAX_IDS_PER_ALBUM_EDIT, 7],
      [2, 7]
    ])
  })
})

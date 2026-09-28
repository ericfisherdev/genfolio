import { describe, expect, it, vi, type Mock } from 'vitest'
import { AlbumKind, type Album } from '@shared/albums'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'
import type { GalleryQuery } from '@shared/gallery'
import { AlbumArranger } from './album-arranger.svelte'
import { dropBefore, stepTargets } from './album-arrangement'

const TRIP: Album = { id: 3, name: 'Trip', kind: AlbumKind.Manual, imageCount: 4, coverImageId: 10 }
const ids = [10, 20, 30, 40]
const order = {
  count: ids.length,
  indexOf: (id: number) => ids.indexOf(id),
  idAt: (index: number) => ids[index] ?? 0
}

describe('stepTargets', () => {
  it('moves earlier before the previous image and later before the one after next', () => {
    expect(stepTargets(order, 10)).toEqual({ earlier: undefined, later: 30 })
    expect(stepTargets(order, 20)).toEqual({ earlier: 10, later: 40 })
    expect(stepTargets(order, 30)).toEqual({ earlier: 20, later: null })
    expect(stepTargets(order, 40)).toEqual({ earlier: 30, later: undefined })
    expect(stepTargets(order, 99)).toEqual({ earlier: undefined, later: undefined })
  })
})

describe('dropBefore', () => {
  it('drops before the target, or before the next image on its far half', () => {
    expect(dropBefore(order, 20, false)).toBe(20)
    expect(dropBefore(order, 20, true)).toBe(30)
    expect(dropBefore(order, 40, true)).toBeNull()
  })
})

interface Harness {
  readonly albums: { readonly move: Mock<(...args: unknown[]) => Promise<void>> }
  readonly addToAlbum: Mock<(ids: number[]) => void>
  readonly arranger: AlbumArranger
}

function arranger(query: GalleryQuery, selected: number[] = []): Harness {
  const albums = {
    find: (id: number) => (id === TRIP.id ? TRIP : undefined),
    setCover: vi.fn(async () => undefined),
    remove: vi.fn(async () => 1),
    move: vi.fn<(...args: unknown[]) => Promise<void>>(async () => undefined)
  }
  const addToAlbum = vi.fn<(ids: number[]) => void>()
  const selection = { has: (id: number) => selected.includes(id), list: () => selected }
  return {
    albums,
    addToAlbum,
    arranger: new AlbumArranger(albums, { ...order, query }, selection, addToAlbum)
  }
}

const inTrip = (sort: SortOrder): GalleryQuery => ({
  scope: { kind: GalleryScopeKind.Album, albumId: TRIP.id },
  sort
})
const labels = (actions: { label: string }[]): string[] => actions.map((action) => action.label)

describe('AlbumArranger', () => {
  it('offers only adding outside an album', () => {
    const { arranger: outside, addToAlbum } = arranger(
      { scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Newest },
      [20, 30]
    )
    const actions = outside.cardActions(20)
    expect(labels(actions)).toEqual(['Add to album…'])
    actions[0]?.onselect()
    expect(addToAlbum).toHaveBeenCalledWith([20, 30])
    expect(outside.arrangeable).toBeUndefined()
  })

  it('offers removing and the cover in an album, and steps only in album order', () => {
    expect(labels(arranger(inTrip(SortOrder.Newest)).arranger.cardActions(20))).toEqual([
      'Add to album…',
      'Use as album cover',
      'Remove from album'
    ])
    const { arranger: ordered, albums } = arranger(inTrip(SortOrder.AlbumOrder))
    const actions = ordered.cardActions(20)
    expect(labels(actions)).toEqual([
      'Add to album…',
      'Use as album cover',
      'Remove from album',
      'Move to start',
      'Move earlier',
      'Move later',
      'Move to end'
    ])
    actions.find((action) => action.label === 'Move to start')?.onselect()
    expect(albums.move).toHaveBeenCalledWith(TRIP, [20], 10)
    expect(labels(ordered.cardActions(10))).not.toContain('Move earlier')
  })

  it('drags the selection a card belongs to, or just the card', () => {
    const { arranger: ordered, albums } = arranger(inTrip(SortOrder.AlbumOrder), [10, 20])
    const transfer = { effectAllowed: '', setData: vi.fn() }
    const event = (): DragEvent =>
      ({ dataTransfer: transfer, preventDefault: vi.fn() }) as unknown as DragEvent
    ordered.dragStart(event(), 20)
    ordered.dragOver(event(), 40, true)
    expect(ordered.dropAt).toEqual({ imageId: 40, after: true })
    ordered.drop(event())
    expect(albums.move).toHaveBeenCalledWith(TRIP, [10, 20], null)
    expect(ordered.dropAt).toBeUndefined()
    ordered.dragStart(event(), 30)
    ordered.dragOver(event(), 10, false)
    ordered.drop(event())
    expect(albums.move).toHaveBeenLastCalledWith(TRIP, [30], 10)
  })

  it('ignores drags when the album is not in its own order', () => {
    const { arranger: newest, albums } = arranger(inTrip(SortOrder.Newest))
    const event = {
      dataTransfer: { setData: vi.fn() },
      preventDefault: vi.fn()
    } as unknown as DragEvent
    newest.dragStart(event, 20)
    newest.dragOver(event, 10, false)
    newest.drop(event)
    expect(albums.move).not.toHaveBeenCalled()
  })
})

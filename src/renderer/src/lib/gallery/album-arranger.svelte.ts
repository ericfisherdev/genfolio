import { AlbumKind, type Album } from '@shared/albums'
import { GalleryScopeKind } from '@shared/gallery-kinds'
import type { MenuAction } from '../../components/ActionMenu.svelte'
import type { AlbumsState } from '../state/albums.svelte'
import type { GalleryState } from '../state/gallery.svelte'
import type { SelectionState } from '../state/selection.svelte'
import { arrangeableAlbum, dropBefore, stepTargets } from './album-arrangement'

type Albums = Pick<AlbumsState, 'find' | 'setCover' | 'remove' | 'move'>
type Results = Pick<GalleryState, 'query' | 'count' | 'indexOf' | 'idAt'>
type Selected = Pick<SelectionState, 'has' | 'list'>

/**
 * The album commands of the gallery's cards: adding to an album anywhere, choosing the cover
 * in any album, and in a manual album removing and arranging (menu steps, and dragging while
 * the album is shown in its own order). A card acts for the whole selection it is part of.
 */
export class AlbumArranger {
  /** Where a drag would drop, for the insertion marker. */
  dropAt: { imageId: number; after: boolean } | undefined = $state()
  private dragged: number[] | undefined

  constructor(
    private readonly albums: Albums,
    private readonly gallery: Results,
    private readonly selection: Selected,
    private readonly addToAlbum: (imageIds: number[]) => void
  ) {}

  /** The manual album shown in its own order, which cards can be dragged within. */
  get arrangeable(): Album | undefined {
    return arrangeableAlbum(this.gallery.query, (id) => this.albums.find(id))
  }

  cardActions(imageId: number): MenuAction[] {
    const actions: MenuAction[] = [
      { label: 'Add to album…', onselect: () => this.addToAlbum(this.targetsOf(imageId)) }
    ]
    const shown = this.albumShown()
    if (shown) {
      actions.push({
        label: 'Use as album cover',
        onselect: () => void this.albums.setCover(shown, imageId)
      })
    }
    if (shown?.kind === AlbumKind.Manual) {
      actions.push({
        label: 'Remove from album',
        onselect: () => void this.albums.remove(shown, this.targetsOf(imageId))
      })
    }
    const arrangeable = this.arrangeable
    return arrangeable ? [...actions, ...this.moveActions(arrangeable, imageId)] : actions
  }

  dragStart(event: DragEvent, imageId: number): void {
    if (!this.arrangeable || !event.dataTransfer) return
    this.dragged = this.targetsOf(imageId)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', this.dragged.join(','))
  }

  /** `after`: the pointer is over the far half of the target. */
  dragOver(event: DragEvent, imageId: number, after: boolean): void {
    if (!this.arrangeable || !this.dragged) return
    event.preventDefault()
    this.dropAt = { imageId, after }
  }

  drop(event: DragEvent): void {
    event.preventDefault()
    const album = this.arrangeable
    const ids = this.dragged
    const at = this.dropAt
    this.dragEnd()
    if (album && ids && at) {
      void this.albums.move(album, ids, dropBefore(this.gallery, at.imageId, at.after))
    }
  }

  dragEnd(): void {
    this.dragged = undefined
    this.dropAt = undefined
  }

  private albumShown(): Album | undefined {
    const scope = this.gallery.query?.scope
    return scope?.kind === GalleryScopeKind.Album ? this.albums.find(scope.albumId) : undefined
  }

  private moveActions(album: Album, imageId: number): MenuAction[] {
    const { earlier, later } = stepTargets(this.gallery, imageId)
    const move = (beforeId: number | null) => () =>
      void this.albums.move(album, [imageId], beforeId)
    return [
      ...(earlier !== undefined
        ? [
            { label: 'Move to start', onselect: move(this.gallery.idAt(0)) },
            { label: 'Move earlier', onselect: move(earlier) }
          ]
        : []),
      ...(later !== undefined
        ? [
            { label: 'Move later', onselect: move(later) },
            { label: 'Move to end', onselect: move(null) }
          ]
        : [])
    ]
  }

  private targetsOf(imageId: number): number[] {
    return this.selection.has(imageId) ? this.selection.list() : [imageId]
  }
}

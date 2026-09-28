import { AlbumKind, type Album } from '@shared/albums'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'
import type { GalleryQuery } from '@shared/gallery'
import type { DisplayOrder } from '../state/selection.svelte'

/** The manual album the query shows in its own order, which the user can then rearrange. */
export function arrangeableAlbum(
  query: GalleryQuery | undefined,
  find: (albumId: number) => Album | undefined
): Album | undefined {
  if (query?.scope.kind !== GalleryScopeKind.Album || query.sort !== SortOrder.AlbumOrder) {
    return undefined
  }
  const album = find(query.scope.albumId)
  return album?.kind === AlbumKind.Manual ? album : undefined
}

/** Where a one-step move lands: the image to go before (null: the end), or none possible. */
export interface StepTargets {
  readonly earlier: number | null | undefined
  readonly later: number | null | undefined
}

/**
 * Moving earlier goes before the previous image; later goes before the image after next (the
 * end when that is past the last). Undefined when the image is already first or last. Only
 * meaningful when the view shows the whole album, so steps match the stored order.
 */
export function stepTargets(order: DisplayOrder, imageId: number): StepTargets {
  const index = order.indexOf(imageId)
  if (index < 0) return { earlier: undefined, later: undefined }
  const last = order.count - 1
  return {
    earlier: index > 0 ? order.idAt(index - 1) : undefined,
    later: index >= last ? undefined : index + 2 <= last ? order.idAt(index + 2) : null
  }
}

/** The image a drop goes before: the target, or the one after it for a drop on its far half. */
export function dropBefore(order: DisplayOrder, targetId: number, after: boolean): number | null {
  if (!after) return targetId
  const index = order.indexOf(targetId)
  return index >= 0 && index + 1 < order.count ? order.idAt(index + 1) : null
}

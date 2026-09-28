import { describe, expect, it, vi } from 'vitest'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'
import type { GalleryQuery } from '@shared/gallery'
import { SetMatchMode } from '@shared/search-kinds'
import { LayoutUpdate } from './image-marks'
import { refreshAfterAlbumChange, refreshAfterTagChange } from './refresh-results'

const PLAIN: GalleryQuery = { scope: { kind: GalleryScopeKind.All }, sort: SortOrder.Newest }
const BY_TAG: GalleryQuery = {
  ...PLAIN,
  filters: { tags: { ids: [1], mode: SetMatchMode.All } }
}

function fakes(query: GalleryQuery): {
  gallery: { query: GalleryQuery; refreshLayout: () => Promise<void>; markLayoutStale: () => void }
  facets: { load: (query: GalleryQuery) => Promise<void> }
} {
  return {
    gallery: {
      query,
      refreshLayout: vi.fn(async () => undefined),
      markLayoutStale: vi.fn()
    },
    facets: { load: vi.fn(async () => undefined) }
  }
}

describe('refreshAfterTagChange', () => {
  it('reloads only the facets when the results do not depend on tags', () => {
    const { gallery, facets } = fakes(PLAIN)
    refreshAfterTagChange(gallery, facets, LayoutUpdate.Now)
    expect(facets.load).toHaveBeenCalledWith(PLAIN)
    expect(gallery.refreshLayout).not.toHaveBeenCalled()
  })

  it('reloads a tag-filtered layout at once', () => {
    const { gallery, facets } = fakes(BY_TAG)
    refreshAfterTagChange(gallery, facets, LayoutUpdate.Now)
    expect(gallery.refreshLayout).toHaveBeenCalled()
  })

  it('reloads an album, which may be a smart one searching by tags', () => {
    const album: GalleryQuery = { ...PLAIN, scope: { kind: GalleryScopeKind.Album, albumId: 2 } }
    const { gallery, facets } = fakes(album)
    refreshAfterTagChange(gallery, facets, LayoutUpdate.Now)
    expect(gallery.refreshLayout).toHaveBeenCalled()
  })

  it('only flags a tag-filtered layout stale while an image is open', () => {
    const { gallery, facets } = fakes(BY_TAG)
    refreshAfterTagChange(gallery, facets, LayoutUpdate.Deferred)
    expect(gallery.refreshLayout).not.toHaveBeenCalled()
    expect(gallery.markLayoutStale).toHaveBeenCalled()
  })
})

describe('refreshAfterAlbumChange', () => {
  const ALBUM: GalleryQuery = { ...PLAIN, scope: { kind: GalleryScopeKind.Album, albumId: 2 } }

  it('leaves views other than an album alone', () => {
    const { gallery, facets } = fakes(PLAIN)
    refreshAfterAlbumChange(gallery, facets, LayoutUpdate.Now)
    expect(facets.load).not.toHaveBeenCalled()
    expect(gallery.refreshLayout).not.toHaveBeenCalled()
  })

  it('reloads an album view and its facets, or flags it stale while an image is open', () => {
    const now = fakes(ALBUM)
    refreshAfterAlbumChange(now.gallery, now.facets, LayoutUpdate.Now)
    expect(now.gallery.refreshLayout).toHaveBeenCalled()
    expect(now.facets.load).toHaveBeenCalledWith(ALBUM)
    const deferred = fakes(ALBUM)
    refreshAfterAlbumChange(deferred.gallery, deferred.facets, LayoutUpdate.Deferred)
    expect(deferred.gallery.markLayoutStale).toHaveBeenCalled()
  })
})

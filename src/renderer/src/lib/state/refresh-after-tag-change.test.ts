import { describe, expect, it, vi } from 'vitest'
import { GalleryScopeKind, SortOrder } from '@shared/gallery-kinds'
import type { GalleryQuery } from '@shared/gallery'
import { SetMatchMode } from '@shared/search-kinds'
import { LayoutUpdate } from './image-marks'
import { refreshAfterTagChange } from './refresh-after-tag-change'

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

  it('only flags a tag-filtered layout stale while an image is open', () => {
    const { gallery, facets } = fakes(BY_TAG)
    refreshAfterTagChange(gallery, facets, LayoutUpdate.Deferred)
    expect(gallery.refreshLayout).not.toHaveBeenCalled()
    expect(gallery.markLayoutStale).toHaveBeenCalled()
  })
})

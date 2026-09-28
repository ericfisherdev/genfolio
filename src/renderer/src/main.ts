import { mount } from 'svelte'
import App from './App.svelte'
import { appServicesContext, type AppServices } from './lib/app-context'
import { RouterState, windowHashLocation } from './lib/routing/router.svelte'
import { GalleryState } from './lib/state/gallery.svelte'
import { AlbumsState } from './lib/state/albums.svelte'
import { ImageDeletion } from './lib/state/image-deletion.svelte'
import { SlideshowNavigator } from './lib/slideshow/slideshow-navigator'
import { SlideshowPresetsState } from './lib/slideshow/slideshow-presets.svelte'
import { SlideshowSettingsState } from './lib/slideshow/slideshow-settings.svelte'
import { SimilarityState } from './lib/state/similarity.svelte'
import { FacetsState } from './lib/state/facets.svelte'
import { GenerationCopier } from './lib/state/generation-copier'
import { GenerationDetailsState } from './lib/state/generation-details.svelte'
import { ImageMarks, layoutUpdateFor } from './lib/state/image-marks'
import { LibraryState } from './lib/state/library.svelte'
import { refreshAfterAlbumChange, refreshAfterTagChange } from './lib/state/refresh-results'
import { SelectionState } from './lib/state/selection.svelte'
import { TagsState } from './lib/state/tags.svelte'
import { ScanProgressState } from './lib/state/scan-progress.svelte'
import { localPreferenceStore, SortPreference } from './lib/state/sort-preference.svelte'
import './styles/tokens.css'

// Composition root of the renderer.

const target = document.getElementById('app')
if (!target) throw new Error('#app mount point missing from index.html')

const api = window.genfolio
const library = new LibraryState(api)
const gallery = new GalleryState(api)
const facets = new FacetsState(api)
const router = new RouterState(windowHashLocation(window))
const services: AppServices = {
  api,
  router,
  library,
  gallery,
  scans: new ScanProgressState(api, () => void library.refresh()),
  sort: new SortPreference(localPreferenceStore(() => window.localStorage)),
  generation: new GenerationDetailsState(api),
  copier: new GenerationCopier(api, library),
  facets,
  marks: new ImageMarks(api, gallery, facets, library),
  tags: new TagsState(api, library, () =>
    refreshAfterTagChange(gallery, facets, layoutUpdateFor(router.route))
  ),
  selection: new SelectionState(gallery),
  slideshowSettings: new SlideshowSettingsState(localPreferenceStore(() => window.localStorage)),
  slideshowPresets: new SlideshowPresetsState(api, library),
  slideshowNavigator: new SlideshowNavigator(router, gallery),
  similarity: new SimilarityState(api, library, () => void gallery.reload()),
  deletion: new ImageDeletion(api, library, () => void library.refresh()),
  albums: new AlbumsState(api, library, () =>
    refreshAfterAlbumChange(gallery, facets, layoutUpdateFor(router.route))
  )
}

export default mount(App, {
  target,
  context: appServicesContext(services)
})

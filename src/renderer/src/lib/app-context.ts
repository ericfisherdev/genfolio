import { getContext } from 'svelte'
import type { GenfolioApi } from '@shared/genfolio-api'
import type { RouterState } from './routing/router.svelte'
import type { AlbumsState } from './state/albums.svelte'
import type { SlideshowNavigator } from './slideshow/slideshow-navigator'
import type { SlideshowPresetsState } from './slideshow/slideshow-presets.svelte'
import type { SlideshowSettingsState } from './slideshow/slideshow-settings.svelte'
import type { FacetsState } from './state/facets.svelte'
import type { ModelFoldersState } from './state/model-folders.svelte'
import type { SimilarityState } from './state/similarity.svelte'
import type { ImageDeletion } from './state/image-deletion.svelte'
import type { GalleryState } from './state/gallery.svelte'
import type { GenerationCopier } from './state/generation-copier'
import type { ImageMarks } from './state/image-marks'
import type { SelectionState } from './state/selection.svelte'
import type { TagsState } from './state/tags.svelte'
import type { GenerationDetailsState } from './state/generation-details.svelte'
import type { LibraryState } from './state/library.svelte'
import type { ScanProgressState } from './state/scan-progress.svelte'
import type { SortPreference } from './state/sort-preference.svelte'

/** Everything the renderer shares, created once in main.ts and provided by context. */
export interface AppServices {
  readonly api: GenfolioApi
  readonly router: RouterState
  readonly library: LibraryState
  readonly gallery: GalleryState
  readonly scans: ScanProgressState
  readonly sort: SortPreference
  readonly generation: GenerationDetailsState
  readonly copier: GenerationCopier
  readonly facets: FacetsState
  readonly marks: ImageMarks
  readonly tags: TagsState
  readonly selection: SelectionState
  readonly albums: AlbumsState
  readonly deletion: ImageDeletion
  readonly slideshowSettings: SlideshowSettingsState
  readonly slideshowPresets: SlideshowPresetsState
  readonly slideshowNavigator: SlideshowNavigator
  readonly similarity: SimilarityState
  readonly modelFolders: ModelFoldersState
}

const APP_SERVICES = Symbol('app-services')

export function appServicesContext(services: AppServices): Map<symbol, AppServices> {
  return new Map([[APP_SERVICES, services]])
}

/** Throws when no ancestor provided the services — a wiring bug, not a runtime condition. */
export function getAppServices(): AppServices {
  const services = getContext<AppServices | undefined>(APP_SERVICES)
  if (!services) throw new Error('AppServices missing from component context')
  return services
}

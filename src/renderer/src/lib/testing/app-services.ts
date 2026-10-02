import type { GenfolioApi } from '@shared/genfolio-api'
import type { DirectoryNode } from '@shared/gallery'
import type { RootSummary } from '@shared/library'
import type { ScanEvent } from '@shared/scan'
import { appServicesContext, type AppServices } from '../app-context'
import { RouterState, type HashLocation } from '../routing/router.svelte'
import { GalleryState } from '../state/gallery.svelte'
import { AlbumsState } from '../state/albums.svelte'
import { DeleteMode } from '@shared/deletion-kinds'
import { ImageDeletion } from '../state/image-deletion.svelte'
import { SlideshowNavigator } from '../slideshow/slideshow-navigator'
import { SlideshowPresetsState } from '../slideshow/slideshow-presets.svelte'
import { SlideshowSettingsState } from '../slideshow/slideshow-settings.svelte'
import { CivitaiBrowseState } from '../state/civitai-browse.svelte'
import { CivitaiKeyState } from '../state/civitai-key.svelte'
import { DownloadsState } from '../state/downloads.svelte'
import { ModelFoldersState } from '../state/model-folders.svelte'
import { ModelsState } from '../state/models.svelte'
import { SimilarityState } from '../state/similarity.svelte'
import { FacetsState } from '../state/facets.svelte'
import { GenerationCopier } from '../state/generation-copier'
import { GenerationDetailsState } from '../state/generation-details.svelte'
import { ImageMarks, layoutUpdateFor } from '../state/image-marks'
import { LibraryState } from '../state/library.svelte'
import { refreshAfterAlbumChange, refreshAfterTagChange } from '../state/refresh-results'
import { SelectionState } from '../state/selection.svelte'
import { TagsState } from '../state/tags.svelte'
import { ScanProgressState } from '../state/scan-progress.svelte'
import { SortPreference, type PreferenceStore } from '../state/sort-preference.svelte'
import { fakeGenfolioApi } from './fake-genfolio-api'

/** In-memory location hash for router tests. */
export interface MemoryHash extends HashLocation {
  current: string
  /** Simulates the user editing the hash (fires hashchange). */
  change(hash: string): void
}

export function memoryHash(initial = ''): MemoryHash {
  let listeners: (() => void)[] = []
  const location = {
    current: initial,
    read: () => location.current,
    write: (hash: string) => {
      location.current = hash
    },
    replace: (hash: string) => {
      location.current = hash
    },
    onChange: (listener: () => void) => {
      listeners.push(listener)
      return () => {
        listeners = listeners.filter((l) => l !== listener)
      }
    },
    /** Simulates the user editing the hash (fires hashchange). */
    change: (hash: string) => {
      location.current = hash
      listeners.forEach((listener) => listener())
    }
  }
  return location
}

export function memoryStore(values: Record<string, string> = {}): PreferenceStore {
  return {
    get: (key) => values[key] ?? null,
    set: (key, value) => {
      values[key] = value
    }
  }
}

export interface TestLibrary {
  readonly roots: RootSummary[]
  readonly trees: Record<number, DirectoryNode | null>
}

export interface TestServices {
  readonly services: AppServices
  readonly context: Map<symbol, unknown>
  readonly api: GenfolioApi
  readonly hash: MemoryHash
  emitScan(event: ScanEvent): void
}

/** Real state classes over a fake API serving `library`; override any API method. */
export function testServices(
  library: TestLibrary,
  overrides: Partial<GenfolioApi> = {}
): TestServices {
  let scanListener: (event: ScanEvent) => void = () => undefined
  const api = fakeGenfolioApi({
    getServiceHealth: async () => ({
      electron: '44.4.5',
      node: '24.21.0',
      sqlite: '3.53.4',
      fts5: true,
      schemaVersion: 2,
      decodableFormats: ['png']
    }),
    listRoots: async () => library.roots,
    getDirectoryTree: async (rootId) => library.trees[rootId] ?? null,
    getImageLayout: async () => new Int32Array(0),
    getImages: async () => [],
    listTags: async () => [],
    listAlbums: async () => [],
    getDiagnostics: async () => ({ serviceRestarts: 0, serviceStopped: false }),
    listSlideshowPresets: async () => [],
    getSimilarityThreshold: async () => 10,
    getModelFolders: async () => ({ checkpoint: null, lora: null }),
    listModels: async () => ({ total: 0, items: [], baseModels: [] }),
    listDownloads: async () => [],
    getCivitaiKeyStatus: async () => ({ hasKey: false }),
    listSimilarGroups: async () => ({ total: 0, groups: [] }),
    getFacets: async () => ({
      checkpoints: [],
      loras: [],
      tags: [],
      generators: [],
      withoutMetadata: 0
    }),
    onScanEvent: (listener) => {
      scanListener = listener
      return () => undefined
    },
    ...overrides
  })
  const hash = memoryHash()
  const libraryState = new LibraryState(api)
  const gallery = new GalleryState(api)
  const facets = new FacetsState(api)
  const deletion = new ImageDeletion(api, libraryState, () => void libraryState.refresh())
  const router = new RouterState(hash)
  const services: AppServices = {
    api,
    router,
    library: libraryState,
    gallery,
    scans: new ScanProgressState(api, () => void libraryState.refresh()),
    sort: new SortPreference(memoryStore()),
    generation: new GenerationDetailsState(api),
    copier: new GenerationCopier(api, libraryState),
    facets,
    marks: new ImageMarks(api, gallery, facets, libraryState),
    tags: new TagsState(api, libraryState, () =>
      refreshAfterTagChange(gallery, facets, layoutUpdateFor(router.route))
    ),
    selection: new SelectionState(gallery),
    slideshowSettings: new SlideshowSettingsState(memoryStore()),
    slideshowPresets: new SlideshowPresetsState(api, libraryState),
    slideshowNavigator: new SlideshowNavigator(router, gallery),
    similarity: new SimilarityState(
      api,
      libraryState,
      () => void gallery.refresh(),
      async (ids) => {
        const report = await deletion.delete(ids, DeleteMode.Trash)
        return report !== undefined && !report.cancelled && report.deleted.length > 0
      }
    ),
    modelFolders: new ModelFoldersState(api, libraryState),
    models: new ModelsState(api, libraryState),
    civitaiBrowse: new CivitaiBrowseState(api, libraryState),
    downloads: new DownloadsState(api, libraryState),
    civitaiKey: new CivitaiKeyState(api, libraryState),
    deletion,
    albums: new AlbumsState(api, libraryState, () =>
      refreshAfterAlbumChange(gallery, facets, layoutUpdateFor(router.route))
    )
  }
  return {
    services,
    context: appServicesContext(services) as Map<symbol, unknown>,
    api,
    hash,
    emitScan: (event) => scanListener(event)
  }
}

/** A root "outputs" (id 1) with folders 2026-09-27 (id 11, 6 images) and old (id 12, 2). */
export function sampleLibrary(): TestLibrary {
  const tree: DirectoryNode = {
    id: 10,
    name: '',
    relPath: '',
    imageCount: 0,
    totalImageCount: 8,
    children: [
      {
        id: 11,
        name: '2026-09-27',
        relPath: '2026-09-27',
        imageCount: 6,
        totalImageCount: 6,
        children: []
      },
      { id: 12, name: 'old', relPath: 'old', imageCount: 2, totalImageCount: 2, children: [] }
    ]
  }
  return {
    roots: [{ id: 1, path: '/home/me/outputs', addedAt: 0, imageCount: 8, scanning: false }],
    trees: { 1: tree }
  }
}

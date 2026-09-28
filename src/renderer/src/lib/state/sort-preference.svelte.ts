import { SortOrder } from '@shared/gallery-kinds'

/** Where the preference is kept; localStorage in the app. Failures must not break the UI. */
export interface PreferenceStore {
  get(key: string): string | null
  set(key: string, value: string): void
}

const KEY = 'genfolio.sort'
const ALBUM_KEY = 'genfolio.album-sort'
const SORT_ORDERS = new Set<string>(Object.values(SortOrder))

/**
 * Sort orders, persisted across restarts: `current` for the library and its folders
 * (default Newest; album order means nothing there), `album` for albums (default album order).
 */
export class SortPreference {
  current: SortOrder = $state(SortOrder.Newest)
  album: SortOrder = $state(SortOrder.AlbumOrder)

  constructor(private readonly store: PreferenceStore) {
    const saved = this.saved(KEY)
    if (saved && saved !== SortOrder.AlbumOrder) this.current = saved
    this.album = this.saved(ALBUM_KEY) ?? SortOrder.AlbumOrder
  }

  set(sort: SortOrder): void {
    if (sort === SortOrder.AlbumOrder) return
    this.current = sort
    this.safely(() => this.store.set(KEY, sort))
  }

  setAlbum(sort: SortOrder): void {
    this.album = sort
    this.safely(() => this.store.set(ALBUM_KEY, sort))
  }

  private saved(key: string): SortOrder | undefined {
    const saved = this.safely(() => this.store.get(key))
    return saved && SORT_ORDERS.has(saved) ? (saved as SortOrder) : undefined
  }

  private safely<T>(read: () => T): T | undefined {
    try {
      return read()
    } catch {
      return undefined
    }
  }
}

/** localStorage-backed store; storage can be unavailable, which SortPreference tolerates. */
export function localPreferenceStore(storage: () => Storage): PreferenceStore {
  return {
    get: (key) => storage().getItem(key),
    set: (key, value) => storage().setItem(key, value)
  }
}

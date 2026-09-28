import { SortOrder } from '@shared/gallery-kinds'

/** Where the preference is kept; localStorage in the app. Failures must not break the UI. */
export interface PreferenceStore {
  get(key: string): string | null
  set(key: string, value: string): void
}

const KEY = 'genfolio.sort'
const SORT_ORDERS = new Set<string>(Object.values(SortOrder))

/** Gallery sort order, persisted across restarts. Defaults to Newest. */
export class SortPreference {
  current: SortOrder = $state(SortOrder.Newest)

  constructor(private readonly store: PreferenceStore) {
    const saved = this.safely(() => store.get(KEY))
    if (saved && SORT_ORDERS.has(saved)) this.current = saved as SortOrder
  }

  set(sort: SortOrder): void {
    this.current = sort
    this.safely(() => this.store.set(KEY, sort))
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

import { getContext } from 'svelte'
import type { GenfolioApi } from '@shared/genfolio-api'
import type { RouterState } from './routing/router.svelte'
import type { LibraryState } from './state/library.svelte'
import type { ScanProgressState } from './state/scan-progress.svelte'
import type { SortPreference } from './state/sort-preference.svelte'

/** Everything the renderer shares, created once in main.ts and provided by context. */
export interface AppServices {
  readonly api: GenfolioApi
  readonly router: RouterState
  readonly library: LibraryState
  readonly scans: ScanProgressState
  readonly sort: SortPreference
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

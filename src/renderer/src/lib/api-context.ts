import { getContext, setContext } from 'svelte'
import type { GenfolioApi } from '@shared/genfolio-api'

const GENFOLIO_API = Symbol('genfolio-api')

/** Context map for `mount`/`render`, so components never read `window.genfolio` directly. */
export function genfolioApiContext(api: GenfolioApi): Map<symbol, GenfolioApi> {
  return new Map([[GENFOLIO_API, api]])
}

export function setGenfolioApi(api: GenfolioApi): void {
  setContext(GENFOLIO_API, api)
}

/** Throws when no ancestor provided the API — a wiring bug, not a runtime condition. */
export function getGenfolioApi(): GenfolioApi {
  const api = getContext<GenfolioApi | undefined>(GENFOLIO_API)
  if (!api) throw new Error('GenfolioApi missing from component context')
  return api
}

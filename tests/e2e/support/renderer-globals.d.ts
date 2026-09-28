import type { GenfolioApi } from '../../../src/shared/genfolio-api'

// The preload exposes this in the renderer; page.evaluate callbacks run there.
declare global {
  interface Window {
    genfolio: GenfolioApi
  }
}

export {}

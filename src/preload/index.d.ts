import type { GenfolioApi } from '../shared/genfolio-api'

declare global {
  interface Window {
    genfolio: GenfolioApi
  }
}

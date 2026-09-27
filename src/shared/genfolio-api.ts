import type { ServiceHealth } from './service-health'

/** IPC channels between renderer and main. One channel per API method. */
export enum IpcChannel {
  ServiceHealth = 'service:health'
}

/** API exposed to the renderer as `window.genfolio` by the preload script. */
export interface GenfolioApi {
  /** Rejects when the library service is unavailable or its health probe fails. */
  getServiceHealth(): Promise<ServiceHealth>
}

import type { ServiceHealth } from './service-health'

/** IPC channels between renderer and main. One channel per API method. */
export enum IpcChannel {
  ServiceHealth = 'service:health'
}

/** API exposed to the renderer as `window.genfolio` by the preload script. */
export interface GenfolioApi {
  /**
   * Rejects when the health probe fails, the service does not answer within 30 s,
   * or the service has exited and could not be restarted.
   */
  getServiceHealth(): Promise<ServiceHealth>
}

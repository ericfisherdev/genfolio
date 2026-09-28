import type { AddRootViaDialogResult, RootSummary } from './library'
import type { ScanEvent } from './scan'
import type { ServiceHealth } from './service-health'

/** Renderer → main request channels. One channel per API method. */
export enum IpcChannel {
  ServiceHealth = 'service:health',
  ListRoots = 'library:list-roots',
  AddRootViaDialog = 'library:add-root-via-dialog',
  RemoveRoot = 'library:remove-root',
  RescanRoot = 'library:rescan-root'
}

/** Main → renderer push channels. */
export enum IpcEvent {
  Scan = 'library:scan-event'
}

/**
 * API exposed to the renderer as `window.genfolio` by the preload script. Every request
 * rejects when the service fails, does not answer within 30 s, or has exited and could
 * not be restarted.
 */
export interface GenfolioApi {
  getServiceHealth(): Promise<ServiceHealth>
  listRoots(): Promise<readonly RootSummary[]>
  /** Shows the folder picker in main; the renderer never supplies a path. */
  addRootViaDialog(): Promise<AddRootViaDialogResult>
  /** Removes the root's library rows; files on disk are never touched. */
  removeRoot(rootId: number): Promise<boolean>
  /** Resolves false when a scan of that root is already running. */
  rescanRoot(rootId: number): Promise<boolean>
  /** Subscribes to scan lifecycle events; returns the unsubscribe function. */
  onScanEvent(listener: (event: ScanEvent) => void): () => void
}

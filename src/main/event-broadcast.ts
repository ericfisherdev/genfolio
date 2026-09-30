import { BrowserWindow } from 'electron'
import { IpcEvent } from '@shared/genfolio-api'
import type { ScanEvent } from '@shared/scan'
import type { UpdateEvent } from '@shared/updates'

/** Pushes a main-process event to every open window. */
function broadcast(event: IpcEvent, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(event, payload)
  }
}

export const broadcastScanEvent = (event: ScanEvent): void => broadcast(IpcEvent.Scan, event)

export const broadcastUpdateEvent = (event: UpdateEvent): void => broadcast(IpcEvent.Update, event)

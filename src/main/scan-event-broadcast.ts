import { BrowserWindow } from 'electron'
import { IpcEvent } from '@shared/genfolio-api'
import type { ScanEvent } from '@shared/scan'

/** Pushes a scan event to every open window. */
export function broadcastScanEvent(event: ScanEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IpcEvent.Scan, event)
  }
}

import type { App, BrowserWindow } from 'electron'

export type SingleInstanceApp = Pick<App, 'requestSingleInstanceLock' | 'quit' | 'on'>

/**
 * Only one Genfolio per userData may run, so only one library service writes the database.
 * Returns false (and quits) when another instance holds the lock; otherwise wires
 * `onSecondInstance` for later launches.
 */
export function claimSingleInstance(app: SingleInstanceApp, onSecondInstance: () => void): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return false
  }
  app.on('second-instance', onSecondInstance)
  return true
}

/** Brings an existing window to the front when the user launches the app again. */
export function focusWindow(window: BrowserWindow | undefined): void {
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.focus()
}

import { BrowserWindow, type WebPreferences } from 'electron'
import { rendererEntryUrl, type RendererEntry } from './app-url'

export interface MainWindowOptions {
  readonly preloadPath: string
  readonly renderer: RendererEntry
  readonly iconPath: string | undefined
}

/** Renderer isolation settings; the renderer shows content from arbitrary user folders. */
export function secureWebPreferences(preloadPath: string): WebPreferences {
  return {
    preload: preloadPath,
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true
  }
}

export function createMainWindow(options: MainWindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    title: 'Genfolio',
    backgroundColor: '#18191c',
    autoHideMenuBar: true,
    ...(options.iconPath ? { icon: options.iconPath } : {}),
    webPreferences: secureWebPreferences(options.preloadPath)
  })
  window.once('ready-to-show', () => window.show())
  void window.loadURL(rendererEntryUrl(options.renderer))
  return window
}

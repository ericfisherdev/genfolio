import type { MenuItemConstructorOptions } from 'electron'

export interface AppMenuActions {
  showAbout(): void
  openLogs(): void
  openWebsite(): void
}

/**
 * The application menu: Quit, the usual edit and view roles (developer tools only in
 * development), and Help with About, the logs folder and the project page.
 */
export function appMenuTemplate(
  actions: AppMenuActions,
  development: boolean
): MenuItemConstructorOptions[] {
  return [
    { label: 'File', submenu: [{ role: 'quit' }] },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        ...(development
          ? ([{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }] as const)
          : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About Genfolio', click: () => actions.showAbout() },
        { label: 'Open Logs Folder', click: () => actions.openLogs() },
        { type: 'separator' },
        { label: 'Genfolio on GitHub', click: () => actions.openWebsite() }
      ]
    }
  ]
}

/** `genfolio --version` prints the version and exits, for packagers and bug reports. */
export const versionRequested = (argv: readonly string[]): boolean =>
  argv.slice(1).includes('--version')

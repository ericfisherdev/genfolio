import { join } from 'node:path'
import { open, realpath, stat } from 'node:fs/promises'
import { app, BrowserWindow, clipboard, ipcMain, session, shell } from 'electron'
import { ImageFileResolver } from '@application/image-file-resolver'
import { LazyImageLocator } from '@infrastructure/db/lazy-image-locator'
import { DatabaseMode, openLibraryDatabase } from '@infrastructure/db/open-database'
import { ServiceMethod } from '@shared/service-contract'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { isAppUrl, type RendererEntry } from './app-url'
import { denyAllPermissions } from './deny-permissions'
import { pickFolderWithDialog } from './folder-picker'
import { ImageFileActions } from './image-file-actions'
import { registerGenerationChannels } from './ipc/generation-channels'
import { registerImageChannels } from './ipc/image-channels'
import { registerTagChannels } from './ipc/tag-channels'
import { registerLibraryChannels } from './ipc/library-channels'
import { ValidatingIpcRegistry } from './ipc/validating-ipc-registry'
import { guardNavigation } from './navigation-guard'
import { createImageRequestHandler } from './protocol/image-request-handler'
import { streamOpenFile } from './protocol/stream-open-file'
import {
  handleImageScheme,
  registerImageSchemeAsPrivileged
} from './protocol/register-image-scheme'
import { broadcastScanEvent } from './scan-event-broadcast'
import { forkLibraryService } from './service/fork-library-service'
import { LibraryServiceClient } from './service/library-service-client'
import { LibraryServiceSupervisor } from './service/library-service-supervisor'
import { claimSingleInstance, focusWindow } from './single-instance'
import { e2eUserDataOverride } from './user-data-override'
import { createMainWindow } from './window'

// Composition root of the main process.

const userDataOverride = e2eUserDataOverride(process.env)
if (userDataOverride) app.setPath('userData', userDataOverride)

const devServerUrl = process.env['ELECTRON_RENDERER_URL']
const rendererEntry: RendererEntry =
  is.dev && devServerUrl
    ? { kind: 'dev-server', url: devServerUrl }
    : { kind: 'file', path: join(__dirname, '../renderer/index.html') }

function libraryDatabasePath(): string {
  return join(app.getPath('userData'), 'genfolio.db')
}

function openMainWindow(): void {
  createMainWindow({
    preloadPath: join(__dirname, '../preload/index.js'),
    renderer: rendererEntry,
    iconPath: process.platform === 'linux' ? icon : undefined
  })
}

function startApp(): void {
  registerImageSchemeAsPrivileged()
  app.on('web-contents-created', (_, contents) => guardNavigation(contents, rendererEntry))
  app.whenReady().then(onReady)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}

function onReady(): void {
  electronApp.setAppUserModelId('dev.ericfisher.genfolio')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const libraryService = new LibraryServiceSupervisor(
    (onExit) =>
      new LibraryServiceClient(forkLibraryService(libraryDatabasePath()), {
        requestTimeoutMs: 30_000,
        onExit,
        onEvent: broadcastScanEvent
      }),
    { maxRestarts: 3, windowMs: 60_000 },
    {
      warn: (message) => console.warn(`[main] ${message}`),
      error: (message) => console.error(`[main] ${message}`)
    }
  )
  const ipc = new ValidatingIpcRegistry(ipcMain, (url) => isAppUrl(url, rendererEntry))
  registerLibraryChannels(ipc, libraryService, pickFolderWithDialog)
  registerGenerationChannels(ipc, libraryService, (text) => clipboard.writeText(text))
  registerTagChannels(ipc, libraryService)
  denyAllPermissions(session.defaultSession)
  const imageFiles = new ImageFileResolver(
    new LazyImageLocator(() => openLibraryDatabase(libraryDatabasePath(), DatabaseMode.ReadOnly)),
    { open: (path) => open(path, 'r'), realpath, stat }
  )
  registerImageChannels(
    ipc,
    new ImageFileActions(imageFiles, {
      showItemInFolder: (path) => shell.showItemInFolder(path),
      writeClipboardText: (text) => clipboard.writeText(text)
    })
  )
  handleImageScheme(
    createImageRequestHandler({
      openImage: (id) => imageFiles.open(id),
      streamFile: streamOpenFile,
      renderDisplayCopy: (imageId, maxWidth) =>
        libraryService.request(ServiceMethod.RenderDisplayCopy, { imageId, maxWidth })
    })
  )

  openMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow()
  })
}

// The lock lives in userData, so it is claimed after any e2e userData override.
if (claimSingleInstance(app, () => focusWindow(BrowserWindow.getAllWindows()[0]))) startApp()

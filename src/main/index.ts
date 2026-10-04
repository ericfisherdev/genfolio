import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { open, realpath, rm, stat } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  session,
  shell
} from 'electron'
import { autoUpdater } from 'electron-updater'
import { ImageDeleter } from '@application/image-deleter'
import { ImageFileResolver } from '@application/image-file-resolver'
import { ModelDownloader } from '@application/model-downloader'
import { NodeDownloadFiles } from '@infrastructure/downloads/node-download-files'
import { HttpDownloadSource } from '@infrastructure/downloads/http-download-source'
import { LazyImageLocator } from '@infrastructure/db/lazy-image-locator'
import { DatabaseMode, openLibraryDatabase } from '@infrastructure/db/open-database'
import { ServiceMethod } from '@shared/service-contract'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { isAppUrl, type RendererEntry } from './app-url'
import { denyAllPermissions } from './deny-permissions'
import { pickFolderWithDialog } from './folder-picker'
import { ImageFileActions } from './image-file-actions'
import { DialogDeleteConfirmer } from './delete-confirmer'
import { registerDeletionChannels } from './ipc/deletion-channels'
import { registerSimilarityChannels } from './ipc/similarity-channels'
import { registerSlideshowChannels } from './ipc/slideshow-channels'
import { registerAppChannels } from './ipc/app-channels'
import { appMenuTemplate, versionRequested } from './app-menu'
import { LogLevel, RotatingFileLog } from '@infrastructure/logging/rotating-file-log'
import { registerGenerationChannels } from './ipc/generation-channels'
import { registerImageChannels } from './ipc/image-channels'
import { registerAlbumChannels } from './ipc/album-channels'
import { registerTagChannels } from './ipc/tag-channels'
import { registerSettingsChannels } from './ipc/settings-channels'
import { registerModelChannels } from './ipc/model-channels'
import { registerDownloadChannels } from './ipc/download-channels'
import { CivitaiApiKeyStore } from './civitai/api-key-store'
import { electronSecretCipher } from './civitai/electron-secret-cipher'
import { NodeSecretFile } from './civitai/node-secret-file'
import { ServiceDownloadAdapters } from './civitai/service-adapters'
import { registerLibraryChannels } from './ipc/library-channels'
import { ValidatingIpcRegistry } from './ipc/validating-ipc-registry'
import { guardNavigation } from './navigation-guard'
import { createImageRequestHandler } from './protocol/image-request-handler'
import { streamOpenFile } from './protocol/stream-open-file'
import {
  handleImageScheme,
  registerImageSchemeAsPrivileged
} from './protocol/register-image-scheme'
import { broadcastDownloadEvent, broadcastScanEvent, broadcastUpdateEvent } from './event-broadcast'
import { forkLibraryService } from './service/fork-library-service'
import { LibraryServiceClient } from './service/library-service-client'
import { LibraryServiceSupervisor } from './service/library-service-supervisor'
import { claimSingleInstance, focusWindow } from './single-instance'
import { ElectronUpdaterSource } from './updates/electron-updater-source'
import { detectInstallMethod, PACKAGE_TYPE_FILE } from './updates/install-method'
import { UpdateCoordinator } from './updates/update-coordinator'
import { sanitizeUpdaterLog } from './updates/updater-log-sanitizer'
import { userDataLocation } from './user-data-override'
import { createMainWindow } from './window'

// Composition root of the main process.

const userData = userDataLocation(process.env, app.isPackaged, app.getPath('appData'))
if (userData) app.setPath('userData', userData)

const devServerUrl = process.env['ELECTRON_RENDERER_URL']
const rendererEntry: RendererEntry =
  is.dev && devServerUrl
    ? { kind: 'dev-server', url: devServerUrl }
    : { kind: 'file', path: join(__dirname, '../renderer/index.html') }

const PROJECT_URL = 'https://github.com/ericfisherdev/genfolio'
const RELEASES_URL = `${PROJECT_URL}/releases`

/** The message box goes over the focused window when there is one. */
function showMessageBox(
  options: Electron.MessageBoxOptions
): Promise<Electron.MessageBoxReturnValue> {
  const window = BrowserWindow.getFocusedWindow()
  return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options)
}

/** electron-builder's package marker, or undefined when this build has none. */
function readPackageType(): string | undefined {
  try {
    return readFileSync(join(process.resourcesPath, PACKAGE_TYPE_FILE), 'utf8')
  } catch {
    return undefined
  }
}

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

  const logsDir = join(app.getPath('userData'), 'logs')
  const openLogs = async (): Promise<boolean> => {
    mkdirSync(logsDir, { recursive: true })
    // shell.openPath resolves an error message, or '' when the folder opened.
    return (await shell.openPath(logsDir)) === ''
  }
  app.setAboutPanelOptions({
    applicationName: 'Genfolio',
    applicationVersion: app.getVersion(),
    version: `Electron ${process.versions.electron} · Node ${process.versions.node}`,
    copyright: 'Copyright © 2026 Eric Fisher · MIT licence',
    website: PROJECT_URL,
    iconPath: icon,
    credits: 'Third-party licences: THIRD_PARTY_LICENSES.txt in the application resources'
  })
  const mainLog = new RotatingFileLog(logsDir, 'main')
  const updates = new UpdateCoordinator({
    source: new ElectronUpdaterSource(autoUpdater, {
      info: (message) => mainLog.write(LogLevel.Info, `updater: ${sanitizeUpdaterLog(message)}`),
      warn: (message) => mainLog.write(LogLevel.Warn, `updater: ${sanitizeUpdaterLog(message)}`),
      error: (message) => mainLog.write(LogLevel.Error, `updater: ${sanitizeUpdaterLog(message)}`)
    }),
    installMethod: detectInstallMethod(process.env, app.isPackaged, readPackageType),
    currentVersion: app.getVersion(),
    releasesUrl: RELEASES_URL,
    show: showMessageBox,
    openExternal: (url) => void shell.openExternal(url),
    publish: broadcastUpdateEvent,
    log: {
      info: (message) => mainLog.write(LogLevel.Info, message),
      error: (message) => mainLog.write(LogLevel.Error, message)
    }
  })
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      appMenuTemplate(
        {
          showAbout: () => app.showAboutPanel(),
          checkForUpdates: () => void updates.checkInteractively(),
          openLogs: () => void openLogs(),
          openWebsite: () => void shell.openExternal(PROJECT_URL)
        },
        is.dev
      )
    )
  )
  const libraryService = new LibraryServiceSupervisor(
    (onExit) =>
      new LibraryServiceClient(forkLibraryService(libraryDatabasePath(), logsDir), {
        requestTimeoutMs: 30_000,
        onExit,
        onEvent: broadcastScanEvent
      }),
    { maxRestarts: 3, windowMs: 60_000 },
    {
      warn: (message) => {
        console.warn(`[main] ${message}`)
        mainLog.write(LogLevel.Warn, message)
      },
      error: (message) => {
        console.error(`[main] ${message}`)
        mainLog.write(LogLevel.Error, message)
      }
    }
  )
  const civitaiKeys = new CivitaiApiKeyStore(
    electronSecretCipher(safeStorage),
    new NodeSecretFile(join(app.getPath('userData'), 'civitai-key.bin'))
  )
  const downloadAdapters = new ServiceDownloadAdapters(libraryService)
  const downloader = new ModelDownloader({
    planner: downloadAdapters,
    folders: downloadAdapters,
    files: new NodeDownloadFiles(),
    source: new HttpDownloadSource(fetch, () => civitaiKeys.key()),
    recorder: downloadAdapters,
    publish: broadcastDownloadEvent,
    newId: randomUUID,
    now: () => Date.now(),
    logError: (message) => mainLog.write(LogLevel.Error, message)
  })
  const ipc = new ValidatingIpcRegistry(ipcMain, (url) => isAppUrl(url, rendererEntry))
  registerLibraryChannels(ipc, libraryService, pickFolderWithDialog)
  registerGenerationChannels(ipc, libraryService, (text) => clipboard.writeText(text))
  registerTagChannels(ipc, libraryService)
  registerAlbumChannels(ipc, libraryService)
  registerSlideshowChannels(ipc, libraryService)
  registerSimilarityChannels(ipc, libraryService)
  registerSettingsChannels(ipc, libraryService, pickFolderWithDialog)
  registerDownloadChannels(ipc, libraryService, downloader, civitaiKeys)
  registerModelChannels(
    ipc,
    libraryService,
    (text) => clipboard.writeText(text),
    (url) => void shell.openExternal(url)
  )
  registerAppChannels(ipc, {
    openLogs,
    logRendererError: (name) => mainLog.write(LogLevel.Error, `renderer: ${name}`),
    diagnostics: () => ({
      serviceRestarts: libraryService.restarts,
      serviceStopped: libraryService.stopped
    }),
    cancelUpdateDownload: () => updates.cancelDownload()
  })
  denyAllPermissions(session.defaultSession)
  const imageLocator = new LazyImageLocator(() =>
    openLibraryDatabase(libraryDatabasePath(), DatabaseMode.ReadOnly)
  )
  const imageFiles = new ImageFileResolver(imageLocator, {
    open: (path) => open(path, 'r'),
    realpath,
    stat
  })
  registerDeletionChannels(
    ipc,
    new ImageDeleter(
      imageFiles,
      { trash: (path) => shell.trashItem(path), remove: (path) => rm(path) },
      new DialogDeleteConfirmer(showMessageBox),
      {
        forget: async (ids) =>
          ids.length === 0
            ? 0
            : (await libraryService.request(ServiceMethod.ImagesForget, { ids: [...ids] }))
                .forgotten
      }
    )
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
      imageDimensions: (id) => imageLocator.locate(id),
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
if (versionRequested(process.argv)) {
  console.log(`Genfolio ${app.getVersion()}`)
  app.exit(0)
} else if (claimSingleInstance(app, () => focusWindow(BrowserWindow.getAllWindows()[0]))) {
  startApp()
}

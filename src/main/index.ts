import { join } from 'node:path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-rpc'
import icon from '../../resources/icon.png?asset'
import type { RendererEntry } from './app-url'
import { guardNavigation } from './navigation-guard'
import { forkLibraryService } from './service/fork-library-service'
import { LibraryServiceClient } from './service/library-service-client'
import { createMainWindow } from './window'

// Composition root of the main process.

const devServerUrl = process.env['ELECTRON_RENDERER_URL']
const rendererEntry: RendererEntry =
  is.dev && devServerUrl
    ? { kind: 'dev-server', url: devServerUrl }
    : { kind: 'file', path: join(__dirname, '../renderer/index.html') }

function openMainWindow(): void {
  createMainWindow({
    preloadPath: join(__dirname, '../preload/index.js'),
    renderer: rendererEntry,
    iconPath: process.platform === 'linux' ? icon : undefined
  })
}

app.on('web-contents-created', (_, contents) => guardNavigation(contents, rendererEntry))

app.whenReady().then(() => {
  electronApp.setAppUserModelId('dev.ericfisher.genfolio')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  const libraryService = new LibraryServiceClient(forkLibraryService())
  ipcMain.handle(IpcChannel.ServiceHealth, () => libraryService.request(ServiceMethod.Health))

  openMainWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

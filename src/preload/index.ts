import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel, IpcEvent, type GenfolioApi } from '@shared/genfolio-api'
import type { ScanEvent } from '@shared/scan'

const api: GenfolioApi = {
  getServiceHealth: () => ipcRenderer.invoke(IpcChannel.ServiceHealth),
  listRoots: () => ipcRenderer.invoke(IpcChannel.ListRoots),
  addRootViaDialog: () => ipcRenderer.invoke(IpcChannel.AddRootViaDialog),
  removeRoot: (rootId) => ipcRenderer.invoke(IpcChannel.RemoveRoot, rootId),
  rescanRoot: (rootId) => ipcRenderer.invoke(IpcChannel.RescanRoot, rootId),
  getImageLayout: (query) => ipcRenderer.invoke(IpcChannel.GalleryLayout, query),
  getImages: (ids) => ipcRenderer.invoke(IpcChannel.GalleryImages, ids),
  getDirectoryTree: (rootId) => ipcRenderer.invoke(IpcChannel.DirectoryTree, rootId),
  revealImage: (imageId) => ipcRenderer.invoke(IpcChannel.RevealImage, imageId),
  copyImagePath: (imageId) => ipcRenderer.invoke(IpcChannel.CopyImagePath, imageId),
  onScanEvent: (listener) => {
    const forward = (_event: IpcRendererEvent, scanEvent: ScanEvent): void => listener(scanEvent)
    ipcRenderer.on(IpcEvent.Scan, forward)
    return () => ipcRenderer.removeListener(IpcEvent.Scan, forward)
  }
}

contextBridge.exposeInMainWorld('genfolio', api)

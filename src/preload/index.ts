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
  getFacets: (query) => ipcRenderer.invoke(IpcChannel.SearchFacets, query),
  setFavorite: (ids, favorite) => ipcRenderer.invoke(IpcChannel.SetFavorite, ids, favorite),
  setRating: (ids, rating) => ipcRenderer.invoke(IpcChannel.SetRating, ids, rating),
  listTags: () => ipcRenderer.invoke(IpcChannel.ListTags),
  getImageTags: (imageId) => ipcRenderer.invoke(IpcChannel.ImageTags, imageId),
  createTag: (name) => ipcRenderer.invoke(IpcChannel.CreateTag, name),
  renameTag: (tagId, name) => ipcRenderer.invoke(IpcChannel.RenameTag, tagId, name),
  mergeTags: (fromId, intoId) => ipcRenderer.invoke(IpcChannel.MergeTags, fromId, intoId),
  deleteTag: (tagId) => ipcRenderer.invoke(IpcChannel.DeleteTag, tagId),
  applyTags: (tagIds, imageIds) => ipcRenderer.invoke(IpcChannel.ApplyTags, tagIds, imageIds),
  removeTags: (tagIds, imageIds) => ipcRenderer.invoke(IpcChannel.RemoveTags, tagIds, imageIds),
  listAlbums: () => ipcRenderer.invoke(IpcChannel.ListAlbums),
  createAlbum: (name) => ipcRenderer.invoke(IpcChannel.CreateAlbum, name),
  renameAlbum: (albumId, name) => ipcRenderer.invoke(IpcChannel.RenameAlbum, albumId, name),
  deleteAlbum: (albumId) => ipcRenderer.invoke(IpcChannel.DeleteAlbum, albumId),
  setAlbumCover: (albumId, imageId) =>
    ipcRenderer.invoke(IpcChannel.SetAlbumCover, albumId, imageId),
  addToAlbum: (albumId, imageIds) => ipcRenderer.invoke(IpcChannel.AddToAlbum, albumId, imageIds),
  removeFromAlbum: (albumId, imageIds) =>
    ipcRenderer.invoke(IpcChannel.RemoveFromAlbum, albumId, imageIds),
  moveInAlbum: (albumId, imageIds, beforeId) =>
    ipcRenderer.invoke(IpcChannel.MoveInAlbum, albumId, imageIds, beforeId),
  getDirectoryTree: (rootId) => ipcRenderer.invoke(IpcChannel.DirectoryTree, rootId),
  revealImage: (imageId) => ipcRenderer.invoke(IpcChannel.RevealImage, imageId),
  copyImagePath: (imageId) => ipcRenderer.invoke(IpcChannel.CopyImagePath, imageId),
  getGeneration: (imageId) => ipcRenderer.invoke(IpcChannel.GetGeneration, imageId),
  copyGeneration: (imageId, variant) =>
    ipcRenderer.invoke(IpcChannel.CopyGeneration, imageId, variant),
  onScanEvent: (listener) => {
    const forward = (_event: IpcRendererEvent, scanEvent: ScanEvent): void => listener(scanEvent)
    ipcRenderer.on(IpcEvent.Scan, forward)
    return () => ipcRenderer.removeListener(IpcEvent.Scan, forward)
  }
}

contextBridge.exposeInMainWorld('genfolio', api)

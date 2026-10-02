import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannel, IpcEvent, type GenfolioApi } from '@shared/genfolio-api'
import type { DownloadSnapshot } from '@shared/downloads'
import type { ScanEvent } from '@shared/scan'
import type { UpdateEvent } from '@shared/updates'

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
  createSmartAlbum: (name, filters) =>
    ipcRenderer.invoke(IpcChannel.CreateSmartAlbum, name, filters),
  renameAlbum: (albumId, name) => ipcRenderer.invoke(IpcChannel.RenameAlbum, albumId, name),
  deleteAlbum: (albumId) => ipcRenderer.invoke(IpcChannel.DeleteAlbum, albumId),
  setAlbumCover: (albumId, imageId) =>
    ipcRenderer.invoke(IpcChannel.SetAlbumCover, albumId, imageId),
  addToAlbum: (albumId, imageIds) => ipcRenderer.invoke(IpcChannel.AddToAlbum, albumId, imageIds),
  removeFromAlbum: (albumId, imageIds) =>
    ipcRenderer.invoke(IpcChannel.RemoveFromAlbum, albumId, imageIds),
  getSimilarityThreshold: () => ipcRenderer.invoke(IpcChannel.SimilarityThreshold),
  setSimilarityThreshold: (threshold) =>
    ipcRenderer.invoke(IpcChannel.SetSimilarityThreshold, threshold),
  openLogs: () => ipcRenderer.invoke(IpcChannel.OpenLogs),
  reportRendererError: (name) => ipcRenderer.invoke(IpcChannel.ReportRendererError, name),
  getDiagnostics: () => ipcRenderer.invoke(IpcChannel.Diagnostics),
  listSimilarGroupMembers: (groupId) => ipcRenderer.invoke(IpcChannel.SimilarGroupMembers, groupId),
  listSimilarGroups: (offset, limit) => ipcRenderer.invoke(IpcChannel.SimilarGroups, offset, limit),
  listSlideshowPresets: () => ipcRenderer.invoke(IpcChannel.ListPresets),
  saveSlideshowPreset: (name, settings) =>
    ipcRenderer.invoke(IpcChannel.SavePreset, name, settings),
  deleteSlideshowPreset: (presetId) => ipcRenderer.invoke(IpcChannel.DeletePreset, presetId),
  deleteImages: (imageIds, mode) => ipcRenderer.invoke(IpcChannel.DeleteImages, imageIds, mode),
  moveInAlbum: (albumId, imageIds, beforeId) =>
    ipcRenderer.invoke(IpcChannel.MoveInAlbum, albumId, imageIds, beforeId),
  getDirectoryTree: (rootId) => ipcRenderer.invoke(IpcChannel.DirectoryTree, rootId),
  revealImage: (imageId) => ipcRenderer.invoke(IpcChannel.RevealImage, imageId),
  copyImagePath: (imageId) => ipcRenderer.invoke(IpcChannel.CopyImagePath, imageId),
  getGeneration: (imageId) => ipcRenderer.invoke(IpcChannel.GetGeneration, imageId),
  copyGeneration: (imageId, variant) =>
    ipcRenderer.invoke(IpcChannel.CopyGeneration, imageId, variant),
  getModelFolders: () => ipcRenderer.invoke(IpcChannel.GetModelFolders),
  chooseModelFolder: (kind) => ipcRenderer.invoke(IpcChannel.ChooseModelFolder, kind),
  clearModelFolder: (kind) => ipcRenderer.invoke(IpcChannel.ClearModelFolder, kind),
  listModels: (query) => ipcRenderer.invoke(IpcChannel.ListModels, query),
  getModel: (key) => ipcRenderer.invoke(IpcChannel.GetModel, key),
  saveModel: (key, fields) => ipcRenderer.invoke(IpcChannel.SaveModel, key, fields),
  createModel: (kind, name, fields) =>
    ipcRenderer.invoke(IpcChannel.CreateModel, kind, name, fields),
  clearModel: (key) => ipcRenderer.invoke(IpcChannel.ClearModel, key),
  copyModelTriggerWords: (key) => ipcRenderer.invoke(IpcChannel.CopyModelTriggerWords, key),
  lookupModelOnCivitai: (key) => ipcRenderer.invoke(IpcChannel.LookupModelOnCivitai, key),
  searchCivitai: (params) => ipcRenderer.invoke(IpcChannel.SearchCivitai, params),
  linkModelToCivitai: (key, modelId, versionId) =>
    ipcRenderer.invoke(IpcChannel.LinkModelToCivitai, key, modelId, versionId),
  refreshModelFromCivitai: (key) => ipcRenderer.invoke(IpcChannel.RefreshModelFromCivitai, key),
  unlinkModelFromCivitai: (key) => ipcRenderer.invoke(IpcChannel.UnlinkModelFromCivitai, key),
  openModelOnCivitai: (key) => ipcRenderer.invoke(IpcChannel.OpenModelOnCivitai, key),
  browseCivitai: (query) => ipcRenderer.invoke(IpcChannel.BrowseCivitai, query),
  startDownload: (request) => ipcRenderer.invoke(IpcChannel.StartDownload, request),
  cancelDownload: (id) => ipcRenderer.invoke(IpcChannel.CancelDownload, id),
  listDownloads: () => ipcRenderer.invoke(IpcChannel.ListDownloads),
  clearFinishedDownloads: () => ipcRenderer.invoke(IpcChannel.ClearFinishedDownloads),
  getCivitaiKeyStatus: () => ipcRenderer.invoke(IpcChannel.CivitaiKeyStatus),
  setCivitaiKey: (key) => ipcRenderer.invoke(IpcChannel.SetCivitaiKey, key),
  clearCivitaiKey: () => ipcRenderer.invoke(IpcChannel.ClearCivitaiKey),
  onDownloadEvent: (listener) => {
    const forward = (_event: IpcRendererEvent, snapshot: DownloadSnapshot): void =>
      listener(snapshot)
    ipcRenderer.on(IpcEvent.Download, forward)
    return () => ipcRenderer.removeListener(IpcEvent.Download, forward)
  },
  onScanEvent: (listener) => {
    const forward = (_event: IpcRendererEvent, scanEvent: ScanEvent): void => listener(scanEvent)
    ipcRenderer.on(IpcEvent.Scan, forward)
    return () => ipcRenderer.removeListener(IpcEvent.Scan, forward)
  },
  onUpdateEvent: (listener) => {
    const forward = (_event: IpcRendererEvent, update: UpdateEvent): void => listener(update)
    ipcRenderer.on(IpcEvent.Update, forward)
    return () => ipcRenderer.removeListener(IpcEvent.Update, forward)
  },
  cancelUpdateDownload: () => ipcRenderer.invoke(IpcChannel.CancelUpdateDownload)
}

contextBridge.exposeInMainWorld('genfolio', api)

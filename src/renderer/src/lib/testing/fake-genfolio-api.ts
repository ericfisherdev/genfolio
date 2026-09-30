import type { GenfolioApi } from '@shared/genfolio-api'

const unexpected = (name: string) => (): never => {
  throw new Error(`Unexpected GenfolioApi.${name} call in test`)
}

/** A GenfolioApi whose methods throw unless overridden, so tests state what they use. */
export function fakeGenfolioApi(overrides: Partial<GenfolioApi> = {}): GenfolioApi {
  return {
    getServiceHealth: unexpected('getServiceHealth'),
    listRoots: unexpected('listRoots'),
    addRootViaDialog: unexpected('addRootViaDialog'),
    removeRoot: unexpected('removeRoot'),
    rescanRoot: unexpected('rescanRoot'),
    getImageLayout: unexpected('getImageLayout'),
    getImages: unexpected('getImages'),
    getFacets: unexpected('getFacets'),
    setFavorite: unexpected('setFavorite'),
    setRating: unexpected('setRating'),
    listTags: unexpected('listTags'),
    getImageTags: unexpected('getImageTags'),
    createTag: unexpected('createTag'),
    renameTag: unexpected('renameTag'),
    mergeTags: unexpected('mergeTags'),
    deleteTag: unexpected('deleteTag'),
    applyTags: unexpected('applyTags'),
    removeTags: unexpected('removeTags'),
    listAlbums: unexpected('listAlbums'),
    createAlbum: unexpected('createAlbum'),
    createSmartAlbum: unexpected('createSmartAlbum'),
    renameAlbum: unexpected('renameAlbum'),
    deleteAlbum: unexpected('deleteAlbum'),
    setAlbumCover: unexpected('setAlbumCover'),
    addToAlbum: unexpected('addToAlbum'),
    removeFromAlbum: unexpected('removeFromAlbum'),
    moveInAlbum: unexpected('moveInAlbum'),
    deleteImages: unexpected('deleteImages'),
    listSlideshowPresets: unexpected('listSlideshowPresets'),
    getSimilarityThreshold: unexpected('getSimilarityThreshold'),
    setSimilarityThreshold: unexpected('setSimilarityThreshold'),
    listSimilarGroups: unexpected('listSimilarGroups'),
    listSimilarGroupMembers: unexpected('listSimilarGroupMembers'),
    openLogs: unexpected('openLogs'),
    reportRendererError: unexpected('reportRendererError'),
    getDiagnostics: unexpected('getDiagnostics'),
    saveSlideshowPreset: unexpected('saveSlideshowPreset'),
    deleteSlideshowPreset: unexpected('deleteSlideshowPreset'),
    getDirectoryTree: unexpected('getDirectoryTree'),
    revealImage: unexpected('revealImage'),
    copyImagePath: unexpected('copyImagePath'),
    getGeneration: unexpected('getGeneration'),
    copyGeneration: unexpected('copyGeneration'),
    onScanEvent: () => () => undefined,
    onUpdateEvent: () => () => undefined,
    cancelUpdateDownload: unexpected('cancelUpdateDownload'),
    ...overrides
  }
}

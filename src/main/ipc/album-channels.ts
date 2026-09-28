import { z } from 'zod'
import { albumNameSchema } from '@shared/albums'
import { MAX_IDS_PER_MARK } from '@shared/gallery'
import { searchFiltersSchema } from '@shared/search'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

const id = z.number().int().positive()
const imageIds = z.array(id).min(1).max(MAX_IDS_PER_MARK)

/** Registers the album channels; each validates, then forwards to the service. */
export function registerAlbumChannels(ipc: IpcHandlerRegistry, service: ServiceRequester): void {
  ipc.register(IpcChannel.ListAlbums, z.tuple([]), () =>
    service.request(ServiceMethod.AlbumsList, {})
  )
  ipc.register(IpcChannel.CreateAlbum, z.tuple([albumNameSchema]), (name) =>
    service.request(ServiceMethod.AlbumsCreate, { name })
  )
  ipc.register(
    IpcChannel.CreateSmartAlbum,
    z.tuple([albumNameSchema, searchFiltersSchema]),
    (name, filters) => service.request(ServiceMethod.AlbumsCreateSmart, { name, filters })
  )
  ipc.register(IpcChannel.RenameAlbum, z.tuple([id, albumNameSchema]), (albumId, name) =>
    service.request(ServiceMethod.AlbumsRename, { id: albumId, name })
  )
  ipc.register(
    IpcChannel.DeleteAlbum,
    z.tuple([id]),
    async (albumId) => (await service.request(ServiceMethod.AlbumsDelete, { id: albumId })).deleted
  )
  ipc.register(IpcChannel.SetAlbumCover, z.tuple([id, id.nullable()]), (albumId, imageId) =>
    service.request(ServiceMethod.AlbumsSetCover, { id: albumId, imageId })
  )
  ipc.register(
    IpcChannel.AddToAlbum,
    z.tuple([id, imageIds]),
    async (albumId, images) =>
      (await service.request(ServiceMethod.AlbumsAdd, { albumId, imageIds: images })).changed
  )
  ipc.register(
    IpcChannel.RemoveFromAlbum,
    z.tuple([id, imageIds]),
    async (albumId, images) =>
      (await service.request(ServiceMethod.AlbumsRemove, { albumId, imageIds: images })).changed
  )
  ipc.register(
    IpcChannel.MoveInAlbum,
    z.tuple([id, imageIds, id.nullable()]),
    async (albumId, images, beforeId) =>
      (await service.request(ServiceMethod.AlbumsMove, { albumId, imageIds: images, beforeId }))
        .changed
  )
}

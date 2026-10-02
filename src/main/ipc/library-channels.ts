import { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import {
  galleryQuerySchema,
  MAX_IDS_PER_MARK,
  MAX_IMAGES_PER_REQUEST,
  MAX_RATING
} from '@shared/gallery'
import { AddRootOutcome, type AddRootViaDialogResult } from '@shared/library'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

/** Asks the user for a folder; resolves `undefined` when they cancel. */
export type FolderPicker = (title: string) => Promise<string | undefined>

const rootIdArgs = z.tuple([z.number().int().positive()])

/** Registers the library channels; each forwards to the service after validation. */
export function registerLibraryChannels(
  ipc: IpcHandlerRegistry,
  service: ServiceRequester,
  pickFolder: FolderPicker
): void {
  ipc.register(IpcChannel.ServiceHealth, z.tuple([]), () =>
    service.request(ServiceMethod.Health, {})
  )
  ipc.register(IpcChannel.ListRoots, z.tuple([]), () =>
    service.request(ServiceMethod.ListRoots, {})
  )
  ipc.register(
    IpcChannel.AddRootViaDialog,
    z.tuple([]),
    async (): Promise<AddRootViaDialogResult> => {
      const path = await pickFolder('Add folder to library')
      if (path === undefined) return { outcome: AddRootOutcome.Cancelled }
      return service.request(ServiceMethod.AddRoot, { path })
    }
  )
  ipc.register(
    IpcChannel.RemoveRoot,
    rootIdArgs,
    async (rootId) => (await service.request(ServiceMethod.RemoveRoot, { rootId })).removed
  )
  ipc.register(IpcChannel.GalleryLayout, z.tuple([galleryQuerySchema]), (query) =>
    service.request(ServiceMethod.GalleryLayout, { query })
  )
  const markIds = z.array(z.number().int().positive()).min(1).max(MAX_IDS_PER_MARK)
  ipc.register(
    IpcChannel.SetFavorite,
    z.tuple([markIds, z.boolean()]),
    async (ids, favorite) =>
      (await service.request(ServiceMethod.SetFavorite, { ids, favorite })).changed
  )
  ipc.register(
    IpcChannel.SetRating,
    z.tuple([markIds, z.number().int().min(0).max(MAX_RATING)]),
    async (ids, rating) => (await service.request(ServiceMethod.SetRating, { ids, rating })).changed
  )
  ipc.register(IpcChannel.SearchFacets, z.tuple([galleryQuerySchema]), (query) =>
    service.request(ServiceMethod.SearchFacets, { query })
  )
  ipc.register(
    IpcChannel.GalleryImages,
    z.tuple([z.array(z.number().int().positive()).max(MAX_IMAGES_PER_REQUEST)]),
    (ids) => service.request(ServiceMethod.GalleryImages, { ids })
  )
  ipc.register(IpcChannel.DirectoryTree, rootIdArgs, (rootId) =>
    service.request(ServiceMethod.DirectoryTree, { rootId })
  )
  ipc.register(
    IpcChannel.RescanRoot,
    rootIdArgs,
    async (rootId) => (await service.request(ServiceMethod.RescanRoot, { rootId })).started
  )
}

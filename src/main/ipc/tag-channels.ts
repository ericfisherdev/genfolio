import { z } from 'zod'
import { MAX_IDS_PER_MARK } from '@shared/gallery'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-contract'
import { tagNameSchema } from '@shared/tags'
import type { ServiceRequester } from '../service/library-service-client'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

const id = z.number().int().positive()
const tagIds = z.array(id).min(1).max(200)
const imageIds = z.array(id).min(1).max(MAX_IDS_PER_MARK)

/** Registers the tag channels; each validates, then forwards to the service. */
export function registerTagChannels(ipc: IpcHandlerRegistry, service: ServiceRequester): void {
  ipc.register(IpcChannel.ListTags, z.tuple([]), () => service.request(ServiceMethod.TagsList, {}))
  ipc.register(IpcChannel.ImageTags, z.tuple([id]), (imageId) =>
    service.request(ServiceMethod.TagsOfImage, { imageId })
  )
  ipc.register(IpcChannel.CreateTag, z.tuple([tagNameSchema]), (name) =>
    service.request(ServiceMethod.TagsCreate, { name })
  )
  ipc.register(IpcChannel.RenameTag, z.tuple([id, tagNameSchema]), (tagId, name) =>
    service.request(ServiceMethod.TagsRename, { id: tagId, name })
  )
  ipc.register(IpcChannel.MergeTags, z.tuple([id, id]), (fromId, intoId) =>
    service.request(ServiceMethod.TagsMerge, { fromId, intoId })
  )
  ipc.register(
    IpcChannel.DeleteTag,
    z.tuple([id]),
    async (tagId) => (await service.request(ServiceMethod.TagsDelete, { id: tagId })).deleted
  )
  ipc.register(
    IpcChannel.ApplyTags,
    z.tuple([tagIds, imageIds]),
    async (tags, images) =>
      (await service.request(ServiceMethod.TagsApply, { tagIds: tags, imageIds: images })).changed
  )
  ipc.register(
    IpcChannel.RemoveTags,
    z.tuple([tagIds, imageIds]),
    async (tags, images) =>
      (await service.request(ServiceMethod.TagsRemove, { tagIds: tags, imageIds: images })).changed
  )
}

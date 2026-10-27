import { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { modelTagNameSchema } from '@shared/model-tags'
import { modelKeySchema } from '@shared/models'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

const id = z.number().int().positive()

/** Registers the model tag channels; each validates, then forwards to the service. */
export function registerModelTagChannels(ipc: IpcHandlerRegistry, service: ServiceRequester): void {
  ipc.register(IpcChannel.ListModelTags, z.tuple([]), () =>
    service.request(ServiceMethod.ModelTagsList, {})
  )
  ipc.register(IpcChannel.ModelTagsOf, z.tuple([modelKeySchema]), (key) =>
    service.request(ServiceMethod.ModelTagsOfModel, key)
  )
  ipc.register(IpcChannel.CreateModelTag, z.tuple([modelTagNameSchema]), (name) =>
    service.request(ServiceMethod.ModelTagsCreate, { name })
  )
  ipc.register(IpcChannel.RenameModelTag, z.tuple([id, modelTagNameSchema]), (tagId, name) =>
    service.request(ServiceMethod.ModelTagsRename, { id: tagId, name })
  )
  ipc.register(
    IpcChannel.DeleteModelTag,
    z.tuple([id]),
    async (tagId) => (await service.request(ServiceMethod.ModelTagsDelete, { id: tagId })).deleted
  )
  ipc.register(
    IpcChannel.ApplyModelTag,
    z.tuple([id, modelKeySchema]),
    async (tagId, key) =>
      (await service.request(ServiceMethod.ModelTagsApply, { tagId, key })).applied
  )
  ipc.register(
    IpcChannel.RemoveModelTag,
    z.tuple([id, modelKeySchema]),
    async (tagId, key) =>
      (await service.request(ServiceMethod.ModelTagsRemove, { tagId, key })).removed
  )
}

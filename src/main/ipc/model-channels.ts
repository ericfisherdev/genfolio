import { z } from 'zod'
import { civitaiModelUrl } from '@domain/civitai'
import { civitaiLinkParamsSchema, civitaiSearchParamsSchema } from '@shared/civitai'
import { IpcChannel } from '@shared/genfolio-api'
import { ModelKind } from '@shared/generation-kinds'
import {
  modelFieldsSchema,
  modelKeySchema,
  modelListQuerySchema,
  modelNameSchema
} from '@shared/models'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

/** Registers the model channels; each validates, then forwards to the service. */
export function registerModelChannels(
  ipc: IpcHandlerRegistry,
  service: ServiceRequester,
  writeClipboardText: (text: string) => void,
  openExternal: (url: string) => void
): void {
  ipc.register(IpcChannel.ListModels, z.tuple([modelListQuerySchema]), (query) =>
    service.request(ServiceMethod.ModelsList, query)
  )
  ipc.register(IpcChannel.GetModel, z.tuple([modelKeySchema]), (key) =>
    service.request(ServiceMethod.ModelsGet, key)
  )
  ipc.register(IpcChannel.SaveModel, z.tuple([modelKeySchema, modelFieldsSchema]), (key, fields) =>
    service.request(ServiceMethod.ModelsSave, { key, fields })
  )
  ipc.register(
    IpcChannel.CreateModel,
    z.tuple([z.enum(ModelKind), modelNameSchema, modelFieldsSchema]),
    (kind, name, fields) => service.request(ServiceMethod.ModelsCreate, { kind, name, fields })
  )
  ipc.register(
    IpcChannel.ClearModel,
    z.tuple([modelKeySchema]),
    async (key) => (await service.request(ServiceMethod.ModelsClear, key)).cleared
  )
  // The words come from the stored entry, so the renderer never supplies clipboard text.
  ipc.register(IpcChannel.CopyModelTriggerWords, z.tuple([modelKeySchema]), async (key) => {
    const model = await service.request(ServiceMethod.ModelsGet, key)
    if (!model || model.triggerWords.length === 0) return false
    writeClipboardText(model.triggerWords.join(', '))
    return true
  })

  registerCivitaiChannels(ipc, service, openExternal)
}

/** The Civitai channels: they forward to the service, which does the contacting of civitai.com. */
function registerCivitaiChannels(
  ipc: IpcHandlerRegistry,
  service: ServiceRequester,
  openExternal: (url: string) => void
): void {
  const modelId = z.number().int().positive()
  ipc.register(IpcChannel.LookupModelOnCivitai, z.tuple([modelKeySchema]), (key) =>
    service.request(ServiceMethod.ModelsCivitaiLookup, key)
  )
  ipc.register(IpcChannel.SearchCivitai, z.tuple([civitaiSearchParamsSchema]), (params) =>
    service.request(ServiceMethod.ModelsCivitaiSearch, params)
  )
  ipc.register(
    IpcChannel.LinkModelToCivitai,
    z.tuple([modelKeySchema, modelId, modelId]),
    (key, model, version) =>
      service.request(
        ServiceMethod.ModelsCivitaiLink,
        civitaiLinkParamsSchema.parse({ key, modelId: model, versionId: version })
      )
  )
  ipc.register(IpcChannel.RefreshModelFromCivitai, z.tuple([modelKeySchema]), (key) =>
    service.request(ServiceMethod.ModelsCivitaiRefresh, key)
  )
  ipc.register(
    IpcChannel.UnlinkModelFromCivitai,
    z.tuple([modelKeySchema]),
    async (key) => (await service.request(ServiceMethod.ModelsCivitaiUnlink, key)).unlinked
  )
  // The address is built here from the stored ids, so the renderer never supplies a URL.
  ipc.register(IpcChannel.OpenModelOnCivitai, z.tuple([modelKeySchema]), async (key) => {
    const link = (await service.request(ServiceMethod.ModelsGet, key))?.civitai
    if (!link) return false
    openExternal(civitaiModelUrl(link.modelId, link.versionId))
    return true
  })
}

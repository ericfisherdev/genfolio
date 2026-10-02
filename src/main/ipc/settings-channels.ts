import { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { ModelKind } from '@shared/generation-kinds'
import type { ModelFolders } from '@shared/model-folders'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import type { FolderPicker } from './library-channels'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

const kindArgs = z.tuple([z.enum(ModelKind)])

const PICKER_TITLES: Readonly<Record<ModelKind, string>> = {
  [ModelKind.Checkpoint]: 'Choose the checkpoints download folder',
  [ModelKind.Lora]: 'Choose the LoRAs download folder'
}

/** Registers the settings channels; the folder is chosen in main, never passed by the renderer. */
export function registerSettingsChannels(
  ipc: IpcHandlerRegistry,
  service: ServiceRequester,
  pickFolder: FolderPicker
): void {
  ipc.register(IpcChannel.GetModelFolders, z.tuple([]), () =>
    service.request(ServiceMethod.ModelFolders, {})
  )
  ipc.register(IpcChannel.ChooseModelFolder, kindArgs, async (kind): Promise<ModelFolders> => {
    const path = await pickFolder(PICKER_TITLES[kind])
    return path === undefined
      ? service.request(ServiceMethod.ModelFolders, {})
      : service.request(ServiceMethod.SetModelFolder, { kind, path })
  })
  ipc.register(IpcChannel.ClearModelFolder, kindArgs, (kind) =>
    service.request(ServiceMethod.SetModelFolder, { kind, path: null })
  )
}

import { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-contract'
import { presetNameSchema, slideshowSettingsSchema } from '@shared/slideshow'
import type { ServiceRequester } from '../service/library-service-client'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

/** Registers the slideshow preset channels; each validates, then forwards to the service. */
export function registerSlideshowChannels(
  ipc: IpcHandlerRegistry,
  service: ServiceRequester
): void {
  ipc.register(IpcChannel.ListPresets, z.tuple([]), () =>
    service.request(ServiceMethod.PresetsList, {})
  )
  ipc.register(
    IpcChannel.SavePreset,
    z.tuple([presetNameSchema, slideshowSettingsSchema]),
    (name, settings) => service.request(ServiceMethod.PresetsSave, { name, settings })
  )
  ipc.register(
    IpcChannel.DeletePreset,
    z.tuple([z.number().int().positive()]),
    async (id) => (await service.request(ServiceMethod.PresetsDelete, { id })).deleted
  )
}

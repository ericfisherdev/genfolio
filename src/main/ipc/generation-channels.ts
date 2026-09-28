import { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { CopyVariant } from '@shared/generation'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

const imageId = z.number().int().positive()

/**
 * Registers the generation channels. Copying asks the service for the text and writes the
 * clipboard here, so the renderer never supplies clipboard contents.
 */
export function registerGenerationChannels(
  ipc: IpcHandlerRegistry,
  service: ServiceRequester,
  writeClipboardText: (text: string) => void
): void {
  ipc.register(IpcChannel.GetGeneration, z.tuple([imageId]), (id) =>
    service.request(ServiceMethod.ImageGeneration, { imageId: id })
  )
  ipc.register(
    IpcChannel.CopyGeneration,
    z.tuple([imageId, z.enum(CopyVariant)]),
    async (id, variant) => {
      const text = await service.request(ServiceMethod.ImageGenerationText, {
        imageId: id,
        variant
      })
      if (text === null) return false
      writeClipboardText(text)
      return true
    }
  )
}

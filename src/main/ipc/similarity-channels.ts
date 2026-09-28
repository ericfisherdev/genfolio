import { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { ServiceMethod } from '@shared/service-contract'
import { MAX_GROUPS_PER_PAGE, similarityThresholdSchema } from '@shared/similarity'
import type { ServiceRequester } from '../service/library-service-client'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

/** Registers the look-alike channels; each validates, then forwards to the service. */
export function registerSimilarityChannels(
  ipc: IpcHandlerRegistry,
  service: ServiceRequester
): void {
  ipc.register(
    IpcChannel.SimilarityThreshold,
    z.tuple([]),
    async () => (await service.request(ServiceMethod.SimilarityThreshold, {})).threshold
  )
  ipc.register(
    IpcChannel.SetSimilarityThreshold,
    z.tuple([similarityThresholdSchema]),
    async (threshold) =>
      (await service.request(ServiceMethod.SetSimilarityThreshold, { threshold })).threshold
  )
  ipc.register(
    IpcChannel.SimilarGroups,
    z.tuple([z.number().int().nonnegative(), z.number().int().min(1).max(MAX_GROUPS_PER_PAGE)]),
    (offset, limit) => service.request(ServiceMethod.SimilarGroups, { offset, limit })
  )
}

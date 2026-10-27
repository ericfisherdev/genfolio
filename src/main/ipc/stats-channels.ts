import { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import { modelStatsQuerySchema, statsRowLimitSchema } from '@shared/model-stats'
import { DEFAULT_STATS_ROWS } from '@shared/model-stats-kinds'
import { modelKeySchema } from '@shared/models'
import { ServiceMethod } from '@shared/service-contract'
import type { ServiceRequester } from '../service/library-service-client'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

/** Registers the model stats channels; each validates, then forwards to the service. */
export function registerStatsChannels(ipc: IpcHandlerRegistry, service: ServiceRequester): void {
  ipc.register(IpcChannel.StatsOverview, z.tuple([modelStatsQuerySchema.default({})]), (query) =>
    service.request(ServiceMethod.StatsOverview, query)
  )
  ipc.register(
    IpcChannel.StatsModelUsage,
    z.tuple([modelKeySchema, statsRowLimitSchema.default(DEFAULT_STATS_ROWS)]),
    (key, limit) => service.request(ServiceMethod.StatsModelUsage, { key, limit })
  )
}

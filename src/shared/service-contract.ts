import { z } from 'zod'
import { addRootResultSchema, rootSummarySchema } from './library'
import { serviceHealthSchema } from './service-health'

/** Methods the library service (utility process) answers over its parent port. */
export enum ServiceMethod {
  Health = 'health',
  ListRoots = 'roots.list',
  AddRoot = 'roots.add',
  RemoveRoot = 'roots.remove',
  RescanRoot = 'roots.rescan'
}

const noParams = z.object({}).strict()
const rootIdParams = z.object({ rootId: z.number().int().positive() }).strict()

/**
 * Parameter and result schemas per method: the service validates params, main validates
 * results. Adding a method means adding an entry here and a handler in the service.
 */
export const serviceContract = {
  [ServiceMethod.Health]: { params: noParams, result: serviceHealthSchema },
  [ServiceMethod.ListRoots]: { params: noParams, result: z.array(rootSummarySchema).readonly() },
  [ServiceMethod.AddRoot]: {
    params: z.object({ path: z.string().min(1) }).strict(),
    result: addRootResultSchema
  },
  [ServiceMethod.RemoveRoot]: { params: rootIdParams, result: z.object({ removed: z.boolean() }) },
  [ServiceMethod.RescanRoot]: { params: rootIdParams, result: z.object({ started: z.boolean() }) }
} as const satisfies { [M in ServiceMethod]: { params: z.ZodType; result: z.ZodType } }

export type ServiceParams = { [M in ServiceMethod]: z.infer<(typeof serviceContract)[M]['params']> }
export type ServiceResults = {
  [M in ServiceMethod]: z.infer<(typeof serviceContract)[M]['result']>
}

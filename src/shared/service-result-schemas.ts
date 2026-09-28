import type { z } from 'zod'
import { ServiceMethod, type ServiceResults } from './service-rpc'
import { serviceHealthSchema } from './service-health'

/** Runtime shape of each service method's result, checked by main before trusting it. */
export const serviceResultSchemas: { readonly [M in ServiceMethod]: z.ZodType<ServiceResults[M]> } =
  {
    [ServiceMethod.Health]: serviceHealthSchema
  }

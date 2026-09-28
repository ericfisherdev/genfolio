import {
  serviceContract,
  type ServiceMethod,
  type ServiceParams,
  type ServiceResults
} from '@shared/service-contract'
import type { ServiceRequest, ServiceResponse } from '@shared/service-rpc'
import { describeIssues } from '@shared/validation'

export type ServiceHandlers = {
  [M in ServiceMethod]: (params: ServiceParams[M]) => Promise<ServiceResults[M]>
}

/**
 * Validates params against the method's schema, then routes to its handler. Invalid params
 * and handler failures become error responses; this never rejects.
 */
export class RpcDispatcher {
  constructor(private readonly handlers: ServiceHandlers) {}

  async dispatch(request: ServiceRequest): Promise<ServiceResponse> {
    const params = serviceContract[request.method].params.safeParse(request.params)
    if (!params.success) {
      return { id: request.id, ok: false, error: `invalid params: ${describeIssues(params.error)}` }
    }
    try {
      const handler = this.handlers[request.method] as (params: unknown) => Promise<unknown>
      return { id: request.id, ok: true, result: await handler(params.data) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { id: request.id, ok: false, error: message }
    }
  }
}

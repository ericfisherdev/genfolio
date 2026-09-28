import type {
  ServiceMethod,
  ServiceRequest,
  ServiceResponse,
  ServiceResults
} from '@shared/service-rpc'

export type ServiceHandlers = { [M in ServiceMethod]: () => Promise<ServiceResults[M]> }

/** Routes a validated request to its handler; handler failures become error responses. */
export class RpcDispatcher {
  constructor(private readonly handlers: ServiceHandlers) {}

  async dispatch(request: ServiceRequest): Promise<ServiceResponse> {
    try {
      const result = await this.handlers[request.method]()
      return { id: request.id, ok: true, result }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { id: request.id, ok: false, error: message }
    }
  }
}

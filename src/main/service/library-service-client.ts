import type { UtilityProcess } from 'electron'
import type { ServiceMethod, ServiceResults } from '@shared/service-rpc'
import { isServiceResponse } from '@shared/service-rpc-guards'

/** The library service process exited before answering. */
export class ServiceExitedError extends Error {
  constructor(readonly exitCode: number) {
    super(`Library service exited with code ${exitCode}`)
    this.name = 'ServiceExitedError'
  }
}

/** The library service answered a request with an error. */
export class ServiceRequestError extends Error {
  constructor(
    readonly method: ServiceMethod,
    reason: string
  ) {
    super(`Library service failed ${method}: ${reason}`)
    this.name = 'ServiceRequestError'
  }
}

interface PendingRequest {
  readonly method: ServiceMethod
  resolve(result: unknown): void
  reject(error: Error): void
}

export type ServiceProcess = Pick<UtilityProcess, 'postMessage' | 'on'>

/** Request/response client over the utility process parent port. */
export class LibraryServiceClient {
  private nextId = 1
  private exitCode: number | undefined
  private readonly pending = new Map<number, PendingRequest>()

  constructor(private readonly child: ServiceProcess) {
    child.on('message', (message: unknown) => this.settle(message))
    child.on('exit', (code: number) => this.failAll(code))
  }

  /**
   * Rejects with {@link ServiceRequestError} when the service reports a failure,
   * or {@link ServiceExitedError} when the service process is gone.
   */
  request<M extends ServiceMethod>(method: M): Promise<ServiceResults[M]> {
    if (this.exitCode !== undefined) {
      return Promise.reject(new ServiceExitedError(this.exitCode))
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        method,
        resolve: (result) => resolve(result as ServiceResults[M]),
        reject
      })
      this.child.postMessage({ id, method })
    })
  }

  private settle(message: unknown): void {
    if (!isServiceResponse(message)) return
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    if (message.ok) {
      pending.resolve(message.result)
    } else {
      pending.reject(new ServiceRequestError(pending.method, message.error))
    }
  }

  private failAll(code: number): void {
    this.exitCode = code
    const error = new ServiceExitedError(code)
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}

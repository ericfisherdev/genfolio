import type { UtilityProcess } from 'electron'
import type { ServiceMethod, ServiceResults } from '@shared/service-rpc'
import { isServiceResponse } from '@shared/service-rpc-guards'
import { serviceResultSchemas } from '@shared/service-result-schemas'
import { describeIssues } from '@shared/validation'

/** The library service process exited before answering. */
export class ServiceExitedError extends Error {
  constructor(readonly exitCode: number) {
    super(`Library service exited with code ${exitCode}`)
    this.name = 'ServiceExitedError'
  }
}

/** The library service answered with an error, or with a result that fails its schema. */
export class ServiceRequestError extends Error {
  constructor(
    readonly method: ServiceMethod,
    reason: string
  ) {
    super(`Library service failed ${method}: ${reason}`)
    this.name = 'ServiceRequestError'
  }
}

/** The library service did not answer within the request deadline. */
export class ServiceTimeoutError extends Error {
  constructor(readonly method: ServiceMethod) {
    super(`Library service did not answer ${method} in time`)
    this.name = 'ServiceTimeoutError'
  }
}

/** Anything that can forward a request to the library service. */
export interface ServiceRequester {
  /**
   * Rejects with {@link ServiceRequestError} (service error or malformed result),
   * {@link ServiceTimeoutError} or {@link ServiceExitedError}.
   */
  request<M extends ServiceMethod>(method: M): Promise<ServiceResults[M]>
}

export interface LibraryServiceClientOptions {
  readonly requestTimeoutMs: number
  /** Called once when the process exits, after outstanding requests were rejected. */
  readonly onExit?: (exitCode: number) => void
}

interface PendingRequest {
  readonly method: ServiceMethod
  resolve(result: unknown): void
  reject(error: Error): void
}

export type ServiceProcess = Pick<UtilityProcess, 'postMessage' | 'on'>

/** Request/response client over the utility process parent port. */
export class LibraryServiceClient implements ServiceRequester {
  private nextId = 1
  private exitCode: number | undefined
  private readonly pending = new Map<number, PendingRequest>()

  constructor(
    private readonly child: ServiceProcess,
    private readonly options: LibraryServiceClientOptions
  ) {
    child.on('message', (message: unknown) => this.settle(message))
    child.on('exit', (code: number) => this.failAll(code))
  }

  /** Requests awaiting an answer; settled, timed-out and failed requests are removed. */
  get pendingRequestCount(): number {
    return this.pending.size
  }

  request<M extends ServiceMethod>(method: M): Promise<ServiceResults[M]> {
    if (this.exitCode !== undefined) {
      return Promise.reject(new ServiceExitedError(this.exitCode))
    }
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        this.pending.delete(id)
        reject(new ServiceTimeoutError(method))
      }, this.options.requestTimeoutMs)
      this.pending.set(id, {
        method,
        resolve: (result) => {
          clearTimeout(deadline)
          resolve(result as ServiceResults[M])
        },
        reject: (error) => {
          clearTimeout(deadline)
          reject(error)
        }
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
      this.resolveValidated(pending, message.result)
    } else {
      pending.reject(new ServiceRequestError(pending.method, message.error))
    }
  }

  private resolveValidated(pending: PendingRequest, result: unknown): void {
    const parsed = serviceResultSchemas[pending.method].safeParse(result)
    if (parsed.success) {
      pending.resolve(parsed.data)
    } else {
      pending.reject(
        new ServiceRequestError(pending.method, `malformed result: ${describeIssues(parsed.error)}`)
      )
    }
  }

  private failAll(code: number): void {
    this.exitCode = code
    const error = new ServiceExitedError(code)
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    this.options.onExit?.(code)
  }
}

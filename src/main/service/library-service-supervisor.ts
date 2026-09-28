import type { ServiceMethod, ServiceResults } from '@shared/service-rpc'
import type { ServiceRequester } from './library-service-client'

/** Creates a client for a freshly started service; the client must call `onExit` when it dies. */
export type ServiceClientFactory = (onExit: (exitCode: number) => void) => ServiceRequester

export interface RestartPolicy {
  /** Restarts allowed within {@link windowMs} before the supervisor gives up. */
  readonly maxRestarts: number
  readonly windowMs: number
}

export interface SupervisorLogger {
  warn(message: string): void
  error(message: string): void
}

/**
 * Keeps the library service running: replaces the process after a crash, and stops
 * restarting when it crashes more than the policy allows (a crash loop). After giving up,
 * requests reject with the dead client's `ServiceExitedError`.
 */
export class LibraryServiceSupervisor implements ServiceRequester {
  private current: ServiceRequester
  private restartTimes: number[] = []

  constructor(
    private readonly createClient: ServiceClientFactory,
    private readonly policy: RestartPolicy,
    private readonly logger: SupervisorLogger,
    private readonly now: () => number = Date.now
  ) {
    this.current = this.start()
  }

  request<M extends ServiceMethod>(method: M): Promise<ServiceResults[M]> {
    return this.current.request(method)
  }

  private start(): ServiceRequester {
    return this.createClient((exitCode) => this.handleExit(exitCode))
  }

  private handleExit(exitCode: number): void {
    const now = this.now()
    this.restartTimes = this.restartTimes.filter((time) => now - time < this.policy.windowMs)
    if (this.restartTimes.length >= this.policy.maxRestarts) {
      this.logger.error(
        `Library service exited with code ${exitCode}; ${this.restartTimes.length} restarts ` +
          `within ${this.policy.windowMs} ms, not restarting again`
      )
      return
    }
    this.restartTimes.push(now)
    this.logger.warn(`Library service exited with code ${exitCode}; restarting`)
    this.current = this.start()
  }
}

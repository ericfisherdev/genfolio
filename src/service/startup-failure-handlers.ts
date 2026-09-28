import { ServiceMethod } from '@shared/service-contract'
import type { ServiceHandlers } from './rpc-dispatcher'

/**
 * Handlers for a service that could not start (e.g. a database written by a newer app):
 * every request fails with the same readable reason instead of the process crash-looping.
 */
export function startupFailureHandlers(reason: string): ServiceHandlers {
  const fail = (): Promise<never> => Promise.reject(new Error(reason))
  return Object.fromEntries(
    Object.values(ServiceMethod).map((method) => [method, fail])
  ) as unknown as ServiceHandlers
}

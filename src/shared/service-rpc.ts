import type { ScanEvent } from './scan'
import type { ServiceMethod } from './service-contract'

export interface ServiceRequest {
  readonly id: number
  readonly method: ServiceMethod
  readonly params: unknown
}

export type ServiceResponse =
  | { readonly id: number; readonly ok: true; readonly result: unknown }
  | { readonly id: number; readonly ok: false; readonly error: string }

/** Unsolicited notification from the service; has no request id. */
export interface ServiceEventMessage {
  readonly event: ScanEvent
}

import type { ServiceHealth } from './service-health'

/** Methods the library service (utility process) answers over its parent port. */
export enum ServiceMethod {
  Health = 'health'
}

export interface ServiceResults {
  [ServiceMethod.Health]: ServiceHealth
}

export interface ServiceRequest {
  readonly id: number
  readonly method: ServiceMethod
}

export type ServiceResponse =
  | { readonly id: number; readonly ok: true; readonly result: unknown }
  | { readonly id: number; readonly ok: false; readonly error: string }

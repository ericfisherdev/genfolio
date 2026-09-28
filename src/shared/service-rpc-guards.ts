import { ServiceMethod } from './service-contract'
import type { ServiceEventMessage, ServiceRequest, ServiceResponse } from './service-rpc'

const SERVICE_METHODS = new Set<string>(Object.values(ServiceMethod))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Envelope check only; the service validates `params` against the method's schema. */
export function isServiceRequest(value: unknown): value is ServiceRequest {
  return (
    isRecord(value) &&
    typeof value['id'] === 'number' &&
    typeof value['method'] === 'string' &&
    SERVICE_METHODS.has(value['method']) &&
    'params' in value
  )
}

export function isServiceResponse(value: unknown): value is ServiceResponse {
  if (!isRecord(value) || typeof value['id'] !== 'number') return false
  if (value['ok'] === true) return 'result' in value
  return value['ok'] === false && typeof value['error'] === 'string'
}

/** Envelope check only; main validates `event` against the scan event schema. */
export function isServiceEventMessage(value: unknown): value is ServiceEventMessage {
  return isRecord(value) && !('id' in value) && 'event' in value
}

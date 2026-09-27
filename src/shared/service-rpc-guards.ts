import { ServiceMethod, type ServiceRequest, type ServiceResponse } from './service-rpc'

const SERVICE_METHODS = new Set<string>(Object.values(ServiceMethod))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isServiceRequest(value: unknown): value is ServiceRequest {
  return (
    isRecord(value) &&
    typeof value['id'] === 'number' &&
    typeof value['method'] === 'string' &&
    SERVICE_METHODS.has(value['method'])
  )
}

export function isServiceResponse(value: unknown): value is ServiceResponse {
  if (!isRecord(value) || typeof value['id'] !== 'number') return false
  if (value['ok'] === true) return 'result' in value
  return value['ok'] === false && typeof value['error'] === 'string'
}

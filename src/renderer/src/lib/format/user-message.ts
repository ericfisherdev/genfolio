const IPC_PREFIX = /^Error invoking remote method '[^']+': (?:\w*Error: )?/
const SERVICE_PREFIX = /^Library service failed [\w.-]+: /

/**
 * The part of an error worth showing a user: drops Electron's IPC wrapper and the service's
 * method prefix, keeping the reason itself.
 */
export function userMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(IPC_PREFIX, '').replace(SERVICE_PREFIX, '')
}

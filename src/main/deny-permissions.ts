import type { Session } from 'electron'

/** Genfolio needs no browser permissions (camera, geolocation, notifications, …). */
export function denyAllPermissions(
  session: Pick<Session, 'setPermissionRequestHandler' | 'setPermissionCheckHandler'>
): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
}

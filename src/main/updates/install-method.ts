import { InstallMethod } from '@shared/update-kinds'

/** electron-builder writes the package target into this file for deb, rpm and pacman packages. */
export const PACKAGE_TYPE_FILE = 'package-type'

const METHOD_BY_PACKAGE_TYPE: Readonly<Record<string, InstallMethod>> = {
  pacman: InstallMethod.Pacman,
  deb: InstallMethod.Deb
}

/**
 * How this build was installed: an AppImage sets `APPIMAGE` in the environment; a deb or pacman
 * package carries `resources/package-type`; anything else (development, `--dir` output, an rpm)
 * can't be updated in place. Reading the marker is injected; `undefined` means it isn't there.
 */
export function detectInstallMethod(
  env: Readonly<Record<string, string | undefined>>,
  packaged: boolean,
  readPackageType: () => string | undefined
): InstallMethod {
  if (!packaged) return InstallMethod.Unsupported
  if (env['APPIMAGE']) return InstallMethod.AppImage
  const packageType = readPackageType()?.trim() ?? ''
  return METHOD_BY_PACKAGE_TYPE[packageType] ?? InstallMethod.Unsupported
}

/** Whether installing an update goes through the system's authentication (password) dialog. */
export const installAsksForPassword = (method: InstallMethod): boolean =>
  method === InstallMethod.Pacman || method === InstallMethod.Deb

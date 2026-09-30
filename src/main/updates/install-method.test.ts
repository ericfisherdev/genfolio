import { describe, expect, it } from 'vitest'
import { InstallMethod } from '@shared/update-kinds'
import { detectInstallMethod, installAsksForPassword } from './install-method'

describe('detectInstallMethod', () => {
  it('is the AppImage when the runtime set APPIMAGE', () => {
    expect(
      detectInstallMethod({ APPIMAGE: '/apps/Genfolio.AppImage' }, true, () => undefined)
    ).toBe(InstallMethod.AppImage)
  })

  it('reads the package marker electron-builder writes into deb and pacman packages', () => {
    expect(detectInstallMethod({}, true, () => 'pacman\n')).toBe(InstallMethod.Pacman)
    expect(detectInstallMethod({}, true, () => 'deb')).toBe(InstallMethod.Deb)
  })

  it('cannot update development builds, unpacked builds or unknown packages', () => {
    expect(detectInstallMethod({ APPIMAGE: '/x' }, false, () => 'deb')).toBe(
      InstallMethod.Unsupported
    )
    expect(detectInstallMethod({}, true, () => undefined)).toBe(InstallMethod.Unsupported)
    expect(detectInstallMethod({}, true, () => 'rpm')).toBe(InstallMethod.Unsupported)
  })

  it('knows which installs go through the system authentication dialog', () => {
    expect(installAsksForPassword(InstallMethod.Pacman)).toBe(true)
    expect(installAsksForPassword(InstallMethod.Deb)).toBe(true)
    expect(installAsksForPassword(InstallMethod.AppImage)).toBe(false)
  })
})

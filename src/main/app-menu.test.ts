import { describe, expect, it, vi } from 'vitest'
import { appMenuTemplate, versionRequested } from './app-menu'

describe('appMenuTemplate', () => {
  it('offers About, the logs folder and the project page under Help', () => {
    const actions = { showAbout: vi.fn(), openLogs: vi.fn(), openWebsite: vi.fn() }
    const help = appMenuTemplate(actions, false).find((menu) => menu.label === 'Help')
    const items = help?.submenu as { label?: string; click?: () => void }[]
    items.find((item) => item.label === 'About Genfolio')?.click?.()
    items.find((item) => item.label === 'Open Logs Folder')?.click?.()
    expect(actions.showAbout).toHaveBeenCalled()
    expect(actions.openLogs).toHaveBeenCalled()
  })

  it('offers developer tools only in development', () => {
    const roles = (development: boolean): unknown[] =>
      (
        appMenuTemplate(
          { showAbout: vi.fn(), openLogs: vi.fn(), openWebsite: vi.fn() },
          development
        ).find((menu) => menu.label === 'View')?.submenu as { role?: string }[]
      ).map((item) => item.role)
    expect(roles(true)).toContain('toggleDevTools')
    expect(roles(false)).not.toContain('toggleDevTools')
  })
})

describe('versionRequested', () => {
  it('looks for --version after the executable', () => {
    expect(versionRequested(['/usr/bin/genfolio', '--version'])).toBe(true)
    expect(versionRequested(['/usr/bin/genfolio'])).toBe(false)
  })
})

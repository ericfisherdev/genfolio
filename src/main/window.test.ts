import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: class {} }))

const { secureWebPreferences } = await import('./window')

describe('secureWebPreferences', () => {
  it('sandboxes and isolates the renderer', () => {
    expect(secureWebPreferences('/app/preload.js')).toEqual({
      preload: '/app/preload.js',
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    })
  })
})

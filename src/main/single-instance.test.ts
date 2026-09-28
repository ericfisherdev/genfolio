import { describe, expect, it, vi } from 'vitest'
import { claimSingleInstance, type SingleInstanceApp } from './single-instance'

function fakeApp(hasLock: boolean): SingleInstanceApp & { on: ReturnType<typeof vi.fn> } {
  return {
    requestSingleInstanceLock: vi.fn(() => hasLock),
    quit: vi.fn(),
    on: vi.fn()
  } as unknown as SingleInstanceApp & { on: ReturnType<typeof vi.fn> }
}

describe('claimSingleInstance', () => {
  it('keeps running and listens for later launches when it gets the lock', () => {
    const app = fakeApp(true)
    const onSecondInstance = vi.fn()
    expect(claimSingleInstance(app, onSecondInstance)).toBe(true)
    expect(app.quit).not.toHaveBeenCalled()
    expect(app.on).toHaveBeenCalledWith('second-instance', onSecondInstance)
  })

  it('quits when another instance holds the lock', () => {
    const app = fakeApp(false)
    expect(claimSingleInstance(app, vi.fn())).toBe(false)
    expect(app.quit).toHaveBeenCalledOnce()
    expect(app.on).not.toHaveBeenCalled()
  })
})

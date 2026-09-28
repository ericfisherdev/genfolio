import { describe, expect, it, vi } from 'vitest'
import { denyAllPermissions } from './deny-permissions'

describe('denyAllPermissions', () => {
  it('rejects every permission request and check', () => {
    let requestHandler: ((...args: never[]) => void) | undefined
    let checkHandler: (() => boolean) | undefined
    denyAllPermissions({
      setPermissionRequestHandler: (handler) => {
        requestHandler = handler as unknown as (...args: never[]) => void
      },
      setPermissionCheckHandler: (handler) => {
        checkHandler = handler as unknown as () => boolean
      }
    })
    const callback = vi.fn()
    ;(requestHandler as unknown as (a: unknown, b: string, c: (granted: boolean) => void) => void)(
      {},
      'media',
      callback
    )
    expect(callback).toHaveBeenCalledWith(false)
    expect(checkHandler?.()).toBe(false)
  })
})

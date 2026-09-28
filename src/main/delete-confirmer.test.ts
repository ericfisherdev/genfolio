import { describe, expect, it, vi } from 'vitest'
import { DialogDeleteConfirmer } from './delete-confirmer'

describe('DialogDeleteConfirmer', () => {
  it('asks with the count and size, defaults to Cancel and deletes only on the second button', async () => {
    const show = vi.fn(async () => ({ response: 1, checkboxChecked: false }))
    const confirmer = new DialogDeleteConfirmer(show)
    await expect(confirmer.confirmPermanent(3, 2_500_000)).resolves.toBe(true)
    expect(show).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Delete 3 image files permanently?',
        detail: expect.stringContaining('2.5 MB'),
        defaultId: 0,
        cancelId: 0
      })
    )
    show.mockResolvedValueOnce({ response: 0, checkboxChecked: false })
    await expect(confirmer.confirmPermanentAfterTrashFailed(1, 10)).resolves.toBe(false)
    expect(show).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: '1 image file could not be moved to the trash. Delete permanently instead?'
      })
    )
  })
})

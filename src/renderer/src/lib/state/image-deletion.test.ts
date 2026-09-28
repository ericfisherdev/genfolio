import { describe, expect, it, vi } from 'vitest'
import { DeleteFailure, DeleteMode, type DeleteReport } from '@shared/deletion'
import { MAX_IDS_PER_MARK } from '@shared/gallery-kinds'
import { ImageDeletion } from './image-deletion.svelte'

const report = (fields: Partial<DeleteReport>): DeleteReport => ({
  cancelled: false,
  deleted: [],
  missing: [],
  failed: [],
  ...fields
})

function setup(result: DeleteReport | Error): {
  deletion: ImageDeletion
  api: { deleteImages: ReturnType<typeof vi.fn> }
  notify: ReturnType<typeof vi.fn>
  onchange: ReturnType<typeof vi.fn>
} {
  const api = {
    deleteImages: vi.fn(async () => {
      if (result instanceof Error) throw result
      return result
    })
  }
  const notify = vi.fn()
  const onchange = vi.fn()
  return { deletion: new ImageDeletion(api, { notify }, onchange), api, notify, onchange }
}

describe('ImageDeletion', () => {
  it('says how many went to the trash and how many were already gone, then reloads', async () => {
    const { deletion, notify, onchange } = setup(report({ deleted: [1, 2], missing: [3] }))
    await deletion.delete([1, 2, 3], DeleteMode.Trash)
    expect(notify).toHaveBeenCalledWith('Moved 2 images to the trash. 1 image was already gone.')
    expect(onchange).toHaveBeenCalled()
    expect(deletion.report).toBeUndefined()
  })

  it('keeps a report of failures for the dialog', async () => {
    const failed = { imageId: 2, fileName: 'b.png', reason: DeleteFailure.RemoveFailed }
    const { deletion, notify } = setup(report({ deleted: [1], failed: [failed] }))
    await deletion.delete([1, 2], DeleteMode.Permanent)
    expect(notify).toHaveBeenCalledWith('Deleted 1 image. Could not delete 1 image.')
    expect(deletion.report?.failed).toEqual([failed])
    deletion.dismissReport()
    expect(deletion.report).toBeUndefined()
  })

  it('does nothing more when the confirmation was declined', async () => {
    const { deletion, notify, onchange } = setup(report({ cancelled: true }))
    const result = await deletion.delete([1], DeleteMode.Permanent)
    expect(result?.cancelled).toBe(true)
    expect(notify).not.toHaveBeenCalled()
    expect(onchange).not.toHaveBeenCalled()
  })

  it('sends large selections in chunks and reports a failed request', async () => {
    const chunked = setup(report({}))
    const ids = Array.from({ length: MAX_IDS_PER_MARK + 1 }, (_, index) => index + 1)
    await chunked.deletion.delete(ids, DeleteMode.Trash)
    expect(chunked.api.deleteImages).toHaveBeenCalledTimes(2)
    const broken = setup(new Error('service down'))
    expect(await broken.deletion.delete([1], DeleteMode.Trash)).toBeUndefined()
    expect(broken.notify).toHaveBeenCalledWith('Could not delete: service down')
  })
})

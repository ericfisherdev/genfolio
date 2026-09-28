import type { FileHandle } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import type { OpenImageFile } from '@application/image-file-resolver'
import { ImageFileActions } from './image-file-actions'

function setup(found: boolean): {
  actions: ImageFileActions
  desktop: {
    showItemInFolder: ReturnType<typeof vi.fn>
    writeClipboardText: ReturnType<typeof vi.fn>
  }
  close: ReturnType<typeof vi.fn>
} {
  const close = vi.fn(async () => undefined)
  const file: OpenImageFile = {
    handle: { close } as unknown as FileHandle,
    path: '/lib/day/a.png',
    fileName: 'a.png',
    width: 1,
    height: 1,
    mtimeMs: 1
  }
  const desktop = { showItemInFolder: vi.fn(), writeClipboardText: vi.fn() }
  const actions = new ImageFileActions({ open: async () => (found ? file : undefined) }, desktop)
  return { actions, desktop, close }
}

describe('ImageFileActions', () => {
  it('reveals and copies the verified path, closing the handle', async () => {
    const { actions, desktop, close } = setup(true)
    await expect(actions.reveal(1)).resolves.toBe(true)
    await expect(actions.copyPath(1)).resolves.toBe(true)
    expect(desktop.showItemInFolder).toHaveBeenCalledWith('/lib/day/a.png')
    expect(desktop.writeClipboardText).toHaveBeenCalledWith('/lib/day/a.png')
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('does nothing and returns false when the image cannot be found', async () => {
    const { actions, desktop } = setup(false)
    await expect(actions.reveal(1)).resolves.toBe(false)
    expect(desktop.showItemInFolder).not.toHaveBeenCalled()
  })
})

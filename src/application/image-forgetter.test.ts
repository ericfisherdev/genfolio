import { describe, expect, it, vi } from 'vitest'
import type { ImageLocator } from '@domain/image-location'
import type { ImageId } from '@domain/library'
import { ImageForgetter } from './image-forgetter'

const locator: ImageLocator = {
  locate: (id) =>
    id === 99
      ? undefined
      : { rootPath: '/lib', relDir: 'day', fileName: `${id}.png`, width: 1, height: 1, mtimeMs: 1 }
}

describe('ImageForgetter', () => {
  it('forgets only images whose files are gone, then prunes unused models', async () => {
    const present = new Set(['/lib/day/2.png'])
    const images = { deleteByIds: vi.fn((ids: readonly ImageId[]) => ids.length) }
    const generations = { pruneUnusedModels: vi.fn(() => 0) }
    const forgetter = new ImageForgetter(
      locator,
      { exists: async (path) => present.has(path) },
      images,
      generations
    )
    const ids = [1, 2, 99, 1].map((id) => id as ImageId)
    expect(await forgetter.forget(ids)).toBe(1)
    expect(images.deleteByIds).toHaveBeenCalledWith([1])
    expect(generations.pruneUnusedModels).toHaveBeenCalled()
  })

  it('touches nothing when every file is still there', async () => {
    const images = { deleteByIds: vi.fn(() => 0) }
    const generations = { pruneUnusedModels: vi.fn(() => 0) }
    const forgetter = new ImageForgetter(locator, { exists: async () => true }, images, generations)
    expect(await forgetter.forget([1 as ImageId])).toBe(0)
    expect(images.deleteByIds).not.toHaveBeenCalled()
    expect(generations.pruneUnusedModels).not.toHaveBeenCalled()
  })
})

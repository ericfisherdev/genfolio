import { describe, expect, it, vi } from 'vitest'
import type { GenerationDetails } from '@shared/generation'
import { CopyVariant } from '@shared/generation-kinds'
import { GenerationCopier } from './generation-copier'
import { GenerationDetailsState } from './generation-details.svelte'

describe('GenerationCopier', () => {
  const notices = (): { notify: ReturnType<typeof vi.fn<(message: string) => void>> } => ({
    notify: vi.fn<(message: string) => void>()
  })

  it('confirms a copy, says when there is nothing to copy, and reports failures', async () => {
    const sink = notices()
    const copyGeneration = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('service down'))
    const copier = new GenerationCopier({ copyGeneration }, sink)
    await copier.copy(7, CopyVariant.PromptWithLoras)
    await copier.copy(7, CopyVariant.Negative)
    await copier.copy(7, CopyVariant.All)
    expect(sink.notify.mock.calls.map(([message]) => message)).toEqual([
      'Copied the prompt with LoRA tags.',
      'This image has no negative prompt to copy.',
      'Could not copy the generation data: service down'
    ])
    expect(copyGeneration).toHaveBeenCalledWith(7, CopyVariant.PromptWithLoras)
  })
})

describe('GenerationDetailsState', () => {
  it('ignores a load that finishes after a newer one', async () => {
    let resolveFirst: (details: GenerationDetails | null) => void = () => undefined
    const getGeneration = vi
      .fn()
      .mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)))
      .mockResolvedValueOnce(null)
    const state = new GenerationDetailsState({ getGeneration })
    const first = state.load(1)
    await state.load(2)
    resolveFirst({ prompt: 'stale' } as GenerationDetails)
    await first
    expect(state.details).toBeNull()
    expect(state.loadedImageId).toBe(2)
  })

  it('keeps the error and retries the same image', async () => {
    const getGeneration = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(null)
    const state = new GenerationDetailsState({ getGeneration })
    await state.load(5)
    expect(state.loadError).toBe('boom')
    await state.retry()
    expect(getGeneration).toHaveBeenLastCalledWith(5)
    expect(state.loadError).toBeUndefined()
    expect(state.details).toBeNull()
  })
})

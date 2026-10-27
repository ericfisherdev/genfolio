import { describe, expect, it, vi, type Mock } from 'vitest'
import { ChangeOutcome } from '@shared/change-outcome'
import { ModelKind } from '@shared/generation-kinds'
import type { ModelTag } from '@shared/model-tags'
import { ModelTagsState } from './model-tags.svelte'

const LIGHTING: ModelTag = { id: 1, name: 'lighting', modelCount: 2 }
const ANIME: ModelTag = { id: 2, name: 'Anime', modelCount: 1 }
const MODEL = { kind: ModelKind.Lora, identity: 'detail' }

type Api = ConstructorParameters<typeof ModelTagsState>[0]

interface Setup {
  readonly api: Api
  readonly notices: { notify: Mock<(message: string) => void> }
  readonly onchange: Mock<() => void>
  readonly state: ModelTagsState
}

function setup(overrides: Partial<Api> = {}): Setup {
  const notices = { notify: vi.fn<(message: string) => void>() }
  const onchange = vi.fn<() => void>()
  const api: Api = {
    listModelTags: vi.fn(async () => [LIGHTING]),
    createModelTag: vi.fn(async () => ({ outcome: ChangeOutcome.Done, tag: ANIME }) as const),
    applyModelTag: vi.fn(async () => true),
    removeModelTag: vi.fn(async () => true),
    ...overrides
  }
  return { api, notices, onchange, state: new ModelTagsState(api, notices, onchange) }
}

describe('ModelTagsState', () => {
  it('loads the tags with their model counts', async () => {
    const { state } = setup()
    await state.load()
    expect(state.tags).toEqual([LIGHTING])
  })

  it('creates a tag, or returns the one a duplicate name already has', async () => {
    const { state, api } = setup()
    expect(await state.ensure('anime')).toEqual(ANIME)
    vi.mocked(api.createModelTag).mockResolvedValueOnce({
      outcome: ChangeOutcome.Duplicate,
      existing: LIGHTING
    })
    expect(await state.ensure('LIGHTING')).toEqual(LIGHTING)
  })

  it('reloads and notifies its owner after every command', async () => {
    const { state, api, onchange } = setup()
    await state.apply(LIGHTING, MODEL)
    await state.remove(LIGHTING, MODEL)
    expect(api.applyModelTag).toHaveBeenCalledWith(1, MODEL)
    expect(api.removeModelTag).toHaveBeenCalledWith(1, MODEL)
    expect(api.listModelTags).toHaveBeenCalledTimes(2)
    expect(onchange).toHaveBeenCalledTimes(2)
  })

  it('says so when the model or tag is gone', async () => {
    const { state, notices } = setup({ applyModelTag: vi.fn(async () => false) })
    await state.apply(LIGHTING, MODEL)
    expect(notices.notify).toHaveBeenCalledWith('That model or tag no longer exists.')
  })

  it('reports a failed command and still reloads', async () => {
    const { state, notices, api, onchange } = setup({
      applyModelTag: vi.fn(async () => {
        throw new Error('service down')
      })
    })
    await state.apply(LIGHTING, MODEL)
    expect(notices.notify).toHaveBeenCalledWith('Could not tag the model: service down')
    expect(api.listModelTags).toHaveBeenCalled()
    expect(onchange).toHaveBeenCalled()
  })

  it('reports a tag list it could not load', async () => {
    const { state, notices } = setup({
      listModelTags: vi.fn(async () => {
        throw new Error('service down')
      })
    })
    await state.load()
    expect(notices.notify).toHaveBeenCalledWith('Could not load model tags: service down')
  })
})

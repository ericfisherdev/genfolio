import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { tick } from 'svelte'
import { describe, expect, it, vi } from 'vitest'
import { CivitaiOutcome, type CivitaiCandidate } from '@shared/civitai'
import type { GenfolioApi } from '@shared/genfolio-api'
import { ModelKind } from '@shared/generation-kinds'
import type { CivitaiInfo } from '@shared/model-civitai'
import { EMPTY_MODEL_FIELDS, type ModelDetail, type ModelEntry } from '@shared/models'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import ModelsView from './ModelsView.svelte'

const entry: ModelEntry = {
  kind: ModelKind.Lora,
  identity: 'detail',
  name: 'detail',
  imageCount: 2,
  hasInfo: false,
  baseModel: null,
  triggerWords: [],
  strength: null
}

const civitai: CivitaiInfo = {
  modelId: 122359,
  versionId: 135867,
  modelName: 'Detail Tweaker XL',
  versionName: 'v1.0',
  baseModel: 'SDXL 1.0',
  triggerWords: ['add detail'],
  description: 'Detail tweaker for SDXL.',
  versionDescription: 'First release.',
  creator: 'w4r10ck',
  nsfw: false,
  tags: ['detail'],
  downloads: 455250,
  thumbsUp: 43677,
  publishedAt: null,
  fetchedAt: Date.UTC(2026, 9, 1)
}

const unlinked: ModelDetail = {
  ...entry,
  custom: EMPTY_MODEL_FIELDS,
  civitai: null,
  addedByHand: false
}
const linked: ModelDetail = {
  ...entry,
  hasInfo: true,
  baseModel: 'SDXL 1.0',
  triggerWords: ['add detail'],
  custom: EMPTY_MODEL_FIELDS,
  civitai,
  addedByHand: false
}

const candidate = (fields: Partial<CivitaiCandidate> = {}): CivitaiCandidate => ({
  modelId: 5,
  versionId: 9,
  modelName: 'Detail Tweaker XL',
  versionName: 'v1.0',
  baseModel: 'SDXL 1.0',
  creator: 'w4r10ck',
  nsfw: false,
  downloads: 1200,
  thumbsUp: 3,
  fileNames: ['add-detail-xl.safetensors'],
  matchesFileName: false,
  ...fields
})

function harness(overrides: Partial<GenfolioApi> = {}): TestServices {
  return testServices(sampleLibrary(), {
    listModels: async () => ({ total: 1, items: [entry], baseModels: [] }),
    getModel: async () => unlinked,
    ...overrides
  })
}

async function openModel(harnessed: TestServices): Promise<HTMLElement> {
  render(ModelsView, { context: harnessed.context })
  await fireEvent.click(await screen.findByRole('button', { name: /detail/ }))
  return screen.findByRole('region', { name: 'Civitai' })
}

describe('linking a model to Civitai', () => {
  it('looks a model up by its file hash and shows what Civitai says', async () => {
    const lookupModelOnCivitai = vi.fn(async () => ({
      outcome: CivitaiOutcome.Linked as const,
      model: linked
    }))
    const section = await openModel(harness({ lookupModelOnCivitai }))
    expect(within(section).getByText(/contacts civitai\.com/)).toBeTruthy()
    await fireEvent.click(within(section).getByRole('button', { name: 'Look up on Civitai' }))
    expect(lookupModelOnCivitai).toHaveBeenCalledWith({ kind: 'lora', identity: 'detail' })
    await within(section).findByText('Detail Tweaker XL')
    expect(within(section).getByText(/by w4r10ck/)).toBeTruthy()
    expect(within(section).getByText('First release.')).toBeTruthy()
    expect(within(section).getByRole('list', { name: 'Trigger words on Civitai' })).toBeTruthy()
    const summary = screen.getByRole('list', { name: 'Trigger words' })
    expect(summary.textContent).toContain('add detail')
  })

  it('opens the search when no file hash matches, and links the chosen version', async () => {
    const searchCivitai = vi.fn(async () => [
      candidate({ matchesFileName: true, nsfw: true }),
      candidate({ versionId: 10, versionName: 'v0.3', fileNames: [] })
    ])
    const linkModelToCivitai = vi.fn(async () => ({
      outcome: CivitaiOutcome.Linked as const,
      model: linked
    }))
    const harnessed = harness({
      lookupModelOnCivitai: async () => ({ outcome: CivitaiOutcome.NotFound as const }),
      searchCivitai,
      linkModelToCivitai
    })
    const section = await openModel(harnessed)
    await fireEvent.click(within(section).getByRole('button', { name: 'Look up on Civitai' }))
    expect(await screen.findByRole('dialog', { name: 'Search Civitai' })).toBeTruthy()
    await waitFor(() =>
      expect(harnessed.services.library.notice).toContain('Search Civitai by name')
    )
    const dialog = screen.getByRole('dialog', { name: 'Search Civitai' })
    expect((within(dialog).getByLabelText('Search text') as HTMLInputElement).value).toBe('detail')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Search' }))
    expect(searchCivitai).toHaveBeenCalledWith({ kind: 'lora', text: 'detail', identity: 'detail' })
    const versions = await within(dialog).findByRole('list', { name: 'Civitai versions' })
    expect(within(versions).getByText('same file name')).toBeTruthy()
    expect(within(versions).getByText('NSFW')).toBeTruthy()
    await fireEvent.click(
      within(dialog).getByRole('button', { name: 'Link Detail Tweaker XL v1.0' })
    )
    expect(linkModelToCivitai).toHaveBeenCalledWith({ kind: 'lora', identity: 'detail' }, 5, 9)
    await within(section).findByText('Detail Tweaker XL')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search Civitai' })).toBeNull())
  })

  it('says when a search finds nothing', async () => {
    const section = await openModel(harness({ searchCivitai: async () => [] }))
    await fireEvent.click(within(section).getByRole('button', { name: 'Search Civitai…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Search Civitai' })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Search' }))
    await within(dialog).findByText(/Nothing found/)
  })

  it('reports Civitai being unreachable and stays unlinked', async () => {
    const harnessed = harness({
      lookupModelOnCivitai: async () => {
        throw new Error('Could not reach Civitai')
      }
    })
    const section = await openModel(harnessed)
    await fireEvent.click(within(section).getByRole('button', { name: 'Look up on Civitai' }))
    await waitFor(() =>
      expect(harnessed.services.library.notice).toBe(
        'Could not look the model up on Civitai: Could not reach Civitai'
      )
    )
    expect(within(section).getByRole('button', { name: 'Look up on Civitai' })).toBeTruthy()
    // The panel opens the search only after the lookup has settled, so let that finish first.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await tick()
    expect(screen.queryByRole('dialog', { name: 'Search Civitai' })).toBeNull()
  })

  it('keeps the dialog open and says so when the chosen version has gone from Civitai', async () => {
    const harnessed = harness({
      searchCivitai: async () => [candidate()],
      linkModelToCivitai: async () => ({ outcome: CivitaiOutcome.NotFound as const })
    })
    const section = await openModel(harnessed)
    await fireEvent.click(within(section).getByRole('button', { name: 'Search Civitai…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Search Civitai' })
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Search' }))
    await fireEvent.click(await within(dialog).findByRole('button', { name: /^Link/ }))
    await waitFor(() =>
      expect(harnessed.services.library.notice).toBe('Civitai no longer has that model version.')
    )
    expect(screen.getByRole('dialog', { name: 'Search Civitai' })).toBeTruthy()
  })
})

describe('a model linked to Civitai', () => {
  const linkedHarness = (overrides: Partial<GenfolioApi> = {}): TestServices =>
    harness({ getModel: async () => linked, ...overrides })

  it('opens its Civitai page', async () => {
    const openModelOnCivitai = vi.fn(async () => true)
    const section = await openModel(linkedHarness({ openModelOnCivitai }))
    await fireEvent.click(within(section).getByRole('button', { name: 'Open on Civitai' }))
    expect(openModelOnCivitai).toHaveBeenCalledWith({ kind: 'lora', identity: 'detail' })
  })

  it('refreshes from Civitai', async () => {
    const refreshModelFromCivitai = vi.fn(async () => ({
      outcome: CivitaiOutcome.Linked as const,
      model: { ...linked, civitai: { ...civitai, versionName: 'v1.1' } }
    }))
    const section = await openModel(linkedHarness({ refreshModelFromCivitai }))
    await fireEvent.click(within(section).getByRole('button', { name: 'Refresh' }))
    await within(section).findByText(/v1\.1/)
  })

  it('says so when Civitai has dropped the linked version', async () => {
    const harnessed = linkedHarness({
      refreshModelFromCivitai: async () => ({ outcome: CivitaiOutcome.NotFound as const })
    })
    const section = await openModel(harnessed)
    await fireEvent.click(within(section).getByRole('button', { name: 'Refresh' }))
    await waitFor(() =>
      expect(harnessed.services.library.notice).toBe(
        'Civitai no longer has the linked model version.'
      )
    )
  })

  it('unlinks and goes back to offering the lookup', async () => {
    let unlinkedNow = false
    const unlinkModelFromCivitai = vi.fn(async () => {
      unlinkedNow = true
      return true
    })
    const section = await openModel(
      harness({
        getModel: async () => (unlinkedNow ? unlinked : linked),
        unlinkModelFromCivitai
      })
    )
    await fireEvent.click(within(section).getByRole('button', { name: 'Unlink' }))
    expect(unlinkModelFromCivitai).toHaveBeenCalledWith({ kind: 'lora', identity: 'detail' })
    await within(section).findByRole('button', { name: 'Look up on Civitai' })
  })

  it('offers to change the link through the search', async () => {
    const section = await openModel(linkedHarness({ searchCivitai: async () => [candidate()] }))
    await fireEvent.click(within(section).getByRole('button', { name: 'Change…' }))
    expect(await screen.findByRole('dialog', { name: 'Search Civitai' })).toBeTruthy()
  })

  it("keeps the user's own info separate from what Civitai said", async () => {
    const section = await openModel(
      linkedHarness({
        getModel: async () => ({
          ...linked,
          baseModel: 'My base',
          triggerWords: ['mine', 'add detail'],
          custom: { ...EMPTY_MODEL_FIELDS, baseModel: 'My base', triggerWords: ['mine'] }
        })
      })
    )
    expect(within(section).getByText('SDXL 1.0', { exact: false })).toBeTruthy()
    const own = within(screen.getByRole('region', { name: 'Your info' }))
    expect(own.getByText('My base')).toBeTruthy()
    expect(own.getByRole('button', { name: 'Edit' })).toBeTruthy()
  })

  it('disables unlinking and changing while Civitai is being asked', async () => {
    let finish: (value: {
      outcome: typeof CivitaiOutcome.Linked
      model: ModelDetail
    }) => void = () => undefined
    const section = await openModel(
      linkedHarness({
        refreshModelFromCivitai: () => new Promise((resolve) => (finish = resolve))
      })
    )
    await fireEvent.click(within(section).getByRole('button', { name: 'Refresh' }))
    await waitFor(() =>
      expect(
        (within(section).getByRole('button', { name: 'Unlink' }) as HTMLButtonElement).disabled
      ).toBe(true)
    )
    expect(
      (within(section).getByRole('button', { name: 'Change…' }) as HTMLButtonElement).disabled
    ).toBe(true)
    finish({ outcome: CivitaiOutcome.Linked, model: linked })
    await waitFor(() =>
      expect(
        (within(section).getByRole('button', { name: 'Unlink' }) as HTMLButtonElement).disabled
      ).toBe(false)
    )
  })

  it('shows the model as it now is when it was unlinked while refreshing', async () => {
    let unlinkedNow = false
    const section = await openModel(
      harness({
        getModel: async () => (unlinkedNow ? unlinked : linked),
        refreshModelFromCivitai: async () => {
          unlinkedNow = true
          return { outcome: CivitaiOutcome.Unlinked as const }
        }
      })
    )
    await fireEvent.click(within(section).getByRole('button', { name: 'Refresh' }))
    await within(section).findByRole('button', { name: 'Look up on Civitai' })
  })
})

describe('a model added by hand', () => {
  it('is removed with its Civitai link after confirming, and says so', async () => {
    let removed = false
    const clearModel = vi.fn(async () => {
      removed = true
      return true
    })
    const byHand: ModelDetail = { ...linked, imageCount: 0, addedByHand: true }
    const harnessed = harness({
      listModels: async () => ({
        total: removed ? 0 : 1,
        items: removed ? [] : [entry],
        baseModels: []
      }),
      getModel: async () => (removed ? null : byHand),
      clearModel
    })
    render(ModelsView, { context: harnessed.context })
    await fireEvent.click(await screen.findByRole('button', { name: /detail/ }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Remove model' }))
    const dialog = await screen.findByRole('dialog', { name: 'Remove detail?' })
    expect(dialog.textContent).toContain('Civitai link')
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(clearModel).toHaveBeenCalledWith({ kind: 'lora', identity: 'detail' })
    )
    await screen.findByText(/Choose a model|No models/)
    expect(screen.queryByRole('article', { name: 'detail details' })).toBeNull()
  })

  it('offers Clear info, not Remove, for a model the library uses', async () => {
    const section = await openModel(
      harness({
        getModel: async () => ({ ...linked, custom: { ...EMPTY_MODEL_FIELDS, notes: 'x' } })
      })
    )
    expect(section).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear info' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove model' })).toBeNull()
  })
})

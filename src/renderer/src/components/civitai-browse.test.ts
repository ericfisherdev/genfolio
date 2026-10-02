import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { CivitaiBrowseItem, CivitaiBrowsePage } from '@shared/civitai-browse'
import { DownloadStatus, type DownloadSnapshot } from '@shared/downloads'
import type { GenfolioApi } from '@shared/genfolio-api'
import { ModelKind } from '@shared/generation-kinds'
import { RouteKind } from '../lib/routing/route'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import AppShell from './AppShell.svelte'
import CivitaiBrowseView from './CivitaiBrowseView.svelte'
import Sidebar from './Sidebar.svelte'

const item = (fields: Partial<CivitaiBrowseItem> = {}): CivitaiBrowseItem => ({
  modelId: 5,
  name: 'Detail Tweaker XL',
  creator: 'w4r10ck',
  nsfw: false,
  downloads: 455250,
  thumbsUp: 43677,
  tags: ['concept', 'detail'],
  versions: [
    {
      versionId: 9,
      name: 'v1.0',
      baseModel: 'SDXL 1.0',
      publishedAt: null,
      trainedWords: ['add detail'],
      fileName: 'add-detail-xl.safetensors',
      sizeKb: 223098
    },
    {
      versionId: 8,
      name: 'v0.3',
      baseModel: 'SD 1.5',
      publishedAt: null,
      trainedWords: [],
      fileName: 'add-detail-sd15.safetensors',
      sizeKb: 100000
    }
  ],
  ...fields
})

const page = (items: CivitaiBrowseItem[], nextCursor: string | null = null): CivitaiBrowsePage => ({
  items,
  nextCursor
})

const snapshot = (fields: Partial<DownloadSnapshot> = {}): DownloadSnapshot => ({
  id: 'd1',
  kind: ModelKind.Lora,
  modelId: 5,
  versionId: 9,
  status: DownloadStatus.Queued,
  modelName: null,
  versionName: null,
  fileName: null,
  folder: null,
  path: null,
  receivedBytes: 0,
  totalBytes: null,
  message: null,
  ...fields
})

interface Harness extends TestServices {
  push(snapshot: DownloadSnapshot): void
}

function harness(overrides: Partial<GenfolioApi> = {}): Harness {
  let listener: (snapshot: DownloadSnapshot) => void = () => undefined
  const harnessed = testServices(sampleLibrary(), {
    browseCivitai: async () => page([item()]),
    getModelFolders: async () => ({ checkpoint: '/models/ckpt', lora: '/models/loras' }),
    onDownloadEvent: (next) => {
      listener = next
      return () => undefined
    },
    ...overrides
  })
  return { ...harnessed, push: (next) => listener(next) }
}

async function openCard(h: Harness): Promise<HTMLElement> {
  render(CivitaiBrowseView, { context: h.context })
  return screen.findByRole('article', { name: 'Detail Tweaker XL' })
}

describe('CivitaiBrowseView', () => {
  it('lists the most downloaded LoRAs when opened', async () => {
    const browseCivitai = vi.fn(async () => page([item()]))
    const h = harness({ browseCivitai })
    const card = await openCard(h)
    expect(browseCivitai).toHaveBeenCalledWith({ kind: 'lora' })
    expect(within(card).getByText(/by w4r10ck · 455,250 downloads/)).toBeTruthy()
    expect(within(card).getByText(/Trigger words: add detail/)).toBeTruthy()
  })

  it('searches by name, type and base model', async () => {
    const browseCivitai = vi.fn(async () => page([item()]))
    const h = harness({ browseCivitai })
    await openCard(h)
    await fireEvent.input(screen.getByRole('searchbox', { name: 'Search by name' }), {
      target: { value: ' detail ' }
    })
    await fireEvent.input(screen.getByRole('combobox', { name: 'Base model' }), {
      target: { value: 'SDXL 1.0' }
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(browseCivitai).toHaveBeenLastCalledWith({
        kind: 'lora',
        text: 'detail',
        baseModel: 'SDXL 1.0'
      })
    )
    await fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), {
      target: { value: 'checkpoint' }
    })
    await waitFor(() =>
      expect(browseCivitai).toHaveBeenLastCalledWith({
        kind: 'checkpoint',
        text: 'detail',
        baseModel: 'SDXL 1.0'
      })
    )
  })

  it('suggests the common base models', async () => {
    const h = harness()
    await openCard(h)
    const options = [...document.querySelectorAll('#civitai-base-models option')].map(
      (option) => (option as HTMLOptionElement).value
    )
    expect(options).toEqual(expect.arrayContaining(['SDXL 1.0', 'SD 1.5', 'Pony', 'Illustrious']))
  })

  it('shows more results a page at a time', async () => {
    const browseCivitai = vi.fn(async (query: { cursor?: string | undefined }) =>
      query.cursor === '20' ? page([item({ modelId: 6, name: 'Second' })]) : page([item()], '20')
    )
    const h = harness({ browseCivitai })
    await openCard(h)
    await fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    await screen.findByRole('article', { name: 'Second' })
    expect(browseCivitai).toHaveBeenLastCalledWith({ kind: 'lora', cursor: '20' })
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('says so when nothing is found', async () => {
    const h = harness({ browseCivitai: async () => page([]) })
    render(CivitaiBrowseView, { context: h.context })
    await screen.findByText(/Nothing found/)
  })

  it('reports Civitai being unreachable', async () => {
    const h = harness({
      browseCivitai: async () => {
        throw new Error('Could not reach Civitai')
      }
    })
    render(CivitaiBrowseView, { context: h.context })
    await waitFor(() =>
      expect(h.services.library.notice).toBe('Could not search Civitai: Could not reach Civitai')
    )
    expect(screen.queryByText(/Nothing found/)).toBeNull()
  })

  it('keeps the newest search when an older one answers last', async () => {
    let answerFirst: (value: CivitaiBrowsePage) => void = () => undefined
    const browseCivitai = vi
      .fn()
      .mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)))
      .mockResolvedValueOnce(page([item({ name: 'Newest' })]))
    const h = harness({ browseCivitai })
    render(CivitaiBrowseView, { context: h.context })
    await vi.waitFor(() => expect(browseCivitai).toHaveBeenCalledTimes(1))
    // The button is disabled while searching; Enter in a field still submits.
    await fireEvent.submit(screen.getByRole('search', { name: 'Search Civitai' }))
    await screen.findByRole('article', { name: 'Newest' })
    answerFirst(page([item({ name: 'Stale' })]))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('article', { name: 'Stale' })).toBeNull()
  })
})

describe('a result card', () => {
  it('shows where the file will go, by the base model of the chosen version', async () => {
    const h = harness()
    const card = await openCard(h)
    await within(card).findByText('/models/loras/sdxl/add-detail-xl.safetensors')
    await fireEvent.change(within(card).getByRole('combobox', { name: 'Version' }), {
      target: { value: '8' }
    })
    await within(card).findByText('/models/loras/sd15/add-detail-sd15.safetensors')
    expect(within(card).getByRole('combobox', { name: 'Version' }).textContent).toContain('SD 1.5')
  })

  it('downloads the chosen version by ids alone', async () => {
    const startDownload = vi.fn(async () => snapshot())
    const h = harness({ startDownload })
    const card = await openCard(h)
    await fireEvent.change(within(card).getByRole('combobox', { name: 'Version' }), {
      target: { value: '8' }
    })
    await fireEvent.click(within(card).getByRole('button', { name: 'Download' }))
    expect(startDownload).toHaveBeenCalledWith({ kind: 'lora', modelId: 5, versionId: 8 })
  })

  it('asks for the folder in Settings when none is set, and opens Settings', async () => {
    const h = harness({ getModelFolders: async () => ({ checkpoint: null, lora: null }) })
    const card = await openCard(h)
    await within(card).findByText(/Choose the LoRAs download folder/)
    expect(
      (within(card).getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled
    ).toBe(true)
    await fireEvent.click(within(card).getByRole('button', { name: 'Open Settings' }))
    expect(h.services.router.route).toEqual({ kind: RouteKind.Settings })
  })

  it('follows the download from waiting to saved', async () => {
    const h = harness({ startDownload: async () => snapshot() })
    const card = await openCard(h)
    await fireEvent.click(within(card).getByRole('button', { name: 'Download' }))
    await within(card).findByRole('button', { name: 'Waiting…' })
    h.push(
      snapshot({
        status: DownloadStatus.Downloading,
        receivedBytes: 50,
        totalBytes: 100,
        fileName: 'add-detail-xl.safetensors'
      })
    )
    await within(card).findByRole('button', { name: 'Downloading…' })
    const panel = screen.getByRole('region', { name: 'Downloads' })
    expect(within(panel).getByText('50 B of 100 B')).toBeTruthy()
    expect(within(panel).getByRole('progressbar').getAttribute('value')).toBe('50')
    h.push(
      snapshot({
        status: DownloadStatus.Completed,
        fileName: 'add-detail-xl.safetensors',
        path: '/models/loras/sdxl/add-detail-xl.safetensors'
      })
    )
    await within(card).findByText('Downloaded')
    expect(within(card).getByRole('button', { name: 'Download' })).toBeTruthy()
    expect(
      within(panel).getByText(/Saved to \/models\/loras\/sdxl\/add-detail-xl\.safetensors/)
    ).toBeTruthy()
  })

  it('says why a download failed and offers to try again', async () => {
    const h = harness({ startDownload: async () => snapshot() })
    const card = await openCard(h)
    await fireEvent.click(within(card).getByRole('button', { name: 'Download' }))
    h.push(
      snapshot({ status: DownloadStatus.Failed, message: 'Civitai wants a login for this file.' })
    )
    await within(card).findByRole('button', { name: 'Try again' })
    expect(within(card).getByText('Civitai wants a login for this file.')).toBeTruthy()
  })

  it('says a file that was already there is', async () => {
    const h = harness({ startDownload: async () => snapshot() })
    const card = await openCard(h)
    await fireEvent.click(within(card).getByRole('button', { name: 'Download' }))
    h.push(
      snapshot({ status: DownloadStatus.AlreadyExists, path: '/models/loras/sdxl/x.safetensors' })
    )
    await within(card).findByText('Already in the folder')
  })

  it('marks an NSFW model', async () => {
    const h = harness({ browseCivitai: async () => page([item({ nsfw: true })]) })
    const card = await openCard(h)
    expect(within(card).getByText('NSFW')).toBeTruthy()
  })

  it('offers no download for a model with no version that has a file', async () => {
    const h = harness({
      browseCivitai: async () =>
        page([item({ versions: [{ ...item().versions[0]!, fileName: null, sizeKb: null }] })])
    })
    const card = await openCard(h)
    expect(within(card).queryByRole('button', { name: 'Download' })).toBeNull()
  })
})

describe('downloads', () => {
  it('cancels a running download and clears the finished ones', async () => {
    const cancelDownload = vi.fn(async () => true)
    const clearFinishedDownloads = vi.fn(async () => undefined)
    const h = harness({
      listDownloads: async () => [
        snapshot({
          id: 'a',
          status: DownloadStatus.Downloading,
          fileName: 'a.safetensors',
          totalBytes: 10
        }),
        snapshot({
          id: 'b',
          versionId: 10,
          status: DownloadStatus.Completed,
          fileName: 'b.safetensors',
          path: '/x/b.safetensors'
        })
      ],
      cancelDownload,
      clearFinishedDownloads
    })
    render(CivitaiBrowseView, { context: h.context })
    const panel = await screen.findByRole('region', { name: 'Downloads' })
    await fireEvent.click(
      await within(panel).findByRole('button', { name: 'Cancel a.safetensors' })
    )
    expect(cancelDownload).toHaveBeenCalledWith('a')
    expect(within(panel).queryByRole('button', { name: 'Cancel b.safetensors' })).toBeNull()
    await fireEvent.click(within(panel).getByRole('button', { name: 'Clear finished' }))
    expect(clearFinishedDownloads).toHaveBeenCalled()
    await waitFor(() => expect(within(panel).queryByText('b.safetensors')).toBeNull())
    expect(within(panel).getByText('a.safetensors')).toBeTruthy()
  })

  it('does not let an old state overwrite a download that has stopped', async () => {
    const h = harness({ startDownload: async () => snapshot() })
    render(CivitaiBrowseView, { context: h.context })
    await screen.findByRole('article', { name: 'Detail Tweaker XL' })
    h.push(snapshot({ status: DownloadStatus.Completed, fileName: 'x.safetensors', path: '/x' }))
    h.push(snapshot({ status: DownloadStatus.Downloading, fileName: 'x.safetensors' }))
    await screen.findByText(/Saved to \/x/)
    expect(h.services.downloads.items).toHaveLength(1)
    expect(h.services.downloads.items[0]?.status).toBe(DownloadStatus.Completed)
  })

  it('reports a download that could not be started', async () => {
    const h = harness({
      startDownload: async () => {
        throw new Error('service down')
      }
    })
    const card = await openCard(h)
    await fireEvent.click(within(card).getByRole('button', { name: 'Download' }))
    await waitFor(() =>
      expect(h.services.library.notice).toBe('Could not start the download: service down')
    )
  })
})

describe('Get models navigation', () => {
  it('opens from the sidebar and replaces the gallery', async () => {
    const h = harness()
    await h.services.library.refresh()
    render(AppShell, { context: h.context })
    await fireEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Get models' })
    )
    expect(h.services.router.route).toEqual({ kind: RouteKind.Civitai })
    expect(h.hash.current).toBe('#/civitai')
    expect(await screen.findByRole('heading', { name: 'Get models' })).toBeTruthy()
    expect(screen.queryByRole('search', { name: 'Filter images' })).toBeNull()
  })

  it('marks the sidebar entry current', () => {
    const h = harness()
    h.services.router.navigate({ kind: RouteKind.Civitai })
    render(Sidebar, { context: h.context })
    expect(screen.getByRole('button', { name: 'Get models' }).getAttribute('aria-current')).toBe(
      'page'
    )
  })
})

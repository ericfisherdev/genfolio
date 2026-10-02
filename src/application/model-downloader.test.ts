import { describe, expect, it, vi } from 'vitest'
import { CivitaiUnavailableError } from '@domain/civitai'
import {
  DownloadError,
  type DownloadBody,
  type DownloadFiles,
  type PartialFile
} from '@domain/downloads'
import type { DownloadPlan } from '@shared/civitai-browse'
import { DownloadStatus, type DownloadSnapshot } from '@shared/downloads'
import { ModelKind } from '@shared/generation-kinds'
import type { ModelFolders } from '@shared/model-folders'
import { ModelDownloader } from './model-downloader'

const SHA = 'a'.repeat(64)
const plan = (fields: Partial<DownloadPlan> = {}): DownloadPlan => ({
  fileName: 'add-detail-xl.safetensors',
  sizeKb: 1,
  sha256: SHA,
  downloadUrl: 'https://civitai.com/api/download/models/9',
  baseModel: 'SDXL 1.0',
  modelName: 'Detail Tweaker XL',
  versionName: 'v1.0',
  ...fields
})

/** An in-memory file system: a folder is any key, a file is `path → bytes`. */
class MemoryFiles implements DownloadFiles {
  readonly files = new Map<string, Uint8Array>()
  readonly folders = new Set<string>()
  readonly discarded: string[] = []
  readonly removedFolders: string[] = []
  digest = SHA
  failPublish = false

  async resolveFolder(root: string, name: string): Promise<string> {
    const existing = [...this.folders].find(
      (folder) =>
        folder.startsWith(`${root}/`) && folder.slice(root.length + 1).toLowerCase() === name
    )
    return existing ?? `${root}/${name}`
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.folders.has(path)
  }

  async ensureFolder(path: string): Promise<void> {
    this.folders.add(path)
  }

  async removeEmptyFolder(path: string): Promise<void> {
    const empty = ![...this.files.keys()].some((file) => file.startsWith(`${path}/`))
    if (empty) {
      this.folders.delete(path)
      this.removedFolders.push(path)
    }
  }

  async begin(path: string): Promise<PartialFile> {
    let written = 0
    const parts: Uint8Array[] = []
    return {
      write: async (chunk) => {
        parts.push(chunk)
        written += chunk.length
      },
      finish: async () => ({ bytes: written, sha256: this.digest }),
      publish: async () => {
        if (this.failPublish) throw new DownloadError('exists now')
        this.files.set(path, new Uint8Array(written))
      },
      discard: async () => {
        this.discarded.push(path)
      }
    }
  }
}

const body = (chunks: Uint8Array[], totalBytes: number | null = null): DownloadBody => ({
  totalBytes,
  chunks: (async function* () {
    for (const chunk of chunks) yield chunk
  })()
})

interface Setup {
  downloader: ModelDownloader
  files: MemoryFiles
  events: DownloadSnapshot[]
  record: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
  planner: ReturnType<typeof vi.fn>
  logError: ReturnType<typeof vi.fn>
}

function setup(
  options: {
    folders?: Partial<ModelFolders>
    planner?: () => Promise<DownloadPlan | null>
    open?: (url: string, signal: AbortSignal) => Promise<DownloadBody>
    record?: () => Promise<void>
    maxConcurrent?: number
  } = {}
): Setup {
  const files = new MemoryFiles()
  const events: DownloadSnapshot[] = []
  const planner = vi.fn(options.planner ?? (async () => plan()))
  const open = vi.fn(
    options.open ?? (async () => body([new Uint8Array(10), new Uint8Array(5)], 15))
  )
  const record = vi.fn(options.record ?? (async () => undefined))
  const logError = vi.fn()
  let counter = 0
  const downloader = new ModelDownloader({
    planner: { plan: planner },
    folders: {
      folders: async () => ({
        checkpoint: '/models/ckpt',
        lora: '/models/loras',
        ...options.folders
      })
    },
    files,
    source: { open },
    recorder: { record },
    publish: (snapshot) => events.push(snapshot),
    newId: () => `d${++counter}`,
    now: () => 0,
    logError,
    ...(options.maxConcurrent === undefined ? {} : { maxConcurrent: options.maxConcurrent })
  })
  return { downloader, files, events, record, open, planner, logError }
}

const request = { kind: ModelKind.Lora, modelId: 5, versionId: 9 }

/** Waits until the download has stopped. */
async function settled(s: Setup, id = 'd1'): Promise<DownloadSnapshot> {
  await vi.waitFor(() => {
    const status = s.downloader.list().find((snapshot) => snapshot.id === id)?.status
    expect(status).not.toMatch(/queued|downloading/)
  })
  return s.downloader.list().find((snapshot) => snapshot.id === id) as DownloadSnapshot
}

describe('ModelDownloader', () => {
  it('saves a LoRA in a subfolder named for its base model, and notes the model', async () => {
    const s = setup()
    const queued = s.downloader.start(request)
    expect(queued).toMatchObject({ id: 'd1', status: DownloadStatus.Queued })
    const done = await settled(s)
    expect(done).toMatchObject({
      status: DownloadStatus.Completed,
      path: '/models/loras/sdxl/add-detail-xl.safetensors',
      folder: 'sdxl',
      fileName: 'add-detail-xl.safetensors',
      modelName: 'Detail Tweaker XL',
      receivedBytes: 15,
      totalBytes: 15,
      message: null
    })
    expect(s.files.files.has('/models/loras/sdxl/add-detail-xl.safetensors')).toBe(true)
    expect(s.record).toHaveBeenCalledWith(ModelKind.Lora, 'add-detail-xl.safetensors', 5, 9)
    expect(s.open).toHaveBeenCalledWith(
      'https://civitai.com/api/download/models/9',
      expect.any(AbortSignal)
    )
  })

  it('uses the folder of the kind', async () => {
    const s = setup({ planner: async () => plan({ baseModel: 'Pony' }) })
    s.downloader.start({ kind: ModelKind.Checkpoint, modelId: 5, versionId: 9 })
    expect((await settled(s)).path).toBe('/models/ckpt/pony/add-detail-xl.safetensors')
  })

  it('reuses an existing base model folder spelled differently', async () => {
    const s = setup()
    s.files.folders.add('/models/loras/SDXL')
    s.downloader.start(request)
    expect((await settled(s)).path).toBe('/models/loras/SDXL/add-detail-xl.safetensors')
  })

  it('says to choose the folder in Settings when there is none, fetching nothing', async () => {
    const s = setup({ folders: { lora: null } })
    s.downloader.start(request)
    const done = await settled(s)
    expect(done).toMatchObject({ status: DownloadStatus.Failed })
    expect(done.message).toBe('Choose the LoRAs download folder in Settings first.')
    expect(s.open).not.toHaveBeenCalled()
  })

  it('never overwrites a file that is there, and still notes the model', async () => {
    const s = setup()
    s.files.files.set('/models/loras/sdxl/add-detail-xl.safetensors', new Uint8Array(3))
    s.downloader.start(request)
    const done = await settled(s)
    expect(done).toMatchObject({
      status: DownloadStatus.AlreadyExists,
      path: '/models/loras/sdxl/add-detail-xl.safetensors',
      message: 'Already in the folder.'
    })
    expect(s.open).not.toHaveBeenCalled()
    expect(s.files.files.get('/models/loras/sdxl/add-detail-xl.safetensors')).toHaveLength(3)
    expect(s.record).toHaveBeenCalled()
  })

  it('removes a file whose checksum is not the one Civitai gave', async () => {
    const s = setup()
    s.files.digest = 'b'.repeat(64)
    s.downloader.start(request)
    const done = await settled(s)
    expect(done.status).toBe(DownloadStatus.Failed)
    expect(done.message).toMatch(/checksum/)
    expect(s.files.discarded).toEqual(['/models/loras/sdxl/add-detail-xl.safetensors'])
    expect(s.files.files.size).toBe(0)
    expect(s.record).not.toHaveBeenCalled()
  })

  it('accepts any checksum when Civitai gave none', async () => {
    const s = setup({ planner: async () => plan({ sha256: null }) })
    s.files.digest = 'b'.repeat(64)
    s.downloader.start(request)
    expect((await settled(s)).status).toBe(DownloadStatus.Completed)
  })

  it('removes a file that ended before the announced size', async () => {
    const s = setup({ open: async () => body([new Uint8Array(10)], 15) })
    s.downloader.start(request)
    const done = await settled(s)
    expect(done.status).toBe(DownloadStatus.Failed)
    expect(done.message).toMatch(/ended early/)
    expect(s.files.discarded).toHaveLength(1)
  })

  it('tells the user why a download was refused, and discards what it had', async () => {
    const s = setup({
      open: async () => {
        throw new DownloadError('This model needs a Civitai API key.')
      }
    })
    s.downloader.start(request)
    const done = await settled(s)
    expect(done).toMatchObject({
      status: DownloadStatus.Failed,
      message: 'This model needs a Civitai API key.'
    })
    expect(s.files.discarded).toHaveLength(1)
  })

  it('passes on Civitai being unreachable, and says nothing of an unexpected failure', async () => {
    const unreachable = setup({
      planner: async () => {
        throw new CivitaiUnavailableError('Could not reach Civitai')
      }
    })
    unreachable.downloader.start(request)
    expect((await settled(unreachable)).message).toBe('Could not reach Civitai')

    const odd = setup({
      open: async () => {
        throw new TypeError('ECONNRESET 10.0.0.1:443 /secret/path')
      }
    })
    odd.downloader.start(request)
    const done = await settled(odd)
    expect(done.message).toBe('The download failed unexpectedly.')
    expect(odd.logError).toHaveBeenCalledWith('download failed: TypeError')
  })

  it('takes away the folder it made when the download fails, but not one that was there', async () => {
    const refused = async (): Promise<DownloadBody> => {
      throw new DownloadError('This model needs a Civitai API key.')
    }
    const made = setup({ open: refused })
    made.downloader.start(request)
    await settled(made)
    expect(made.files.removedFolders).toEqual(['/models/loras/sdxl'])
    expect(made.files.folders.has('/models/loras/sdxl')).toBe(false)

    const there = setup({ open: refused })
    there.files.folders.add('/models/loras/sdxl')
    there.downloader.start(request)
    await settled(there)
    expect(there.files.removedFolders).toEqual([])
    expect(there.files.folders.has('/models/loras/sdxl')).toBe(true)
  })

  it('takes away the folder it made when the download is cancelled', async () => {
    const s = setup({
      open: async (_url, signal) => ({
        totalBytes: 100,
        chunks: (async function* () {
          yield new Uint8Array(1)
          await new Promise((resolve) => signal.addEventListener('abort', resolve))
          yield new Uint8Array(1)
        })()
      })
    })
    s.downloader.start(request)
    await vi.waitFor(() => expect(s.open).toHaveBeenCalled())
    s.downloader.cancel('d1')
    await settled(s)
    expect(s.files.removedFolders).toEqual(['/models/loras/sdxl'])
  })

  it('keeps the folder of a download that finished', async () => {
    const s = setup()
    s.downloader.start(request)
    await settled(s)
    expect(s.files.removedFolders).toEqual([])
  })

  it('fails when Civitai has no file for the version', async () => {
    const s = setup({ planner: async () => null })
    s.downloader.start(request)
    expect((await settled(s)).message).toBe('Civitai has no model file for this version.')
  })

  it('keeps a finished download even when noting the model fails', async () => {
    const s = setup({
      record: async () => {
        throw new Error('db down')
      }
    })
    s.downloader.start(request)
    const done = await settled(s)
    expect(done.status).toBe(DownloadStatus.Completed)
    expect(done.message).toBe('Downloaded. It could not be added to Models.')
    expect(s.files.files.size).toBe(1)
    expect(s.logError).toHaveBeenCalledWith('could not record a finished download: Error')
  })

  it('does not queue the same version twice while it is active', async () => {
    const s = setup()
    const first = s.downloader.start(request)
    expect(s.downloader.start(request).id).toBe(first.id)
    await settled(s)
    expect(s.downloader.start(request).id).not.toBe(first.id)
  })

  it('runs two at a time and starts the next when one ends', async () => {
    const gates: (() => void)[] = []
    let named = 0
    const s = setup({
      // Each version is a different file, or the later ones would find the first already there.
      planner: async () => plan({ fileName: `file-${++named}.safetensors` }),
      open: () =>
        new Promise<DownloadBody>((resolve) => {
          gates.push(() => resolve(body([new Uint8Array(1)], 1)))
        })
    })
    for (const versionId of [1, 2, 3]) s.downloader.start({ ...request, versionId })
    await vi.waitFor(() => expect(gates).toHaveLength(2))
    expect(s.downloader.list().map((snapshot) => snapshot.status)).toEqual([
      DownloadStatus.Downloading,
      DownloadStatus.Downloading,
      DownloadStatus.Queued
    ])
    gates[0]?.()
    await vi.waitFor(() => expect(gates).toHaveLength(3))
    gates[1]?.()
    gates[2]?.()
    await settled(s, 'd3')
    expect(
      s.downloader.list().every((snapshot) => snapshot.status === DownloadStatus.Completed)
    ).toBe(true)
  })

  it('cancels a download in progress and removes its partial file', async () => {
    let seenSignal: AbortSignal | undefined
    const s = setup({
      open: async (_url, signal) => {
        seenSignal = signal
        return {
          totalBytes: 100,
          chunks: (async function* () {
            yield new Uint8Array(1)
            await new Promise((resolve) => signal.addEventListener('abort', resolve))
            yield new Uint8Array(1)
          })()
        }
      }
    })
    s.downloader.start(request)
    await vi.waitFor(() => expect(seenSignal).toBeDefined())
    expect(s.downloader.cancel('d1')).toBe(true)
    const done = await settled(s)
    expect(done.status).toBe(DownloadStatus.Cancelled)
    expect(s.files.discarded).toHaveLength(1)
    expect(s.files.files.size).toBe(0)
    expect(s.downloader.cancel('d1')).toBe(false)
  })

  it('cancels a queued download without ever starting it', async () => {
    const s = setup({ maxConcurrent: 1, open: () => new Promise<DownloadBody>(() => undefined) })
    s.downloader.start(request)
    s.downloader.start({ ...request, versionId: 2 })
    await vi.waitFor(() => expect(s.open).toHaveBeenCalledTimes(1))
    expect(s.downloader.cancel('d2')).toBe(true)
    expect(s.downloader.list()[1]?.status).toBe(DownloadStatus.Cancelled)
    expect(s.planner).toHaveBeenCalledTimes(1)
  })

  it('refuses a plan whose file name would leave the folder', async () => {
    const s = setup({ planner: async () => plan({ fileName: '../../evil.safetensors' }) })
    s.downloader.start(request)
    const done = await settled(s)
    expect(done.status).toBe(DownloadStatus.Failed)
    expect(done.message).toMatch(/outside the download folder/)
    expect(s.open).not.toHaveBeenCalled()
  })

  it('forgets finished downloads and keeps the running ones', async () => {
    const s = setup({ maxConcurrent: 1, open: () => new Promise<DownloadBody>(() => undefined) })
    s.downloader.start(request)
    s.downloader.start({ ...request, versionId: 2 })
    await vi.waitFor(() => expect(s.open).toHaveBeenCalledTimes(1))
    s.downloader.cancel('d2')
    s.downloader.clearFinished()
    expect(s.downloader.list().map((snapshot) => snapshot.id)).toEqual(['d1'])
  })

  it('publishes each change, with progress at most as often as the throttle allows', async () => {
    const s = setup()
    s.downloader.start(request)
    await settled(s)
    const statuses = s.events.map((event) => event.status)
    expect(statuses[0]).toBe(DownloadStatus.Queued)
    expect(statuses.at(-1)).toBe(DownloadStatus.Completed)
    expect(statuses).toContain(DownloadStatus.Downloading)
  })
})

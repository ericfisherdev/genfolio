import { basename, join } from 'node:path'
import { CivitaiUnavailableError } from '@domain/civitai'
import {
  DownloadError,
  type DownloadFiles,
  type DownloadPlanner,
  type DownloadRecorder,
  type DownloadSource,
  type ModelFolderProvider
} from '@domain/downloads'
import { baseModelFolder } from '@shared/base-model-folder'
import {
  DownloadStatus,
  isFinished,
  type DownloadRequest,
  type DownloadSnapshot
} from '@shared/downloads'
import { ModelKind } from '@shared/generation-kinds'
import { isInside } from './path-containment'
import { ProgressThrottle } from './progress-throttle'

export interface ModelDownloaderDeps {
  readonly planner: DownloadPlanner
  readonly folders: ModelFolderProvider
  readonly files: DownloadFiles
  readonly source: DownloadSource
  readonly recorder: DownloadRecorder
  /** Called with a snapshot whenever a download changes. */
  readonly publish: (snapshot: DownloadSnapshot) => void
  readonly newId: () => string
  readonly now: () => number
  /** Records an unexpected failure; the user is only told it failed. */
  readonly logError: (message: string) => void
  /** Downloads running at once; the rest wait their turn. */
  readonly maxConcurrent?: number
  readonly progressIntervalMs?: number
}

const KIND_LABEL: Readonly<Record<ModelKind, string>> = {
  [ModelKind.Checkpoint]: 'checkpoints',
  [ModelKind.Lora]: 'LoRAs'
}

interface Job {
  snapshot: DownloadSnapshot
  /** A folder this download made, which a failed download takes away again if it is still empty. */
  createdFolder?: string
  readonly controller: AbortController
  readonly progress: ProgressThrottle<DownloadSnapshot>
}

/**
 * Downloads Civitai model files into the folder chosen for their kind, in a subfolder named for
 * the base model. A file is written beside its name and only renamed into place once the size
 * and checksum Civitai gave have checked out; one already there is never overwritten.
 */
export class ModelDownloader {
  private readonly jobs = new Map<string, Job>()
  private readonly queue: string[] = []
  /** Files a running download is writing, compared ignoring case (some disks do). */
  private readonly targets = new Set<string>()
  private running = 0

  constructor(private readonly deps: ModelDownloaderDeps) {}

  /**
   * Queues the download and returns how it stands; the version already being downloaded is not
   * queued twice.
   */
  start(request: DownloadRequest): DownloadSnapshot {
    const active = [...this.jobs.values()].find(
      ({ snapshot }) =>
        !isFinished(snapshot.status) &&
        snapshot.kind === request.kind &&
        snapshot.modelId === request.modelId &&
        snapshot.versionId === request.versionId
    )
    if (active) return active.snapshot
    const snapshot: DownloadSnapshot = {
      id: this.deps.newId(),
      ...request,
      status: DownloadStatus.Queued,
      modelName: null,
      versionName: null,
      fileName: null,
      folder: null,
      path: null,
      receivedBytes: 0,
      totalBytes: null,
      message: null
    }
    const job: Job = {
      snapshot,
      controller: new AbortController(),
      progress: new ProgressThrottle(
        this.deps.publish,
        this.deps.progressIntervalMs ?? 250,
        this.deps.now
      )
    }
    this.jobs.set(snapshot.id, job)
    this.queue.push(snapshot.id)
    this.deps.publish(snapshot)
    this.pump()
    return snapshot
  }

  /** Stops a queued or running download; false when there is none such (or it has finished). */
  cancel(id: string): boolean {
    const job = this.jobs.get(id)
    if (!job || isFinished(job.snapshot.status)) return false
    job.controller.abort()
    const queued = this.queue.indexOf(id)
    if (queued >= 0) {
      this.queue.splice(queued, 1)
      this.update(job, { status: DownloadStatus.Cancelled })
    }
    return true
  }

  list(): DownloadSnapshot[] {
    return [...this.jobs.values()].map(({ snapshot }) => snapshot)
  }

  /** Forgets the downloads that have stopped; the files stay. */
  clearFinished(): void {
    for (const [id, { snapshot }] of this.jobs) {
      if (isFinished(snapshot.status)) this.jobs.delete(id)
    }
  }

  private pump(): void {
    const limit = this.deps.maxConcurrent ?? 2
    while (this.running < limit) {
      const job = this.jobs.get(this.queue.shift() ?? '')
      if (!job) return
      this.running++
      void this.run(job).finally(() => {
        this.running--
        this.pump()
      })
    }
  }

  private async run(job: Job): Promise<void> {
    const { signal } = job.controller
    this.update(job, { status: DownloadStatus.Downloading })
    try {
      const plan = await this.deps.planner.plan(job.snapshot.modelId, job.snapshot.versionId)
      signal.throwIfAborted()
      if (!plan) throw new DownloadError('Civitai has no model file for this version.')
      const root = (await this.deps.folders.folders())[job.snapshot.kind]
      if (!root) {
        throw new DownloadError(
          `Choose the ${KIND_LABEL[job.snapshot.kind]} download folder in Settings first.`
        )
      }
      const folder = await this.deps.files.resolveFolder(root, baseModelFolder(plan.baseModel))
      const target = join(folder, plan.fileName)
      if (!isInside(target, root))
        throw new DownloadError('That file would land outside the download folder.')
      this.update(job, {
        modelName: plan.modelName,
        versionName: plan.versionName,
        fileName: plan.fileName,
        folder: basename(folder),
        totalBytes: plan.sizeKb === null ? null : Math.round(plan.sizeKb * 1024)
      })
      await this.save(job, plan.downloadUrl, plan.sha256, folder, target)
    } catch (error) {
      await this.fail(job, error)
    }
  }

  /**
   * Puts the file in place, holding its name for as long as it is written: two versions can
   * share a file name, and writing the same temporary file would mix them.
   */
  private async save(
    job: Job,
    url: string,
    sha256: string | null,
    folder: string,
    target: string
  ): Promise<void> {
    const claim = target.toLowerCase()
    if (this.targets.has(claim)) {
      throw new DownloadError('Another download is writing a file with this name.')
    }
    this.targets.add(claim)
    try {
      if (await this.deps.files.exists(target)) {
        await this.finishWith(job, DownloadStatus.AlreadyExists, target, 'Already in the folder.')
        return
      }
      if (!(await this.deps.files.exists(folder))) job.createdFolder = folder
      await this.deps.files.ensureFolder(folder)
      await this.fetchInto(job, url, sha256, target)
      await this.finishWith(job, DownloadStatus.Completed, target, null)
    } finally {
      this.targets.delete(claim)
    }
  }

  private async fetchInto(
    job: Job,
    url: string,
    sha256: string | null,
    target: string
  ): Promise<void> {
    const { signal } = job.controller
    const partial = await this.deps.files.begin(target)
    try {
      const body = await this.deps.source.open(url, signal)
      this.update(job, { totalBytes: body.totalBytes ?? job.snapshot.totalBytes })
      let received = 0
      for await (const chunk of body.chunks) {
        signal.throwIfAborted()
        await partial.write(chunk)
        received += chunk.length
        job.snapshot = { ...job.snapshot, receivedBytes: received }
        job.progress.report(job.snapshot)
      }
      const done = await partial.finish()
      if (body.totalBytes !== null && done.bytes !== body.totalBytes) {
        throw new DownloadError('The download ended early, so the file was removed.')
      }
      if (sha256 !== null && done.sha256 !== sha256) {
        throw new DownloadError("The file does not match Civitai's checksum, so it was removed.")
      }
      await partial.publish()
      job.snapshot = { ...job.snapshot, receivedBytes: done.bytes, totalBytes: done.bytes }
    } catch (error) {
      await partial.discard()
      throw error
    }
  }

  /** Ends the download where the file is, and notes the model; noting it can't undo the download. */
  private async finishWith(
    job: Job,
    status: DownloadStatus,
    path: string,
    message: string | null
  ): Promise<void> {
    let note = message
    try {
      await this.deps.recorder.record(
        job.snapshot.kind,
        job.snapshot.fileName ?? basename(path),
        job.snapshot.modelId,
        job.snapshot.versionId
      )
    } catch (error) {
      this.deps.logError(`could not record a finished download: ${describe(error)}`)
      note = `${message ?? 'Downloaded.'} It could not be added to Models.`.trim()
    }
    this.update(job, { status, path, message: note })
  }

  private async fail(job: Job, error: unknown): Promise<void> {
    await this.removeCreatedFolder(job)
    if (job.controller.signal.aborted) {
      this.update(job, { status: DownloadStatus.Cancelled })
      return
    }
    const known = error instanceof DownloadError || error instanceof CivitaiUnavailableError
    if (!known) this.deps.logError(`download failed: ${describe(error)}`)
    this.update(job, {
      status: DownloadStatus.Failed,
      message: known ? error.message : 'The download failed unexpectedly.'
    })
  }

  private async removeCreatedFolder(job: Job): Promise<void> {
    if (!job.createdFolder) return
    try {
      await this.deps.files.removeEmptyFolder(job.createdFolder)
    } catch (error) {
      this.deps.logError(`could not remove an empty download folder: ${describe(error)}`)
    }
  }

  private update(job: Job, changes: Partial<DownloadSnapshot>): void {
    job.snapshot = { ...job.snapshot, ...changes }
    job.progress.report(job.snapshot, true)
  }
}

/** The error's name only: messages can carry paths and addresses. */
const describe = (error: unknown): string => (error instanceof Error ? error.name : typeof error)

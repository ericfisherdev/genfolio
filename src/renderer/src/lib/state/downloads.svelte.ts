import { isFinished, type DownloadRequest, type DownloadSnapshot } from '@shared/downloads'
import type { GenfolioApi } from '@shared/genfolio-api'
import { userMessage } from '../format/user-message'
import type { NoticeSink } from './notice-sink'

type DownloadsApi = Pick<
  GenfolioApi,
  | 'listDownloads'
  | 'startDownload'
  | 'cancelDownload'
  | 'clearFinishedDownloads'
  | 'onDownloadEvent'
>

const sameVersion = (snapshot: DownloadSnapshot, request: DownloadRequest): boolean =>
  snapshot.kind === request.kind &&
  snapshot.modelId === request.modelId &&
  snapshot.versionId === request.versionId

/**
 * Model downloads and how far they have got. Main pushes a snapshot whenever one changes, so
 * this only keeps the latest of each. Reports failures to start or cancel in the notice bar;
 * never rejects.
 */
export class DownloadsState {
  items: readonly DownloadSnapshot[] = $state.raw([])
  private readonly unsubscribe: () => void

  constructor(
    private readonly api: DownloadsApi,
    private readonly notices: NoticeSink
  ) {
    this.unsubscribe = api.onDownloadEvent((snapshot) => this.upsert(snapshot))
  }

  /** Downloads still waiting or running. */
  get active(): readonly DownloadSnapshot[] {
    return this.items.filter((snapshot) => !isFinished(snapshot.status))
  }

  /** The latest download of this version, if there has been one. */
  latest(request: DownloadRequest): DownloadSnapshot | undefined {
    return this.items.findLast((snapshot) => sameVersion(snapshot, request))
  }

  /** Whether the version is waiting or downloading now. */
  isActive(request: DownloadRequest): boolean {
    const latest = this.latest(request)
    return latest !== undefined && !isFinished(latest.status)
  }

  async load(): Promise<void> {
    await this.attempt('load the downloads', async () => {
      const listed = await this.api.listDownloads()
      // A snapshot pushed while the list was on its way is newer than the list's copy.
      this.items = listed.map(
        (snapshot) => this.items.find((pushed) => pushed.id === snapshot.id) ?? snapshot
      )
    })
  }

  async start(request: DownloadRequest): Promise<void> {
    await this.attempt('start the download', async () => {
      this.upsert(await this.api.startDownload(request))
    })
  }

  async cancel(id: string): Promise<void> {
    await this.attempt('cancel the download', async () => {
      await this.api.cancelDownload(id)
    })
  }

  async clearFinished(): Promise<void> {
    await this.attempt('clear the downloads', async () => {
      await this.api.clearFinishedDownloads()
      this.items = this.items.filter((snapshot) => !isFinished(snapshot.status))
    })
  }

  dispose(): void {
    this.unsubscribe()
  }

  /** Replaces the snapshot with the same id, or adds it; a stopped one is never overwritten by an older state. */
  private upsert(snapshot: DownloadSnapshot): void {
    const at = this.items.findIndex((item) => item.id === snapshot.id)
    if (at < 0) {
      this.items = [...this.items, snapshot]
      return
    }
    const current = this.items[at]
    if (current && isFinished(current.status) && !isFinished(snapshot.status)) return
    this.items = this.items.map((item, index) => (index === at ? snapshot : item))
  }

  private async attempt(description: string, work: () => Promise<void>): Promise<void> {
    try {
      await work()
    } catch (error) {
      this.notices.notify(`Could not ${description}: ${userMessage(error)}`)
    }
  }
}

import type { GenfolioApi } from '@shared/genfolio-api'
import type { DirectoryNode } from '@shared/gallery'
import type { AddRootViaDialogResult, RootSummary } from '@shared/library'
import { AddRootOutcome } from '@shared/library-kinds'
import { addRootMessage } from '../format/add-root-message'
import { userMessage as messageOf } from '../format/user-message'

/**
 * Library roots and their folder trees, refreshed from the service on demand. No method
 * rejects: service failures become `loadError` (loading) or `notice` (actions).
 */
export class LibraryState {
  roots: readonly RootSummary[] = $state([])
  trees: Readonly<Record<number, DirectoryNode | null>> = $state({})
  /** Last user-facing message from an action, e.g. "already in the library". */
  notice: string | undefined = $state(undefined)
  /** Why the last refresh failed; cleared by the next successful one. */
  loadError: string | undefined = $state(undefined)
  loaded = $state(false)

  readonly totalImages = $derived(this.roots.reduce((sum, root) => sum + root.imageCount, 0))
  private generation = 0

  constructor(private readonly api: GenfolioApi) {}

  /** Loads roots and trees; a refresh that finishes after a newer one is ignored. */
  async refresh(): Promise<void> {
    const generation = ++this.generation
    try {
      const roots = await this.api.listRoots()
      const trees = await Promise.all(roots.map((root) => this.api.getDirectoryTree(root.id)))
      if (generation !== this.generation) return
      this.roots = roots
      this.trees = Object.fromEntries(roots.map((root, index) => [root.id, trees[index] ?? null]))
      this.loaded = true
      this.loadError = undefined
    } catch (error) {
      if (generation !== this.generation) return
      this.loadError = messageOf(error)
      // Once loaded, the view keeps showing the library; say the refresh failed instead.
      if (this.loaded) this.notice = `Could not refresh the library: ${this.loadError}`
    }
  }

  async addFolder(): Promise<AddRootViaDialogResult | undefined> {
    let result: AddRootViaDialogResult
    try {
      result = await this.api.addRootViaDialog()
    } catch (error) {
      this.notice = `Could not add the folder: ${messageOf(error)}`
      return undefined
    }
    this.notice = addRootMessage(result)
    if (result.outcome === AddRootOutcome.Added) await this.refresh()
    return result
  }

  async remove(rootId: number): Promise<void> {
    await this.act('remove the folder', () => this.api.removeRoot(rootId))
  }

  async rescan(rootId: number): Promise<void> {
    await this.act('rescan the folder', () => this.api.rescanRoot(rootId))
  }

  /**
   * Runs a file action (show in folder, copy path) and reports failure as a notice: `false`
   * means the file is no longer where the library recorded it.
   */
  async fileAction(description: string, action: () => Promise<boolean>): Promise<void> {
    try {
      if (!(await action())) this.notice = `Could not ${description}: the file is no longer there.`
    } catch (error) {
      this.notice = `Could not ${description}: ${messageOf(error)}`
    }
  }

  dismissNotice(): void {
    this.notice = undefined
  }

  private async act(description: string, action: () => Promise<unknown>): Promise<void> {
    try {
      await action()
    } catch (error) {
      this.notice = `Could not ${description}: ${messageOf(error)}`
      return
    }
    await this.refresh()
  }
}

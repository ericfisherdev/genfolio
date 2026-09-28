import type { GenfolioApi } from '@shared/genfolio-api'
import type { DirectoryNode } from '@shared/gallery'
import type { AddRootViaDialogResult, RootSummary } from '@shared/library'
import { AddRootOutcome } from '@shared/library-kinds'
import { addRootMessage } from '../format/add-root-message'

/** Library roots and their folder trees, refreshed from the service on demand. */
export class LibraryState {
  roots: readonly RootSummary[] = $state([])
  trees: Readonly<Record<number, DirectoryNode | null>> = $state({})
  /** Last user-facing message from an add, e.g. "already in the library". */
  notice: string | undefined = $state(undefined)
  loaded = $state(false)

  readonly totalImages = $derived(this.roots.reduce((sum, root) => sum + root.imageCount, 0))

  constructor(private readonly api: GenfolioApi) {}

  async refresh(): Promise<void> {
    const roots = await this.api.listRoots()
    const trees = await Promise.all(roots.map((root) => this.api.getDirectoryTree(root.id)))
    this.roots = roots
    this.trees = Object.fromEntries(roots.map((root, index) => [root.id, trees[index] ?? null]))
    this.loaded = true
  }

  async addFolder(): Promise<AddRootViaDialogResult> {
    const result = await this.api.addRootViaDialog()
    this.notice = addRootMessage(result)
    if (result.outcome === AddRootOutcome.Added) await this.refresh()
    return result
  }

  async remove(rootId: number): Promise<void> {
    await this.api.removeRoot(rootId)
    await this.refresh()
  }

  async rescan(rootId: number): Promise<void> {
    await this.api.rescanRoot(rootId)
    await this.refresh()
  }

  dismissNotice(): void {
    this.notice = undefined
  }
}

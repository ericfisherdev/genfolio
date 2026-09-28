import { relative, sep } from 'node:path'
import type { LibraryRoot, RootId } from '@domain/library'
import type {
  DirectoryRepository,
  ImageRepository,
  LibraryRootRepository
} from '@domain/repositories'
import { AddRootOutcome, type AddRootResult, type RootSummary } from '@shared/library'
import { isInside } from './path-containment'
import type { ScanCoordinator } from './scan-coordinator'

/** Resolves a path to its real (symlink-free) location when it is a directory. */
export interface DirectoryResolver {
  realDirectory(path: string): Promise<string | undefined>
}

/** Runs `work` atomically (a database transaction). */
export type Transact = <T>(work: () => T) => T

export interface LibraryRootsDependencies {
  readonly roots: LibraryRootRepository
  readonly directories: DirectoryRepository
  readonly images: ImageRepository
  readonly scans: ScanCoordinator
  readonly resolver: DirectoryResolver
  readonly transact: Transact
  readonly now: () => number
}

/** The requested root id does not exist. */
export class UnknownRootError extends Error {
  constructor(readonly rootId: number) {
    super(`Unknown library root ${rootId}`)
    this.name = 'UnknownRootError'
  }
}

const toPosix = (path: string): string => path.split(sep).join('/')

/**
 * Adding, listing, removing and rescanning the folders that make up the library.
 * Mutations run one at a time, so each decision is made on a root list no other call is
 * changing (the service is the only writer).
 */
export class LibraryRoots {
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly deps: LibraryRootsDependencies) {}

  list(): RootSummary[] {
    return this.deps.roots.list().map((root) => this.summarize(root))
  }

  /**
   * Adds a folder and starts scanning it. Existing roots inside it are merged in, keeping
   * their indexed images. Expected conflicts are returned as outcomes, not thrown.
   */
  add(path: string): Promise<AddRootResult> {
    return this.exclusive(() => this.addExclusive(path))
  }

  private async addExclusive(path: string): Promise<AddRootResult> {
    const real = await this.deps.resolver.realDirectory(path)
    if (!real) return { outcome: AddRootOutcome.NotADirectory, path }
    const existing = this.deps.roots.list()
    if (existing.some((root) => root.path === real)) {
      return { outcome: AddRootOutcome.AlreadyAdded, path: real }
    }
    const container = existing.find((root) => isInside(real, root.path))
    if (container) return { outcome: AddRootOutcome.InsideExistingRoot, path: container.path }

    const contained = existing.filter((root) => isInside(root.path, real))
    for (const root of contained) await this.deps.scans.cancel(root.id)
    const root = this.deps.transact(() => {
      const added = this.deps.roots.add(real, this.deps.now())
      for (const child of contained) {
        this.deps.directories.moveRoot(child.id, added.id, toPosix(relative(real, child.path)))
        this.deps.roots.remove(child.id)
      }
      return added
    })
    this.deps.scans.start(root)
    return {
      outcome: AddRootOutcome.Added,
      root: this.summarize(root),
      absorbedRoots: contained.length
    }
  }

  /** Stops any running scan, then deletes the root's rows. Files on disk are never touched. */
  remove(rootId: RootId): Promise<boolean> {
    return this.exclusive(async () => {
      await this.deps.scans.cancel(rootId)
      return this.deps.roots.remove(rootId)
    })
  }

  /** Rejects with {@link UnknownRootError}. Resolves false when a scan is already running. */
  rescan(rootId: RootId): Promise<boolean> {
    return this.exclusive(async () => {
      const root = this.deps.roots.findById(rootId)
      if (!root) throw new UnknownRootError(rootId)
      return this.deps.scans.start(root)
    })
  }

  /** Runs `work` after every earlier mutation settles; a failed one does not block the queue. */
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.tail.then(work, work)
    this.tail = run.catch(() => undefined)
    return run
  }

  private summarize(root: LibraryRoot): RootSummary {
    return {
      id: root.id,
      path: root.path,
      addedAt: root.addedAt,
      imageCount: this.deps.images.countByRoot(root.id),
      scanning: this.deps.scans.isScanning(root.id)
    }
  }
}

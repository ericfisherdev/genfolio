import type { ImageId } from '@domain/library'
import { DeleteFailure, DeleteMode, type DeleteReport, type FailedDeletion } from '@shared/deletion'
import { forEachConcurrent } from './for-each-concurrent'
import { FileStatus, type ImageFileResolver } from './image-file-resolver'

/** Moves or removes one verified path. Rejects with the system error when it fails. */
export interface FileRemover {
  trash(path: string): Promise<void>
  remove(path: string): Promise<void>
}

/** Confirmations main shows before anything is removed from disk for good. */
export interface DeleteConfirmer {
  /** Before a permanent delete. */
  confirmPermanent(count: number, totalBytes: number): Promise<boolean>
  /** After moving some files to the trash failed: delete those permanently instead? */
  confirmPermanentAfterTrashFailed(count: number, totalBytes: number): Promise<boolean>
}

/** Removes images from the library whose files are gone; returns how many were forgotten. */
export interface DeletedImageForgetter {
  forget(ids: readonly ImageId[]): Promise<number>
}

/** A file that was verified as the image's own file inside its root. */
interface Target {
  readonly imageId: ImageId
  readonly fileName: string
  readonly sizeBytes: number
}

/** A target whose trash or removal failed, with the system error code when there was one. */
type Unremoved = Target & { readonly code?: string }

interface Outcomes {
  deleted: ImageId[]
  missing: ImageId[]
  failed: FailedDeletion[]
}

const INSPECT_CONCURRENCY = 16

/**
 * Deletes image files. Every path is verified (inside its root, the image's own file, not a
 * link) right before it is acted on, including after a confirmation dialog, so a file
 * swapped meanwhile is refused. Trash is the default; nothing is removed for good without a
 * confirmation. Images whose files were deleted or were already gone leave the library.
 */
export class ImageDeleter {
  constructor(
    private readonly files: Pick<ImageFileResolver, 'inspect'>,
    private readonly remover: FileRemover,
    private readonly confirmer: DeleteConfirmer,
    private readonly forgetter: DeletedImageForgetter
  ) {}

  async delete(ids: readonly ImageId[], mode: DeleteMode): Promise<DeleteReport> {
    const found = await this.survey(ids)
    if (mode === DeleteMode.Permanent && found.targets.length > 0) {
      const confirmed = await this.confirmer.confirmPermanent(
        found.targets.length,
        totalBytes(found.targets)
      )
      if (!confirmed) return { cancelled: true, deleted: [], missing: [], failed: [] }
    }
    const report: Outcomes = { deleted: [], missing: found.missing, failed: found.failed }
    const unremoved = await this.act(found.targets, mode, report)
    await this.settle(unremoved, mode, report)
    await this.forgetter.forget([...report.deleted, ...report.missing])
    return { cancelled: false, ...report }
  }

  /**
   * Files the trash refused may be deleted permanently if the user agrees; whatever still
   * could not be removed is reported as failed.
   */
  private async settle(
    unremoved: readonly Unremoved[],
    mode: DeleteMode,
    report: Outcomes
  ): Promise<void> {
    if (unremoved.length === 0) return
    const retry =
      mode === DeleteMode.Trash &&
      (await this.confirmer.confirmPermanentAfterTrashFailed(
        unremoved.length,
        totalBytes(unremoved)
      ))
    const reason =
      mode === DeleteMode.Trash ? DeleteFailure.TrashFailed : DeleteFailure.RemoveFailed
    const stillThere = retry ? await this.act(unremoved, DeleteMode.Permanent, report) : unremoved
    const finalReason = retry ? DeleteFailure.RemoveFailed : reason
    report.failed.push(...stillThere.map((target) => failed(target, finalReason, target.code)))
  }

  /**
   * Re-verifies each target right before trashing or removing its path. Returns the targets
   * the trash or removal failed for, with the error code; a file that vanished counts as
   * missing, and one that no longer verifies as refused.
   */
  private async act(
    targets: readonly Target[],
    mode: DeleteMode,
    report: Outcomes
  ): Promise<Unremoved[]> {
    const unremoved: Unremoved[] = []
    for (const target of targets) {
      const inspection = await this.files.inspect(target.imageId)
      if (inspection.status !== FileStatus.Found) {
        if (inspection.status === FileStatus.Missing) report.missing.push(target.imageId)
        else report.failed.push(failed(target, failureOf(inspection.status)))
        continue
      }
      await inspection.file.handle.close()
      if (!inspection.exact) {
        report.failed.push(failed(target, DeleteFailure.Refused))
        continue
      }
      try {
        const path = inspection.file.path
        await (mode === DeleteMode.Trash ? this.remover.trash(path) : this.remover.remove(path))
        report.deleted.push(target.imageId)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        unremoved.push(code ? { ...target, code } : target)
      }
    }
    return unremoved
  }

  /** Sorts the ids into files to act on, files already gone, and files that can't be touched. */
  private async survey(
    ids: readonly ImageId[]
  ): Promise<{ targets: Target[]; missing: ImageId[]; failed: FailedDeletion[] }> {
    const targets: Target[] = []
    const missing: ImageId[] = []
    const failures: FailedDeletion[] = []
    await forEachConcurrent(
      [...new Set(ids)],
      INSPECT_CONCURRENCY,
      new AbortController().signal,
      async (imageId) => {
        const inspection = await this.files.inspect(imageId)
        if (inspection.status === FileStatus.Found) {
          await inspection.file.handle.close()
          const target = {
            imageId,
            fileName: inspection.file.fileName,
            sizeBytes: inspection.file.sizeBytes
          }
          if (inspection.exact) targets.push(target)
          else failures.push(failed(target, DeleteFailure.Refused))
        } else if (inspection.status === FileStatus.Missing) {
          missing.push(imageId)
        } else if (inspection.status !== FileStatus.Unknown) {
          failures.push(
            failed({ imageId, fileName: inspection.fileName ?? '' }, failureOf(inspection.status))
          )
        }
      }
    )
    // Inspections finish in any order; act and report in the order the ids were given.
    const order = new Map<number, number>(ids.map((imageId, index) => [imageId, index]))
    const byInput = (a: { imageId: number }, b: { imageId: number }): number =>
      (order.get(a.imageId) ?? 0) - (order.get(b.imageId) ?? 0)
    return {
      targets: targets.sort(byInput),
      missing: missing.sort((a, b) => byInput({ imageId: a }, { imageId: b })),
      failed: failures.sort(byInput)
    }
  }
}

function failureOf(status: FileStatus): DeleteFailure {
  return status === FileStatus.Unreadable ? DeleteFailure.Unreadable : DeleteFailure.Refused
}

function failed(
  target: { imageId: ImageId; fileName: string },
  reason: DeleteFailure,
  code?: string
): FailedDeletion {
  return { imageId: target.imageId, fileName: target.fileName, reason, ...(code ? { code } : {}) }
}

const totalBytes = (targets: readonly Target[]): number =>
  targets.reduce((sum, target) => sum + target.sizeBytes, 0)

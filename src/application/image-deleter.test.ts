import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { open, realpath, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageLocator } from '@domain/image-location'
import type { ImageId } from '@domain/library'
import { DeleteFailure, DeleteMode } from '@shared/deletion'
import { ImageDeleter, type DeleteConfirmer, type FileRemover } from './image-deleter'
import { ImageFileResolver } from './image-file-resolver'

let dir: string
let library: string
let trash: string
let outside: string
const NAMES = ['a.png', 'b.png', 'c.png']
const id = (n: number): ImageId => n as ImageId

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'genfolio-delete-')))
  library = join(dir, 'library')
  trash = join(dir, 'trash')
  mkdirSync(library)
  mkdirSync(trash)
  for (const name of NAMES) writeFileSync(join(library, name), name.repeat(10))
  outside = join(dir, 'outside.png')
  writeFileSync(outside, 'keep me')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** Images 1–3 are a.png, b.png and c.png in the root. */
const locator: ImageLocator = {
  locate: (imageId) => {
    const fileName = NAMES[imageId - 1]
    if (fileName === undefined) return undefined
    return { rootPath: library, relDir: '', fileName, width: 1, height: 1, mtimeMs: 1 }
  }
}

interface Harness {
  readonly deleter: ImageDeleter
  readonly remover: FileRemover
  readonly confirmer: { [K in keyof DeleteConfirmer]: ReturnType<typeof vi.fn> }
  readonly forget: ReturnType<typeof vi.fn>
}

function setup(
  options: { trashFails?: string[]; permanent?: boolean; retry?: boolean } = {}
): Harness {
  const remover: FileRemover = {
    trash: vi.fn(async (path: string) => {
      if (options.trashFails?.includes(basename(path))) {
        throw Object.assign(new Error('no trash here'), { code: 'EXDEV' })
      }
      renameSync(path, join(trash, basename(path)))
    }),
    remove: vi.fn((path: string) => rm(path))
  }
  const confirmer = {
    confirmPermanent: vi.fn(async () => options.permanent ?? true),
    confirmPermanentAfterTrashFailed: vi.fn(async () => options.retry ?? false)
  }
  const forget = vi.fn(async (ids: readonly ImageId[]) => ids.length)
  const resolver = new ImageFileResolver(locator, {
    open: (path) => open(path, 'r'),
    realpath,
    stat
  })
  return {
    deleter: new ImageDeleter(resolver, remover, confirmer, { forget }),
    remover,
    confirmer,
    forget
  }
}

describe('ImageDeleter', () => {
  it('moves files to the trash and forgets their images', async () => {
    const { deleter, forget, confirmer } = setup()
    const report = await deleter.delete([id(1), id(2)], DeleteMode.Trash)
    expect(report).toEqual({ cancelled: false, deleted: [1, 2], missing: [], failed: [] })
    expect(existsSync(join(trash, 'a.png'))).toBe(true)
    expect(existsSync(join(library, 'b.png'))).toBe(false)
    expect(forget).toHaveBeenCalledWith([1, 2])
    expect(confirmer.confirmPermanent).not.toHaveBeenCalled()
  })

  it('reports exactly the file that could not be trashed and deletes the rest', async () => {
    unlinkSync(join(library, 'c.png'))
    const { deleter, forget, confirmer } = setup({ trashFails: ['b.png'] })
    const report = await deleter.delete([id(1), id(2), id(3), id(9)], DeleteMode.Trash)
    expect(report).toEqual({
      cancelled: false,
      deleted: [1],
      missing: [3],
      failed: [{ imageId: 2, fileName: 'b.png', reason: DeleteFailure.TrashFailed, code: 'EXDEV' }]
    })
    expect(confirmer.confirmPermanentAfterTrashFailed).toHaveBeenCalledWith(1, 50)
    expect(existsSync(join(library, 'b.png'))).toBe(true)
    expect(forget).toHaveBeenCalledWith([1, 3])
  })

  it('deletes files the trash refused when the user agrees', async () => {
    const { deleter, remover } = setup({ trashFails: ['b.png'], retry: true })
    const report = await deleter.delete([id(2)], DeleteMode.Trash)
    expect(report.deleted).toEqual([2])
    expect(remover.remove).toHaveBeenCalledTimes(1)
    expect(existsSync(join(library, 'b.png'))).toBe(false)
  })

  it('deletes permanently only after confirming the count and size', async () => {
    const declined = setup({ permanent: false })
    expect(await declined.deleter.delete([id(1), id(2)], DeleteMode.Permanent)).toEqual({
      cancelled: true,
      deleted: [],
      missing: [],
      failed: []
    })
    expect(declined.confirmer.confirmPermanent).toHaveBeenCalledWith(2, 100)
    expect(existsSync(join(library, 'a.png'))).toBe(true)
    expect(declined.forget).not.toHaveBeenCalled()

    const accepted = setup()
    const report = await accepted.deleter.delete([id(1)], DeleteMode.Permanent)
    expect(report.deleted).toEqual([1])
    expect(existsSync(join(library, 'a.png'))).toBe(false)
    expect(accepted.remover.trash).not.toHaveBeenCalled()
  })

  it('refuses a file swapped for a symlink to a file outside the root', async () => {
    unlinkSync(join(library, 'a.png'))
    symlinkSync(outside, join(library, 'a.png'))
    const { deleter, forget } = setup()
    const report = await deleter.delete([id(1)], DeleteMode.Trash)
    expect(report.failed).toEqual([
      { imageId: 1, fileName: 'a.png', reason: DeleteFailure.Refused }
    ])
    expect(existsSync(outside)).toBe(true)
    expect(forget).toHaveBeenCalledWith([])
  })

  it('refuses a link to another image inside the root', async () => {
    unlinkSync(join(library, 'a.png'))
    symlinkSync(join(library, 'b.png'), join(library, 'a.png'))
    const { deleter } = setup()
    const report = await deleter.delete([id(1)], DeleteMode.Trash)
    expect(report.failed[0]?.reason).toBe(DeleteFailure.Refused)
    expect(existsSync(join(library, 'b.png'))).toBe(true)
  })

  it('verifies again after the confirmation, refusing a file swapped meanwhile', async () => {
    const harness = setup()
    harness.confirmer.confirmPermanent.mockImplementation(async () => {
      unlinkSync(join(library, 'a.png'))
      symlinkSync(outside, join(library, 'a.png'))
      return true
    })
    const report = await harness.deleter.delete([id(1)], DeleteMode.Permanent)
    expect(report.failed[0]?.reason).toBe(DeleteFailure.Refused)
    expect(existsSync(outside)).toBe(true)
  })
})

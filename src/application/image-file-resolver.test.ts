import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { open, realpath, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ImageLocator, StoredImageLocation } from '@domain/image-location'
import type { ImageId } from '@domain/library'
import { ImageFileResolver, type ResolverFileSystem } from './image-file-resolver'

let dir: string
let library: string
let inside: string
let outside: string

const realFs: ResolverFileSystem = { open: (path) => open(path, 'r'), realpath, stat }

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'genfolio-resolve-')))
  library = join(dir, 'library')
  mkdirSync(join(library, 'day'), { recursive: true })
  inside = join(library, 'day', 'a.png')
  outside = join(dir, 'outside.png')
  writeFileSync(inside, 'inside')
  writeFileSync(outside, 'outside')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function resolverFor(
  location: Partial<StoredImageLocation> | undefined,
  fs: ResolverFileSystem = realFs
): ImageFileResolver {
  const locator: ImageLocator = {
    locate: () =>
      location && {
        rootPath: library,
        relDir: 'day',
        fileName: 'a.png',
        width: 10,
        height: 20,
        mtimeMs: 5,
        ...location
      }
  }
  return new ImageFileResolver(locator, fs)
}

async function contentsOf(resolver: ImageFileResolver): Promise<string | undefined> {
  const file = await resolver.open(1 as ImageId)
  if (!file) return undefined
  try {
    return (await file.handle.readFile()).toString()
  } finally {
    await file.handle.close()
  }
}

describe('ImageFileResolver', () => {
  it('opens a stored image inside its root', async () => {
    await expect(contentsOf(resolverFor({}))).resolves.toBe('inside')
  })

  it('reports the file’s current mtime, not the one stored at scan time', async () => {
    utimesSync(inside, new Date(2030, 0, 1), new Date(2030, 0, 1))
    const file = await resolverFor({}).open(1 as ImageId)
    await file?.handle.close()
    expect(file?.mtimeMs).toBe(new Date(2030, 0, 1).getTime())
  })

  it('refuses a file replaced by a symlink pointing outside the root', async () => {
    unlinkSync(inside)
    symlinkSync(outside, inside)
    await expect(contentsOf(resolverFor({}))).resolves.toBeUndefined()
  })

  it('refuses when the file becomes a symlink after it was opened', async () => {
    const swapAfterOpen: ResolverFileSystem = {
      ...realFs,
      realpath: async (path) => {
        if (path === inside) {
          unlinkSync(inside)
          symlinkSync(outside, inside)
        }
        return realpath(path)
      }
    }
    await expect(contentsOf(resolverFor({}, swapAfterOpen))).resolves.toBeUndefined()
  })

  it('refuses when an outside symlink was opened and swapped back before the check', async () => {
    unlinkSync(inside)
    symlinkSync(outside, inside)
    const swapBackAfterOpen: ResolverFileSystem = {
      ...realFs,
      realpath: async (path) => {
        if (path === inside) {
          unlinkSync(inside)
          copyFileSync(outside, inside)
        }
        return realpath(path)
      }
    }
    await expect(contentsOf(resolverFor({}, swapBackAfterOpen))).resolves.toBeUndefined()
  })

  it('refuses stored paths that climb out of the root', async () => {
    await expect(
      contentsOf(resolverFor({ relDir: '..', fileName: 'outside.png' }))
    ).resolves.toBeUndefined()
  })

  it('returns undefined for unknown ids, missing files and directories', async () => {
    await expect(contentsOf(resolverFor(undefined))).resolves.toBeUndefined()
    await expect(contentsOf(resolverFor({ fileName: 'gone.png' }))).resolves.toBeUndefined()
    await expect(contentsOf(resolverFor({ relDir: '', fileName: 'day' }))).resolves.toBeUndefined()
  })
})

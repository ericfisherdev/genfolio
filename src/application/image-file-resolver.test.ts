import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ImageLocator, StoredImageLocation } from '@domain/image-location'
import type { ImageId } from '@domain/library'
import { ImageFileResolver } from './image-file-resolver'

let dir: string
let library: string

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'genfolio-resolve-')))
  library = join(dir, 'library')
  mkdirSync(join(library, 'day'), { recursive: true })
  writeFileSync(join(library, 'day', 'a.png'), 'x')
  writeFileSync(join(dir, 'outside.png'), 'secret')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function resolverFor(location: Partial<StoredImageLocation> | undefined): ImageFileResolver {
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
  return new ImageFileResolver(locator, realpath)
}

describe('ImageFileResolver', () => {
  it('resolves a stored image to its real path inside the root', async () => {
    await expect(resolverFor({}).resolve(1 as ImageId)).resolves.toEqual({
      path: join(library, 'day', 'a.png'),
      width: 10,
      height: 20,
      mtimeMs: 5
    })
  })

  it('refuses a file swapped for a symlink that points outside the root', async () => {
    symlinkSync(join(dir, 'outside.png'), join(library, 'day', 'escape.png'))
    await expect(
      resolverFor({ fileName: 'escape.png' }).resolve(1 as ImageId)
    ).resolves.toBeUndefined()
  })

  it('refuses stored paths that climb out of the root', async () => {
    await expect(
      resolverFor({ relDir: '..', fileName: 'outside.png' }).resolve(1 as ImageId)
    ).resolves.toBeUndefined()
  })

  it('returns undefined for unknown ids and missing files', async () => {
    await expect(resolverFor(undefined).resolve(1 as ImageId)).resolves.toBeUndefined()
    await expect(
      resolverFor({ fileName: 'gone.png' }).resolve(1 as ImageId)
    ).resolves.toBeUndefined()
  })
})

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DownloadError } from '@domain/downloads'
import { NodeDownloadFiles } from './node-download-files'

let root: string
const files = new NodeDownloadFiles()

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'genfolio-dl-'))
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text)

describe('NodeDownloadFiles', () => {
  it('writes beside the name and links the file into place with its checksum', async () => {
    const target = join(root, 'a.safetensors')
    const partial = await files.begin(target)
    await partial.write(bytes('hello '))
    await partial.write(bytes('world'))
    expect(await readdir(root)).toEqual(['a.safetensors.part'])
    const done = await partial.finish()
    expect(done).toEqual({
      bytes: 11,
      sha256: createHash('sha256').update('hello world').digest('hex')
    })
    await partial.publish()
    expect(await readdir(root)).toEqual(['a.safetensors'])
    expect(await readFile(target, 'utf8')).toBe('hello world')
  })

  it('never replaces a file that appeared meanwhile', async () => {
    const target = join(root, 'a.safetensors')
    const partial = await files.begin(target)
    await partial.write(bytes('new'))
    await partial.finish()
    await writeFile(target, 'mine')
    await expect(partial.publish()).rejects.toBeInstanceOf(DownloadError)
    expect(await readFile(target, 'utf8')).toBe('mine')
    await partial.discard()
    expect(await readdir(root)).toEqual(['a.safetensors'])
  })

  it('discards what was written, from any step and more than once', async () => {
    const target = join(root, 'a.safetensors')
    const early = await files.begin(target)
    await early.write(bytes('x'))
    await early.discard()
    await early.discard()
    expect(await readdir(root)).toEqual([])
    const late = await files.begin(target)
    await late.write(bytes('x'))
    await late.finish()
    await late.discard()
    expect(await readdir(root)).toEqual([])
  })

  it('starts over a leftover partial file', async () => {
    const target = join(root, 'a.safetensors')
    await writeFile(`${target}.part`, 'stale stale stale')
    const partial = await files.begin(target)
    await partial.write(bytes('ok'))
    expect((await partial.finish()).bytes).toBe(2)
    await partial.publish()
    expect(await readFile(target, 'utf8')).toBe('ok')
  })

  it('finds an existing folder named alike ignoring case, else names a new one', async () => {
    await mkdir(join(root, 'SDXL'))
    await writeFile(join(root, 'pony'), 'a file, not a folder')
    expect(await files.resolveFolder(root, 'sdxl')).toBe(join(root, 'SDXL'))
    expect(await files.resolveFolder(root, 'pony')).toBe(join(root, 'pony'))
    expect(await files.resolveFolder(root, 'sd15')).toBe(join(root, 'sd15'))
    expect(await files.resolveFolder(join(root, 'missing'), 'sdxl')).toBe(
      join(root, 'missing', 'sdxl')
    )
  })

  it('removes a folder only when it is empty', async () => {
    const empty = join(root, 'empty')
    const full = join(root, 'full')
    await mkdir(empty)
    await mkdir(full)
    await writeFile(join(full, 'a.safetensors'), 'x')
    await files.removeEmptyFolder(empty)
    await files.removeEmptyFolder(full)
    await files.removeEmptyFolder(join(root, 'missing'))
    expect((await readdir(root)).sort()).toEqual(['full'])
  })

  it('creates a folder and tells whether a path is there', async () => {
    const folder = join(root, 'a', 'b')
    expect(await files.exists(folder)).toBe(false)
    await files.ensureFolder(folder)
    await files.ensureFolder(folder)
    expect(await files.exists(folder)).toBe(true)
  })
})

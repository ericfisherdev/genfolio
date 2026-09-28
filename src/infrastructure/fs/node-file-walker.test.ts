import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FoundFile } from '@domain/scan'
import { NodeFileWalker } from './node-file-walker'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'genfolio-walk-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function touch(relPath: string, bytes = 'x'): void {
  const path = join(root, relPath)
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, bytes)
}

async function collect(
  walker: NodeFileWalker,
  signal = new AbortController().signal
): Promise<FoundFile[]> {
  const found: FoundFile[] = []
  for await (const file of walker.walk(root, signal)) found.push(file)
  const key = (file: FoundFile): string => `${file.relDir}\0${file.fileName}`
  return found.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
}

const walker = (): NodeFileWalker => new NodeFileWalker({ warn: vi.fn() }, (path) => path)

describe('NodeFileWalker', () => {
  it('finds image-extension files at every depth with POSIX relative dirs', async () => {
    touch('a.png')
    touch('2026/09/b.JPG', 'abc')
    touch('2026/09/27/c.webp')
    const found = await collect(walker())
    expect(found.map((f) => [f.relDir, f.fileName])).toEqual([
      ['', 'a.png'],
      ['2026/09', 'b.JPG'],
      ['2026/09/27', 'c.webp']
    ])
    expect(found[1]?.sizeBytes).toBe(3)
    expect(Number.isInteger(found[1]?.mtimeMs)).toBe(true)
  })

  it('skips hidden entries, symlinks and non-image files', async () => {
    touch('keep.png')
    touch('.hidden/secret.png')
    touch('.dotfile.png')
    touch('notes.txt')
    touch('log.html')
    symlinkSync(root, join(root, 'loop'))
    symlinkSync(join(root, 'keep.png'), join(root, 'alias.png'))
    expect((await collect(walker())).map((f) => f.fileName)).toEqual(['keep.png'])
  })

  it('stops when aborted', async () => {
    touch('a/1.png')
    touch('b/2.png')
    const controller = new AbortController()
    controller.abort()
    await expect(collect(walker(), controller.signal)).rejects.toThrow()
  })
})

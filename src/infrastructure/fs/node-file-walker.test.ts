import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { opendir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FoundFile } from '@domain/scan'
import { NodeFileWalker } from './node-file-walker'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, stat: vi.fn(actual.stat) }
})

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

  it("stats a folder's files concurrently but never more than 32 at once, yielding them in listing order", async () => {
    for (let i = 0; i < 100; i++) touch(`${String(i).padStart(3, '0')}.png`)
    const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
    let inFlight = 0
    let peak = 0
    vi.mocked(stat).mockImplementation((async (...args: Parameters<typeof actual.stat>) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 1))
      try {
        return await actual.stat(...args)
      } finally {
        inFlight--
      }
    }) as typeof actual.stat)

    const names: string[] = []
    for await (const file of walker().walk(root, new AbortController().signal)) {
      names.push(file.fileName)
    }

    expect(names).toHaveLength(100)
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(32)
    const listed: string[] = []
    for await (const entry of await opendir(root)) listed.push(entry.name)
    expect(names).toEqual(listed)
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

  it('flags images with a <stem>.txt sidecar beside them', async () => {
    touch('a.png')
    touch('a.txt')
    touch('b.png')
    touch('sub/b.txt')
    const found = await collect(walker())
    expect(found.map((f) => [f.fileName, f.hasTextSidecar])).toEqual(
      expect.arrayContaining([
        ['a.png', true],
        ['b.png', false]
      ])
    )
  })

  it('rejects when the root itself cannot be read', async () => {
    const walker = new NodeFileWalker({ warn: vi.fn() }, (path) => path)
    const missing = join(root, 'unmounted')
    const run = async (): Promise<void> => {
      for await (const _ of walker.walk(missing, new AbortController().signal)) void _
    }
    await expect(run()).rejects.toThrow(/ENOENT/)
  })

  it.skipIf(process.getuid?.() === 0)(
    'reports an unreadable subdirectory and skips it',
    async () => {
      touch('open/a.png')
      touch('locked/b.png')
      chmodSync(join(root, 'locked'), 0o000)
      try {
        const skipped: string[] = []
        const found: string[] = []
        const walker = new NodeFileWalker({ warn: vi.fn() }, (path) => path)
        for await (const file of walker.walk(root, new AbortController().signal, (dir) =>
          skipped.push(dir)
        )) {
          found.push(file.fileName)
        }
        expect(found).toEqual(['a.png'])
        expect(skipped).toEqual(['locked'])
      } finally {
        chmodSync(join(root, 'locked'), 0o755)
      }
    }
  )

  it('walks only the scoped folders, without their subfolders, and nothing for a gone one', async () => {
    touch('a/one.png')
    touch('a/deeper/two.png')
    touch('b/three.png')
    const skipped = vi.fn()
    const found: string[] = []
    for await (const file of walker().walk(root, new AbortController().signal, skipped, [
      'a',
      'gone'
    ])) {
      found.push(`${file.relDir}/${file.fileName}`)
    }
    expect(found).toEqual(['a/one.png'])
    expect(skipped).not.toHaveBeenCalled()
  })

  it('stops when aborted', async () => {
    touch('a/1.png')
    touch('b/2.png')
    const controller = new AbortController()
    controller.abort()
    await expect(collect(walker(), controller.signal)).rejects.toThrow()
  })
})

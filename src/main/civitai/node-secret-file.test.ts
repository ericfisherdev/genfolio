import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NodeSecretFile } from './node-secret-file'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'genfolio-secret-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('NodeSecretFile', () => {
  it('stores, reads and removes the data, for its owner only', async () => {
    const file = new NodeSecretFile(join(dir, 'nested', 'key.bin'))
    expect(await file.read()).toBeUndefined()
    await file.write(Buffer.from('one'))
    await file.write(Buffer.from('two'))
    expect((await file.read())?.toString()).toBe('two')
    expect((await stat(join(dir, 'nested', 'key.bin'))).mode & 0o777).toBe(0o600)
    await file.remove()
    await file.remove()
    expect(await file.read()).toBeUndefined()
  })
})

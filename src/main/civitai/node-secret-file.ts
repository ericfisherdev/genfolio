import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { SecretFile } from './api-key-store'

/** One file for a secret, readable by its owner only. */
export class NodeSecretFile implements SecretFile {
  constructor(private readonly path: string) {}

  async read(): Promise<Buffer | undefined> {
    try {
      return await readFile(this.path)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }

  async write(data: Buffer): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    await writeFile(this.path, data, { mode: 0o600 })
    // The mode above only applies to a file this call created.
    await chmod(this.path, 0o600)
  }

  async remove(): Promise<void> {
    await rm(this.path, { force: true })
  }
}

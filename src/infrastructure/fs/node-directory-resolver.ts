import { realpath, stat } from 'node:fs/promises'
import type { DirectoryResolver } from '@application/library-roots'

/** Resolves symlinks with `realpath`; missing or non-directory paths resolve to `undefined`. */
export class NodeDirectoryResolver implements DirectoryResolver {
  async realDirectory(path: string): Promise<string | undefined> {
    try {
      const real = await realpath(path)
      return (await stat(real)).isDirectory() ? real : undefined
    } catch {
      return undefined
    }
  }
}

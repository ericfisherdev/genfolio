import type { Stats } from 'node:fs'
import { basename, dirname, extname, relative, sep } from 'node:path'
import { watch } from 'chokidar'
import type { FileWatcher, WatchedChange, WatchSubscription } from '@domain/file-watcher'
import { IMAGE_EXTENSIONS } from './node-file-walker'

export interface ChokidarOptions {
  /** How long a file must stop growing before it is reported (a writer may still be busy). */
  readonly stabilityMs: number
}

export const DEFAULT_WATCH_OPTIONS: ChokidarOptions = { stabilityMs: 2_000 }

const toPosix = (path: string): string => path.split(sep).join('/')

/** Files the library reads: images, and the Fooocus log whose rewrites carry metadata. */
const isWatchedFile = (path: string): boolean =>
  IMAGE_EXTENSIONS.has(extname(path).toLowerCase()) || basename(path) === 'log.html'

/** chokidar 5, one watcher per folder tree. */
export class ChokidarFileWatcher implements FileWatcher {
  constructor(private readonly options: ChokidarOptions = DEFAULT_WATCH_OPTIONS) {}

  watch(
    path: string,
    onChange: (change: WatchedChange) => void,
    onFailure: (error: unknown) => void
  ): WatchSubscription {
    const folderOf = (filePath: string): string => {
      const rel = toPosix(relative(path, dirname(filePath)))
      return rel === '.' ? '' : rel
    }
    const watcher = watch(path, {
      ignoreInitial: true,
      followSymlinks: false,
      awaitWriteFinish: { stabilityThreshold: this.options.stabilityMs, pollInterval: 100 },
      ignored: (entry: string, stats?: Stats) =>
        (entry !== path && basename(entry).startsWith('.')) ||
        (stats?.isFile() === true && !isWatchedFile(entry))
    })
    const fileChanged = (filePath: string): void => {
      if (isWatchedFile(filePath)) onChange({ relDir: folderOf(filePath) })
    }
    let markReady: () => void = () => undefined
    const ready = new Promise<void>((resolve) => (markReady = resolve))
    watcher
      .on('ready', markReady)
      .on('add', fileChanged)
      .on('change', fileChanged)
      .on('unlink', fileChanged)
      .on('unlinkDir', (dirPath: string) => {
        // Its files are gone; chokidar may not report each of them.
        const rel = toPosix(relative(path, dirPath))
        onChange({ relDir: rel })
        onChange({ relDir: folderOf(dirPath) })
      })
      .on('error', (error: unknown) => {
        void watcher.close()
        markReady()
        onFailure(error)
      })
    return { ready, close: () => watcher.close() }
  }
}

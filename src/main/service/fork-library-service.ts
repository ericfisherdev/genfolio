import { availableParallelism } from 'node:os'
import { utilityProcess, type UtilityProcess } from 'electron'
import { THREAD_POOL_SIZE_VARIABLE, threadPoolSizeFor } from '@shared/libuv-thread-pool'
import servicePath from '../../service/index?modulePath'

/**
 * Starts the library service utility process. Must be called after `app` is ready. The
 * service's libuv pool is sized to the machine (an explicit `UV_THREADPOOL_SIZE` wins), since
 * image decodes and resizes run on it.
 */
export function forkLibraryService(databasePath: string, logDir: string): UtilityProcess {
  const threadPoolSize =
    process.env[THREAD_POOL_SIZE_VARIABLE] ?? String(threadPoolSizeFor(availableParallelism()))
  return utilityProcess.fork(servicePath, [], {
    serviceName: 'genfolio-library',
    stdio: 'inherit',
    env: {
      ...process.env,
      GENFOLIO_DB_PATH: databasePath,
      GENFOLIO_LOG_DIR: logDir,
      [THREAD_POOL_SIZE_VARIABLE]: threadPoolSize
    }
  })
}

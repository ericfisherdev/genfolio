import { utilityProcess, type UtilityProcess } from 'electron'
import servicePath from '../../service/index?modulePath'

/** Starts the library service utility process. Must be called after `app` is ready. */
export function forkLibraryService(): UtilityProcess {
  return utilityProcess.fork(servicePath, [], {
    serviceName: 'genfolio-library',
    stdio: 'inherit'
  })
}

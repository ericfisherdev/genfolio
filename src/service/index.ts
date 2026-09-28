import { MigrationRunner } from '@infrastructure/db/migration-runner'
import { migrations } from '@infrastructure/db/migrations'
import { DatabaseMode, openLibraryDatabase } from '@infrastructure/db/open-database'
import type { ScanEvent } from '@shared/scan'
import { isServiceRequest } from '@shared/service-rpc-guards'
import { createLibraryHandlers } from './library-handlers'
import { requireEnv } from './require-env'
import { RpcDispatcher, type ServiceHandlers } from './rpc-dispatcher'
import { startupFailureHandlers } from './startup-failure-handlers'
import { startupFailureReason } from './startup-failure-reason'

// Composition root of the library service (Electron utility process).

process.on('unhandledRejection', (reason) => {
  console.error('[library-service] unhandled rejection', reason)
  process.exit(1)
})

const emit = (event: ScanEvent): void => process.parentPort.postMessage({ event })

function startHandlers(): ServiceHandlers {
  try {
    const db = openLibraryDatabase(requireEnv('GENFOLIO_DB_PATH'), DatabaseMode.ReadWrite)
    new MigrationRunner(db, migrations).migrate()
    return createLibraryHandlers(db, emit)
  } catch (error) {
    const reason = startupFailureReason(error)
    console.error(`[library-service] ${reason}`)
    return startupFailureHandlers(reason)
  }
}

const dispatcher = new RpcDispatcher(startHandlers())

process.parentPort.on('message', (event) => {
  if (!isServiceRequest(event.data)) {
    console.error('[library-service] dropped malformed request')
    return
  }
  void dispatcher.dispatch(event.data).then((response) => process.parentPort.postMessage(response))
})

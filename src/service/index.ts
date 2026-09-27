import Database from 'better-sqlite3'
import { Transformer } from '@napi-rs/image'
import { ServiceMethod } from '@shared/service-rpc'
import { isServiceRequest } from '@shared/service-rpc-guards'
import { HealthReporter } from './health/health-reporter'
import { ImageCodecProbe } from './health/image-codec-probe'
import { RuntimeProbe } from './health/runtime-probe'
import { SqliteProbe } from './health/sqlite-probe'
import { RpcDispatcher } from './rpc-dispatcher'

// Composition root of the library service (Electron utility process).

process.on('unhandledRejection', (reason) => {
  console.error('[library-service] unhandled rejection', reason)
  process.exit(1)
})

const healthReporter = new HealthReporter([
  new RuntimeProbe(process.versions),
  new SqliteProbe(() => new Database(':memory:')),
  new ImageCodecProbe(Transformer)
])

const dispatcher = new RpcDispatcher({
  [ServiceMethod.Health]: () => healthReporter.report()
})

process.parentPort.on('message', (event) => {
  if (!isServiceRequest(event.data)) {
    console.error('[library-service] dropped malformed request')
    return
  }
  void dispatcher.dispatch(event.data).then((response) => process.parentPort.postMessage(response))
})

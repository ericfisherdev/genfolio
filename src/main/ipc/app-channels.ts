import { z } from 'zod'
import { IpcChannel } from '@shared/genfolio-api'
import type { AppDiagnostics } from '@shared/diagnostics'
import type { IpcHandlerRegistry } from './validating-ipc-registry'

export interface AppActions {
  /** Opens the folder holding the log files; false when it couldn't be opened. */
  openLogs(): Promise<boolean>
  /** Records a renderer error by its name only. */
  logRendererError(name: string): void
  diagnostics(): AppDiagnostics
}

/** Registers the app-level channels: logs, renderer errors and diagnostics. */
export function registerAppChannels(ipc: IpcHandlerRegistry, actions: AppActions): void {
  ipc.register(IpcChannel.OpenLogs, z.tuple([]), () => actions.openLogs())
  ipc.register(
    IpcChannel.ReportRendererError,
    z.tuple([z.string().min(1).max(100)]),
    async (name) => actions.logRendererError(name)
  )
  ipc.register(IpcChannel.Diagnostics, z.tuple([]), async () => actions.diagnostics())
}

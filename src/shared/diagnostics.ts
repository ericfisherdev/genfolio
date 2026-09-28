/** What the diagnostics panel shows about the app's own health. */
export interface AppDiagnostics {
  /** Times the library service was restarted after a crash since launch. */
  readonly serviceRestarts: number
  /** The service crashed repeatedly and is no longer restarted. */
  readonly serviceStopped: boolean
}

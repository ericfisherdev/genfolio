import type { ServiceHealth } from '@shared/service-health'
import type { HealthProbe } from './health-probe'

const REQUIRED_FIELDS: readonly (keyof ServiceHealth)[] = [
  'electron',
  'node',
  'sqlite',
  'fts5',
  'decodableFormats'
]

/** Runs every probe and merges their results into one complete report. */
export class HealthReporter {
  constructor(private readonly probes: readonly HealthProbe[]) {}

  /** Rejects when any probe fails or a required field is missing from the merged report. */
  async report(): Promise<ServiceHealth> {
    const parts = await Promise.all(this.probes.map((probe) => probe.probe()))
    const merged = Object.assign({}, ...parts) as Partial<ServiceHealth>
    const missing = REQUIRED_FIELDS.filter((field) => merged[field] === undefined)
    if (missing.length > 0) {
      throw new Error(`Health report missing fields: ${missing.join(', ')}`)
    }
    return merged as ServiceHealth
  }
}

import { serviceHealthSchema, type ServiceHealth } from '@shared/service-health'
import { describeIssues } from '@shared/validation'
import type { HealthProbe } from './health-probe'

/** Runs every probe and merges their results into one complete report. */
export class HealthReporter {
  constructor(private readonly probes: readonly HealthProbe[]) {}

  /** Rejects when any probe fails or the merged report does not match {@link serviceHealthSchema}. */
  async report(): Promise<ServiceHealth> {
    const parts = await Promise.all(this.probes.map((probe) => probe.probe()))
    const merged = serviceHealthSchema.safeParse(Object.assign({}, ...parts))
    if (!merged.success) {
      throw new Error(`Health report incomplete: ${describeIssues(merged.error)}`)
    }
    return merged.data
  }
}

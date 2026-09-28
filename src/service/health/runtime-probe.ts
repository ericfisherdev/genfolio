import type { ServiceHealth } from '@shared/service-health'
import type { HealthProbe } from './health-probe'

/** Reports the Electron and Node versions of the process it runs in. */
export class RuntimeProbe implements HealthProbe {
  constructor(private readonly versions: NodeJS.ProcessVersions) {}

  async probe(): Promise<Partial<ServiceHealth>> {
    return { electron: this.versions.electron ?? 'unknown', node: this.versions.node }
  }
}

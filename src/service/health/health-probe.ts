import type { ServiceHealth } from '@shared/service-health'

/** One component's contribution to the service health report. */
export interface HealthProbe {
  /** Rejects when the probed component cannot be loaded or exercised. */
  probe(): Promise<Partial<ServiceHealth>>
}

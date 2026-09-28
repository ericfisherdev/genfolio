import { describe, expect, it } from 'vitest'
import type { ServiceHealth } from '@shared/service-health'
import { HealthReporter } from './health-reporter'
import type { HealthProbe } from './health-probe'

const probeOf = (part: Partial<ServiceHealth>): HealthProbe => ({ probe: async () => part })

describe('HealthReporter', () => {
  it('merges every probe into one report', async () => {
    const reporter = new HealthReporter([
      probeOf({ electron: '44', node: '24' }),
      probeOf({ sqlite: '3.53', fts5: true, schemaVersion: 1 }),
      probeOf({ decodableFormats: ['png'] })
    ])
    await expect(reporter.report()).resolves.toEqual({
      electron: '44',
      node: '24',
      sqlite: '3.53',
      fts5: true,
      schemaVersion: 1,
      decodableFormats: ['png']
    })
  })

  it('rejects when fields are missing', async () => {
    const reporter = new HealthReporter([probeOf({ electron: '44' })])
    await expect(reporter.report()).rejects.toThrow(/incomplete: node: .*; sqlite: /)
  })

  it('rejects when a probe fails', async () => {
    const failing: HealthProbe = { probe: () => Promise.reject(new Error('native load failed')) }
    await expect(new HealthReporter([failing]).report()).rejects.toThrow('native load failed')
  })
})

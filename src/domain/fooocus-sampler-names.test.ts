import { describe, expect, it } from 'vitest'
import { fooocusSamplerKey, fooocusSchedulerName } from './fooocus-sampler-names'

describe('fooocusSamplerKey', () => {
  it('keeps a Fooocus key, including ones A1111 has no label for', () => {
    for (const key of [
      'dpmpp_2m_sde_gpu',
      'dpmpp_2m_sde',
      'heunpp2',
      'dpmpp_3m_sde_gpu',
      'uni_pc_bh2'
    ]) {
      expect(fooocusSamplerKey(key)).toBe(key)
    }
  })

  it('maps an A1111 label to the first key Fooocus gives it, as its own import does', () => {
    expect(fooocusSamplerKey('Euler a')).toBe('euler_ancestral')
    expect(fooocusSamplerKey('DPM++ 2M SDE')).toBe('dpmpp_2m_sde')
    expect(fooocusSamplerKey('DPM++ SDE Karras')).toBe('dpmpp_sde')
    expect(fooocusSamplerKey('UniPC')).toBe('uni_pc')
  })

  it('has no key for a name Fooocus does not offer', () => {
    expect(fooocusSamplerKey('DPM++ 2M SDE Heun')).toBeUndefined()
    expect(fooocusSamplerKey('')).toBeUndefined()
  })
})

describe('fooocusSchedulerName', () => {
  it('normalizes an A1111 schedule type to a Fooocus scheduler', () => {
    expect(fooocusSchedulerName('Karras', null)).toBe('karras')
    expect(fooocusSchedulerName('SGM Uniform', 'Euler a')).toBe('sgm_uniform')
    expect(fooocusSchedulerName('karras', 'dpmpp_2m_sde_gpu')).toBe('karras')
  })

  it('reads Karras off the sampler label when no scheduler is recorded', () => {
    expect(fooocusSchedulerName(null, 'DPM++ 2M SDE Karras')).toBe('karras')
    expect(fooocusSchedulerName(null, 'Euler a')).toBeUndefined()
  })

  it('has no name for a scheduler Fooocus does not offer', () => {
    expect(fooocusSchedulerName('Automatic', 'Euler a')).toBeUndefined()
    expect(fooocusSchedulerName('Karras', 'x')).toBe('karras')
    expect(fooocusSchedulerName('Beta', null)).toBeUndefined()
  })
})

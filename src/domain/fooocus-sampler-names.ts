/**
 * Fooocus's sampler keys and the A1111 labels it gives them (`modules/flags.py` `SAMPLERS`,
 * KSAMPLER then SAMPLER_EXTRA, in Fooocus's order). A blank label is a sampler A1111 has no name
 * for.
 */
const FOOOCUS_SAMPLERS: readonly (readonly [key: string, a1111Label: string])[] = [
  ['euler', 'Euler'],
  ['euler_ancestral', 'Euler a'],
  ['heun', 'Heun'],
  ['heunpp2', ''],
  ['dpm_2', 'DPM2'],
  ['dpm_2_ancestral', 'DPM2 a'],
  ['lms', 'LMS'],
  ['dpm_fast', 'DPM fast'],
  ['dpm_adaptive', 'DPM adaptive'],
  ['dpmpp_2s_ancestral', 'DPM++ 2S a'],
  ['dpmpp_sde', 'DPM++ SDE'],
  ['dpmpp_sde_gpu', 'DPM++ SDE'],
  ['dpmpp_2m', 'DPM++ 2M'],
  ['dpmpp_2m_sde', 'DPM++ 2M SDE'],
  ['dpmpp_2m_sde_gpu', 'DPM++ 2M SDE'],
  ['dpmpp_3m_sde', ''],
  ['dpmpp_3m_sde_gpu', ''],
  ['ddpm', ''],
  ['lcm', 'LCM'],
  ['tcd', 'TCD'],
  ['restart', 'Restart'],
  ['ddim', 'DDIM'],
  ['uni_pc', 'UniPC'],
  ['uni_pc_bh2', '']
]

const FOOOCUS_SAMPLER_KEYS = new Set(FOOOCUS_SAMPLERS.map(([key]) => key))

/** Fooocus's `SCHEDULER_NAMES`. */
const FOOOCUS_SCHEDULERS = new Set([
  'normal',
  'karras',
  'exponential',
  'sgm_uniform',
  'simple',
  'ddim_uniform',
  'lcm',
  'turbo',
  'align_your_steps',
  'tcd',
  'edm_playground_v2.5'
])

/** A1111 folds the Karras schedule into the sampler label. */
const KARRAS_SUFFIX = ' Karras'

/**
 * The Fooocus sampler key for a sampler name: the name itself when it is already one, else the
 * first key Fooocus labels with the A1111 name (its own import does the same, so `DPM++ 2M SDE`
 * is `dpmpp_2m_sde`, not the `_gpu` variant), else `undefined`. A ` Karras` suffix is ignored.
 */
export function fooocusSamplerKey(sampler: string): string | undefined {
  if (FOOOCUS_SAMPLER_KEYS.has(sampler)) return sampler
  const label = sampler.endsWith(KARRAS_SUFFIX) ? sampler.slice(0, -KARRAS_SUFFIX.length) : sampler
  return FOOOCUS_SAMPLERS.find(([, a1111Label]) => a1111Label !== '' && a1111Label === label)?.[0]
}

/**
 * The Fooocus scheduler name for a scheduler (A1111 writes `Karras`, `SGM Uniform`, …), or,
 * with none recorded, `karras` when the A1111 sampler label carries it. `undefined` when Fooocus
 * has no scheduler of that name (A1111's `Automatic` among them).
 */
export function fooocusSchedulerName(
  scheduler: string | null,
  sampler: string | null
): string | undefined {
  const name =
    scheduler !== null
      ? scheduler.trim().toLowerCase().replaceAll(' ', '_')
      : sampler?.endsWith(KARRAS_SUFFIX)
        ? 'karras'
        : undefined
  return name !== undefined && FOOOCUS_SCHEDULERS.has(name) ? name : undefined
}

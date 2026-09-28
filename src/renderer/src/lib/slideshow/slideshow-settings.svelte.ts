import { MAX_SLIDE_INTERVAL_MS, MIN_SLIDE_INTERVAL_MS } from '@shared/slideshow-kinds'
import type { SlideshowSettings } from '@shared/slideshow'
import type { PreferenceStore } from '../state/sort-preference.svelte'

const KEY = 'genfolio.slideshow'

export const DEFAULT_SLIDESHOW: SlideshowSettings = {
  intervalMs: 5_000,
  shuffle: false,
  loop: true,
  showPrompt: false
}

/** The saved settings when they are whole and in range; anything else is ignored. */
function parse(json: string | null): SlideshowSettings | undefined {
  if (!json) return undefined
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    return undefined
  }
  if (typeof value !== 'object' || value === null) return undefined
  const { intervalMs, shuffle, loop, showPrompt } = value as Record<string, unknown>
  const validInterval =
    typeof intervalMs === 'number' &&
    Number.isInteger(intervalMs) &&
    intervalMs >= MIN_SLIDE_INTERVAL_MS &&
    intervalMs <= MAX_SLIDE_INTERVAL_MS
  if (!validInterval || typeof shuffle !== 'boolean' || typeof loop !== 'boolean') return undefined
  if (typeof showPrompt !== 'boolean') return undefined
  return { intervalMs, shuffle, loop, showPrompt }
}

/** The slideshow settings in use, kept across restarts as the default preset. */
export class SlideshowSettingsState {
  current: SlideshowSettings = $state(DEFAULT_SLIDESHOW)

  constructor(private readonly store: PreferenceStore) {
    this.current = parse(this.safely(() => store.get(KEY)) ?? null) ?? DEFAULT_SLIDESHOW
  }

  update(changes: Partial<SlideshowSettings>): void {
    this.current = { ...this.current, ...changes }
    const saved = JSON.stringify(this.current)
    this.safely(() => this.store.set(KEY, saved))
  }

  private safely<T>(action: () => T): T | undefined {
    try {
      return action()
    } catch {
      return undefined
    }
  }
}

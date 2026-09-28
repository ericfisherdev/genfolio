<script lang="ts">
  import { MAX_PRESET_NAME } from '@shared/slideshow-kinds'
  import type { SlideshowPreset } from '@shared/slideshow'
  import { getAppServices } from '../lib/app-context'
  import type { Slideshow } from '../lib/slideshow/slideshow.svelte'
  import PromptDialog from './PromptDialog.svelte'

  interface Props {
    show: Slideshow
    /** The ids being shown, for rebuilding the order after shuffle or loop change. */
    ids: () => number[]
    onexit: () => void
  }

  let { show, ids, onexit }: Props = $props()
  const { slideshowSettings: settings, slideshowPresets: presets } = getAppServices()
  const INTERVALS_S = [2, 3, 5, 8, 10, 15, 30, 60]
  let naming = $state(false)
  let chosen: SlideshowPreset | undefined = $state()

  $effect(() => {
    void presets.load()
  })

  function setInterval(seconds: number): void {
    settings.update({ intervalMs: seconds * 1000 })
    show.reschedule()
  }

  /** Shuffle and loop change the order, rebuilt from the image on screen. */
  function setOrder(changes: { shuffle?: boolean; loop?: boolean }): void {
    settings.update(changes)
    show.restart(ids())
  }

  function apply(presetId: string): void {
    chosen = presets.presets.find((preset) => String(preset.id) === presetId)
    if (!chosen) return
    settings.update(chosen.settings)
    show.restart(ids())
  }
</script>

<div class="bar" role="toolbar" aria-label="Slideshow controls">
  <button type="button" aria-label="Previous image" onclick={() => show.previous()}>‹</button>
  <button type="button" onclick={() => show.togglePlaying()}>
    {show.playing ? 'Pause' : 'Play'}
  </button>
  <button type="button" aria-label="Next image" onclick={() => show.next()}>›</button>
  <label>
    Every
    <select
      value={settings.current.intervalMs / 1000}
      onchange={(event) => setInterval(Number(event.currentTarget.value))}
    >
      {#each INTERVALS_S as seconds (seconds)}
        <option value={seconds}>{seconds} s</option>
      {/each}
    </select>
  </label>
  <label>
    <input
      type="checkbox"
      checked={settings.current.shuffle}
      onchange={(event) => setOrder({ shuffle: event.currentTarget.checked })}
    />
    Shuffle
  </label>
  <label>
    <input
      type="checkbox"
      checked={settings.current.loop}
      onchange={(event) => setOrder({ loop: event.currentTarget.checked })}
    />
    Loop
  </label>
  <label>
    <input
      type="checkbox"
      checked={settings.current.showPrompt}
      onchange={(event) => settings.update({ showPrompt: event.currentTarget.checked })}
    />
    Prompt
  </label>
  <label>
    Preset
    <select
      value={chosen ? String(chosen.id) : ''}
      onchange={(event) => apply(event.currentTarget.value)}
    >
      <option value="" disabled>Choose…</option>
      {#each presets.presets as preset (preset.id)}
        <option value={String(preset.id)}>{preset.name}</option>
      {/each}
    </select>
  </label>
  <button type="button" onclick={() => (naming = true)}>Save preset…</button>
  {#if chosen}
    {@const preset = chosen}
    <button
      type="button"
      onclick={() => {
        chosen = undefined
        void presets.delete(preset)
      }}>Delete preset</button
    >
  {/if}
  <span class="spacer"></span>
  <button type="button" onclick={onexit}>Exit</button>
</div>

<PromptDialog
  open={naming}
  title="Save slideshow preset"
  label="Name"
  initial={chosen?.name ?? ''}
  confirmLabel="Save"
  maxlength={MAX_PRESET_NAME}
  onconfirm={(name) => {
    naming = false
    void presets.save(name, settings.current)
  }}
  oncancel={() => (naming = false)}
/>

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-4);
    background: linear-gradient(transparent, rgb(0 0 0 / 80%));
    color: #fff;
  }
  button,
  select {
    background: rgb(255 255 255 / 12%);
    color: #fff;
    border: 1px solid rgb(255 255 255 / 25%);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
  }
  option {
    background: var(--color-surface);
  }
  label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .spacer {
    flex: 1;
  }
</style>

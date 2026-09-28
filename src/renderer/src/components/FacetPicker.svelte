<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { FacetValue } from '@shared/search'

  interface Props {
    label: string
    values: readonly FacetValue[]
    selected: readonly number[]
    onchange: (ids: number[]) => void
    /** Extra controls shown above the list (the LoRA match mode and weight range). */
    children?: Snippet
  }

  let { label, values, selected, onchange, children }: Props = $props()
  let open = $state(false)
  let search = $state('')
  let root: HTMLDivElement | undefined = $state()
  let trigger: HTMLButtonElement | undefined = $state()

  const shown = $derived(
    values.filter((value) => value.name.toLowerCase().includes(search.trim().toLowerCase()))
  )

  function toggle(id: number): void {
    onchange(selected.includes(id) ? selected.filter((other) => other !== id) : [...selected, id])
  }

  function close(): void {
    open = false
    search = ''
    trigger?.focus()
  }

  function onpointerdown(event: PointerEvent): void {
    if (open && root && event.target instanceof Node && !root.contains(event.target)) {
      open = false
      search = ''
    }
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.preventDefault()
    close()
  }
</script>

<svelte:window {onpointerdown} />

<div class="picker" bind:this={root}>
  <button
    type="button"
    class="trigger"
    class:active={selected.length > 0}
    aria-haspopup="dialog"
    aria-expanded={open}
    bind:this={trigger}
    onclick={() => (open = !open)}
  >
    {label}{selected.length > 0 ? ` · ${selected.length}` : ''} ▾
  </button>
  {#if open}
    <div class="popover" role="dialog" aria-label={label} tabindex="-1" {onkeydown}>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        type="search"
        placeholder="Filter…"
        aria-label={`Find a ${label}`}
        bind:value={search}
        autofocus
      />
      {@render children?.()}
      {#if shown.length === 0}
        <p class="empty">{values.length === 0 ? 'None in these images' : 'No matches'}</p>
      {:else}
        <ul>
          {#each shown as value (value.id)}
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(value.id)}
                  onchange={() => toggle(value.id)}
                />
                <span class="name" title={value.name}>{value.name}</span>
                <span class="count">{value.count}</span>
              </label>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
  }
  .trigger {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
  }
  .trigger.active {
    border-color: var(--color-accent);
  }
  .popover {
    position: absolute;
    z-index: 10;
    top: calc(100% + var(--space-1));
    left: 0;
    width: 300px;
    max-height: 360px;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2);
    box-shadow: 0 8px 24px rgb(0 0 0 / 40%);
  }
  input[type='search'] {
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    color: inherit;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow-y: auto;
  }
  label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1);
    border-radius: var(--radius-1);
    cursor: pointer;
  }
  label:hover {
    background: var(--color-surface-raised);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count,
  .empty {
    color: var(--color-text-muted);
  }
  .empty {
    margin: var(--space-2);
  }
</style>

<script lang="ts">
  interface Props {
    rootLabel: string
    onrescan: () => void
    onremove: () => void
  }

  let { rootLabel, onrescan, onremove }: Props = $props()
  let open = $state(false)
  let container: HTMLDivElement | undefined = $state()

  function closeOnOutsideClick(event: MouseEvent): void {
    if (open && container && !container.contains(event.target as Node)) open = false
  }
</script>

<svelte:window
  onclick={closeOnOutsideClick}
  onkeydown={(event) => {
    if (open && event.key === 'Escape') open = false
  }}
/>

<div class="menu" bind:this={container}>
  <button
    type="button"
    class="trigger"
    aria-label={`Actions for ${rootLabel}`}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}>⋮</button
  >
  {#if open}
    <div class="items" role="menu" aria-label={`Actions for ${rootLabel}`}>
      <button
        type="button"
        role="menuitem"
        onclick={() => {
          open = false
          onrescan()
        }}>Rescan</button
      >
      <button
        type="button"
        role="menuitem"
        class="danger"
        onclick={() => {
          open = false
          onremove()
        }}>Remove from library…</button
      >
    </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
  }
  .trigger {
    background: none;
    border: none;
    padding: 0 var(--space-2);
    cursor: pointer;
    color: var(--color-text-muted);
  }
  .items {
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 10;
    display: flex;
    flex-direction: column;
    min-width: 180px;
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2);
    padding: var(--space-1);
  }
  .items button {
    background: none;
    border: none;
    text-align: left;
    padding: var(--space-2);
    border-radius: var(--radius-1);
    cursor: pointer;
  }
  .items button:hover {
    background: var(--color-selected);
  }
  .danger {
    color: var(--color-danger);
  }
</style>

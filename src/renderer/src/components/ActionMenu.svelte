<script lang="ts">
  export interface MenuAction {
    readonly label: string
    readonly danger?: boolean
    readonly onselect: () => void
  }

  interface Props {
    label: string
    actions: readonly MenuAction[]
  }

  let { label, actions }: Props = $props()
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
    aria-label={label}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}>⋮</button
  >
  {#if open}
    <div class="items" role="menu" aria-label={label}>
      {#each actions as action (action.label)}
        <button
          type="button"
          role="menuitem"
          class:danger={action.danger}
          onclick={() => {
            open = false
            action.onselect()
          }}>{action.label}</button
        >
      {/each}
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
    color: inherit;
    font-size: 1.1rem;
    line-height: 1;
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
    color: var(--color-text);
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

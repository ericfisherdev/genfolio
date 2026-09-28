<script lang="ts">
  import { getAppServices } from '../lib/app-context'

  const { library } = getAppServices()
</script>

{#if library.notice}
  <div class="notice" role="status">
    <span>{library.notice}</span>
    <button type="button" aria-label="Dismiss" onclick={() => library.dismissNotice()}>✕</button>
  </div>
{/if}

<style>
  .notice {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin: var(--space-3) var(--space-5) 0;
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2);
  }
  button {
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-muted);
  }
</style>

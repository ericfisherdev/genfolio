<script lang="ts">
  import { SortOrder } from '@shared/gallery-kinds'
  import { getAppServices } from '../lib/app-context'

  const LABELS: Record<SortOrder, string> = {
    [SortOrder.Newest]: 'Newest',
    [SortOrder.Oldest]: 'Oldest',
    [SortOrder.RecentlyAdded]: 'Recently added',
    [SortOrder.FileName]: 'File name'
  }

  const { sort } = getAppServices()
</script>

<label class="sort">
  <span class="visually-hidden">Sort by</span>
  <span aria-hidden="true">⇅</span>
  <select
    value={sort.current}
    onchange={(event) => sort.set(event.currentTarget.value as SortOrder)}
  >
    {#each Object.values(SortOrder) as order (order)}
      <option value={order}>{LABELS[order]}</option>
    {/each}
  </select>
</label>

<style>
  .sort {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-weight: 600;
  }
  select {
    background: transparent;
    border: none;
    font-weight: 600;
    cursor: pointer;
    field-sizing: content;
  }
  option {
    background: var(--color-surface);
  }
</style>

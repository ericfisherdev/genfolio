<script lang="ts">
  import { SortOrder } from '@shared/gallery-kinds'
  import { getAppServices } from '../lib/app-context'
  import { RouteKind } from '../lib/routing/route'

  const LABELS: Record<SortOrder, string> = {
    [SortOrder.AlbumOrder]: 'Album order',
    [SortOrder.Newest]: 'Newest',
    [SortOrder.Oldest]: 'Oldest',
    [SortOrder.RecentlyAdded]: 'Recently added',
    [SortOrder.FileName]: 'File name',
    [SortOrder.Rating]: 'Rating'
  }

  const { sort, router } = getAppServices()
  // Albums keep their own order preference; album order means nothing elsewhere.
  const inAlbum = $derived(router.route.kind === RouteKind.Album)
  const orders = $derived(
    Object.values(SortOrder).filter((order) => inAlbum || order !== SortOrder.AlbumOrder)
  )

  function choose(order: SortOrder): void {
    if (inAlbum) sort.setAlbum(order)
    else sort.set(order)
  }
</script>

<label class="sort">
  <span class="visually-hidden">Sort by</span>
  <span aria-hidden="true">⇅</span>
  <select
    value={inAlbum ? sort.album : sort.current}
    onchange={(event) => choose(event.currentTarget.value as SortOrder)}
  >
    {#each orders as order (order)}
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

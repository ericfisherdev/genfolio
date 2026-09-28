<script lang="ts">
  import { createVirtualizer } from '@tanstack/svelte-virtual'
  import { tick, untrack } from 'svelte'
  import { getAppServices } from '../lib/app-context'
  import { cardHeight, GRID_GAP, gridGeometry } from '../lib/gallery/grid-geometry'
  import { queryForRoute, queryKey } from '../lib/gallery/gallery-query'
  import { RouteKind } from '../lib/routing/route'
  import GalleryCard from './GalleryCard.svelte'

  const { gallery, router, sort, library, scans, api } = getAppServices()

  let scroller: HTMLDivElement | undefined = $state()
  let width = $state(0)
  const geometry = $derived(gridGeometry(width))

  const virtualizer = createVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: 0,
    getScrollElement: () => scroller ?? null,
    estimateSize: () => 300,
    overscan: 6,
    lanes: 1,
    gap: GRID_GAP
  })

  // Load the query for the current route and sort; image routes keep the current results.
  let loadedOnMount = false
  $effect(() => {
    const query = queryForRoute(
      router.route,
      sort.current,
      untrack(() => gallery.query)
    )
    if (!query || queryKey(query) === untrack(() => gallery.key)) return
    untrack(() => {
      onscroll()
      void gallery.load(query)
      loadedOnMount = true
    })
  })

  // A changed root list (scan finished, root added or removed) means the results changed.
  // On mount, reload unless the route effect above has just loaded: the results may be from
  // before roots changed while the gallery was not mounted.
  let rootsSeen = false
  $effect(() => {
    void library.roots
    if (!rootsSeen) {
      rootsSeen = true
      if (loadedOnMount) return
    }
    untrack(() => void gallery.reload())
  })

  // Resize every card from the layout whenever columns, width or results change.
  $effect(() => {
    const { lanes, columnWidth } = geometry
    const count = gallery.count
    void gallery.layout
    untrack(() => {
      $virtualizer.setOptions({
        count,
        lanes,
        estimateSize: (index) => {
          const size = gallery.sizeAt(index)
          return cardHeight(columnWidth, size.width, size.height)
        }
      })
      $virtualizer.measure()
    })
  })

  // Return to where the user was in this view once the grid is laid out. Until then, scroll
  // events (the virtualizer's own mount scroll, or clamping while the grid is still empty)
  // must not overwrite the remembered position.
  let restoredLayout: Int32Array | undefined
  $effect(() => {
    const layout = gallery.layout
    if (width === 0 || restoredLayout === layout) return
    const saved = untrack(() => gallery.savedScroll())
    void tick().then(() => {
      if (!scroller) return
      scroller.scrollTop = saved
      restoredLayout = layout
    })
  })

  function onscroll(): void {
    if (scroller && restoredLayout === gallery.layout) gallery.rememberScroll(scroller.scrollTop)
  }

  const items = $derived($virtualizer.getVirtualItems())

  // Fetch card details for what is on screen (plus overscan).
  $effect(() => {
    const ids = items.map((item) => gallery.idAt(item.index))
    untrack(() => void gallery.ensureCards(ids))
  })

  const open = (imageId: number): void => router.navigate({ kind: RouteKind.Image, imageId })
</script>

<div class="scroller" bind:this={scroller} {onscroll}>
  <!-- Measured inside the padding, so columns fill the content box exactly. -->
  <div class="content" bind:clientWidth={width}>
    {#if gallery.loadError}
      <div class="empty" role="alert">
        <p>The images could not be loaded: {gallery.loadError}</p>
        <button type="button" onclick={() => gallery.reload()}>Retry</button>
      </div>
    {:else if gallery.count === 0 && !gallery.loading}
      <p class="empty">
        {scans.isScanning
          ? 'Scanning… images appear here when the scan finishes.'
          : 'No images here yet.'}
      </p>
    {:else}
      <div
        class="canvas"
        role="list"
        aria-label="Images"
        style:height={`${$virtualizer.getTotalSize()}px`}
      >
        {#each items as item (item.key)}
          {@const imageId = gallery.idAt(item.index)}
          <div
            class="slot"
            role="listitem"
            style:width={`${geometry.columnWidth}px`}
            style:height={`${item.size}px`}
            style:transform={`translate(${item.lane * (geometry.columnWidth + GRID_GAP)}px, ${item.start}px)`}
          >
            <GalleryCard
              {imageId}
              card={gallery.card(imageId)}
              onopen={() => open(imageId)}
              onreveal={() => library.fileAction('show the file', () => api.revealImage(imageId))}
              oncopypath={() =>
                library.fileAction('copy the path', () => api.copyImagePath(imageId))}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .scroller {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5);
    box-sizing: border-box;
  }
  .content {
    width: 100%;
  }
  .canvas {
    position: relative;
    width: 100%;
  }
  .slot {
    position: absolute;
    top: 0;
    left: 0;
  }
  /* Each slot's transform makes a stacking context; lift the one whose menu is open. */
  .slot:has(:global([aria-expanded='true'])) {
    z-index: 1;
  }
  .empty button {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
  }
  .empty {
    color: var(--color-text-muted);
  }
</style>

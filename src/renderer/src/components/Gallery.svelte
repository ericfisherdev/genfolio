<script lang="ts">
  import { createVirtualizer } from '@tanstack/svelte-virtual'
  import { tick, untrack } from 'svelte'
  import { AlbumKind } from '@shared/albums'
  import { GalleryScopeKind } from '@shared/gallery-kinds'
  import { getAppServices } from '../lib/app-context'
  import { cardHeight, GRID_GAP, gridGeometry } from '../lib/gallery/grid-geometry'
  import { samePromptRoute } from '../lib/gallery/find-similar'
  import { queryForRoute, queryKey } from '../lib/gallery/gallery-query'
  import { isGalleryRoute, routeFilters, RouteKind, withFilters } from '../lib/routing/route'
  import { DeleteMode } from '@shared/deletion-kinds'
  import { AlbumArranger } from '../lib/gallery/album-arranger.svelte'
  import { actionTargets } from '../lib/gallery/card-targets'
  import type { MenuAction } from './ActionMenu.svelte'
  import AddToAlbumDialog from './AddToAlbumDialog.svelte'
  import GalleryCard from './GalleryCard.svelte'

  const {
    gallery,
    router,
    sort,
    library,
    scans,
    api,
    copier,
    facets,
    marks,
    selection,
    albums,
    deletion
  } = getAppServices()

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
  $effect(() => {
    const query = queryForRoute(
      router.route,
      sort,
      untrack(() => gallery.query),
      (albumId) => albums.find(albumId)?.kind === AlbumKind.Smart
    )
    if (!query) return
    // A mark made on the detail page may have changed which images these results hold.
    const stale = untrack(() => gallery.layoutStale)
    if (!stale && queryKey(query) === untrack(() => gallery.key)) return
    untrack(() => {
      onscroll()
      void gallery.load(query)
      void facets.load(query)
    })
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

  // A new query (scope, filters, sort) starts with nothing selected.
  $effect(() => {
    void gallery.key
    untrack(() => selection.clear())
  })

  /** Ctrl/Cmd+A selects every result; Escape clears the selection. Fields keep their keys. */
  function onkeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return
    const target = event.target
    if (target instanceof Element && target.closest('input, select, textarea, dialog')) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') selection.selectAll()
    else if (event.key === 'Escape' && selection.count > 0) selection.clear()
    else return
    event.preventDefault()
  }
  let adding: readonly number[] | undefined = $state()
  const arranger = new AlbumArranger(albums, gallery, selection, (ids) => (adding = ids))

  /** Opens the image's look-alike group, when it is in one. */
  function openSimilar(imageId: number): void {
    const groupId = gallery.card(imageId)?.similarGroupId
    if (groupId) router.navigate({ kind: RouteKind.SimilarGroup, groupId })
  }

  function similarActions(imageId: number): MenuAction[] {
    return gallery.card(imageId)?.similarGroupId
      ? [{ label: 'Find similar', onselect: () => openSimilar(imageId) }]
      : []
  }

  function deleteActions(imageId: number): MenuAction[] {
    const remove = (mode: DeleteMode) => () =>
      void deletion.delete(actionTargets(selection, imageId), mode)
    return [
      { label: 'Move to trash', danger: true, onselect: remove(DeleteMode.Trash) },
      { label: 'Delete permanently…', danger: true, onselect: remove(DeleteMode.Permanent) }
    ]
  }

  /** Whether a drag is over the far half of the slot, which drops after its image. */
  const overFarHalf = (event: DragEvent): boolean => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    return event.clientX - rect.left > rect.width / 2
  }

  const filtered = $derived(routeFilters(router.route) !== undefined)
  function clearFilters(): void {
    if (isGalleryRoute(router.route)) router.navigate(withFilters(router.route, undefined))
  }
</script>

<svelte:window {onkeydown} />

<div class="scroller" bind:this={scroller} {onscroll}>
  <!-- Measured inside the padding, so columns fill the content box exactly. -->
  <div class="content" bind:clientWidth={width}>
    {#if gallery.loadError}
      <div class="empty" role="alert">
        <p>The images could not be loaded: {gallery.loadError}</p>
        <button type="button" onclick={() => gallery.reload()}>Retry</button>
      </div>
    {:else if gallery.count === 0 && !gallery.loading && filtered}
      <div class="empty">
        <p>No images match these filters.</p>
        <button type="button" onclick={clearFilters}>Clear filters</button>
      </div>
    {:else if gallery.count === 0 && !gallery.loading}
      <p class="empty">
        {#if gallery.query?.scope.kind === GalleryScopeKind.Album}
          This album is empty. Add images to it with “Add to album…” on a card or a selection.
        {:else if scans.isScanning}
          Scanning… images appear here when the scan finishes.
        {:else}
          No images here yet.
        {/if}
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
            draggable={arranger.arrangeable !== undefined}
            class:drop-before={arranger.dropAt?.imageId === imageId && !arranger.dropAt.after}
            class:drop-after={arranger.dropAt?.imageId === imageId && arranger.dropAt.after}
            ondragstart={(event) => arranger.dragStart(event, imageId)}
            ondragover={(event) => arranger.dragOver(event, imageId, overFarHalf(event))}
            ondrop={(event) => arranger.drop(event)}
            ondragend={() => arranger.dragEnd()}
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
              oncopy={(variant) => copier.copy(imageId, variant)}
              onsameprompt={() => router.navigate(samePromptRoute(imageId))}
              onfavorite={(favorite) => marks.setFavorite([imageId], favorite)}
              onrate={(rating) => marks.setRating([imageId], rating)}
              selected={selection.has(imageId)}
              selecting={selection.count > 0}
              onselect={(range) =>
                range ? selection.extendTo(imageId) : selection.toggle(imageId)}
              onsimilar={() => openSimilar(imageId)}
              moreActions={[
                ...similarActions(imageId),
                ...arranger.cardActions(imageId),
                ...deleteActions(imageId)
              ]}
            />
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<AddToAlbumDialog imageIds={adding} onclose={() => (adding = undefined)} />

<style>
  .drop-before {
    box-shadow: -4px 0 0 var(--color-accent);
  }
  .drop-after {
    box-shadow: 4px 0 0 var(--color-accent);
  }
  .scroller {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    /* A scrollbar that comes and goes would change the width, re-lay out the columns and
       change the height again: near the fold that loops and the cards never settle. */
    scrollbar-gutter: stable;
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

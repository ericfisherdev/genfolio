<script lang="ts">
  import { getAppServices } from '../lib/app-context'
  import { routeFilters, RouteKind } from '../lib/routing/route'
  import { findDirectory } from '../lib/routing/scope-title'
  import Gallery from './Gallery.svelte'

  const { library, router, gallery, albums, similarity } = getAppServices()
  const filtered = $derived(routeFilters(router.route) !== undefined)
  const count = new Intl.NumberFormat()

  const directoryExists = $derived(
    router.route.kind !== RouteKind.Directory ||
      findDirectory(library.roots, library.trees, router.route.directoryId) !== undefined
  )
  const albumMissing = $derived(
    router.route.kind === RouteKind.Album &&
      albums.loaded &&
      albums.find(router.route.albumId) === undefined
  )

  const inScope = $derived.by(() => {
    const route = router.route
    if (route.kind === RouteKind.Album) return albums.find(route.albumId)?.imageCount ?? 0
    if (route.kind === RouteKind.SimilarGroup) {
      return similarity.sizeOf(route.groupId) ?? gallery.count
    }
    if (route.kind !== RouteKind.Directory) return library.totalImages
    const match = findDirectory(library.roots, library.trees, route.directoryId)
    if (!match) return 0
    return route.recursive ? match.node.totalImageCount : match.node.imageCount
  })
</script>

<section class="library-view" aria-label="Library contents">
  {#if !library.loaded && library.loadError}
    <div class="empty" role="alert">
      <h2>The library could not be loaded</h2>
      <p>{library.loadError}</p>
      <button type="button" class="primary" onclick={() => library.refresh()}>Retry</button>
    </div>
  {:else if !library.loaded}
    <p class="muted">Loading library…</p>
  {:else if router.route.kind === RouteKind.Directory && !directoryExists}
    <p class="muted">This folder is no longer in the library.</p>
  {:else if albumMissing}
    <p class="muted">This album no longer exists.</p>
  {:else if library.roots.length === 0}
    <div class="empty">
      <h2>Your library is empty</h2>
      <p>Add a folder of generated images. Genfolio indexes it and every folder inside it.</p>
      <button type="button" class="primary" onclick={() => library.addFolder()}>Add folder</button>
    </div>
  {:else}
    <p class="summary" aria-live="polite">
      <!-- The layout of the previous query stays on screen until the filtered one arrives. -->
      {#if filtered && gallery.loading}
        Filtering…
      {:else if filtered}
        {count.format(gallery.count)} of {count.format(inScope)} images
      {:else}
        {count.format(inScope)} images
      {/if}
    </p>
    <Gallery />
  {/if}
</section>

<style>
  .library-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }
  .library-view > :global(p),
  .library-view > :global(div[role='alert']) {
    padding: 0 var(--space-5);
  }
  .summary {
    margin: var(--space-3) 0 0;
    font-size: 0.85rem;
  }
  .muted,
  .summary {
    color: var(--color-text-muted);
  }
  .empty {
    max-width: 420px;
    margin: 12vh auto 0;
    text-align: center;
  }
  .empty h2 {
    margin-bottom: var(--space-2);
  }
  .primary {
    margin-top: var(--space-3);
    background: var(--color-accent);
    color: var(--color-accent-contrast);
    border: none;
    border-radius: var(--radius-2);
    padding: var(--space-2) var(--space-4);
    font-weight: 600;
    cursor: pointer;
  }
</style>

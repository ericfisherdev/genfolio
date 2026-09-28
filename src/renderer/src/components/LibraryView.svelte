<script lang="ts">
  import { getAppServices } from '../lib/app-context'
  import { RouteKind } from '../lib/routing/route'
  import { findDirectory } from '../lib/routing/scope-title'

  const { library, router } = getAppServices()
  const count = new Intl.NumberFormat()

  const inScope = $derived.by(() => {
    const route = router.route
    if (route.kind !== RouteKind.Directory) return library.totalImages
    const match = findDirectory(library.roots, library.trees, route.directoryId)
    if (!match) return 0
    return route.recursive ? match.node.totalImageCount : match.node.imageCount
  })
</script>

<section class="library-view" aria-label="Library contents">
  {#if !library.loaded}
    <p class="muted">Loading library…</p>
  {:else if library.roots.length === 0}
    <div class="empty">
      <h2>Your library is empty</h2>
      <p>Add a folder of generated images. Genfolio indexes it and every folder inside it.</p>
      <button type="button" class="primary" onclick={() => library.addFolder()}>Add folder</button>
    </div>
  {:else}
    <p class="summary">{count.format(inScope)} images</p>
  {/if}
</section>

<style>
  .library-view {
    padding: var(--space-5);
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

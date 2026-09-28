<script lang="ts">
  import { getAppServices } from '../lib/app-context'
  import { RouteKind } from '../lib/routing/route'
  import { directoryTitle, findDirectory } from '../lib/routing/scope-title'
  import ScanIndicator from './ScanIndicator.svelte'
  import SortMenu from './SortMenu.svelte'

  const { router, library, albums } = getAppServices()

  const directory = $derived(
    router.route.kind === RouteKind.Directory
      ? findDirectory(library.roots, library.trees, router.route.directoryId)
      : undefined
  )
  const title = $derived.by(() => {
    if (directory) return directoryTitle(directory)
    if (router.route.kind === RouteKind.Directory && library.loaded) return 'Folder not found'
    if (router.route.kind === RouteKind.Album) {
      const album = albums.find(router.route.albumId)
      if (album) return album.name
      return albums.loaded ? 'Album not found' : ''
    }
    return 'All Photos'
  })

  function setRecursive(recursive: boolean): void {
    if (router.route.kind === RouteKind.Directory) router.navigate({ ...router.route, recursive })
  }
</script>

<header class="top-bar">
  <h1>{title}</h1>
  <ScanIndicator />
  <div class="controls">
    {#if router.route.kind === RouteKind.Directory && directory && directory.node.children.length > 0}
      <label class="subfolders">
        <input
          type="checkbox"
          checked={router.route.recursive}
          onchange={(event) => setRecursive(event.currentTarget.checked)}
        />
        Include subfolders
      </label>
    {/if}
    <SortMenu />
  </div>
</header>

<style>
  .top-bar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }
  h1 {
    margin: 0;
    font-size: 1.15rem;
    white-space: nowrap;
  }
  .controls {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }
  .subfolders {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-text-muted);
  }
</style>

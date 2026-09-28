<script lang="ts">
  import { untrack } from 'svelte'
  import { GalleryScopeKind } from '@shared/gallery-kinds'
  import { getAppServices } from '../lib/app-context'
  import { RouteKind } from '../lib/routing/route'
  import BulkBar from './BulkBar.svelte'
  import DeleteReportDialog from './DeleteReportDialog.svelte'
  import DetailView from './DetailView.svelte'
  import FilterBar from './FilterBar.svelte'
  import LibraryView from './LibraryView.svelte'
  import NoticeBar from './NoticeBar.svelte'
  import Sidebar from './Sidebar.svelte'
  import SimilarGroupsView from './SimilarGroupsView.svelte'
  import SlideshowView from './SlideshowView.svelte'
  import TopBar from './TopBar.svelte'

  const { library, scans, router, gallery, facets, tags, selection, albums, similarity } =
    getAppServices()

  // A changed root list (scan finished, folder added, rescanned or removed) means the results
  // changed, whether the gallery or the detail view is on screen. The shell stays mounted in
  // both, so the reload lives here. The first run is the mount, before any results exist.
  let rootsSeen = false
  $effect(() => {
    void library.roots
    if (!rootsSeen) {
      rootsSeen = true
      return
    }
    untrack(() => {
      void gallery.reload()
      if (gallery.query) void facets.load(gallery.query)
    })
  })

  // Tag and album counts change when scans add or remove images.
  $effect(() => {
    void library.roots
    untrack(() => {
      void tags.load()
      void albums.load()
    })
  })

  // A smart album's size is evaluated, so whenever an album view's results reload (it opened,
  // or marks, tags or a scan changed them), reload the albums for current counts.
  $effect(() => {
    void gallery.layout
    if (untrack(() => gallery.query?.scope.kind) === GalleryScopeKind.Album) {
      untrack(() => void albums.load())
    }
  })

  // Hashing ends with regrouped look-alikes: counts on cards and in the sidebar change.
  let wasHashing = false
  $effect(() => {
    const hashing = scans.hashing !== undefined
    if (wasHashing && !hashing) {
      untrack(() => {
        void similarity.load()
        void gallery.reload()
      })
    }
    wasHashing = hashing
  })

  // Look-alike counts change when scans add or remove images.
  $effect(() => {
    void library.roots
    untrack(() => void similarity.load())
  })

  // Cancelled scans send no end event; forget progress for roots that are gone.
  $effect(() => {
    const ids = library.roots.map((root) => root.id)
    untrack(() => scans.retain(ids))
  })
</script>

{#if router.route.kind === RouteKind.Slideshow}
  <SlideshowView />
{/if}
<div class="shell" inert={router.route.kind === RouteKind.Slideshow}>
  <Sidebar />
  <main>
    {#if router.route.kind === RouteKind.Image}
      <DetailView />
    {:else}
      <TopBar />
      {#if selection.count > 0}
        <BulkBar />
      {:else}
        <FilterBar />
      {/if}
      <NoticeBar />
      {#if router.route.kind === RouteKind.SimilarGroups}
        <SimilarGroupsView />
      {:else}
        <LibraryView />
      {/if}
    {/if}
  </main>
</div>

<DeleteReportDialog />

<style>
  .shell {
    display: grid;
    grid-template-columns: var(--sidebar-width) 1fr;
    height: 100%;
  }
  main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }
</style>

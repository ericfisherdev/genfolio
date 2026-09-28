<script lang="ts">
  import { untrack } from 'svelte'
  import { getAppServices } from '../lib/app-context'
  import { RouteKind } from '../lib/routing/route'
  import DetailView from './DetailView.svelte'
  import FilterBar from './FilterBar.svelte'
  import LibraryView from './LibraryView.svelte'
  import NoticeBar from './NoticeBar.svelte'
  import Sidebar from './Sidebar.svelte'
  import TopBar from './TopBar.svelte'

  const { library, scans, router, gallery, facets, tags } = getAppServices()

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

  // Tag counts change when scans add or remove images.
  $effect(() => {
    void library.roots
    untrack(() => void tags.load())
  })

  // Cancelled scans send no end event; forget progress for roots that are gone.
  $effect(() => {
    const ids = library.roots.map((root) => root.id)
    untrack(() => scans.retain(ids))
  })
</script>

<div class="shell">
  <Sidebar />
  <main>
    {#if router.route.kind === RouteKind.Image}
      <DetailView />
    {:else}
      <TopBar />
      <FilterBar />
      <NoticeBar />
      <LibraryView />
    {/if}
  </main>
</div>

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

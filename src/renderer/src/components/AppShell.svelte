<script lang="ts">
  import { untrack } from 'svelte'
  import { getAppServices } from '../lib/app-context'
  import LibraryView from './LibraryView.svelte'
  import NoticeBar from './NoticeBar.svelte'
  import Sidebar from './Sidebar.svelte'
  import TopBar from './TopBar.svelte'

  const { library, scans } = getAppServices()

  // Cancelled scans send no end event; forget progress for roots that are gone.
  $effect(() => {
    const ids = library.roots.map((root) => root.id)
    untrack(() => scans.retain(ids))
  })
</script>

<div class="shell">
  <Sidebar />
  <main>
    <TopBar />
    <NoticeBar />
    <LibraryView />
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

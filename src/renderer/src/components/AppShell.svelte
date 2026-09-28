<script lang="ts">
  import LibraryView from './LibraryView.svelte'
  import NoticeBar from './NoticeBar.svelte'
  import Sidebar from './Sidebar.svelte'
  import TopBar from './TopBar.svelte'
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

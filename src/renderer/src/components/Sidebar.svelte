<script lang="ts">
  import { getAppServices } from '../lib/app-context'
  import { folderName } from '../lib/format/folder-name'
  import { ALL_PHOTOS, RouteKind, routeFilters, withFilters } from '../lib/routing/route'
  import ConfirmDialog from './ConfirmDialog.svelte'
  import DirectoryTree from './DirectoryTree.svelte'
  import RootMenu from './RootMenu.svelte'
  import ServiceStatus from './ServiceStatus.svelte'
  import SidebarAlbums from './SidebarAlbums.svelte'
  import SidebarTags from './SidebarTags.svelte'

  const { library, router } = getAppServices()
  const count = new Intl.NumberFormat()

  let removing: { id: number; label: string; path: string } | undefined = $state()

  const selectedDirectory = $derived(
    router.route.kind === RouteKind.Directory ? router.route.directoryId : undefined
  )

  function openDirectory(directoryId: number): void {
    const recursive = router.route.kind === RouteKind.Directory ? router.route.recursive : true
    // Filters carry across folders: they narrow whatever scope is chosen.
    router.navigate(
      withFilters({ kind: RouteKind.Directory, directoryId, recursive }, routeFilters(router.route))
    )
  }

  async function confirmRemove(): Promise<void> {
    const target = removing
    removing = undefined
    if (!target) return
    await library.remove(target.id)
    router.navigate(ALL_PHOTOS)
  }
</script>

<nav class="sidebar" aria-label="Library">
  <button
    type="button"
    class="all"
    aria-current={router.route.kind === RouteKind.All ? 'page' : undefined}
    onclick={() =>
      router.navigate(withFilters({ kind: RouteKind.All }, routeFilters(router.route)))}
  >
    <span>All Photos</span>
    <span class="count">{count.format(library.totalImages)}</span>
  </button>

  <h2>Folders</h2>
  <div class="roots">
    {#each library.roots as root (root.id)}
      {@const label = folderName(root.path)}
      {@const tree = library.trees[root.id]}
      <section class="root" aria-label={label} title={root.path}>
        <div class="root-tree">
          {#if tree}
            <DirectoryTree
              {tree}
              rootLabel={label}
              selectedId={selectedDirectory}
              onselect={openDirectory}
            />
          {:else}
            <p class="empty-root">{label} — {root.scanning ? 'scanning…' : 'no images'}</p>
          {/if}
          <RootMenu
            rootLabel={label}
            onrescan={() => library.rescan(root.id)}
            onremove={() => (removing = { id: root.id, label, path: root.path })}
          />
        </div>
      </section>
    {/each}
  </div>

  <button type="button" class="add" onclick={() => library.addFolder()}>+ Add folder</button>

  <SidebarAlbums />
  <SidebarTags />

  <details class="diagnostics">
    <summary>Library service</summary>
    <ServiceStatus />
  </details>
</nav>

<ConfirmDialog
  open={removing !== undefined}
  title={`Remove ${removing?.label ?? ''} from the library?`}
  message={`Genfolio will forget this folder and everything recorded for its images, including favourites, ratings, tags and album entries. The files in ${removing?.path ?? ''} stay on disk and are not deleted.`}
  confirmLabel="Remove"
  onconfirm={confirmRemove}
  oncancel={() => (removing = undefined)}
/>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    height: 100%;
    box-sizing: border-box;
    padding: var(--space-3);
    background: var(--color-surface);
    border-right: 1px solid var(--color-border);
    overflow-y: auto;
  }
  h2 {
    margin: var(--space-3) 0 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }
  .all,
  .add {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: none;
    border: none;
    border-radius: var(--radius-1);
    padding: var(--space-2);
    cursor: pointer;
    text-align: left;
  }
  .all:hover,
  .add:hover {
    background: var(--color-surface-raised);
  }
  .all[aria-current='page'] {
    background: var(--color-selected);
    font-weight: 600;
  }
  .add {
    color: var(--color-accent);
    font-weight: 600;
  }
  .count {
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }
  .roots {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .root-tree {
    display: flex;
    align-items: flex-start;
  }
  .root-tree :global(ul[role='tree']) {
    flex: 1;
    min-width: 0;
  }
  .empty-root {
    flex: 1;
    margin: 0;
    padding: 3px var(--space-2);
    color: var(--color-text-muted);
  }
  .diagnostics {
    margin-top: auto;
    font-size: 0.8rem;
    color: var(--color-text-muted);
  }
  .diagnostics summary {
    cursor: pointer;
    padding: var(--space-2) 0;
  }
</style>

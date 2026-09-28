<script lang="ts">
  import { MAX_ALBUM_NAME, type Album } from '@shared/albums'
  import { getAppServices } from '../lib/app-context'
  import { RouteKind } from '../lib/routing/route'
  import ActionMenu from './ActionMenu.svelte'
  import ConfirmDialog from './ConfirmDialog.svelte'
  import PromptDialog from './PromptDialog.svelte'

  const { albums, router } = getAppServices()
  const count = new Intl.NumberFormat()

  let creating = $state(false)
  let renaming: Album | undefined = $state()
  let deleting: Album | undefined = $state()

  const openAlbum = (album: Album): void =>
    router.navigate({ kind: RouteKind.Album, albumId: album.id })
  const current = (album: Album): boolean =>
    router.route.kind === RouteKind.Album && router.route.albumId === album.id

  async function create(name: string): Promise<void> {
    creating = false
    // A name that is taken opens that album rather than failing.
    const album = await albums.ensure(name)
    if (album) openAlbum(album)
  }

  async function rename(name: string): Promise<void> {
    const album = renaming
    renaming = undefined
    if (album) await albums.rename(album, name)
  }

  async function remove(): Promise<void> {
    const album = deleting
    deleting = undefined
    if (!album) return
    await albums.delete(album)
    if (current(album)) router.navigate({ kind: RouteKind.All })
  }
</script>

<div class="heading">
  <h2>Albums</h2>
  <button type="button" class="new" aria-label="New album" onclick={() => (creating = true)}
    >+</button
  >
</div>
{#if albums.albums.length > 0}
  <ul class="albums" aria-label="Albums">
    {#each albums.albums as album (album.id)}
      <li>
        <button
          type="button"
          class="album"
          aria-current={current(album) ? 'page' : undefined}
          onclick={() => openAlbum(album)}
        >
          <span class="name">{album.name}</span>
          <span class="count">{count.format(album.imageCount)}</span>
        </button>
        <ActionMenu
          label={`Actions for album ${album.name}`}
          actions={[
            { label: 'Rename…', onselect: () => (renaming = album) },
            { label: 'Delete…', danger: true, onselect: () => (deleting = album) }
          ]}
        />
      </li>
    {/each}
  </ul>
{/if}

<PromptDialog
  open={creating}
  title="New album"
  label="Name"
  initial=""
  confirmLabel="Create"
  maxlength={MAX_ALBUM_NAME}
  onconfirm={(name) => void create(name)}
  oncancel={() => (creating = false)}
/>

<PromptDialog
  open={renaming !== undefined}
  title="Rename album"
  label="Name"
  initial={renaming?.name ?? ''}
  confirmLabel="Rename"
  maxlength={MAX_ALBUM_NAME}
  onconfirm={(name) => void rename(name)}
  oncancel={() => (renaming = undefined)}
/>

<ConfirmDialog
  open={deleting !== undefined}
  title={`Delete the album “${deleting?.name ?? ''}”?`}
  message="Only the album goes. Its images stay in the library, with their favourites, ratings and tags."
  confirmLabel="Delete"
  onconfirm={() => void remove()}
  oncancel={() => (deleting = undefined)}
/>

<style>
  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: var(--space-3);
  }
  h2 {
    margin: 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }
  .new {
    padding: 0 var(--space-2);
    background: none;
    border: none;
    border-radius: var(--radius-1);
    color: var(--color-accent);
    font-size: 1.1rem;
    font-weight: 600;
    cursor: pointer;
  }
  .new:hover {
    background: var(--color-surface-raised);
  }
  .albums {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li {
    display: flex;
    align-items: center;
  }
  .album {
    flex: 1;
    display: flex;
    justify-content: space-between;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    background: none;
    border: none;
    border-radius: var(--radius-1);
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .album:hover {
    background: var(--color-surface-raised);
  }
  .album[aria-current='page'] {
    background: var(--color-selected);
    font-weight: 600;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .count {
    color: var(--color-text-muted);
  }
</style>

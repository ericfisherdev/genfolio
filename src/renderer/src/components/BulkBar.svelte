<script lang="ts">
  import { MAX_TAG_NAME } from '@shared/tag-kinds'
  import type { Tag } from '@shared/tags'
  import { AlbumKind } from '@shared/albums'
  import { GalleryScopeKind } from '@shared/gallery-kinds'
  import { getAppServices } from '../lib/app-context'
  import RatingStars from './RatingStars.svelte'
  import AddToAlbumDialog from './AddToAlbumDialog.svelte'
  import NameCombobox from './NameCombobox.svelte'

  const { selection, marks, tags, library, gallery, albums } = getAppServices()
  let adding: readonly number[] | undefined = $state()
  const shownAlbum = $derived(
    gallery.query?.scope.kind === GalleryScopeKind.Album
      ? albums.find(gallery.query.scope.albumId)
      : undefined
  )
  const count = new Intl.NumberFormat()
  const selected = $derived(selection.count)
  const images = (n: number): string => `${count.format(n)} image${n === 1 ? '' : 's'}`

  /** Runs a bulk action on the selection and confirms it in the notice bar when it worked. */
  async function onSelection(
    action: (ids: number[]) => Promise<boolean>,
    done: (n: number) => string
  ): Promise<void> {
    const ids = selection.list()
    if (await action(ids)) library.notify(done(ids.length))
  }

  async function tag(choice: Tag | string): Promise<void> {
    const chosen = typeof choice === 'string' ? await tags.ensure(choice) : choice
    if (!chosen) return
    await onSelection(
      (ids) => tags.apply([chosen], ids),
      (n) => `Tagged ${images(n)} with “${chosen.name}”.`
    )
  }
</script>

<div class="bulk-bar" role="toolbar" aria-label="Selected images">
  <span class="count" aria-live="polite">{images(selected)} selected</span>
  <button
    type="button"
    onclick={() =>
      onSelection(
        (ids) => marks.setFavorite(ids, true),
        (n) => `Added ${images(n)} to favourites.`
      )}>♥ Favourite</button
  >
  <button
    type="button"
    onclick={() =>
      onSelection(
        (ids) => marks.setFavorite(ids, false),
        (n) => `Removed ${images(n)} from favourites.`
      )}>♡ Unfavourite</button
  >
  <span class="rate">
    Rate
    <RatingStars
      rating={0}
      label="Rate the selected images"
      onrate={(rating) =>
        onSelection(
          (ids) => marks.setRating(ids, rating),
          (n) =>
            rating === 0
              ? `Cleared the rating of ${images(n)}.`
              : `Rated ${images(n)} ${'★'.repeat(rating)}.`
        )}
    />
  </span>
  <div class="tag">
    <NameCombobox
      items={tags.tags}
      excluded={[]}
      onpick={(choice) => void tag(choice)}
      maxName={MAX_TAG_NAME}
      label="Tag them"
      listLabel="Tags"
    />
  </div>
  <button type="button" onclick={() => (adding = selection.list())}>Add to album…</button>
  {#if shownAlbum?.kind === AlbumKind.Manual}
    {@const album = shownAlbum}
    <button
      type="button"
      onclick={() =>
        onSelection(
          async (ids) => (await albums.remove(album, ids)) !== undefined,
          (n) => `Removed ${images(n)} from “${album.name}”.`
        )}>Remove from album</button
    >
  {/if}
  <span class="spacer"></span>
  {#if selected < gallery.count}
    <button type="button" onclick={() => selection.selectAll()}>
      Select all {count.format(gallery.count)}
    </button>
  {/if}
  <button type="button" onclick={() => selection.clear()}>Clear</button>
</div>

<AddToAlbumDialog imageIds={adding} onclose={() => (adding = undefined)} />

<style>
  .bulk-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-5);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-selected);
  }
  .count {
    font-weight: 600;
  }
  button {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
  }
  .rate {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .tag {
    width: 200px;
  }
  .spacer {
    flex: 1;
  }
</style>

<script lang="ts">
  import { untrack } from 'svelte'
  import { ImageDisplay, imageUrl } from '@shared/display-rendition'
  import { DeleteMode } from '@shared/deletion-kinds'
  import { GalleryScopeKind } from '@shared/gallery-kinds'
  import { getAppServices } from '../lib/app-context'
  import { LayoutUpdate } from '../lib/state/image-marks'
  import { filtersToFind, type FindSimilar } from '../lib/gallery/find-similar'
  import { routeForQuery } from '../lib/gallery/route-for-query'
  import { RouteKind } from '../lib/routing/route'
  import FileInfoPanel from './FileInfoPanel.svelte'
  import GenerationPanel from './GenerationPanel.svelte'
  import ImageViewer from './ImageViewer.svelte'
  import NoticeBar from './NoticeBar.svelte'
  import TagEditor from './TagEditor.svelte'

  const {
    router,
    gallery,
    sort,
    library,
    api,
    generation,
    copier,
    marks,
    deletion,
    slideshowNavigator
  } = getAppServices()
  const count = new Intl.NumberFormat()

  const imageId = $derived(router.route.kind === RouteKind.Image ? router.route.imageId : 0)
  const index = $derived(gallery.indexOf(imageId))
  const card = $derived(gallery.card(imageId))
  const size = $derived(
    index >= 0 ? gallery.sizeAt(index) : { width: card?.width ?? 1, height: card?.height ?? 1 }
  )
  const rootPath = $derived(library.roots.find((root) => root.id === card?.rootId)?.path)
  const previousId = $derived(index > 0 ? gallery.idAt(index - 1) : undefined)
  const nextId = $derived(
    index >= 0 && index < gallery.count - 1 ? gallery.idAt(index + 1) : undefined
  )

  // A deep link with no results loaded shows the image within All Photos.
  $effect(() => {
    if (untrack(() => gallery.query) === undefined) {
      void gallery.load({
        scope: { kind: GalleryScopeKind.All },
        sort: untrack(() => sort.current)
      })
    }
  })

  // Re-runs when a reload clears the card cache (so the panel never stays on "Loading") and
  // when a refresh marks cards stale; ensureCards skips the id while it is fresh.
  $effect(() => {
    const id = imageId
    void card
    void gallery.cardEpoch
    if (id > 0) untrack(() => void gallery.ensureCards([id]))
  })

  $effect(() => {
    const id = imageId
    // A finished scan or rescan (a new root list) can change this image's generation data.
    void library.roots
    if (id > 0) untrack(() => void generation.load(id))
  })

  // Decode neighbours ahead of time so stepping through feels instant.
  $effect(() => {
    for (const neighbour of [previousId, nextId]) {
      if (neighbour !== undefined) {
        const image = new Image()
        image.src = imageUrl(neighbour, ImageDisplay.Original)
        void image.decode().catch(() => undefined)
      }
    }
  })

  const show = (id: number | undefined): void => {
    if (id !== undefined) router.navigate({ kind: RouteKind.Image, imageId: id })
  }
  const back = (): void => router.navigate(routeForQuery(gallery.query))

  /** Opens All Photos filtered to images sharing what was picked with this one. */
  function find(similar: FindSimilar): void {
    const details = generation.details
    // While the next image loads, the panel still shows the previous one's data.
    if (!details || generation.loadedImageId !== imageId) return
    const filters = filtersToFind(similar, imageId, details)
    if (filters) router.navigate({ kind: RouteKind.All, filters })
  }

  /** Keys aimed at form fields, the folder tree, an open menu or a dialog are theirs. */
  const ownedByAnotherWidget = (target: EventTarget | null): boolean =>
    target instanceof Element &&
    target.closest(
      'input, select, textarea, [role="tree"], [aria-haspopup][aria-expanded="true"], dialog'
    ) !== null

  const RATING_KEY = /^[0-5]$/

  // The results stay put while stepping through them; the grid reloads them when shown.
  function setFavorite(favorite: boolean): void {
    void marks.setFavorite([imageId], favorite, LayoutUpdate.Deferred)
  }

  function setRating(rating: number): void {
    void marks.setRating([imageId], rating, LayoutUpdate.Deferred)
  }

  /** F toggles the favourite, 0–5 set the rating (0 clears it). True when the key was used. */
  function markWithKey(event: KeyboardEvent): boolean {
    if (!card || event.ctrlKey || event.metaKey || event.altKey) return false
    if (event.key === 'f' || event.key === 'F') {
      // A held key would flip the favourite on every auto-repeat.
      if (!event.repeat) setFavorite(!card.favorite)
      return true
    }
    if (RATING_KEY.test(event.key)) {
      if (!event.repeat) setRating(Number(event.key))
      return true
    }
    return false
  }

  /** Deletes the image, then shows the next one (or the previous, or the gallery). */
  async function remove(mode: DeleteMode): Promise<void> {
    const deleted = imageId
    const then = nextId ?? previousId
    const report = await deletion.delete([deleted], mode)
    const gone = report?.deleted.includes(deleted) || report?.missing.includes(deleted)
    // The viewer may have moved on while main was asking or deleting.
    if (!gone || imageId !== deleted) return
    if (then === undefined) back()
    else show(then)
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || ownedByAnotherWidget(event.target)) return
    if (event.key === 'ArrowLeft') show(previousId)
    else if (event.key === 'ArrowRight') show(nextId)
    else if (event.key === 'Escape') back()
    else if (event.key === 'Delete' && !event.repeat) {
      void remove(event.shiftKey ? DeleteMode.Permanent : DeleteMode.Trash)
    } else if (!markWithKey(event)) return
    event.preventDefault()
  }
</script>

<svelte:window {onkeydown} />

<section class="detail" aria-label="Image">
  <header class="toolbar">
    <button type="button" onclick={back}>← Back</button>
    <span class="position" aria-live="polite">
      {index >= 0 ? `${count.format(index + 1)} / ${count.format(gallery.count)}` : ''}
    </span>
    <div class="steps">
      <button
        type="button"
        aria-label="Previous image"
        disabled={previousId === undefined}
        onclick={() => show(previousId)}>‹</button
      >
      <button
        type="button"
        aria-label="Next image"
        disabled={nextId === undefined}
        onclick={() => show(nextId)}>›</button
      >
    </div>
    {#if card && card.similarGroupId !== null && card.similarCount > 0}
      {@const groupId = card.similarGroupId}
      <button
        type="button"
        title="Find similar"
        onclick={() => router.navigate({ kind: RouteKind.SimilarGroup, groupId })}
        >≈ {card.similarCount} look-alike{card.similarCount === 1 ? '' : 's'}</button
      >
    {/if}
    <button type="button" onclick={() => slideshowNavigator.start(imageId)}>▶ Slideshow</button>
    <button
      type="button"
      class="trash"
      title="Move to trash (Delete; Shift+Delete deletes permanently)"
      onclick={() => void remove(DeleteMode.Trash)}>Move to trash</button
    >
  </header>
  <NoticeBar />
  <div class="body">
    {#key imageId}
      <ImageViewer
        {imageId}
        width={size.width}
        height={size.height}
        alt={card?.fileName ?? 'Image'}
      />
    {/key}
    <div class="side">
      <GenerationPanel
        details={generation.details}
        loadError={generation.loadError}
        busy={generation.loadedImageId !== imageId}
        oncopy={(variant) => void copier.copy(imageId, variant)}
        onretry={() => void generation.retry()}
        onfind={find}
      />
      {#if card}
        <TagEditor {imageId} />
      {/if}
      <FileInfoPanel
        {card}
        {rootPath}
        onreveal={() => void library.fileAction('show the file', () => api.revealImage(imageId))}
        oncopypath={() =>
          void library.fileAction('copy the path', () => api.copyImagePath(imageId))}
        onfavorite={setFavorite}
        onrate={setRating}
      />
    </div>
  </div>
</section>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }
  .toolbar button {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
  }
  .toolbar button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .position {
    color: var(--color-text-muted);
  }
  .steps {
    margin-left: auto;
    display: flex;
    gap: var(--space-1);
  }
  .trash {
    color: var(--color-danger);
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .side {
    width: 380px;
    flex-shrink: 0;
    overflow-y: auto;
    background: var(--color-surface);
    border-left: 1px solid var(--color-border);
  }
</style>

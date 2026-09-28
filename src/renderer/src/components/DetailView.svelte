<script lang="ts">
  import { untrack } from 'svelte'
  import { ImageDisplay, imageUrl } from '@shared/display-rendition'
  import { GalleryScopeKind } from '@shared/gallery-kinds'
  import { getAppServices } from '../lib/app-context'
  import { routeForQuery } from '../lib/gallery/route-for-query'
  import { RouteKind } from '../lib/routing/route'
  import FileInfoPanel from './FileInfoPanel.svelte'
  import GenerationPanel from './GenerationPanel.svelte'
  import ImageViewer from './ImageViewer.svelte'
  import NoticeBar from './NoticeBar.svelte'

  const { router, gallery, sort, library, api, generation, copier } = getAppServices()
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

  // Re-runs when a reload clears the card cache, so the panel never stays on "Loading".
  $effect(() => {
    const id = imageId
    if (id > 0 && card === undefined) untrack(() => void gallery.ensureCards([id]))
  })

  $effect(() => {
    const id = imageId
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

  /** Keys aimed at form fields, the folder tree, an open menu or a dialog are theirs. */
  const ownedByAnotherWidget = (target: EventTarget | null): boolean =>
    target instanceof Element &&
    target.closest(
      'input, select, textarea, [role="tree"], [aria-haspopup][aria-expanded="true"], dialog'
    ) !== null

  function onkeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || ownedByAnotherWidget(event.target)) return
    if (event.key === 'ArrowLeft') show(previousId)
    else if (event.key === 'ArrowRight') show(nextId)
    else if (event.key === 'Escape') back()
    else return
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
        oncopy={(variant) => void copier.copy(imageId, variant)}
        onretry={() => void generation.retry()}
      />
      <FileInfoPanel
        {card}
        {rootPath}
        onreveal={() => void library.fileAction('show the file', () => api.revealImage(imageId))}
        oncopypath={() =>
          void library.fileAction('copy the path', () => api.copyImagePath(imageId))}
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

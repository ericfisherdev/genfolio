<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte'
  import { fade } from 'svelte/transition'
  import { ImageDisplay, imageUrl } from '@shared/display-rendition'
  import { GalleryScopeKind } from '@shared/gallery-kinds'
  import { getAppServices } from '../lib/app-context'
  import { RouteKind } from '../lib/routing/route'
  import { Slideshow } from '../lib/slideshow/slideshow.svelte'
  import SlideshowControls from './SlideshowControls.svelte'

  const { gallery, router, sort, api, slideshowSettings, slideshowNavigator } = getAppServices()
  const settings = slideshowSettings

  const FADE_MS = 600
  const IDLE_MS = 2_500
  const reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

  /** Loads and decodes the image so the swap shows it whole; a broken image still shows. */
  const preload = (imageId: number): Promise<void> => {
    const image = new Image()
    image.src = imageUrl(imageId, ImageDisplay.Original)
    return image.decode().catch(() => undefined)
  }

  const show = new Slideshow(
    {
      set: (callback, ms) => setTimeout(callback, ms),
      clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
    },
    preload,
    () => Date.now(),
    () => settings.current
  )

  let stage: HTMLElement | undefined = $state()
  let prompt: string | undefined = $state()
  let idle = $state(false)
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let wasFullscreen = false

  const ids = (): number[] =>
    Array.from({ length: gallery.count }, (_, index) => gallery.idAt(index))
  const startId = (): number | undefined =>
    router.route.kind === RouteKind.Slideshow ? router.route.startId : undefined

  // Opened directly (a reload): show the library's results.
  if (!gallery.query) {
    void gallery.load({ scope: { kind: GalleryScopeKind.All }, sort: sort.current })
  }

  // Start once the results are there.
  let started = false
  $effect(() => {
    if (started || gallery.loading || gallery.count === 0) return
    started = true
    untrack(() => show.start(ids(), startId()))
  })

  // The prompt overlay follows the image while it is on.
  $effect(() => {
    const imageId = show.currentId
    if (imageId === undefined || !settings.current.showPrompt) return
    untrack(() => {
      prompt = undefined
      void api
        .getGeneration(imageId)
        .then((details) => {
          if (show.currentId === imageId) prompt = details?.prompt ?? undefined
        })
        .catch(() => undefined)
    })
  })

  function exit(): void {
    show.stop()
    slideshowNavigator.exit()
  }

  function onkeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return
    const target = event.target
    if (target instanceof Element && target.closest('input, select, textarea, dialog')) return
    if (event.key === ' ') show.togglePlaying()
    else if (event.key === 'ArrowRight') show.next()
    else if (event.key === 'ArrowLeft') show.previous()
    else if (event.key === 'Escape') exit()
    else if (event.key === 'i' || event.key === 'I') {
      settings.update({ showPrompt: !settings.current.showPrompt })
    } else return
    wake()
    event.preventDefault()
  }

  /** Shows the controls and the pointer again, hiding them after a pause. */
  function wake(): void {
    idle = false
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => (idle = true), IDLE_MS)
  }

  // Leaving full screen (the system's Escape handling included) ends the slideshow.
  function onfullscreenchange(): void {
    if (document.fullscreenElement) wasFullscreen = true
    else if (wasFullscreen) exit()
  }

  onMount(() => {
    wake()
    void stage?.requestFullscreen?.().catch(() => undefined)
  })

  onDestroy(() => {
    show.stop()
    clearTimeout(idleTimer)
    wasFullscreen = false
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  })
</script>

<svelte:window {onkeydown} />
<svelte:document {onfullscreenchange} />

<section class="slideshow" class:idle aria-label="Slideshow" bind:this={stage} onpointermove={wake}>
  {#key show.currentId}
    {#if show.currentId !== undefined}
      <img
        class="slide"
        src={imageUrl(show.currentId, ImageDisplay.Original)}
        alt={gallery.card(show.currentId)?.fileName ?? `Image ${show.currentId}`}
        data-image-id={show.currentId}
        transition:fade={{ duration: reduceMotion ? 0 : FADE_MS }}
      />
    {/if}
  {/key}
  {#if gallery.count === 0 && !gallery.loading}
    <p class="empty">No images to show.</p>
  {/if}
  {#if settings.current.showPrompt && prompt}
    <p class="prompt" aria-live="polite">{prompt}</p>
  {/if}
  <div class="controls" class:hidden={idle && show.playing}>
    <SlideshowControls {show} {ids} onexit={exit} />
  </div>
</section>

<style>
  .slideshow {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #000;
    overflow: hidden;
  }
  .slideshow.idle {
    cursor: none;
  }
  .slide {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: #ccc;
  }
  .prompt {
    position: absolute;
    left: 50%;
    bottom: 88px;
    transform: translateX(-50%);
    max-width: min(90%, 1100px);
    margin: 0;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-2);
    background: rgb(0 0 0 / 65%);
    color: #fff;
    text-align: center;
    line-height: 1.4;
  }
  .controls {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    transition: opacity 200ms;
  }
  .controls.hidden {
    opacity: 0;
  }
  @media (prefers-reduced-motion: reduce) {
    .controls {
      transition: none;
    }
  }
</style>

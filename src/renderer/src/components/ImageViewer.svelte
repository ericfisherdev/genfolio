<script lang="ts">
  import { ImageDisplay, imageUrl } from '@shared/display-rendition'
  import {
    centered,
    fitScale,
    panBy,
    wheelFactor,
    zoomAt,
    type ViewTransform
  } from '../lib/viewer/view-transform'

  interface Props {
    imageId: number
    width: number
    height: number
    alt: string
  }

  let { imageId, width, height, alt }: Props = $props()

  let viewport: HTMLDivElement | undefined = $state()
  let viewWidth = $state(0)
  let viewHeight = $state(0)
  /** While fitted, the image re-fits on resize; any zoom or pan leaves fit mode. */
  let fitted = $state(true)
  let transform: ViewTransform = $state({ scale: 1, x: 0, y: 0 })
  let drag: { x: number; y: number } | undefined = $state()

  const image = $derived({ width, height })
  const view = $derived({ width: viewWidth, height: viewHeight })

  $effect(() => {
    void imageId
    fitted = true
  })

  $effect(() => {
    if (fitted && viewWidth > 0) transform = centered(image, view, fitScale(image, view))
  })

  const cursorIn = (event: MouseEvent): { x: number; y: number } => {
    const rect = viewport?.getBoundingClientRect()
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }
  }

  // Wheel listeners must be non-passive to stop the page from scrolling while zooming.
  $effect(() => {
    if (!viewport) return
    const onwheel = (event: WheelEvent): void => {
      event.preventDefault()
      fitted = false
      transform = zoomAt(transform, wheelFactor(event.deltaY), cursorIn(event))
    }
    viewport.addEventListener('wheel', onwheel, { passive: false })
    return () => viewport?.removeEventListener('wheel', onwheel)
  })

  function toggleActualSize(event: MouseEvent): void {
    if (fitted) {
      fitted = false
      transform = zoomAt(transform, 1 / transform.scale, cursorIn(event))
    } else {
      fitted = true
    }
  }
</script>

<div
  class="viewport"
  class:dragging={drag !== undefined}
  bind:this={viewport}
  bind:clientWidth={viewWidth}
  bind:clientHeight={viewHeight}
  role="img"
  aria-label={alt}
  ondblclick={toggleActualSize}
  onpointerdown={(event) => {
    if (event.button !== 0) return
    drag = { x: event.clientX, y: event.clientY }
    viewport?.setPointerCapture(event.pointerId)
  }}
  onpointermove={(event) => {
    if (!drag) return
    fitted = false
    transform = panBy(transform, event.clientX - drag.x, event.clientY - drag.y)
    drag = { x: event.clientX, y: event.clientY }
  }}
  onpointerup={() => (drag = undefined)}
  onpointercancel={() => (drag = undefined)}
>
  <img
    src={imageUrl(imageId, ImageDisplay.Original)}
    alt=""
    draggable="false"
    style:width={`${width}px`}
    style:height={`${height}px`}
    style:transform={`translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`}
  />
</div>

<style>
  .viewport {
    position: relative;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    background: #0b0c0d;
    cursor: grab;
    touch-action: none;
  }
  .viewport.dragging {
    cursor: grabbing;
  }
  img {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    max-width: none;
    user-select: none;
  }
</style>

<script lang="ts">
  import { ImageDisplay, imageUrl } from '@shared/display-rendition'
  import { MAX_SIMILARITY_DISTANCE, NEAR_IDENTICAL_DISTANCE } from '@shared/similarity'
  import { getAppServices } from '../lib/app-context'
  import { RouteKind } from '../lib/routing/route'

  const { similarity, router } = getAppServices()
  const count = new Intl.NumberFormat()
  const images = (n: number): string => `${count.format(n)} image${n === 1 ? '' : 's'}`

  // The slider shows the value while dragging; regrouping waits for the release.
  let draft = $derived(similarity.threshold)

  $effect(() => {
    void similarity.load()
  })

  const label = $derived(
    draft <= NEAR_IDENTICAL_DISTANCE
      ? 'near-identical copies only'
      : draft <= 10
        ? 'similar images'
        : 'loosely similar images'
  )

  const open = (groupId: number): void => router.navigate({ kind: RouteKind.SimilarGroup, groupId })
</script>

<section class="groups" aria-label="Look-alike groups">
  <div class="threshold">
    <label>
      Threshold
      <input
        type="range"
        min="0"
        max={MAX_SIMILARITY_DISTANCE}
        step="1"
        bind:value={draft}
        onchange={() => void similarity.setThreshold(draft)}
      />
    </label>
    <span class="value">{draft} bits: {label}</span>
  </div>
  {#if similarity.loaded && similarity.groups.length === 0}
    <p class="empty">
      No look-alikes at this threshold. Images are compared after each scan, once they are hashed.
    </p>
  {:else}
    <p class="summary">{count.format(similarity.total)} groups</p>
    <ul aria-label="Groups">
      {#each similarity.groups as group (group.groupId)}
        <li>
          <button
            type="button"
            class="group"
            aria-label={`Open group of ${images(group.count)}`}
            onclick={() => open(group.groupId)}
          >
            {#each group.imageIds as imageId, index (imageId)}
              <span class="thumb" class:keeper={index === 0}>
                <img src={imageUrl(imageId, ImageDisplay.Grid)} alt="" loading="lazy" />
                {#if index === 0}<span class="badge">Keeper</span>{/if}
              </span>
            {/each}
            <span class="count">{images(group.count)}</span>
          </button>
        </li>
      {/each}
    </ul>
    {#if similarity.groups.length < similarity.total}
      <button type="button" class="more" onclick={() => void similarity.loadMore()}>
        Show more groups
      </button>
    {/if}
  {/if}
</section>

<style>
  .groups {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    scrollbar-gutter: stable;
    padding: var(--space-4) var(--space-5);
  }
  .threshold {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }
  .threshold label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 600;
  }
  .value,
  .summary,
  .empty {
    color: var(--color-text-muted);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .group {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2);
    cursor: pointer;
    text-align: left;
  }
  .group:hover {
    border-color: var(--color-accent);
  }
  .thumb {
    position: relative;
    width: 96px;
    height: 96px;
    flex: none;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: var(--radius-1);
  }
  .thumb.keeper img {
    outline: 2px solid var(--color-accent);
  }
  .badge {
    position: absolute;
    left: 4px;
    bottom: 4px;
    padding: 0 var(--space-1);
    border-radius: var(--radius-1);
    background: var(--color-accent);
    color: #fff;
    font-size: 0.7rem;
  }
  .count {
    margin-left: auto;
    font-weight: 600;
  }
  .more {
    margin-top: var(--space-3);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
  }
</style>

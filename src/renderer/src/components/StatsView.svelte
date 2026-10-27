<script lang="ts">
  import { untrack } from 'svelte'
  import type { ModelPair, ModelStat } from '@shared/model-stats'
  import { DEFAULT_STATS_ROWS } from '@shared/model-stats-kinds'
  import { filtersFor } from '@shared/model-stats-filters'
  import { getAppServices } from '../lib/app-context'
  import { RouteKind } from '../lib/routing/route'
  import StatsTable from './StatsTable.svelte'

  const { library, modelStats, modelTags, router } = getAppServices()

  const modelTagId = $derived(
    router.route.kind === RouteKind.Stats ? router.route.modelTagId : undefined
  )

  // The route holds the tag, so Back restores the previous filter; the state follows it.
  $effect(() => {
    const tagId = modelTagId
    untrack(() => void modelStats.show(tagId))
  })
  $effect(() => {
    untrack(() => void modelTags.load())
  })

  const overview = $derived(modelStats.overview)
  const isEmpty = $derived(
    overview !== undefined &&
      overview.checkpoints.length === 0 &&
      overview.loras.length === 0 &&
      overview.checkpointLoraPairs.length === 0 &&
      overview.loraPairs.length === 0
  )

  function chooseTag(value: string): void {
    const id = Number(value)
    router.navigate(id > 0 ? { kind: RouteKind.Stats, modelTagId: id } : { kind: RouteKind.Stats })
  }

  function showImages(row: ModelStat | ModelPair): void {
    router.navigate({ kind: RouteKind.All, filters: filtersFor(row) })
  }

  function emptyMessage(): string {
    if (library.roots.length === 0) return 'Add a folder to see how your models are used.'
    if (modelTagId !== undefined) return 'No image uses a model with this tag.'
    return 'No image has model information yet. Statistics appear once the library has images made with checkpoints or LoRAs.'
  }
</script>

<section class="stats" aria-labelledby="stats-title">
  <header class="toolbar">
    <h1 id="stats-title">Stats</h1>
    <select
      aria-label="Model tag"
      value={modelTagId ?? ''}
      onchange={(event) => chooseTag(event.currentTarget.value)}
    >
      <option value="">All models</option>
      {#each modelTags.tags as tag (tag.id)}
        <option value={tag.id}>{tag.name} ({tag.modelCount})</option>
      {/each}
    </select>
    <p class="note">The {DEFAULT_STATS_ROWS} most used in each list, across the whole library.</p>
  </header>

  <div class="content" aria-busy={modelStats.loading}>
    <!-- A route naming a model (route.model) shows the overview for now. -->
    {#if overview === undefined}
      {#if modelStats.failed}
        <p class="empty">
          The statistics could not be loaded.
          <button type="button" onclick={() => void modelStats.show(modelTagId)}>Try again</button>
        </p>
      {:else}
        <p class="empty" role="status">Loading statistics…</p>
      {/if}
    {:else if isEmpty}
      <p class="empty">{emptyMessage()}</p>
    {:else}
      <section aria-labelledby="stats-checkpoints">
        <h2 id="stats-checkpoints">
          Checkpoints <span class="hint">as model or refiner</span>
        </h2>
        {#if overview.checkpoints.length > 0}
          <StatsTable
            rows={overview.checkpoints}
            labelledby="stats-checkpoints"
            onshowimages={showImages}
          />
        {:else}
          <p class="none">No checkpoints.</p>
        {/if}
      </section>

      <section aria-labelledby="stats-loras">
        <h2 id="stats-loras">LoRAs</h2>
        {#if overview.loras.length > 0}
          <StatsTable rows={overview.loras} labelledby="stats-loras" onshowimages={showImages} />
        {:else}
          <p class="none">No LoRAs.</p>
        {/if}
      </section>

      <section aria-labelledby="stats-checkpoint-loras">
        <h2 id="stats-checkpoint-loras">LoRAs used with checkpoints</h2>
        {#if overview.checkpointLoraPairs.length > 0}
          <StatsTable
            rows={overview.checkpointLoraPairs}
            labelledby="stats-checkpoint-loras"
            onshowimages={showImages}
          />
        {:else}
          <p class="none">No LoRA is used with a checkpoint.</p>
        {/if}
      </section>

      <section aria-labelledby="stats-lora-pairs">
        <h2 id="stats-lora-pairs">LoRAs used together</h2>
        {#if overview.loraPairs.length > 0}
          <StatsTable
            rows={overview.loraPairs}
            labelledby="stats-lora-pairs"
            onshowimages={showImages}
          />
        {:else}
          <p class="none">No two LoRAs are used together.</p>
        {/if}
      </section>
    {/if}
  </div>
</section>

<style>
  .stats {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-5);
    border-bottom: 1px solid var(--color-border);
  }
  h1 {
    margin: 0 var(--space-3) 0 0;
    font-size: 1.2rem;
  }
  select {
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    color: inherit;
  }
  .note {
    margin: 0 0 0 auto;
    color: var(--color-text-muted);
    font-size: 0.8rem;
  }
  .content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: 1rem;
  }
  .hint {
    color: var(--color-text-muted);
    font-size: 0.8rem;
    font-weight: 400;
  }
  .empty,
  .none {
    margin: 0;
    color: var(--color-text-muted);
  }
  .empty button {
    margin-left: var(--space-2);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
    color: inherit;
  }
</style>

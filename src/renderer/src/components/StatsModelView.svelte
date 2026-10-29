<script lang="ts">
  import { untrack } from 'svelte'
  import { ModelKind } from '@shared/generation-kinds'
  import type { ModelKey } from '@shared/models'
  import type { ModelPair, ModelStat } from '@shared/model-stats'
  import { filtersFor } from '@shared/model-stats-filters'
  import { getAppServices } from '../lib/app-context'
  import { formatRoute, RouteKind } from '../lib/routing/route'
  import ModelTagEditor from './ModelTagEditor.svelte'
  import StatsTable from './StatsTable.svelte'

  /** How one model is used: the models it appears with, and cross-links to its images and entry. */
  const { model }: { model: ModelKey } = $props()

  const { modelUsage, modelTags, router } = getAppServices()
  const count = new Intl.NumberFormat()

  // The route holds the model, so Back and Forward follow it; the state shows what it names.
  $effect(() => {
    const key = { kind: model.kind, identity: model.identity }
    untrack(() => void modelUsage.show(key))
  })
  $effect(() => {
    untrack(() => void modelTags.load())
  })

  const usage = $derived(modelUsage.usage)
  const subject = $derived(modelUsage.subject)
  const isLora = $derived(model.kind === ModelKind.Lora)
  const kindLabel = $derived(isLora ? 'LoRA' : 'Checkpoint')
  const name = $derived(subject?.name ?? model.identity)

  // Back to the overview keeps the model tag it was narrowed to.
  const overviewHref = $derived(
    formatRoute({
      kind: RouteKind.Stats,
      ...(router.route.kind === RouteKind.Stats && router.route.modelTagId !== undefined
        ? { modelTagId: router.route.modelTagId }
        : {})
    })
  )

  function showImages(row: ModelStat | ModelPair): void {
    router.navigate({ kind: RouteKind.All, filters: filtersFor(row) })
  }

  function openInModels(): void {
    router.navigate({
      kind: RouteKind.Models,
      model: { kind: model.kind, identity: model.identity }
    })
  }
</script>

<article class="usage" aria-label={`${name} usage`} aria-busy={modelUsage.loading}>
  <p class="back"><a href={overviewHref}>Back to overview</a></p>

  {#if !modelUsage.loaded}
    {#if modelUsage.failed}
      <p class="empty">
        How this model is used could not be loaded.
        <button type="button" onclick={() => void modelUsage.refresh()}>Try again</button>
      </p>
    {:else}
      <p class="empty" role="status">Loading…</p>
    {/if}
  {:else}
    <header>
      <div class="heading">
        <h2>{name}</h2>
        <p class="meta">
          {kindLabel} · {usage
            ? `${count.format(usage.model.imageCount)} image${usage.model.imageCount === 1 ? '' : 's'}`
            : 'not used by any image'}
        </p>
      </div>
      <div class="actions">
        {#if usage}
          <button
            type="button"
            aria-label="Show all images using {name}"
            onclick={() => showImages(usage.model)}>Show all images</button
          >
        {/if}
        {#if subject}
          <button type="button" aria-label="Open {name} in Models" onclick={openInModels}
            >Open in Models</button
          >
        {/if}
      </div>
    </header>

    {#if subject}
      <ModelTagEditor model={subject} />
    {/if}

    {#if usage}
      {#if isLora}
        <section aria-labelledby="usage-checkpoints">
          <h3 id="usage-checkpoints">Checkpoints it is used with</h3>
          {#if usage.checkpoints.length > 0}
            <StatsTable
              rows={usage.checkpoints}
              labelledby="usage-checkpoints"
              onshowimages={showImages}
            />
          {:else}
            <p class="none">No image pairs it with a checkpoint.</p>
          {/if}
        </section>
      {/if}

      <section aria-labelledby="usage-loras">
        <h3 id="usage-loras">
          {isLora ? 'LoRAs used with it' : 'LoRAs used with this checkpoint'}
        </h3>
        {#if usage.loras.length > 0}
          <StatsTable rows={usage.loras} labelledby="usage-loras" onshowimages={showImages} />
        {:else}
          <p class="none">
            {isLora ? 'No other LoRA is used with it.' : 'No LoRA is used with this checkpoint.'}
          </p>
        {/if}
      </section>
    {:else}
      <p class="none">Not used by any image.</p>
    {/if}
  {/if}
</article>

<style>
  .usage {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .back {
    margin: 0;
  }
  a {
    color: var(--color-accent);
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-3);
  }
  h2 {
    margin: 0;
    font-size: 1.1rem;
    overflow-wrap: anywhere;
  }
  h3 {
    margin: 0 0 var(--space-2);
    font-size: 1rem;
  }
  .meta,
  .empty,
  .none {
    margin: 0;
    color: var(--color-text-muted);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  button {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
    color: inherit;
  }
</style>

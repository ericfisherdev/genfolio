<script lang="ts">
  import type { ModelPair, ModelStat, ModelStatRef } from '@shared/model-stats'
  import { formatRoute, RouteKind } from '../lib/routing/route'

  type Row = ModelStat | ModelPair

  /** Ranked rows: models (with their tags) or pairs of models; each side opens its drill-down. */
  const {
    rows,
    labelledby,
    onshowimages
  }: {
    rows: readonly Row[]
    /** The id of the heading that names the table. */
    labelledby: string
    onshowimages: (row: Row) => void
  } = $props()

  const count = new Intl.NumberFormat()
  const showsTags = $derived(rows.some((row) => !('first' in row)))

  const rowKey = (row: Row): string =>
    'first' in row ? `${modelKey(row.first)}|${modelKey(row.second)}` : modelKey(row)
  const modelKey = (model: ModelStatRef): string => `${model.kind}/${model.identity}`
  const rowName = (row: Row): string =>
    'first' in row ? `${row.first.name} and ${row.second.name}` : row.name
  const drillDown = (model: ModelStatRef): string =>
    formatRoute({ kind: RouteKind.Stats, model: { kind: model.kind, identity: model.identity } })
</script>

{#snippet modelLink(model: ModelStatRef)}
  <a href={drillDown(model)}>{model.name}</a>
{/snippet}

<table aria-labelledby={labelledby}>
  <thead>
    <tr>
      <th scope="col">{showsTags ? 'Model' : 'Models'}</th>
      <th scope="col" class="number">Images</th>
      {#if showsTags}
        <th scope="col">Tags</th>
      {/if}
      <th scope="col"><span class="visually-hidden">Actions</span></th>
    </tr>
  </thead>
  <tbody>
    {#each rows as row (rowKey(row))}
      <tr>
        <td class="name">
          {#if 'first' in row}
            {@render modelLink(row.first)} <span class="with">+</span>
            {@render modelLink(row.second)}
          {:else}
            {@render modelLink(row)}
          {/if}
        </td>
        <td class="number">{count.format(row.imageCount)}</td>
        {#if showsTags}
          <td>
            {#if !('first' in row) && row.tags.length > 0}
              <ul class="tags" aria-label="Tags of {row.name}">
                {#each row.tags as tag (tag.id)}
                  <li class="tag">{tag.name}</li>
                {/each}
              </ul>
            {/if}
          </td>
        {/if}
        <td class="actions">
          <button
            type="button"
            aria-label="Show images using {rowName(row)}"
            onclick={() => onshowimages(row)}>Show images</button
          >
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th,
  td {
    padding: var(--space-2);
    border-bottom: 1px solid var(--color-border);
    text-align: left;
    vertical-align: top;
  }
  th {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }
  .number {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .name {
    overflow-wrap: anywhere;
    font-weight: 600;
  }
  .with {
    color: var(--color-text-muted);
    font-weight: 400;
  }
  a {
    color: var(--color-accent);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .tag {
    padding: 0 var(--space-2);
    background: var(--color-selected);
    border-radius: 999px;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
  }
  .actions {
    text-align: right;
    white-space: nowrap;
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

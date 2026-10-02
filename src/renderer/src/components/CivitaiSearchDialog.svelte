<script lang="ts">
  import type { CivitaiCandidate } from '@shared/civitai'
  import type { ModelKind } from '@shared/generation-kinds'
  import { getAppServices } from '../lib/app-context'

  interface Props {
    open: boolean
    kind: ModelKind
    /** The local model's identity: a version with a file of this name is listed first. */
    identity: string
    /** What the search box starts with, usually the model's name. */
    initialText: string
    /** Resolves whether the model is now linked, which closes the dialog. */
    onlink: (candidate: CivitaiCandidate) => Promise<boolean>
    onclose: () => void
  }

  let { open, kind, identity, initialText, onlink, onclose }: Props = $props()
  const { models } = getAppServices()
  const count = new Intl.NumberFormat()
  const uid = $props.id()
  const titleId = `${uid}-title`

  let dialog: HTMLDialogElement | undefined = $state()
  let text = $state('')
  let candidates: readonly CivitaiCandidate[] | undefined = $state.raw()

  $effect(() => {
    if (!dialog) return
    if (open && !dialog.open) {
      text = initialText
      candidates = undefined
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  })

  async function search(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (!text.trim()) return
    candidates = await models.searchCivitai(kind, text.trim(), identity)
  }

  async function link(candidate: CivitaiCandidate): Promise<void> {
    if (await onlink(candidate)) onclose()
  }
</script>

<dialog bind:this={dialog} aria-labelledby={titleId} oncancel={onclose}>
  <h2 id={titleId}>Search Civitai</h2>
  <p class="note">Searching contacts civitai.com. Choose the version that matches your file.</p>
  <form onsubmit={search} role="search" aria-label="Search Civitai">
    <!-- svelte-ignore a11y_autofocus -->
    <input type="search" aria-label="Search text" bind:value={text} maxlength="200" autofocus />
    <button type="submit" disabled={models.civitaiBusy || !text.trim()}>
      {models.civitaiBusy ? 'Searching…' : 'Search'}
    </button>
  </form>

  {#if candidates?.length === 0}
    <p class="empty">Nothing found. Try a shorter or different name.</p>
  {:else if candidates}
    <ul aria-label="Civitai versions">
      {#each candidates as candidate (candidate.versionId)}
        <li>
          <div class="info">
            <span class="title">
              {candidate.modelName} · {candidate.versionName}
              {#if candidate.matchesFileName}<span class="badge">same file name</span>{/if}
              {#if candidate.nsfw}<span class="badge">NSFW</span>{/if}
            </span>
            <span class="sub">
              {candidate.baseModel ?? 'unknown base model'}{candidate.creator
                ? ` · by ${candidate.creator}`
                : ''}{candidate.downloads === null
                ? ''
                : ` · ${count.format(candidate.downloads)} downloads`}
            </span>
            {#if candidate.fileNames.length > 0}
              <span class="files">{candidate.fileNames.join(', ')}</span>
            {/if}
          </div>
          <button
            type="button"
            aria-label={`Link ${candidate.modelName} ${candidate.versionName}`}
            disabled={models.civitaiBusy}
            onclick={() => void link(candidate)}>Link</button
          >
        </li>
      {/each}
    </ul>
  {/if}

  <div class="actions">
    <button type="button" onclick={onclose}>Close</button>
  </div>
</dialog>

<style>
  dialog {
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-2);
    width: min(640px, 92vw);
    max-height: 80vh;
    padding: var(--space-5);
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: 1.1rem;
  }
  .note,
  .empty {
    margin: 0 0 var(--space-3);
    color: var(--color-text-muted);
    font-size: 0.85rem;
  }
  form {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  input {
    flex: 1;
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    color: inherit;
  }
  ul {
    list-style: none;
    margin: 0 0 var(--space-3);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: 46vh;
    overflow-y: auto;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .sub,
  .files {
    color: var(--color-text-muted);
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }
  .badge {
    margin-left: var(--space-1);
    padding: 0 var(--space-2);
    background: var(--color-selected);
    border-radius: 999px;
    font-size: 0.7rem;
    font-weight: 400;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
  }
  button {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
    color: inherit;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>

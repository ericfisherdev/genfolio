<script lang="ts">
  import { ModelKind } from '@shared/generation-kinds'
  import { getAppServices } from '../lib/app-context'

  const { modelFolders } = getAppServices()

  const FOLDERS: readonly { kind: ModelKind; label: string }[] = [
    { kind: ModelKind.Checkpoint, label: 'Checkpoints' },
    { kind: ModelKind.Lora, label: 'LoRAs' }
  ]

  $effect(() => {
    void modelFolders.load()
  })
</script>

<section class="settings" aria-labelledby="settings-title">
  <h1 id="settings-title">Settings</h1>

  <h2 id="model-folders-title">Model download folders</h2>
  <p class="help">
    Downloaded models are saved in a subfolder named for their base model: with the LoRAs folder set
    to <code>/models/loras</code>, an SDXL LoRA goes to <code>/models/loras/sdxl</code>.
  </p>
  <ul aria-labelledby="model-folders-title">
    {#each FOLDERS as { kind, label } (kind)}
      {@const path = modelFolders.folders[kind]}
      <li>
        <span class="kind">{label}</span>
        <span class="path" class:unset={path === null} title={path ?? undefined}>
          {path ?? 'Not set'}
        </span>
        <button type="button" onclick={() => modelFolders.choose(kind)}>
          {path === null ? 'Choose…' : 'Change…'}
        </button>
        {#if path !== null}
          <button
            type="button"
            aria-label={`Clear the ${label} folder`}
            onclick={() => modelFolders.clear(kind)}>Clear</button
          >
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .settings {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: var(--space-4) var(--space-5);
  }
  h1 {
    margin: 0 0 var(--space-4);
    font-size: 1.4rem;
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: 1rem;
  }
  .help {
    margin: 0 0 var(--space-3);
    color: var(--color-text-muted);
    max-width: 60ch;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .kind {
    width: 7em;
    font-weight: 600;
  }
  .path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono, monospace);
  }
  .unset {
    color: var(--color-text-muted);
    font-family: inherit;
  }
  button {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    padding: var(--space-1) var(--space-3);
    cursor: pointer;
  }
</style>

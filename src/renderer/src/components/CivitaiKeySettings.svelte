<script lang="ts">
  import { getAppServices } from '../lib/app-context'

  const { civitaiKey } = getAppServices()
  let key = $state('')

  $effect(() => {
    void civitaiKey.load()
  })

  async function save(event: SubmitEvent): Promise<void> {
    event.preventDefault()
    if (key.trim() && (await civitaiKey.save(key.trim()))) key = ''
  }
</script>

<section aria-labelledby="civitai-key-title">
  <h2 id="civitai-key-title">Civitai API key</h2>
  <p class="help">
    Some Civitai downloads ask for a login. A key from your Civitai account settings lets Genfolio
    download them; it is kept encrypted by your system and sent only to civitai.com.
  </p>
  {#if civitaiKey.loaded}
    <p class="state">{civitaiKey.status.hasKey ? 'A key is saved.' : 'No key saved.'}</p>
    <form onsubmit={save}>
      <input
        type="password"
        aria-label="Civitai API key"
        autocomplete="off"
        spellcheck="false"
        placeholder={civitaiKey.status.hasKey ? 'Paste a new key to replace it' : 'Paste your key'}
        bind:value={key}
      />
      <button type="submit" disabled={!key.trim() || civitaiKey.saving}>
        {civitaiKey.saving ? 'Saving…' : 'Save'}
      </button>
      {#if civitaiKey.status.hasKey}
        <button type="button" disabled={civitaiKey.saving} onclick={() => void civitaiKey.clear()}>
          Remove
        </button>
      {/if}
    </form>
    <p class="help">
      Saving needs a system keyring (such as GNOME Keyring or KWallet) and can take a moment while
      it answers.
    </p>
  {:else}
    <p class="help">Loading…</p>
  {/if}
</section>

<style>
  section {
    margin-top: var(--space-5);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: 1rem;
  }
  .help,
  .state {
    margin: 0 0 var(--space-3);
    color: var(--color-text-muted);
    max-width: 60ch;
  }
  form {
    display: flex;
    gap: var(--space-2);
    max-width: 520px;
  }
  input {
    flex: 1;
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-1);
    color: inherit;
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

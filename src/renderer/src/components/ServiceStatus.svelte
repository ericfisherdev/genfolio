<script lang="ts">
  import type { AppDiagnostics } from '@shared/diagnostics'
  import type { ServiceHealth } from '@shared/service-health'
  import { getAppServices } from '../lib/app-context'
  import { userMessage } from '../lib/format/user-message'

  const { api } = getAppServices()
  let health: Promise<ServiceHealth> = $state(api.getServiceHealth())
  let diagnostics: AppDiagnostics | undefined = $state()
  $effect(() => {
    void api
      .getDiagnostics()
      .then((report) => (diagnostics = report))
      .catch(() => undefined)
  })

  function retry(): void {
    health = api.getServiceHealth()
  }
</script>

<section class="service-status" aria-label="Library service status">
  {#await health}
    <p>Starting library service…</p>
  {:then report}
    <dl>
      <dt>Electron</dt>
      <dd>{report.electron}</dd>
      <dt>Node</dt>
      <dd>{report.node}</dd>
      <dt>SQLite</dt>
      <dd>{report.sqlite}{report.fts5 ? ' (FTS5)' : ' (no FTS5)'}</dd>
      <dt>Library schema</dt>
      <dd>v{report.schemaVersion}</dd>
      <dt>Image formats</dt>
      <dd>{report.decodableFormats.join(', ')}</dd>
      {#if diagnostics}
        <dt>Restarts</dt>
        <dd>{diagnostics.serviceRestarts}</dd>
      {/if}
    </dl>
  {:catch error}
    <p role="alert">
      Library service unavailable: {userMessage(error)}
      {#if diagnostics?.serviceStopped}
        It stopped after crashing repeatedly; restart Genfolio.
      {/if}
    </p>
    <button type="button" onclick={retry}>Retry</button>
  {/await}
</section>

<style>
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: var(--space-1) var(--space-3);
    margin: 0;
  }
  dt {
    color: var(--color-text-muted);
  }
  dd {
    margin: 0;
  }
</style>

<script lang="ts">
  import type { ServiceHealth } from '@shared/service-health'
  import { getGenfolioApi } from '../lib/api-context'

  const api = getGenfolioApi()
  const health: Promise<ServiceHealth> = api.getServiceHealth()
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
      <dt>Image formats</dt>
      <dd>{report.decodableFormats.join(', ')}</dd>
    </dl>
  {:catch error}
    <p role="alert">
      Library service unavailable: {error instanceof Error ? error.message : error}
    </p>
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

<script lang="ts">
  import ServiceStatus from './components/ServiceStatus.svelte'
</script>

<main>
  <h1>Genfolio</h1>
  <ServiceStatus />
</main>

<style>
  main {
    padding: var(--space-4);
  }
  h1 {
    margin: 0 0 var(--space-3);
    font-size: 1.5rem;
  }
</style>

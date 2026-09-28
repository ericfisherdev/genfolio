import { mount } from 'svelte'
import App from './App.svelte'
import { appServicesContext, type AppServices } from './lib/app-context'
import { RouterState, windowHashLocation } from './lib/routing/router.svelte'
import { LibraryState } from './lib/state/library.svelte'
import { ScanProgressState } from './lib/state/scan-progress.svelte'
import { localPreferenceStore, SortPreference } from './lib/state/sort-preference.svelte'
import './styles/tokens.css'

// Composition root of the renderer.

const target = document.getElementById('app')
if (!target) throw new Error('#app mount point missing from index.html')

const api = window.genfolio
const library = new LibraryState(api)
const services: AppServices = {
  api,
  router: new RouterState(windowHashLocation(window)),
  library,
  scans: new ScanProgressState(api, () => void library.refresh()),
  sort: new SortPreference(localPreferenceStore(() => window.localStorage))
}

export default mount(App, {
  target,
  context: appServicesContext(services)
})

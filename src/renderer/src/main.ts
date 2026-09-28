import { mount } from 'svelte'
import App from './App.svelte'
import { genfolioApiContext } from './lib/api-context'
import './styles/tokens.css'

const target = document.getElementById('app')
if (!target) throw new Error('#app mount point missing from index.html')

export default mount(App, { target, context: genfolioApiContext(window.genfolio) })

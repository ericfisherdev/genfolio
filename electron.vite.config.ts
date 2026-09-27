import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

const sharedAlias = { '@shared': resolve(__dirname, 'src/shared') }
const nodeAlias = {
  ...sharedAlias,
  '@infrastructure': resolve(__dirname, 'src/infrastructure')
}

export default defineConfig({
  main: {
    resolve: { alias: nodeAlias }
  },
  preload: {
    resolve: { alias: sharedAlias }
  },
  renderer: {
    resolve: { alias: sharedAlias },
    plugins: [svelte()]
  }
})

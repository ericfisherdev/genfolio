import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@domain': resolve(__dirname, 'src/domain'),
  '@application': resolve(__dirname, 'src/application'),
  '@infrastructure': resolve(__dirname, 'src/infrastructure')
}

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'node',
          restoreMocks: true,
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/renderer/**']
        }
      },
      {
        resolve: { alias },
        plugins: [svelte(), svelteTesting()],
        test: {
          name: 'renderer',
          restoreMocks: true,
          environment: 'jsdom',
          include: ['src/renderer/**/*.test.ts'],
          setupFiles: ['src/renderer/src/test-setup.ts']
        }
      }
    ]
  }
})

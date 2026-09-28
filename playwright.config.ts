import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.ts',
  globalSetup: './tests/e2e/support/global-setup.ts',
  timeout: 30_000,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
})

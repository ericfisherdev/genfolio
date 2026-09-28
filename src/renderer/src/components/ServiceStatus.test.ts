import { render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import type { GenfolioApi } from '@shared/genfolio-api'
import { genfolioApiContext } from '../lib/api-context'
import ServiceStatus from './ServiceStatus.svelte'

function renderWith(api: GenfolioApi): void {
  render(ServiceStatus, { context: genfolioApiContext(api) })
}

describe('ServiceStatus', () => {
  it('shows versions and formats from the service', async () => {
    renderWith({
      getServiceHealth: async () => ({
        electron: '44.4.5',
        node: '24.21.0',
        sqlite: '3.53.4',
        fts5: true,
        decodableFormats: ['png', 'webp']
      })
    })
    expect(await screen.findByText('3.53.4 (FTS5)')).toBeTruthy()
    expect(screen.getByText('png, webp')).toBeTruthy()
  })

  it('shows an alert when the service is unavailable', async () => {
    renderWith({ getServiceHealth: () => Promise.reject(new Error('exited with code 139')) })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('exited with code 139')
  })
})

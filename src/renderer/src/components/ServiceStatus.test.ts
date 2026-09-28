import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { GenfolioApi } from '@shared/genfolio-api'
import type { ServiceHealth } from '@shared/service-health'
import { genfolioApiContext } from '../lib/api-context'
import { fakeGenfolioApi } from '../lib/testing/fake-genfolio-api'
import ServiceStatus from './ServiceStatus.svelte'

const health: ServiceHealth = {
  electron: '44.4.5',
  node: '24.21.0',
  sqlite: '3.53.4',
  fts5: true,
  schemaVersion: 1,
  decodableFormats: ['png', 'webp']
}

function renderWith(api: Partial<GenfolioApi>): void {
  render(ServiceStatus, { context: genfolioApiContext(fakeGenfolioApi(api)) })
}

describe('ServiceStatus', () => {
  it('shows versions and formats from the service', async () => {
    renderWith({
      getServiceHealth: async () => ({
        electron: '44.4.5',
        node: '24.21.0',
        sqlite: '3.53.4',
        fts5: true,
        schemaVersion: 1,
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

  it('retries after a failure and shows the fresh report', async () => {
    const getServiceHealth = vi
      .fn<GenfolioApi['getServiceHealth']>()
      .mockRejectedValueOnce(new Error('exited with code 139'))
      .mockResolvedValueOnce(health)
    renderWith({ getServiceHealth })
    await fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('3.53.4 (FTS5)')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(getServiceHealth).toHaveBeenCalledTimes(2)
  })
})

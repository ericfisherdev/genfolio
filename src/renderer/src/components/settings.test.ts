import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { GenfolioApi } from '@shared/genfolio-api'
import { RouteKind } from '../lib/routing/route'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import AppShell from './AppShell.svelte'
import SettingsView from './SettingsView.svelte'
import Sidebar from './Sidebar.svelte'

function harness(overrides: Partial<GenfolioApi> = {}): TestServices {
  return testServices(sampleLibrary(), overrides)
}

describe('SettingsView', () => {
  it('shows each model folder, or that it is not set', async () => {
    const { context } = harness({
      getModelFolders: async () => ({ checkpoint: null, lora: '/models/loras' })
    })
    render(SettingsView, { context })
    await screen.findByText('/models/loras')
    expect(screen.getByText('Not set')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Choose…' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Change…' })).toBeTruthy()
  })

  it('chooses a folder in main and shows what it stored', async () => {
    const chooseModelFolder = vi.fn(async () => ({ checkpoint: '/models/ckpt', lora: null }))
    const { context } = harness({ chooseModelFolder })
    render(SettingsView, { context })
    await fireEvent.click(
      await screen.findAllByRole('button', { name: 'Choose…' }).then((b) => b[0]!)
    )
    expect(chooseModelFolder).toHaveBeenCalledWith('checkpoint')
    await screen.findByText('/models/ckpt')
  })

  it('clears a folder', async () => {
    const clearModelFolder = vi.fn(async () => ({ checkpoint: null, lora: null }))
    const { context } = harness({
      getModelFolders: async () => ({ checkpoint: '/models/ckpt', lora: null }),
      clearModelFolder
    })
    render(SettingsView, { context })
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Clear the Checkpoints folder' })
    )
    expect(clearModelFolder).toHaveBeenCalledWith('checkpoint')
    await waitFor(() => expect(screen.queryByText('/models/ckpt')).toBeNull())
  })

  it('reports a failure in the notice bar and keeps the folders', async () => {
    const { context, services } = harness({
      getModelFolders: async () => ({ checkpoint: '/models/ckpt', lora: null }),
      chooseModelFolder: async () => {
        throw new Error('service down')
      }
    })
    render(SettingsView, { context })
    await fireEvent.click(await screen.findByRole('button', { name: 'Change…' }))
    await waitFor(() => expect(services.library.notice).toContain('Could not set the folder'))
    expect(screen.getByText('/models/ckpt')).toBeTruthy()
  })
})

describe('Settings navigation', () => {
  it('opens from the sidebar and replaces the gallery', async () => {
    const { context, services, hash } = harness()
    await services.library.refresh()
    render(AppShell, { context })
    await fireEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Settings' })
    )
    expect(services.router.route).toEqual({ kind: RouteKind.Settings })
    expect(hash.current).toBe('#/settings')
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(screen.queryByRole('search', { name: 'Filter images' })).toBeNull()
  })

  it('marks the sidebar entry current', async () => {
    const { context, services } = harness()
    services.router.navigate({ kind: RouteKind.Settings })
    render(Sidebar, { context })
    expect(screen.getByRole('button', { name: 'Settings' }).getAttribute('aria-current')).toBe(
      'page'
    )
  })
})

import { fireEvent, render, screen, waitFor } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { GenfolioApi } from '@shared/genfolio-api'
import { sampleLibrary, testServices } from '../lib/testing/app-services'
import SettingsView from './SettingsView.svelte'

const harness = (overrides: Partial<GenfolioApi> = {}): ReturnType<typeof testServices> =>
  testServices(sampleLibrary(), overrides)

describe('the Civitai API key setting', () => {
  it('says whether a key is saved, without showing it', async () => {
    const h = harness({ getCivitaiKeyStatus: async () => ({ hasKey: true }) })
    render(SettingsView, { context: h.context })
    await screen.findByText('A key is saved.')
    const input = screen.getByLabelText('Civitai API key', {
      selector: 'input'
    }) as HTMLInputElement
    expect(input.type).toBe('password')
    expect(input.value).toBe('')
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy()
  })

  it('saves a pasted key, then empties the field', async () => {
    const setCivitaiKey = vi.fn(async () => ({ hasKey: true }))
    const h = harness({ setCivitaiKey })
    render(SettingsView, { context: h.context })
    await screen.findByText('No key saved.')
    const input = screen.getByLabelText('Civitai API key', {
      selector: 'input'
    }) as HTMLInputElement
    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
    await fireEvent.input(input, { target: { value: '  abcdef0123456789abcdef0123456789 ' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(setCivitaiKey).toHaveBeenCalledWith('abcdef0123456789abcdef0123456789')
    await screen.findByText('A key is saved.')
    expect(input.value).toBe('')
  })

  it('keeps what was typed and says why when the key could not be saved', async () => {
    const h = harness({
      setCivitaiKey: async () => {
        throw new Error('No system keyring is available to keep the key safely.')
      }
    })
    render(SettingsView, { context: h.context })
    await screen.findByText('No key saved.')
    const input = screen.getByLabelText('Civitai API key', {
      selector: 'input'
    }) as HTMLInputElement
    await fireEvent.input(input, { target: { value: 'abcdef0123456789abcdef0123456789' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(h.services.library.notice).toBe(
        'Could not save the Civitai API key: No system keyring is available to keep the key safely.'
      )
    )
    expect(input.value).toBe('abcdef0123456789abcdef0123456789')
  })

  it('removes the key', async () => {
    const clearCivitaiKey = vi.fn(async () => ({ hasKey: false }))
    const h = harness({
      getCivitaiKeyStatus: async () => ({ hasKey: true }),
      clearCivitaiKey
    })
    render(SettingsView, { context: h.context })
    await fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(clearCivitaiKey).toHaveBeenCalled()
    await screen.findByText('No key saved.')
  })

  it('says it is saving while the keyring answers, and does not let the key be saved twice', async () => {
    let finish: (status: { hasKey: boolean }) => void = () => undefined
    const setCivitaiKey = vi.fn(
      () => new Promise<{ hasKey: boolean }>((resolve) => (finish = resolve))
    )
    const h = harness({ setCivitaiKey })
    render(SettingsView, { context: h.context })
    await screen.findByText('No key saved.')
    await fireEvent.input(screen.getByLabelText('Civitai API key', { selector: 'input' }), {
      target: { value: 'abcdef0123456789abcdef0123456789' }
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const saving = await screen.findByRole('button', { name: 'Saving…' })
    expect((saving as HTMLButtonElement).disabled).toBe(true)
    finish({ hasKey: true })
    await screen.findByText('A key is saved.')
    expect(setCivitaiKey).toHaveBeenCalledTimes(1)
  })

  it('does not ask the keyring anything when the page opens', async () => {
    const setCivitaiKey = vi.fn()
    const h = harness({ setCivitaiKey })
    render(SettingsView, { context: h.context })
    await screen.findByText('No key saved.')
    expect(setCivitaiKey).not.toHaveBeenCalled()
  })
})

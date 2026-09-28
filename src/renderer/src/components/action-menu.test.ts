import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it } from 'vitest'
import ActionMenu from './ActionMenu.svelte'

describe('ActionMenu', () => {
  it('opening one menu closes any other', async () => {
    render(ActionMenu, {
      props: { label: 'Actions for a', actions: [{ label: 'Open', onselect: () => undefined }] }
    })
    render(ActionMenu, {
      props: { label: 'Actions for b', actions: [{ label: 'Open', onselect: () => undefined }] }
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Actions for a' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Actions for b' }))
    expect(screen.getAllByRole('menu')).toHaveLength(1)
    expect(screen.getByRole('menu').getAttribute('aria-label')).toBe('Actions for b')
  })
})

import { fireEvent, render, screen } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import RatingStars from './RatingStars.svelte'

describe('RatingStars', () => {
  it('rates, and clears when the current rating is chosen again', async () => {
    const onrate = vi.fn()
    render(RatingStars, { props: { rating: 3, onrate, label: 'Rating of x' } })
    expect(screen.getByRole('group', { name: 'Rating of x' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '3 stars' }).getAttribute('aria-pressed')).toBe(
      'true'
    )
    await fireEvent.click(screen.getByRole('button', { name: '5 stars' }))
    await fireEvent.click(screen.getByRole('button', { name: '3 stars' }))
    expect(onrate.mock.calls.map(([rating]) => rating)).toEqual([5, 0])
  })
})

import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { ImageCard } from '@shared/gallery'
import type { GenfolioApi } from '@shared/genfolio-api'
import { ImageFormat } from '@shared/image-format'
import { RouteKind } from '../lib/routing/route'
import { sampleLibrary, testServices, type TestServices } from '../lib/testing/app-services'
import AppShell from './AppShell.svelte'
import GalleryCard from './GalleryCard.svelte'

const card = (fields: Partial<ImageCard> = {}): ImageCard => ({
  id: 7,
  rootId: 1,
  directoryId: 11,
  fileName: 'image-7.png',
  relDir: '',
  format: ImageFormat.Png,
  width: 1,
  height: 1,
  sizeBytes: 1,
  createdAt: 1,
  addedAt: 1,
  favorite: false,
  rating: 0,
  similarGroupId: 3,
  similarCount: 2,
  ...fields
})

function renderCard(fields: Partial<ImageCard>): ReturnType<typeof vi.fn> {
  const onsimilar = vi.fn()
  render(GalleryCard, {
    props: {
      imageId: 7,
      card: card(fields),
      onopen: vi.fn(),
      onreveal: vi.fn(),
      oncopypath: vi.fn(),
      oncopy: vi.fn(),
      onsameprompt: vi.fn(),
      onfavorite: vi.fn(),
      onrate: vi.fn(),
      selected: false,
      selecting: false,
      onselect: vi.fn(),
      onsimilar
    }
  })
  return onsimilar
}

describe('the look-alike badge', () => {
  it('shows the other members and opens the group', async () => {
    const onsimilar = renderCard({})
    await fireEvent.click(screen.getByRole('button', { name: '2 look-alikes of image-7.png' }))
    expect(onsimilar).toHaveBeenCalled()
  })

  it('is hidden without look-alikes', () => {
    renderCard({ similarGroupId: null, similarCount: 0 })
    expect(screen.queryByRole('button', { name: /look-alike/ })).toBeNull()
  })
})

describe('the look-alikes view', () => {
  async function openGroups(overrides: Partial<GenfolioApi>): Promise<TestServices> {
    const harness = testServices(sampleLibrary(), overrides)
    await harness.services.library.refresh()
    harness.services.router.navigate({ kind: RouteKind.SimilarGroups })
    render(AppShell, { context: harness.context })
    return harness
  }

  it('lists groups with their keeper first and opens one', async () => {
    const listSimilarGroups = vi.fn(async () => ({
      total: 1,
      groups: [{ groupId: 4, count: 3, imageIds: [9, 4, 5] }]
    }))
    const { services } = await openGroups({ listSimilarGroups })
    const groups = await screen.findByRole('list', { name: 'Groups' })
    expect(within(groups).getByText('Keeper')).toBeTruthy()
    expect(
      within(screen.getByRole('navigation', { name: 'Library' })).getByRole('button', {
        name: /Look-alikes/
      }).textContent
    ).toContain('1')
    await fireEvent.click(within(groups).getByRole('button', { name: 'Open group of 3 images' }))
    expect(services.router.route).toEqual({ kind: RouteKind.SimilarGroup, groupId: 4 })
  })

  it('regroups at the threshold chosen on the slider', async () => {
    let threshold = 10
    const setSimilarityThreshold = vi.fn(async (value: number) => (threshold = value))
    const listSimilarGroups = vi.fn(async () =>
      threshold > 4
        ? { total: 1, groups: [{ groupId: 4, count: 2, imageIds: [4, 5] }] }
        : { total: 0, groups: [] }
    )
    await openGroups({
      setSimilarityThreshold,
      listSimilarGroups,
      getSimilarityThreshold: async () => threshold
    })
    const slider = await screen.findByRole('slider', { name: 'Threshold' })
    await screen.findByText('1 groups')
    await fireEvent.input(slider, { target: { value: '4' } })
    expect(screen.getByText('4 bits: near-identical copies only')).toBeTruthy()
    await fireEvent.change(slider, { target: { value: '4' } })
    await waitFor(() => expect(setSimilarityThreshold).toHaveBeenCalledWith(4))
    expect(await screen.findByText(/No look-alikes at this threshold/)).toBeTruthy()
  })
})

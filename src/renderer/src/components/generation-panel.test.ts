import { fireEvent, render, screen, within } from '@testing-library/svelte'
import { describe, expect, it, vi } from 'vitest'
import type { GenerationDetails } from '@shared/generation'
import { CopyVariant, GeneratorKind, ResourceKind } from '@shared/generation-kinds'
import { MetadataOrigin } from '@shared/metadata-kinds'
import GalleryCard from './GalleryCard.svelte'
import GenerationPanel from './GenerationPanel.svelte'

/** The a1111-scheme fixture PNG, as the service describes it after merging its log entry. */
const FIXTURE: GenerationDetails = {
  generator: GeneratorKind.FwdFooocus,
  origin: MetadataOrigin.PngText,
  prompt:
    'a ceramic teapot shaped like a snail on a wooden café table, (studio lighting:1.2), soft morning light, 桜 petals, "still life", 50mm: shallow depth of field',
  negativePrompt: 'blurry, lowres, (text:1.3), watermark, "signature"',
  seed: '6608862657482296148',
  steps: 30,
  cfgScale: 2.66,
  sampler: 'DPM++ 2M SDE Karras',
  scheduler: 'karras',
  width: 1024,
  height: 1024,
  vae: 'Default (model)',
  styles: null,
  performance: 'Speed',
  resources: [
    {
      kind: ResourceKind.Checkpoint,
      name: 'ultraRealisticByStable_v25',
      hash: 'c69e98fa77',
      weight: null,
      weightSource: null
    },
    {
      kind: ResourceKind.Lora,
      name: 'add-detail-xl',
      hash: '0d9bd1b873',
      weight: 0.6,
      weightSource: MetadataOrigin.FooocusLog
    },
    {
      kind: ResourceKind.Lora,
      name: 'mystery',
      hash: null,
      weight: null,
      weightSource: null
    }
  ],
  params: {},
  sources: [
    { origin: MetadataOrigin.PngText, records: [{ key: 'parameters', value: 'raw text' }] },
    { origin: MetadataOrigin.FooocusLog, records: [{ key: 'log.html', value: '{}' }] }
  ]
}

function renderPanel(
  details: GenerationDetails | null | undefined,
  loadError?: string
): { oncopy: ReturnType<typeof vi.fn>; onretry: ReturnType<typeof vi.fn> } {
  const oncopy = vi.fn()
  const onretry = vi.fn()
  render(GenerationPanel, { props: { details, loadError, oncopy, onretry } })
  return { oncopy, onretry }
}

const section = (): HTMLElement => screen.getByRole('region', { name: 'Generation data' })

describe('GenerationPanel', () => {
  it('shows every section for a fixture image', () => {
    renderPanel(FIXTURE)
    const panel = section()
    for (const heading of ['Resources used', 'Prompt', 'Negative prompt', 'Other metadata']) {
      expect(within(panel).getByRole('heading', { name: heading })).toBeTruthy()
    }
    const rows = within(panel).getAllByRole('listitem')
    expect(rows[0]?.textContent).toContain('ultraRealisticByStable_v25')
    expect(rows[0]?.textContent).toContain('c69e98fa77')
    expect(rows[0]?.textContent).toContain('Checkpoint')
    expect(rows[1]?.textContent).toContain('0.6')
    expect(within(panel).getByTitle('Weight from Fooocus log.html')).toBeTruthy()
    expect(within(panel).getByTitle('No source recorded this LoRA’s weight').textContent).toContain(
      '—'
    )
    expect(panel.textContent).toContain('FwdFooocus')
    expect(panel.textContent).toContain('Embedded')
    expect(panel.textContent).toContain('桜 petals')
    const chips = within(panel).getByRole('list', { name: 'Other metadata' })
    expect(chips.textContent).toContain('Seed 6608862657482296148')
    expect(chips.textContent).toContain('Size 1024×1024')
    expect(chips.textContent).not.toContain('Styles')
    expect(within(panel).getByText('Sources')).toBeTruthy()
  })

  it('hides sections the source has no data for', () => {
    renderPanel({
      ...FIXTURE,
      negativePrompt: null,
      resources: [],
      steps: null,
      cfgScale: null,
      sampler: null,
      scheduler: null,
      seed: null,
      width: null,
      height: null,
      vae: null,
      performance: null,
      sources: []
    })
    const panel = section()
    expect(within(panel).getByRole('heading', { name: 'Prompt' })).toBeTruthy()
    for (const heading of ['Resources used', 'Negative prompt', 'Other metadata']) {
      expect(within(panel).queryByRole('heading', { name: heading })).toBeNull()
    }
    expect(within(panel).queryByText('Sources')).toBeNull()
  })

  it('copies each variant through its button', async () => {
    const { oncopy } = renderPanel(FIXTURE)
    await fireEvent.click(screen.getByRole('button', { name: 'Copy all' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Copy prompt' }))
    await fireEvent.click(screen.getByRole('button', { name: '+ LoRA tags' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Copy negative prompt' }))
    expect(oncopy.mock.calls.map(([variant]) => variant)).toEqual([
      CopyVariant.All,
      CopyVariant.Prompt,
      CopyVariant.PromptWithLoras,
      CopyVariant.Negative
    ])
  })

  it('clamps a long prompt and expands it on request', async () => {
    renderPanel({ ...FIXTURE, prompt: 'word '.repeat(200) })
    const toggle = screen.getByRole('button', { name: 'Show more' })
    const text = toggle.previousElementSibling
    expect(text?.classList.contains('clamped')).toBe(true)
    await fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.textContent).toContain('Show less')
    expect(text?.classList.contains('clamped')).toBe(false)
  })

  it('shows at most five resources until asked for all', async () => {
    const loras = Array.from({ length: 7 }, (_, index) => ({
      kind: ResourceKind.Lora,
      name: `lora-${index}`,
      hash: null,
      weight: 1,
      weightSource: MetadataOrigin.PngText
    }))
    renderPanel({ ...FIXTURE, resources: loras })
    expect(screen.queryByText('lora-5')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Show all 7' }))
    expect(screen.getByText('lora-6')).toBeTruthy()
  })

  it('collapses its body from the header', async () => {
    renderPanel(FIXTURE)
    const toggle = screen.getByRole('button', { name: 'Generation data details' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('heading', { name: 'Prompt' })).toBeNull()
  })

  it('says when loading, when there is no data, and offers a retry after an error', async () => {
    renderPanel(undefined)
    expect(screen.getByText('Loading generation data…')).toBeTruthy()
    document.body.innerHTML = ''
    renderPanel(null)
    expect(screen.getByText('This image has no generation data.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy all' })).toBeNull()
    document.body.innerHTML = ''
    const { onretry } = renderPanel(undefined, 'service down')
    expect(screen.getByRole('alert').textContent).toContain('service down')
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onretry).toHaveBeenCalled()
  })

  it('renders metadata as text, never as markup', () => {
    renderPanel({ ...FIXTURE, prompt: '<img src=x onerror=alert(1)>' })
    expect(section().querySelector('img')).toBeNull()
    expect(section().textContent).toContain('<img src=x onerror=alert(1)>')
  })
})

describe('GalleryCard copy button', () => {
  it('copies the prompt on click and everything on Shift-click', async () => {
    const oncopy = vi.fn()
    render(GalleryCard, {
      props: {
        imageId: 7,
        card: undefined,
        onopen: vi.fn(),
        onreveal: vi.fn(),
        oncopypath: vi.fn(),
        oncopy
      }
    })
    const button = screen.getByRole('button', { name: 'Copy prompt of Image 7' })
    await fireEvent.click(button)
    await fireEvent.click(button, { shiftKey: true })
    expect(oncopy.mock.calls.map(([variant]) => variant)).toEqual([
      CopyVariant.Prompt,
      CopyVariant.All
    ])
  })
})

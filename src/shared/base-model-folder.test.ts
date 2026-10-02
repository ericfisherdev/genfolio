import { describe, expect, it } from 'vitest'
import { baseModelFolder } from './base-model-folder'

describe('baseModelFolder', () => {
  it.each([
    ['SDXL 1.0', 'sdxl'],
    ['SDXL 0.9', 'sdxl'],
    ['SDXL Lightning', 'sdxl'],
    ['SDXL Hyper', 'sdxl'],
    ['SDXL 1.0 LCM', 'sdxl'],
    ['SD 1.5', 'sd15'],
    ['SD 1.4', 'sd15'],
    ['SD 1.5 LCM', 'sd15'],
    ['SD 2.1 768', 'sd2'],
    ['SD 3.5 Large', 'sd3'],
    ['Pony', 'pony'],
    ['Illustrious', 'illustrious'],
    ['NoobAI', 'noobai'],
    ['Flux.1 D', 'flux1'],
    ['Flux.1 Krea', 'flux1'],
    ['Flux.2 Klein 9B', 'flux2']
  ])('files %s under %s', (baseModel, folder) => {
    expect(baseModelFolder(baseModel)).toBe(folder)
  })

  it('folds case and spacing', () => {
    expect(baseModelFolder('  sdxl   1.0 ')).toBe('sdxl')
    expect(baseModelFolder('PONY')).toBe('pony')
  })

  it('makes a safe name of any other base model', () => {
    expect(baseModelFolder('Wan Video 14B t2v')).toBe('wan-video-14b-t2v')
    expect(baseModelFolder('Z Image/Turbo')).toBe('z-image-turbo')
    expect(baseModelFolder('Other')).toBe('other')
    expect(baseModelFolder('Qwen 2.1')).toBe('qwen-2.1')
  })

  it('never yields a path part', () => {
    for (const hostile of ['../../etc', '..', '.', '/', 'a/../b', '...', '\\x\\y', 'C:\\Windows']) {
      const folder = baseModelFolder(hostile)
      expect(folder).toMatch(/^[a-z0-9][a-z0-9.-]*$/)
      expect(folder).not.toContain('..')
    }
  })

  it('has a name for a missing or unreadable base model', () => {
    expect(baseModelFolder(null)).toBe('unknown')
    expect(baseModelFolder(undefined)).toBe('unknown')
    expect(baseModelFolder('')).toBe('unknown')
    expect(baseModelFolder('日本語')).toBe('unknown')
  })

  it('keeps a long name to a sensible length', () => {
    expect(baseModelFolder('a'.repeat(200)).length).toBe(60)
  })
})

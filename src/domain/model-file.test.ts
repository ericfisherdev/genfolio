import { describe, expect, it } from 'vitest'
import type { CivitaiFile, CivitaiVersion } from './civitai'
import { modelFileOf, safeModelFileName } from './model-file'

const file = (name: string, fields: Partial<CivitaiFile> = {}): CivitaiFile => ({
  name,
  sizeKb: 1,
  type: 'Model',
  primary: false,
  downloadUrl: 'https://civitai.com/api/download/models/1',
  hashes: {},
  ...fields
})

const version = (...files: CivitaiFile[]): CivitaiVersion => ({
  id: 1,
  name: 'v1',
  baseModel: 'SDXL 1.0',
  trainedWords: [],
  description: null,
  publishedAt: null,
  files
})

describe('safeModelFileName', () => {
  it('keeps an ordinary name', () => {
    expect(safeModelFileName('add-detail-xl.safetensors')).toBe('add-detail-xl.safetensors')
    expect(safeModelFileName('Abstract Painting - Style [LoRA] - Pony V6 XL.safetensors')).toBe(
      'Abstract Painting - Style [LoRA] - Pony V6 XL.safetensors'
    )
  })

  it('keeps the last path part only, whichever separator', () => {
    expect(safeModelFileName('../../etc/evil.safetensors')).toBe('evil.safetensors')
    expect(safeModelFileName('a\\b\\c.ckpt')).toBe('c.ckpt')
    expect(safeModelFileName('/abs/x.pt')).toBe('x.pt')
  })

  it('replaces characters a file system refuses and drops leading dots', () => {
    expect(safeModelFileName('a:b*c?d"e<f>g|h.safetensors')).toBe('a_b_c_d_e_f_g_h.safetensors')
    expect(safeModelFileName('...hidden.safetensors')).toBe('hidden.safetensors')
    expect(safeModelFileName('tab\there.safetensors')).toBe('tab_here.safetensors')
  })

  it('folds the extension to lower case and accepts only model extensions', () => {
    expect(safeModelFileName('X.SafeTensors')).toBe('X.safetensors')
    for (const bad of [
      'x.zip',
      'x.exe',
      'x.sh',
      'x',
      'x.safetensors.exe',
      '.safetensors',
      '..',
      ''
    ]) {
      expect(safeModelFileName(bad)).toBeNull()
    }
  })

  it('shortens a long name but keeps the extension', () => {
    const name = safeModelFileName(`${'a'.repeat(400)}.safetensors`)
    expect(name?.length).toBe(200)
    expect(name?.endsWith('.safetensors')).toBe(true)
  })
})

describe('modelFileOf', () => {
  it('prefers the primary model file', () => {
    expect(
      modelFileOf(version(file('a.safetensors'), file('b.safetensors', { primary: true })))?.name
    ).toBe('b.safetensors')
  })

  it('falls back to the first model file, skipping other types and extensions', () => {
    const chosen = modelFileOf(
      version(
        file('readme.txt'),
        file('config.yaml', { type: 'Config' }),
        file('vae.safetensors', { type: 'VAE' }),
        file('c.ckpt'),
        file('d.safetensors')
      )
    )
    expect(chosen?.name).toBe('c.ckpt')
  })

  it('accepts a file with no type', () => {
    expect(modelFileOf(version(file('a.safetensors', { type: null })))?.name).toBe('a.safetensors')
  })

  it('is null when no file is a model', () => {
    expect(modelFileOf(version())).toBeNull()
    expect(modelFileOf(version(file('a.zip')))).toBeNull()
  })
})

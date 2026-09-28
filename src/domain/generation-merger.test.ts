import { describe, expect, it } from 'vitest'
import { GenerationFormat, GeneratorKind } from '@shared/generation-kinds'
import { MetadataOrigin } from '@shared/metadata-kinds'
import type { ParsedGeneration, SourcedGeneration } from './generation'
import { GenerationMerger } from './generation-merger'

const merger = new GenerationMerger()

function source(
  origin: MetadataOrigin,
  format: GenerationFormat,
  generation: Partial<ParsedGeneration>
): SourcedGeneration {
  return {
    origin,
    format,
    generation: { generator: GeneratorKind.Unknown, params: {}, ...generation }
  }
}

const embeddedJson = (g: Partial<ParsedGeneration>): SourcedGeneration =>
  source(MetadataOrigin.PngText, GenerationFormat.FooocusJson, g)
const embeddedText = (g: Partial<ParsedGeneration>): SourcedGeneration =>
  source(MetadataOrigin.ExifUserComment, GenerationFormat.A1111Infotext, g)
const log = (g: Partial<ParsedGeneration>): SourcedGeneration =>
  source(MetadataOrigin.FooocusLog, GenerationFormat.FooocusJson, g)
const sidecar = (g: Partial<ParsedGeneration>): SourcedGeneration =>
  source(MetadataOrigin.SidecarTxt, GenerationFormat.A1111Infotext, g)

describe('GenerationMerger', () => {
  it('returns null without sources', () => {
    expect(merger.merge([])).toBeNull()
  })

  it('takes each field from the best source: embedded JSON, log, embedded text, sidecar', () => {
    const merged = merger.merge([
      sidecar({ prompt: 'sidecar', seed: '4', steps: 4, sampler: 's4', vae: 'v4' }),
      embeddedText({ prompt: 'caf? text', seed: '3', steps: 3, sampler: 's3' }),
      log({ prompt: 'café log', seed: '2', steps: 2 }),
      embeddedJson({ seed: '1' })
    ])
    expect(merged).toMatchObject({
      prompt: 'café log',
      origin: MetadataOrigin.FooocusLog,
      seed: '1',
      steps: 2,
      sampler: 's3',
      vae: 'v4'
    })
  })

  it('merges LoRAs by name, filling weight and hash from the best source that has them', () => {
    const merged = merger.merge([
      embeddedText({
        loras: [
          { name: 'detail', weight: null, hash: '0123456789ab' },
          { name: 'only-text', weight: 0.4, hash: null }
        ]
      }),
      log({ loras: [{ name: 'Detail', weight: 0.7, hash: null }] })
    ])
    expect(merged?.loras).toEqual([
      { name: 'Detail', weight: 0.7, hash: '0123456789ab' },
      { name: 'only-text', weight: 0.4, hash: null }
    ])
  })

  it("fills the best checkpoint's missing hash from a source naming the same model", () => {
    const merged = merger.merge([
      embeddedText({ checkpoint: { name: 'juggernaut', hash: 'c23324c71c' } }),
      log({ checkpoint: { name: 'sdxl/Juggernaut.safetensors', hash: null } }),
      sidecar({ refiner: { name: 'other', hash: 'abcdef0123' } })
    ])
    expect(merged?.checkpoint).toEqual({ name: 'Juggernaut', hash: 'c23324c71c' })
    expect(merged?.refiner).toEqual({ name: 'other', hash: 'abcdef0123' })
  })

  it('names the first known generator and keeps the best source params', () => {
    const merged = merger.merge([
      embeddedText({ generator: GeneratorKind.FwdFooocus, params: { Steps: '30' } }),
      log({ params: { steps: '30' } })
    ])
    expect(merged?.generator).toBe(GeneratorKind.FwdFooocus)
    expect(merged?.params).toEqual({ steps: '30' })
  })
})

import { describe, expect, it } from 'vitest'
import { GenerationFormat, GeneratorKind } from '@shared/generation-kinds'
import { MetadataOrigin } from '@shared/metadata-kinds'
import { fooocusParamsOf } from './fooocus-parameters'
import type { SourcedGeneration } from './generation'

const source = (
  origin: MetadataOrigin,
  format: GenerationFormat,
  params: Record<string, string>
): SourcedGeneration => ({
  origin,
  format,
  generation: { generator: GeneratorKind.Fooocus, params }
})

describe('fooocusParamsOf', () => {
  it('is undefined when no source is Fooocus JSON', () => {
    const a1111 = source(MetadataOrigin.PngText, GenerationFormat.A1111Infotext, { Steps: '20' })
    expect(fooocusParamsOf([a1111])).toBeUndefined()
  })

  it('takes each field from the best source, but a model file name over a stem', () => {
    const embedded = source(MetadataOrigin.PngText, GenerationFormat.FooocusJson, {
      prompt: 'exact',
      base_model: 'model_v1',
      refiner_model: 'None',
      vae: 'Default (model)',
      lora_combined_1: 'detail : 0.5',
      base_model_hash: 'abc'
    })
    const log = source(MetadataOrigin.FooocusLog, GenerationFormat.FooocusJson, {
      prompt: 'from the log',
      base_model: 'sdxl/model_v1.safetensors',
      refiner_model: 'None',
      vae: 'Default (model)',
      lora_combined_1: 'detail.safetensors : 0.5',
      sharpness: '2'
    })
    expect(fooocusParamsOf([embedded, log])).toEqual({
      prompt: 'exact',
      base_model: 'sdxl/model_v1.safetensors',
      refiner_model: 'None',
      vae: 'Default (model)',
      lora_combined_1: 'detail.safetensors : 0.5',
      base_model_hash: 'abc',
      sharpness: '2'
    })
  })

  it('keeps the best source of a model field when no source names its file', () => {
    const embedded = source(MetadataOrigin.PngText, GenerationFormat.FooocusJson, {
      base_model: 'model_v1'
    })
    const log = source(MetadataOrigin.FooocusLog, GenerationFormat.FooocusJson, {
      base_model: 'model_v2'
    })
    expect(fooocusParamsOf([embedded, log])).toEqual({ base_model: 'model_v1' })
  })
})

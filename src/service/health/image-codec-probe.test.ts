import { Transformer } from '@napi-rs/image'
import { describe, expect, it, vi } from 'vitest'
import { ImageCodecProbe } from './image-codec-probe'

type TransformerClass = ConstructorParameters<typeof ImageCodecProbe>[0]

/** Codec whose encoders all succeed except AVIF, which rejects like a missing native codec. */
function codecWithoutAvif(): TransformerClass {
  const encoded = Buffer.from('encoded')
  const source = {
    png: async () => encoded,
    jpeg: async () => encoded,
    webpLossless: async () => encoded,
    avif: () => Promise.reject(new Error('avif codec not compiled in'))
  }
  class FakeTransformer {
    static fromRgbaPixels(): typeof source {
      return source
    }
    async metadata(): Promise<{ width: number; height: number }> {
      return { width: 4, height: 4 }
    }
  }
  return FakeTransformer as unknown as TransformerClass
}

describe('ImageCodecProbe', () => {
  it('round-trips every gallery format', async () => {
    const result = await new ImageCodecProbe(Transformer).probe()
    expect(result.decodableFormats).toEqual(['png', 'jpeg', 'webp', 'avif'])
  })

  it('reports a failing codec as not decodable instead of rejecting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const result = await new ImageCodecProbe(codecWithoutAvif()).probe()
    expect(result.decodableFormats).toEqual(['png', 'jpeg', 'webp'])
  })
})

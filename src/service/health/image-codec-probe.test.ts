import { Transformer } from '@napi-rs/image'
import { describe, expect, it } from 'vitest'
import { ImageCodecProbe } from './image-codec-probe'

describe('ImageCodecProbe', () => {
  it('round-trips every gallery format', async () => {
    const result = await new ImageCodecProbe(Transformer).probe()
    expect(result.decodableFormats).toEqual(['png', 'jpeg', 'webp', 'avif'])
  })
})

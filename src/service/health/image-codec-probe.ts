import type { Transformer } from '@napi-rs/image'
import type { ServiceHealth } from '@shared/service-health'
import type { HealthProbe } from './health-probe'

type TransformerClass = typeof Transformer

const PROBED_FORMATS = ['png', 'jpeg', 'webp', 'avif'] as const
type ProbedFormat = (typeof PROBED_FORMATS)[number]

/**
 * Encodes a tiny image in each gallery format and decodes it back, proving the codec
 * works in this process. sharp is not used: it segfaults in Electron on Linux (electron#46323).
 */
export class ImageCodecProbe implements HealthProbe {
  constructor(private readonly transformer: TransformerClass) {}

  async probe(): Promise<Partial<ServiceHealth>> {
    const pixels = new Uint8Array(4 * 4 * 4).fill(255)
    const results = await Promise.all(
      PROBED_FORMATS.map((format) => this.roundTrip(pixels, format))
    )
    return { decodableFormats: PROBED_FORMATS.filter((_, index) => results[index]) }
  }

  /** A codec that throws counts as not decodable; one missing format must not fail the report. */
  private async roundTrip(pixels: Uint8Array, format: ProbedFormat): Promise<boolean> {
    try {
      const encoded = await this.encode(this.transformer.fromRgbaPixels(pixels, 4, 4), format)
      const metadata = await new this.transformer(encoded).metadata()
      return metadata.width === 4 && metadata.height === 4
    } catch (error) {
      console.error(`[library-service] codec round trip failed for ${format}`, error)
      return false
    }
  }

  private encode(source: Transformer, format: ProbedFormat): Promise<Buffer> {
    switch (format) {
      case 'png':
        return source.png()
      case 'jpeg':
        return source.jpeg()
      case 'webp':
        return source.webpLossless()
      case 'avif':
        return source.avif()
    }
  }
}

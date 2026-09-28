import { Transformer } from '@napi-rs/image'
import type { ImageResizer } from '@domain/image-resizer'

/** `@napi-rs/image` runs decode, resize and encode on the libuv thread pool, off the event loop. */
export class NapiImageResizer implements ImageResizer {
  constructor(private readonly quality = 80) {}

  async resizeToWebp(source: Uint8Array, maxWidth: number): Promise<Uint8Array<ArrayBuffer>> {
    const oriented = new Transformer(source).rotate()
    const { width } = await oriented.metadata()
    const resized = width > maxWidth ? oriented.resize({ width: maxWidth }) : oriented
    return new Uint8Array(await resized.webp(this.quality))
  }
}

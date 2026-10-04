import { imageSize } from 'image-size'
import { ImageReadError, UnsupportedImageError, type ImageHeader } from '@domain/image-header'
import { ImageFormat } from '@shared/image-format'
import type { ByteSource } from '../metadata/byte-source'

/** Large enough for PNG/WebP/AVIF/GIF headers and most JPEG EXIF blocks. */
export const HEADER_READ_BYTES = 64 * 1024

const FORMAT_BY_TYPE: Readonly<Record<string, ImageFormat>> = {
  png: ImageFormat.Png,
  jpg: ImageFormat.Jpeg,
  webp: ImageFormat.Webp,
  avif: ImageFormat.Avif,
  gif: ImageFormat.Gif
}

/** EXIF orientations 5–8 rotate by 90°, so the displayed width is the stored height. */
const isQuarterTurn = (orientation: number | undefined): boolean =>
  orientation !== undefined && orientation >= 5 && orientation <= 8

/** Only JPEG can place its frame header (SOF) arbitrarily far in, after APPn segments. */
const startsLikeJpeg = (bytes: Uint8Array): boolean => bytes[0] === 0xff && bytes[1] === 0xd8

/**
 * Reads the first {@link HEADER_READ_BYTES} bytes of an image and parses them with `image-size`,
 * falling back to the whole file only for a JPEG whose frame header lies past the head
 * (SOF after large EXIF). Any other unparseable file is unsupported without a full read.
 */
export class ImageSizeHeaderReader {
  /**
   * The header of an image already open as `source` (`path` only names it in errors), so a
   * caller that reads more from the same file doesn't open it again. Rejects with
   * {@link UnsupportedImageError} or {@link ImageReadError}.
   */
  async fromSource(source: ByteSource, path: string): Promise<ImageHeader> {
    let head: Uint8Array
    try {
      head = await source.read(0, HEADER_READ_BYTES)
    } catch (cause) {
      throw new ImageReadError(path, { cause })
    }
    const canFallBack = head.length < source.size && startsLikeJpeg(head)
    const parsed =
      this.parse(head) ?? (canFallBack ? this.parse(await this.readAll(source, path)) : undefined)
    if (!parsed) throw new UnsupportedImageError(path)
    return parsed
  }

  private parse(bytes: Uint8Array): ImageHeader | undefined {
    let size: ReturnType<typeof imageSize>
    try {
      size = imageSize(bytes)
    } catch {
      return undefined
    }
    const format = size.type === undefined ? undefined : FORMAT_BY_TYPE[size.type]
    if (!format || !size.width || !size.height) return undefined
    return isQuarterTurn(size.orientation)
      ? { format, width: size.height, height: size.width }
      : { format, width: size.width, height: size.height }
  }

  private async readAll(source: ByteSource, path: string): Promise<Uint8Array> {
    try {
      return await source.read(0, source.size)
    } catch (cause) {
      throw new ImageReadError(path, { cause })
    }
  }
}

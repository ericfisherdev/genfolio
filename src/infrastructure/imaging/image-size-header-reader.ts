import { open, readFile } from 'node:fs/promises'
import { imageSize } from 'image-size'
import {
  ImageReadError,
  UnsupportedImageError,
  type ImageHeader,
  type ImageHeaderReader
} from '@domain/image-header'
import { ImageFormat } from '@shared/image-format'

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

interface HeadRead {
  readonly bytes: Uint8Array
  readonly isWholeFile: boolean
}

/**
 * Reads the first {@link HEADER_READ_BYTES} bytes and parses them with `image-size`,
 * falling back to the whole file only for a JPEG whose frame header lies past the head
 * (SOF after large EXIF). Any other unparseable file is unsupported without a full read.
 */
export class ImageSizeHeaderReader implements ImageHeaderReader {
  async read(path: string): Promise<ImageHeader> {
    const head = await this.readHead(path)
    const canFallBack = !head.isWholeFile && startsLikeJpeg(head.bytes)
    const parsed =
      this.parse(head.bytes) ?? (canFallBack ? this.parse(await this.readAll(path)) : undefined)
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

  private async readHead(path: string): Promise<HeadRead> {
    try {
      const file = await open(path, 'r')
      try {
        const buffer = Buffer.alloc(HEADER_READ_BYTES)
        const { bytesRead } = await file.read(buffer, 0, HEADER_READ_BYTES, 0)
        return { bytes: buffer.subarray(0, bytesRead), isWholeFile: bytesRead < HEADER_READ_BYTES }
      } finally {
        await file.close()
      }
    } catch (cause) {
      throw new ImageReadError(path, { cause })
    }
  }

  private async readAll(path: string): Promise<Uint8Array> {
    try {
      return await readFile(path)
    } catch (cause) {
      throw new ImageReadError(path, { cause })
    }
  }
}

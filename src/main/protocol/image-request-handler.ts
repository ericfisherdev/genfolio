import type { OpenImageFile } from '@application/image-file-resolver'
import type { ImageId } from '@domain/library'
import { ImageDisplay, usesGridCopy } from '@shared/display-rendition'
import { contentTypeFor } from './content-type'
import { parseImageRequest } from './image-request'

export interface ImageDimensions {
  readonly width: number
  readonly height: number
}

export interface ImageRequestDependencies {
  /** The stored size of an image, from the database alone; `undefined` for unknown ids. */
  readonly imageDimensions: (id: ImageId) => ImageDimensions | undefined
  /** Opens and verifies the image file; see ImageFileResolver. */
  readonly openImage: (id: ImageId) => Promise<OpenImageFile | undefined>
  /** Body stream over the verified handle; the stream closes the handle when it ends. */
  readonly streamFile: (file: OpenImageFile) => ReadableStream<Uint8Array>
  /** Asks the library service for an in-memory WebP rendition; null when the image is gone. */
  readonly renderDisplayCopy: (imageId: number, maxWidth: number) => Promise<Uint8Array | null>
}

/** A versioned URL changes whenever the file does, so its response never goes stale. */
const IMMUTABLE = 'max-age=31536000, immutable'
const NO_STORE = 'no-store'

const notFound = (): Response => new Response(null, { status: 404 })

/**
 * Handles `genfolio:` requests. Grid renditions come from the service, which verifies the
 * file itself, so main touches no file for them. Originals are streamed from the handle
 * whose inode was verified, never re-opened by path. Every failure is a 404 that reveals
 * nothing about paths.
 */
export function createImageRequestHandler(
  deps: ImageRequestDependencies
): (request: Request) => Promise<Response> {
  return async (request) => {
    const parsed = parseImageRequest(request.url)
    if (!parsed) return notFound()
    const imageId = parsed.imageId as ImageId
    const cacheControl = parsed.version === undefined ? NO_STORE : IMMUTABLE

    if (parsed.display === ImageDisplay.Grid) {
      const size = deps.imageDimensions(imageId)
      if (!size) return notFound()
      if (usesGridCopy(size.width, parsed.width)) {
        const copy = await deps.renderDisplayCopy(parsed.imageId, parsed.width)
        if (!copy) return notFound()
        // Arrived by structured clone, so it owns a plain ArrayBuffer: no copy needed.
        return new Response(copy as Uint8Array<ArrayBuffer>, {
          headers: { 'content-type': 'image/webp', 'cache-control': cacheControl }
        })
      }
    }

    const file = await deps.openImage(imageId)
    if (!file) return notFound()
    return new Response(deps.streamFile(file), {
      headers: { 'content-type': contentTypeFor(file.fileName), 'cache-control': cacheControl }
    })
  }
}

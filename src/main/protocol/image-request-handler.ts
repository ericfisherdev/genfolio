import type { OpenImageFile } from '@application/image-file-resolver'
import type { ImageId } from '@domain/library'
import { GRID_COPY_WIDTH, ImageDisplay, usesGridCopy } from '@shared/display-rendition'
import { contentTypeFor } from './content-type'
import { parseImageRequest } from './image-request'

export interface ImageRequestDependencies {
  /** Opens and verifies the image file; see ImageFileResolver. */
  readonly openImage: (id: ImageId) => Promise<OpenImageFile | undefined>
  /** Body stream over the verified handle; the stream closes the handle when it ends. */
  readonly streamFile: (file: OpenImageFile) => ReadableStream<Uint8Array>
  /** Asks the library service for an in-memory WebP copy; null when the image is gone. */
  readonly renderDisplayCopy: (imageId: number, maxWidth: number) => Promise<Uint8Array | null>
}

const notFound = (): Response => new Response(null, { status: 404 })

/**
 * Handles `genfolio:` requests. Originals are streamed from the handle whose inode was
 * verified, never re-opened by path. Every failure is a 404 that reveals nothing about paths.
 */
export function createImageRequestHandler(
  deps: ImageRequestDependencies
): (request: Request) => Promise<Response> {
  return async (request) => {
    const parsed = parseImageRequest(request.url)
    if (!parsed) return notFound()
    const file = await deps.openImage(parsed.imageId as ImageId)
    if (!file) return notFound()

    if (parsed.display === ImageDisplay.Grid && usesGridCopy(file.width, file.height)) {
      await file.handle.close()
      const copy = await deps.renderDisplayCopy(parsed.imageId, GRID_COPY_WIDTH)
      if (!copy) return notFound()
      return new Response(new Uint8Array(copy), {
        headers: { 'content-type': 'image/webp', 'cache-control': 'no-store' }
      })
    }

    return new Response(deps.streamFile(file), {
      headers: { 'content-type': contentTypeFor(file.fileName), 'cache-control': 'no-store' }
    })
  }
}

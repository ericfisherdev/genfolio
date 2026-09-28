import type { ImageFileResolver } from '@application/image-file-resolver'
import type { ImageId } from '@domain/library'
import { GRID_COPY_WIDTH, ImageDisplay, usesGridCopy } from '@shared/display-rendition'
import { parseImageRequest } from './image-request'

export interface ImageRequestDependencies {
  readonly files: Pick<ImageFileResolver, 'resolve'>
  /** Streams a local file (Electron `net.fetch` of a `file:` URL). */
  readonly fetchFile: (path: string) => Promise<Response>
  /** Asks the library service for an in-memory WebP copy; null when the image is gone. */
  readonly renderDisplayCopy: (imageId: number, maxWidth: number) => Promise<Uint8Array | null>
}

const notFound = (): Response => new Response(null, { status: 404 })

/** Handles `genfolio:` requests; every failure is a 404 that reveals nothing about paths. */
export function createImageRequestHandler(
  deps: ImageRequestDependencies
): (request: Request) => Promise<Response> {
  return async (request) => {
    const parsed = parseImageRequest(request.url)
    if (!parsed) return notFound()
    const file = await deps.files.resolve(parsed.imageId as ImageId)
    if (!file) return notFound()

    if (parsed.display === ImageDisplay.Grid && usesGridCopy(file.width, file.height)) {
      const copy = await deps.renderDisplayCopy(parsed.imageId, GRID_COPY_WIDTH)
      if (!copy) return notFound()
      return new Response(new Uint8Array(copy), {
        headers: { 'content-type': 'image/webp', 'cache-control': 'no-store' }
      })
    }

    const original = await deps.fetchFile(file.path)
    if (!original.ok) return notFound()
    const headers = new Headers(original.headers)
    headers.set('cache-control', 'no-store')
    return new Response(original.body, { status: 200, headers })
  }
}

import { protocol } from 'electron'
import { IMAGE_SCHEME } from '@shared/display-rendition'

/** Must run before `app` is ready. */
export function registerImageSchemeAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/** Must run after `app` is ready. */
export function handleImageScheme(handler: (request: Request) => Promise<Response>): void {
  protocol.handle(IMAGE_SCHEME, handler)
}

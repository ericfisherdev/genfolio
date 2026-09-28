import { pathToFileURL } from 'node:url'

/** Where the renderer is loaded from: the Vite dev server in development, a bundled file otherwise. */
export type RendererEntry =
  | { readonly kind: 'dev-server'; readonly url: string }
  | { readonly kind: 'file'; readonly path: string }

export function rendererEntryUrl(entry: RendererEntry): string {
  return entry.kind === 'dev-server' ? entry.url : pathToFileURL(entry.path).href
}

/** True when `url` points at the app's own renderer document (navigation within the app). */
export function isAppUrl(url: string, entry: RendererEntry): boolean {
  let target: URL
  try {
    target = new URL(url)
  } catch {
    return false
  }
  const app = new URL(rendererEntryUrl(entry))
  if (entry.kind === 'dev-server') return target.origin === app.origin
  return target.protocol === 'file:' && target.host === app.host && target.pathname === app.pathname
}

import type { WebContents } from 'electron'
import { isAppUrl, type RendererEntry } from './app-url'

/** Denies new windows and blocks navigation away from the app's renderer document. */
export function guardNavigation(contents: WebContents, entry: RendererEntry): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url, entry)) event.preventDefault()
  })
}

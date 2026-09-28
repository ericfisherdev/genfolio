import type { WebContents } from 'electron'
import { isAppUrl, type RendererEntry } from './app-url'

interface NavigationAttempt {
  readonly url: string
  preventDefault(): void
}

export type GuardedContents = Pick<WebContents, 'setWindowOpenHandler' | 'on'>

/**
 * Denies new windows and blocks every navigation away from the app's renderer document:
 * `will-frame-navigate` covers the main frame and sub-frames, `will-redirect` covers
 * server-side redirects, which no navigate event reports.
 */
export function guardNavigation(contents: GuardedContents, entry: RendererEntry): void {
  const denyForeignUrl = (attempt: NavigationAttempt): void => {
    if (!isAppUrl(attempt.url, entry)) attempt.preventDefault()
  }
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-frame-navigate', denyForeignUrl)
  contents.on('will-redirect', denyForeignUrl)
}

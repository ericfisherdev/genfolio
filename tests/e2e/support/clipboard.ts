import type { ElectronApplication } from '@playwright/test'

/**
 * Records what main writes to the clipboard instead of reading the system clipboard, which
 * every app on the test's X display shares: a parallel test's app could replace (or, by
 * quitting, clear) it between the copy and the read.
 */
export async function recordClipboard(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ clipboard }) => {
    ;(globalThis as { copiedText?: string }).copiedText = ''
    clipboard.writeText = async (text: string) => {
      ;(globalThis as { copiedText?: string }).copiedText = text
    }
  })
}

/** The last text main copied since {@link recordClipboard}. */
export const copiedText = (app: ElectronApplication): Promise<string> =>
  app.evaluate(() => (globalThis as { copiedText?: string }).copiedText ?? '')

import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import type { ElectronApplication, Page } from '@playwright/test'
import type { AddRootViaDialogResult } from '../../../src/shared/library'
import type { ScanEvent } from '../../../src/shared/scan'

const FIXTURES = resolve(__dirname, '../../fixtures/fooocus')

/** A library folder holding copies of the committed Fooocus fixture images. */
export function makeLibrary(): string {
  const root = mkdtempSync(join(tmpdir(), 'genfolio-library-'))
  const day = join(root, '2026-09-27')
  mkdirSync(day)
  for (const name of readdirSync(FIXTURES).filter((n) => /\.(png|webp|jpe?g)$/.test(n))) {
    copyFileSync(join(FIXTURES, name), join(day, name))
  }
  return root
}

/** Makes the folder picker return `path` (or cancel when undefined). */
export async function stubFolderPicker(
  app: ElectronApplication,
  path: string | undefined
): Promise<void> {
  await app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () =>
      picked === undefined
        ? { canceled: true, filePaths: [] }
        : { canceled: false, filePaths: [picked] }) as unknown as typeof dialog.showOpenDialog
  }, path)
}

/** Adds via the dialog and, when a scan starts, waits for its finished event. */
export function addAndAwaitScan(
  page: Page
): Promise<{ result: AddRootViaDialogResult; finished: ScanEvent | undefined }> {
  return page.evaluate(async () => {
    let resolveFinished: (event: ScanEvent) => void = () => undefined
    const finished = new Promise<ScanEvent>((resolve) => (resolveFinished = resolve))
    const off = window.genfolio.onScanEvent((event) => {
      if (event.type !== 'progress') resolveFinished(event)
    })
    const result = await window.genfolio.addRootViaDialog()
    const event = result.outcome === 'added' ? await finished : undefined
    off()
    return { result, finished: event }
  })
}

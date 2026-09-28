import type { MessageBoxOptions, MessageBoxReturnValue } from 'electron'
import type { DeleteConfirmer } from '@application/image-deleter'
import { formatBytes } from '@shared/format-bytes'

/** Shows a modal message box and resolves the button chosen; injectable for tests. */
export type ShowMessageBox = (options: MessageBoxOptions) => Promise<MessageBoxReturnValue>

const CANCEL = 0
const DELETE = 1

/**
 * Confirmations shown by main, never by the renderer, so a compromised page cannot skip
 * them. Cancel is the default and the Escape answer.
 */
export class DialogDeleteConfirmer implements DeleteConfirmer {
  constructor(private readonly show: ShowMessageBox) {}

  confirmPermanent(count: number, totalBytes: number): Promise<boolean> {
    return this.ask(
      `Delete ${files(count)} permanently?`,
      `${formatBytes(totalBytes)} will be removed from disk. This cannot be undone.`
    )
  }

  confirmPermanentAfterTrashFailed(count: number, totalBytes: number): Promise<boolean> {
    return this.ask(
      `${files(count, true)} could not be moved to the trash. Delete permanently instead?`,
      `${formatBytes(totalBytes)} will be removed from disk. This cannot be undone. ` +
        'Choose Cancel to keep the files.'
    )
  }

  private async ask(message: string, detail: string): Promise<boolean> {
    const { response } = await this.show({
      type: 'warning',
      message,
      detail,
      buttons: ['Cancel', 'Delete permanently'],
      defaultId: CANCEL,
      cancelId: CANCEL,
      noLink: true
    })
    return response === DELETE
  }
}

function files(count: number, capital = false): string {
  const text = `${new Intl.NumberFormat().format(count)} image file${count === 1 ? '' : 's'}`
  return capital ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

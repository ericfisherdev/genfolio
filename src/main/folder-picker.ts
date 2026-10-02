import { BrowserWindow, dialog } from 'electron'
import type { FolderPicker } from './ipc/library-channels'

export const pickFolderWithDialog: FolderPicker = async (title) => {
  const options = { title, properties: ['openDirectory' as const, 'createDirectory' as const] }
  const parent = BrowserWindow.getFocusedWindow()
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? undefined : result.filePaths[0]
}

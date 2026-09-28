import { BrowserWindow, dialog } from 'electron'
import type { FolderPicker } from './ipc/library-channels'

export const pickFolderWithDialog: FolderPicker = async () => {
  const options = { title: 'Add folder to library', properties: ['openDirectory' as const] }
  const parent = BrowserWindow.getFocusedWindow()
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? undefined : result.filePaths[0]
}

import type { ElectronApplication } from '@playwright/test'

/**
 * Replaces the system trash in main with the folder `trashDir`, failing for file names in
 * `refuse`, and answers main's confirmation dialogs with `answer` (0 Cancel, 1 Delete
 * permanently), recording their messages for {@link askedToDelete}.
 */
export async function stubTrashAndDialogs(
  app: ElectronApplication,
  trashDir: string,
  options: { refuse?: string[]; answer: number }
): Promise<void> {
  await app.evaluate(
    ({ shell, dialog }, { trashDir, refuse, answer }) => {
      const fs = process.getBuiltinModule('node:fs')
      const path = process.getBuiltinModule('node:path')
      shell.trashItem = async (file: string) => {
        if (refuse.includes(path.basename(file))) {
          throw Object.assign(new Error('trash unavailable'), { code: 'EXDEV' })
        }
        fs.renameSync(file, path.join(trashDir, path.basename(file)))
      }
      const asked: string[] = []
      ;(globalThis as { askedToDelete?: string[] }).askedToDelete = asked
      dialog.showMessageBox = (async (...args: unknown[]) => {
        const options = args.at(-1) as { message: string }
        asked.push(options.message)
        return { response: answer, checkboxChecked: false }
      }) as unknown as typeof dialog.showMessageBox
    },
    { trashDir, refuse: options.refuse ?? [], answer: options.answer }
  )
}

/** The messages of main's confirmation dialogs since the stub was installed. */
export const askedToDelete = (app: ElectronApplication): Promise<string[]> =>
  app.evaluate(() => (globalThis as { askedToDelete?: string[] }).askedToDelete ?? [])

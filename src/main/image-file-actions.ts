import type { ImageFileResolver } from '@application/image-file-resolver'
import type { ImageId } from '@domain/library'

export interface DesktopIntegration {
  showItemInFolder(path: string): void
  writeClipboardText(text: string): void
}

/**
 * File-manager and clipboard actions on an image, done in main with the verified path so the
 * renderer never handles file paths. Each resolves false when the image cannot be found.
 */
export class ImageFileActions {
  constructor(
    private readonly files: Pick<ImageFileResolver, 'open'>,
    private readonly desktop: DesktopIntegration
  ) {}

  reveal(imageId: number): Promise<boolean> {
    return this.withPath(imageId, (path) => this.desktop.showItemInFolder(path))
  }

  copyPath(imageId: number): Promise<boolean> {
    return this.withPath(imageId, (path) => this.desktop.writeClipboardText(path))
  }

  private async withPath(imageId: number, action: (path: string) => void): Promise<boolean> {
    const file = await this.files.open(imageId as ImageId)
    if (!file) return false
    await file.handle.close()
    action(file.path)
    return true
  }
}

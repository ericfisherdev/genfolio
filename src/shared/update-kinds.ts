// Runtime enums with no zod dependency, safe for the renderer bundle.

/** Where an in-app update stands; main reports each change to the renderer. */
export enum UpdatePhase {
  Checking = 'checking',
  UpToDate = 'up-to-date',
  Available = 'available',
  Downloading = 'downloading',
  Downloaded = 'downloaded',
  Installing = 'installing',
  Cancelled = 'cancelled',
  Failed = 'failed'
}

/** How Genfolio was installed, which decides how an update is applied. */
export enum InstallMethod {
  /** The AppImage file is replaced in place; no elevation. */
  AppImage = 'appimage',
  /** `pacman -U` through the system's authentication dialog. */
  Pacman = 'pacman',
  /** `dpkg -i` through the system's authentication dialog. */
  Deb = 'deb',
  /** A development or unpacked build; updates are downloaded by hand. */
  Unsupported = 'unsupported'
}

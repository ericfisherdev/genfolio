// Runtime enums with no zod dependency, safe for the renderer bundle.

/** Where a raw metadata record was found. */
export enum MetadataOrigin {
  PngText = 'png-text',
  ExifUserComment = 'exif-user-comment',
  ExifImageDescription = 'exif-image-description',
  ExifSoftware = 'exif-software',
  ExifMakerNote = 'exif-maker-note',
  SidecarTxt = 'sidecar-txt',
  /** An entry of the image's Fooocus `log.html`, stored as its fields' JSON. */
  FooocusLog = 'fooocus-log'
}

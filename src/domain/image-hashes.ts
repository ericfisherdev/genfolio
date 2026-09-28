/** What identifies an image's content: its exact bytes, and how it looks. */
export interface ImageHashes {
  readonly sha256: Uint8Array
  readonly dhash: bigint
  readonly phash: bigint
}

/** Rejects when the bytes are not a decodable image. */
export interface ImageHasher {
  hash(bytes: Uint8Array): Promise<ImageHashes>
}

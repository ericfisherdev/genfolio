// Runtime enums with no zod dependency, safe for the renderer bundle.

/** The program that wrote an image's generation data. */
export enum GeneratorKind {
  A1111 = 'a1111',
  Fooocus = 'fooocus',
  FwdFooocus = 'fwd-fooocus',
  UnFooocused = 'unfooocused',
  Unknown = 'unknown'
}

/** How a model hash was computed, told apart by its length. */
export enum HashKind {
  /** sha256 of the whole file, first 10 hex digits (A1111 and Fooocus checkpoints, Fooocus LoRAs). */
  AutoV2 = 'autov2',
  /** A1111's 12-hex LoRA hash (sshs/addnet). */
  A1111Lora = 'a1111-lora',
  /** Legacy 8-hex checkpoint hash; not comparable with AutoV2. */
  AutoV1 = 'autov1',
  Unknown = 'unknown'
}

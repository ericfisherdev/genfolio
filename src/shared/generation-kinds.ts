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

/** The text format a generation was parsed from; with its origin, it sets the source's precedence. */
export enum GenerationFormat {
  FooocusJson = 'fooocus-json',
  A1111Infotext = 'a1111-infotext',
  UnFooocusedText = 'unfooocused-text'
}

/** What a stored model is used as. */
export enum ModelKind {
  Checkpoint = 'checkpoint',
  Lora = 'lora'
}

/** What a resource row on the detail page stands for. */
export enum ResourceKind {
  Checkpoint = 'checkpoint',
  Refiner = 'refiner',
  Lora = 'lora'
}

/** Which text a copy action puts on the clipboard. */
export enum CopyVariant {
  Prompt = 'prompt',
  /** The prompt with `<lora:name:weight>` tags appended, ready to paste into A1111. */
  PromptWithLoras = 'prompt-with-loras',
  Negative = 'negative',
  /** Everything, as A1111 infotext. */
  All = 'all',
  /** Everything, as the JSON Fooocus's prompt box loads with "Load Parameters". */
  Fooocus = 'fooocus'
}

# Fooocus fixtures

Real FwdFooocus (v2026.09.7) output, generated for this repository and safe to publish.
All images are 1024×1024 and use the same prompt, which includes weights, quotes, a colon
and non-ASCII characters (`é`, `桜`) to exercise metadata parsing.

| File                            | Format | Embedded metadata                                                         | LoRAs |
| ------------------------------- | ------ | ------------------------------------------------------------------------- | ----- |
| `2026-09-27_20-36-27_8675.png`  | PNG    | `fooocus` scheme (JSON in `parameters` tEXt/iTXt, `fooocus_scheme` chunk) | 1     |
| `2026-09-27_20-38-19_1754.png`  | PNG    | `a1111` scheme (infotext in `parameters`)                                 | 2     |
| `2026-09-27_20-43-28_2563.webp` | WebP   | `a1111` scheme in EXIF IFD0 UserComment; non-ASCII replaced by `?`        | 1     |
| `2026-09-27_20-45-48_2563.webp` | WebP   | `fooocus` scheme in EXIF IFD0 UserComment                                 | 2     |
| `2026-09-27_20-47-27_2563.png`  | PNG    | **none**: only `log.html` describes it                                    | 1     |
| `2026-09-27_20-48-56_2563.jpeg` | JPEG   | `a1111` scheme in EXIF IFD0 UserComment                                   | 0     |

`log.html` is the Fooocus daily log for exactly these six images (newest first). The
original contained entries for other images, which were removed; the file is otherwise
unmodified.

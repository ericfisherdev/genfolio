// Renders build/icon.svg to the PNG sizes the Linux packages and the window use.
// Run after editing the SVG: node scripts/render-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Transformer } from '@napi-rs/image'

const root = join(import.meta.dirname, '..')
const svg = readFileSync(join(root, 'build/icon.svg'))
const SIZES = [16, 24, 32, 48, 64, 128, 256, 512]

const master = await Transformer.fromSvg(svg).png()
for (const size of SIZES) {
  const png = await new Transformer(master).resize(size, size).png()
  writeFileSync(join(root, `build/icons/${size}x${size}.png`), png)
}
const large = await new Transformer(master).resize(512, 512).png()
writeFileSync(join(root, 'build/icon.png'), large)
writeFileSync(join(root, 'resources/icon.png'), large)
console.log(`Rendered ${SIZES.length} sizes`)

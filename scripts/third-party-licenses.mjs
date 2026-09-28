// Writes resources/THIRD_PARTY_LICENSES.txt: the licence of every production dependency
// shipped in the packages. Run by the package scripts; the output isn't committed.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const paths = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], {
  cwd: root,
  encoding: 'utf8'
})
  .split('\n')
  .filter((path) => path && path !== root)

const seen = new Set()
const sections = []
for (const path of paths.sort()) {
  const manifest = join(path, 'package.json')
  if (!existsSync(manifest)) continue
  const { name, version, license } = JSON.parse(readFileSync(manifest, 'utf8'))
  const id = `${name}@${version}`
  if (seen.has(id)) continue
  seen.add(id)
  const file = readdirSync(path).find((entry) => /^(licen[cs]e|copying)(\.|$)/i.test(entry))
  const text = file
    ? readFileSync(join(path, file), 'utf8').trim()
    : `License: ${license ?? 'unknown'}`
  sections.push(`${id}\n${'-'.repeat(id.length)}\n${text}\n`)
}

writeFileSync(
  join(root, 'resources/THIRD_PARTY_LICENSES.txt'),
  `Genfolio includes the following third-party software.\n\n${sections.join('\n')}`
)
console.log(`Wrote the licences of ${sections.length} packages`)

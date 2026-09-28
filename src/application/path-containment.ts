import { isAbsolute, relative, sep } from 'node:path'

/** True when `child` lies strictly inside `parent` (both absolute, resolved). */
export function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

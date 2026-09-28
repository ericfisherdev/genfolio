import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { describeError, LogLevel, RotatingFileLog } from './rotating-file-log'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'genfolio-log-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('RotatingFileLog', () => {
  it('rotates by size and keeps a bounded number of files', () => {
    const log = new RotatingFileLog(join(dir, 'logs'), 'service', { maxBytes: 100, keep: 3 })
    for (let line = 0; line < 40; line++) log.write(LogLevel.Warn, `line ${line} ${'x'.repeat(20)}`)
    expect(readdirSync(join(dir, 'logs')).sort()).toEqual([
      'service.1.log',
      'service.2.log',
      'service.log'
    ])
    const current = readFileSync(join(dir, 'logs', 'service.log'), 'utf8')
    expect(current).toMatch(/WARN line 39/)
    expect(current.length).toBeLessThan(200)
  })

  it('logs errors by name and code, never their message with the path', () => {
    const log = new RotatingFileLog(dir, 'main')
    const error = Object.assign(
      new Error(`ENOENT: no such file, open '/home/someone/library/a.png'`),
      {
        code: 'ENOENT'
      }
    )
    log.write(LogLevel.Error, `scan failed: ${describeError(error)}`)
    const text = readFileSync(join(dir, 'main.log'), 'utf8')
    expect(text).toContain('ERROR scan failed: Error (ENOENT)')
    expect(text).not.toContain('/home/someone')
    expect(describeError('text')).toBe('string')
  })
})

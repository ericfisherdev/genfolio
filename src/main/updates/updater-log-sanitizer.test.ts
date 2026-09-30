import { describe, expect, it } from 'vitest'
import { sanitizeUpdaterLog } from './updater-log-sanitizer'

describe('sanitizeUpdaterLog', () => {
  it('keeps the first line and URLs, and replaces file paths', () => {
    expect(
      sanitizeUpdaterLog(
        'Cannot check for updates: HttpError: 404 https://example.test/latest-linux.yml\n    at x (/opt/Genfolio/resources/app.asar/a.js:1:2)'
      )
    ).toBe('Cannot check for updates: HttpError: 404 https://example.test/latest-linux.yml')
    expect(
      sanitizeUpdaterLog(
        'New version 0.2.0 has been downloaded to /home/me/.cache/genfolio-updater/pending/x.AppImage'
      )
    ).toBe('New version 0.2.0 has been downloaded to <path>')
    expect(sanitizeUpdaterLog('Running (/usr/bin/pkexec) "~/x" and /a/b')).toBe(
      'Running <path> <path> and <path>'
    )
  })
})

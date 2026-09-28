import { describe, expect, it, vi } from 'vitest'
import { ProblemReports } from './problem-reports'

function setup(): {
  problems: ProblemReports
  notify: ReturnType<typeof vi.fn>
  openLogs: ReturnType<typeof vi.fn>
  reportRendererError: ReturnType<typeof vi.fn>
} {
  const notify = vi.fn()
  const openLogs = vi.fn(async () => true)
  const reportRendererError = vi.fn(async () => undefined)
  return {
    problems: new ProblemReports({ openLogs, reportRendererError }, { notify }),
    notify,
    openLogs,
    reportRendererError
  }
}

describe('ProblemReports', () => {
  it('says how many files a scan could not read, with a way to the logs', () => {
    const { problems, notify, openLogs } = setup()
    problems.scanFinished({ added: 3, updated: 0, unchanged: 0, removed: 0, failed: 0 })
    expect(notify).not.toHaveBeenCalled()
    problems.scanFinished({ added: 3, updated: 0, unchanged: 0, removed: 0, failed: 2 })
    expect(notify).toHaveBeenCalledWith('2 files could not be read as images.', {
      label: 'Open logs',
      run: expect.any(Function)
    })
    notify.mock.calls[0]?.[1].run()
    expect(openLogs).toHaveBeenCalled()
  })

  it('records an unexpected error by its name only', () => {
    const { problems, notify, reportRendererError } = setup()
    problems.unexpected(new TypeError('cannot read /home/someone/secret'))
    expect(reportRendererError).toHaveBeenCalledWith('TypeError')
    expect(notify.mock.calls[0]?.[0]).toBe('Something went wrong (TypeError).')
  })
})

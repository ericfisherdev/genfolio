import { describe, expect, it } from 'vitest'
import { MigrationError } from '@infrastructure/db/migration-runner'
import { startupFailureReason } from './startup-failure-reason'

describe('startupFailureReason', () => {
  it('asks the user to update when the database is from a newer app', () => {
    const reason = startupFailureReason(new MigrationError('Database schema v2 is newer than v1'))
    expect(reason).toMatch(/schema v2 is newer.*Update Genfolio/)
  })

  it('reports other failures as an open error', () => {
    expect(startupFailureReason(new Error('disk I/O error'))).toBe(
      'The library database could not be opened: disk I/O error'
    )
  })
})

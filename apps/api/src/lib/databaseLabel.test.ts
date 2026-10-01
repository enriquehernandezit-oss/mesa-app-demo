import { describe, expect, test } from 'bun:test'

import { databaseLabel } from './databaseLabel'

describe('databaseLabel', () => {
  test('a local database says so', () => {
    expect(databaseLabel('postgresql://me@localhost:5432/mesa')).toBe('localhost:5432/mesa (local)')
    expect(databaseLabel('postgresql://me@127.0.0.1:5432/mesa')).toBe('127.0.0.1:5432/mesa (local)')
  })

  test('anything else is REMOTE, with its host, port and database name', () => {
    expect(
      databaseLabel('postgresql://postgres:s3cret@roundhouse.proxy.rlwy.net:41234/railway'),
    ).toBe('roundhouse.proxy.rlwy.net:41234/railway (REMOTE)')
  })

  test('never shows the user or the password', () => {
    const label = databaseLabel('postgresql://postgres:s3cret-pass@host.example:5432/db')
    expect(label).not.toContain('s3cret-pass')
    expect(label).not.toContain('postgres:')
  })

  test('says so when there is no URL or it cannot be read', () => {
    expect(databaseLabel(undefined)).toContain('not set')
    expect(databaseLabel('not a url')).toContain('unreadable')
  })
})

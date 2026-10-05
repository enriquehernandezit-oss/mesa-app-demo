import { afterEach, describe, expect, test } from 'bun:test'

import { databaseLabel, isLocalDatabase, refuseRemoteDatabase } from './localDatabase'

const saved = process.env.DATABASE_URL
afterEach(() => {
  if (saved === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = saved
})

describe('isLocalDatabase', () => {
  test('localhost, 127.0.0.1 and ::1 are local', () => {
    expect(isLocalDatabase('postgresql://me@localhost:5432/mesa')).toBe(true)
    expect(isLocalDatabase('postgresql://me@127.0.0.1:5432/mesa')).toBe(true)
    expect(isLocalDatabase('postgresql://me@[::1]:5432/mesa')).toBe(true)
  })

  test('anything else, or nothing readable, is not', () => {
    expect(isLocalDatabase('postgresql://u:p@roundhouse.proxy.rlwy.net:41234/railway')).toBe(false)
    expect(isLocalDatabase('postgresql://u:p@localhost.evil.example:5432/mesa')).toBe(false)
    expect(isLocalDatabase(undefined)).toBe(false)
    expect(isLocalDatabase('not a url')).toBe(false)
  })
})

describe('refuseRemoteDatabase', () => {
  test('lets a local database through', () => {
    process.env.DATABASE_URL = 'postgresql://me@localhost:5432/mesa'
    expect(() => refuseRemoteDatabase('db:seed')).not.toThrow()
  })

  test('refuses a remote one, naming it without the credentials', () => {
    process.env.DATABASE_URL = 'postgresql://postgres:s3cret@host.example:41234/railway'
    expect(() => refuseRemoteDatabase('db:seed')).toThrow(/host\.example:41234\/railway \(REMOTE\)/)
    expect(() => refuseRemoteDatabase('db:seed')).not.toThrow(/s3cret/)
  })

  test('refuses when there is no URL at all', () => {
    delete process.env.DATABASE_URL
    expect(() => refuseRemoteDatabase('db:seed')).toThrow()
  })
})

describe('databaseLabel', () => {
  test('shares the local/REMOTE verdict', () => {
    expect(databaseLabel('postgresql://me@localhost:5432/mesa')).toBe('localhost:5432/mesa (local)')
  })
})

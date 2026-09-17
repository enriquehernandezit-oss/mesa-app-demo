import { describe, expect, test } from 'bun:test'
import { hashPhone, hashesEqual, normalizePhone } from './phone'

describe('normalizePhone', () => {
  test('a bare DR 10-digit number gets +1 prefixed', () => {
    expect(normalizePhone('8095551234')).toBe('+18095551234')
    expect(normalizePhone('8295551234')).toBe('+18295551234')
    expect(normalizePhone('8495551234')).toBe('+18495551234')
  })

  test('typed with spaces, dashes and parens still normalizes', () => {
    expect(normalizePhone('(809) 555-1234')).toBe('+18095551234')
    expect(normalizePhone('809-555-1234')).toBe('+18095551234')
    expect(normalizePhone('809 555 1234')).toBe('+18095551234')
  })

  test('an 11-digit DR number already carrying the leading 1', () => {
    expect(normalizePhone('18095551234')).toBe('+18095551234')
  })

  test('already-E.164 numbers pass through as-is', () => {
    expect(normalizePhone('+18095551234')).toBe('+18095551234')
    expect(normalizePhone('+34600123456')).toBe('+34600123456')
  })

  test('a 10-digit number with a non-DR area code is left unnormalized', () => {
    // 212 (NYC) — not a DR area code, and no country code was given, so
    // guessing +1 would silently misfile a non-DR number.
    expect(normalizePhone('2125551234')).toBeNull()
  })

  test('garbage input returns null rather than a malformed hash target', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('not a phone number')).toBeNull()
    expect(normalizePhone('+123')).toBeNull() // too short
    expect(normalizePhone('+1234567890123456')).toBeNull() // too long
  })
})

describe('hashPhone', () => {
  test('deterministic for the same number + secret', () => {
    expect(hashPhone('+18095551234', 'secret-a')).toBe(hashPhone('+18095551234', 'secret-a'))
  })

  test('different secrets produce different hashes for the same number', () => {
    expect(hashPhone('+18095551234', 'secret-a')).not.toBe(hashPhone('+18095551234', 'secret-b'))
  })

  test('different numbers produce different hashes under the same secret', () => {
    expect(hashPhone('+18095551234', 'secret-a')).not.toBe(hashPhone('+18295551234', 'secret-a'))
  })

  test('hex-encoded SHA-256 output (64 hex chars)', () => {
    expect(hashPhone('+18095551234', 'secret-a')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('hashesEqual', () => {
  test('equal hashes compare true, differing ones false', () => {
    const h = hashPhone('+18095551234', 'secret-a')
    expect(hashesEqual(h, h)).toBe(true)
    expect(hashesEqual(h, hashPhone('+18295551234', 'secret-a'))).toBe(false)
  })
})

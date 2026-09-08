// This is the first test file in apps/mobile, which extends expo/tsconfig.base
// rather than the root tsconfig.base.json apps/api uses — the latter sets
// `"types": ["bun"]` project-wide, which isn't safe to copy here sight-unseen
// (it would restrict automatic @types/* inclusion for the whole app to just
// "bun", and nothing has verified that's harmless for Expo's own ambient
// types). Scoping the reference to this file avoids that risk entirely.
/// <reference types="bun-types" />
import { describe, expect, test } from 'bun:test'
import { normalizeToPath, toAppPath } from './deepLinks'

describe('normalizeToPath', () => {
  test('already-bare path passes through', () => {
    expect(normalizeToPath('/p/spot/abc')).toBe('/p/spot/abc')
  })

  test('https universal link strips scheme+host', () => {
    expect(normalizeToPath('https://mesa.app/p/spot/abc?x=1')).toBe('/p/spot/abc?x=1')
  })

  test('http (no s) strips too', () => {
    expect(normalizeToPath('http://mesa.app/p/i/CODE')).toBe('/p/i/CODE')
  })

  test('custom scheme with host-shaped authority (no extra slash)', () => {
    // mesa://p/spot/x — WHATWG would treat "p" as host; we must not.
    expect(normalizeToPath('mesa://p/spot/x')).toBe('/p/spot/x')
  })

  test('custom scheme with empty host (triple slash)', () => {
    expect(normalizeToPath('mesa:///p/spot/x')).toBe('/p/spot/x')
  })

  test('dev-client scheme (exp+mesa://) strips correctly', () => {
    expect(normalizeToPath('exp+mesa://expo-development-client/?url=https%3A%2F%2Fx')).toBe(
      '/expo-development-client/?url=https%3A%2F%2Fx',
    )
  })
})

describe('toAppPath', () => {
  test('invite link (bare path)', () => {
    expect(toAppPath('/p/i/ABC123')).toEqual({ path: '/', inviteCode: 'ABC123' })
  })

  test('invite link (https universal link)', () => {
    expect(toAppPath('https://mesa.app/p/i/ABC123')).toEqual({ path: '/', inviteCode: 'ABC123' })
  })

  test('invite link (custom scheme)', () => {
    expect(toAppPath('mesa://p/i/ABC123')).toEqual({ path: '/', inviteCode: 'ABC123' })
  })

  test('reset-password carries the query string', () => {
    expect(toAppPath('https://mesa.app/p/reset-password?token=xyz')).toEqual({
      path: '/reset-password?token=xyz',
    })
  })

  test('reset-password with no query still matches', () => {
    expect(toAppPath('mesa://p/reset-password')).toEqual({ path: '/reset-password' })
  })

  test('verify-email carries the query string', () => {
    expect(toAppPath('mesa://p/verify-email?token=abc')).toEqual({
      path: '/verify-email?token=abc',
    })
  })

  test('spot link', () => {
    expect(toAppPath('https://mesa.app/p/spot/some-restaurant-id')).toEqual({
      path: '/r/some-restaurant-id',
    })
  })

  test('spot link (custom scheme)', () => {
    expect(toAppPath('mesa://p/spot/some-restaurant-id')).toEqual({
      path: '/r/some-restaurant-id',
    })
  })

  test('member link by handle', () => {
    expect(toAppPath('https://mesa.app/p/u/@camila')).toEqual({ path: '/u/handle/camila' })
  })

  test('member link without leading @', () => {
    expect(toAppPath('mesa://p/u/camila')).toEqual({ path: '/u/handle/camila' })
  })

  test('unmatched path returns null (caller falls back to original input)', () => {
    expect(toAppPath('mesa://r/some-id')).toBeNull()
    expect(toAppPath('/onboarding')).toBeNull()
    expect(toAppPath('https://mesa.app/p/unknown/thing')).toBeNull()
  })
})

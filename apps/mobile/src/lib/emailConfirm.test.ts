import { describe, expect, test } from 'bun:test'

import { codeDigits, needsEmailCode } from './emailConfirm'

describe('needsEmailCode', () => {
  test('a sign-up that returned no session waits for the code', () => {
    expect(needsEmailCode('signup', { data: { token: null } })).toBe(true)
    expect(needsEmailCode('signup', { data: {} })).toBe(true)
  })

  test('a sign-up that returned a session is already in (verification switched off)', () => {
    expect(needsEmailCode('signup', { data: { token: 'abc' } })).toBe(false)
  })

  test('a failed sign-up is an error, not a code screen', () => {
    expect(needsEmailCode('signup', { error: { code: 'USER_ALREADY_EXISTS' } })).toBe(false)
  })

  test('only EMAIL_NOT_VERIFIED sends a sign-in to the code screen', () => {
    expect(needsEmailCode('signin', { error: { code: 'EMAIL_NOT_VERIFIED' } })).toBe(true)
    expect(needsEmailCode('signin', { error: { code: 'INVALID_EMAIL_OR_PASSWORD' } })).toBe(false)
    expect(needsEmailCode('signin', { data: { token: 'abc' } })).toBe(false)
  })
})

describe('codeDigits', () => {
  test('keeps digits only and stops at six', () => {
    expect(codeDigits('123 456')).toBe('123456')
    expect(codeDigits('Tu código: 482913.')).toBe('482913')
    expect(codeDigits('12345678')).toBe('123456')
    expect(codeDigits('abc')).toBe('')
  })
})

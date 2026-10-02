import { describe, expect, test } from 'bun:test'

import { MAX_MENTIONS, extractHandles, parseHandlePrefix } from './mentions'

describe('extractHandles', () => {
  test('finds handles anywhere in the text, once each, in order', () => {
    expect(extractHandles('con @ana y @bo_2 — @ana otra vez')).toEqual(['ana', 'bo_2'])
    expect(extractHandles('@ana')).toEqual(['ana'])
  })

  test('is case-insensitive and lowercases', () => {
    expect(extractHandles('gracias @Ana y @BO')).toEqual(['ana', 'bo'])
  })

  test('a sentence-ending dot or comma is not part of the handle; a dot inside is', () => {
    expect(extractHandles('thanks @ana.')).toEqual(['ana'])
    expect(extractHandles('thanks @ana...')).toEqual(['ana'])
    expect(extractHandles('hola @ana, @bo!')).toEqual(['ana', 'bo'])
    expect(extractHandles('with @ana.maria today')).toEqual(['ana.maria'])
  })

  test('an @ inside a word is not a mention: emails, doubled @, text before it', () => {
    expect(extractHandles('write to ana@gmail.com')).toEqual([])
    expect(extractHandles('@@ana')).toEqual([])
    expect(extractHandles('foo@bar')).toEqual([])
    expect(extractHandles('(@ana)')).toEqual(['ana'])
  })

  test('a handle is 2–30 characters of the allowed set', () => {
    expect(extractHandles('@a')).toEqual([])
    expect(extractHandles('@ab')).toEqual(['ab'])
    const long = 'a'.repeat(30)
    expect(extractHandles(`@${long}`)).toEqual([long])
    // longer than 30 is cut at 30 by the pattern, not rejected
    expect(extractHandles(`@${long}zzz`)).toEqual([long])
    expect(extractHandles('@ñandú')).toEqual([])
  })

  test('at most MAX_MENTIONS, the first ones', () => {
    const text = Array.from({ length: 9 }, (_, i) => `@user${i}`).join(' ')
    const got = extractHandles(text)
    expect(got).toHaveLength(MAX_MENTIONS)
    expect(got[0]).toBe('user0')
  })

  test('nothing to find', () => {
    expect(extractHandles('')).toEqual([])
    expect(extractHandles('sin menciones aquí')).toEqual([])
    expect(extractHandles('@')).toEqual([])
  })
})

describe('parseHandlePrefix', () => {
  test('takes what was typed after the @, lowercased', () => {
    expect(parseHandlePrefix('an')).toBe('an')
    expect(parseHandlePrefix('@Ana')).toBe('ana')
    expect(parseHandlePrefix('')).toBe('')
    expect(parseHandlePrefix(undefined)).toBe('')
  })
  test('anything that cannot start a handle is rejected', () => {
    expect(parseHandlePrefix('a b')).toBeNull()
    expect(parseHandlePrefix('ana%')).toBeNull()
    expect(parseHandlePrefix('a'.repeat(31))).toBeNull()
  })
})

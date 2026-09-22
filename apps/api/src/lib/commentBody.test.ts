import { describe, expect, test } from 'bun:test'

import { COMMENT_MAX, parseCommentBody } from './commentBody'

describe('parseCommentBody', () => {
  test('returns the trimmed body', () => {
    expect(parseCommentBody({ body: '  qué rico  ' })).toBe('qué rico')
  })

  test('rejects blank and whitespace-only bodies', () => {
    expect(parseCommentBody({ body: '' })).toBeNull()
    expect(parseCommentBody({ body: '   \n\t ' })).toBeNull()
  })

  test('caps at COMMENT_MAX after trimming', () => {
    expect(parseCommentBody({ body: 'a'.repeat(COMMENT_MAX) })).toBe('a'.repeat(COMMENT_MAX))
    expect(parseCommentBody({ body: ` ${'a'.repeat(COMMENT_MAX)} ` })).toBe('a'.repeat(COMMENT_MAX))
    expect(parseCommentBody({ body: 'a'.repeat(COMMENT_MAX + 1) })).toBeNull()
  })

  test('rejects malformed request bodies', () => {
    expect(parseCommentBody(null)).toBeNull()
    expect(parseCommentBody({})).toBeNull()
    expect(parseCommentBody({ body: 42 })).toBeNull()
    expect(parseCommentBody('hola')).toBeNull()
  })
})

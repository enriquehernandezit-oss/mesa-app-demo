import { describe, expect, test } from 'bun:test'

import { MAX_IMAGE_CHARS, isAllowedImageRef } from './imageRef'

describe('isAllowedImageRef', () => {
  test('accepts data-image and https URLs', () => {
    expect(isAllowedImageRef('data:image/jpeg;base64,AAAA')).toBe(true)
    expect(isAllowedImageRef('https://res.cloudinary.com/x/image/upload/a.jpg')).toBe(true)
  })

  test('rejects other schemes and bare strings', () => {
    expect(isAllowedImageRef('http://example.com/a.jpg')).toBe(false)
    expect(isAllowedImageRef('javascript:alert(1)')).toBe(false)
    expect(isAllowedImageRef('data:text/html,hi')).toBe(false)
    expect(isAllowedImageRef('')).toBe(false)
  })

  test('caps length at MAX_IMAGE_CHARS', () => {
    const prefix = 'data:image/jpeg;base64,'
    expect(isAllowedImageRef(prefix + 'A'.repeat(MAX_IMAGE_CHARS - prefix.length))).toBe(true)
    expect(isAllowedImageRef(prefix + 'A'.repeat(MAX_IMAGE_CHARS - prefix.length + 1))).toBe(false)
  })
})

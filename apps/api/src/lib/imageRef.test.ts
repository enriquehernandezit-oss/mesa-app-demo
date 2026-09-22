import { describe, expect, test } from 'bun:test'

import { isAllowedImageRef } from './imageRef'

const BASE = 'https://pub-test123.r2.dev'

describe('isAllowedImageRef', () => {
  test('accepts a URL under the configured R2 public base', () => {
    expect(isAllowedImageRef(`${BASE}/u/user1/abc.jpg`, BASE)).toBe(true)
  })

  test('rejects a different host, even a plausible-looking one', () => {
    expect(isAllowedImageRef('https://pub-someone-elses-bucket.r2.dev/u/x/a.jpg', BASE)).toBe(false)
    expect(isAllowedImageRef('https://res.cloudinary.com/x/image/upload/a.jpg', BASE)).toBe(false)
  })

  test('rejects other schemes and bare strings', () => {
    expect(isAllowedImageRef('http://example.com/a.jpg', BASE)).toBe(false)
    expect(isAllowedImageRef('javascript:alert(1)', BASE)).toBe(false)
    expect(isAllowedImageRef('data:image/jpeg;base64,AAAA', BASE)).toBe(false)
    expect(isAllowedImageRef('', BASE)).toBe(false)
  })

  test('rejects everything when no base is configured', () => {
    expect(isAllowedImageRef(`${BASE}/u/user1/abc.jpg`, undefined)).toBe(false)
  })
})

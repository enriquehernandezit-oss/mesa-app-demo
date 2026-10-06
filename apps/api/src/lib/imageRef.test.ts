import { describe, expect, test } from 'bun:test'

import { isAllowedImageRef, isOwnImageRef } from './imageRef'

const BASE = 'https://pub-test123.r2.dev'
// what presignUpload mints after the member's folder
const UUID = '0b0f6d1e-3c1a-4f55-9a52-5c6f0a9d2e11'

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

describe('isOwnImageRef', () => {
  test("accepts a photo under the member's own prefix", () => {
    expect(isOwnImageRef(`${BASE}/u/user1/${UUID}.jpg`, 'user1', BASE)).toBe(true)
  })

  test("refuses another member's photo, a bare bucket path, and a look-alike prefix", () => {
    expect(isOwnImageRef(`${BASE}/u/user2/${UUID}.jpg`, 'user1', BASE)).toBe(false)
    expect(isOwnImageRef(`${BASE}/seed/${UUID}.jpg`, 'user1', BASE)).toBe(false)
    // "user1" must not match the prefix of "user10"
    expect(isOwnImageRef(`${BASE}/u/user10/${UUID}.jpg`, 'user1', BASE)).toBe(false)
    // a `..` segment would walk out of the folder once a client normalizes the URL
    expect(isOwnImageRef(`${BASE}/u/user1/../user2/${UUID}.jpg`, 'user1', BASE)).toBe(false)
    expect(isOwnImageRef(`${BASE}/u/user1/${UUID}.jpg?x=1`, 'user1', BASE)).toBe(false)
  })

  test('refuses everything when no bucket is configured', () => {
    expect(isOwnImageRef(`/u/user1/${UUID}.jpg`, 'user1', undefined)).toBe(false)
  })
})

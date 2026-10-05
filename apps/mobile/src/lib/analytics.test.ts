import { describe, expect, test } from 'bun:test'

import { screenName } from './screenName'

describe('screenName', () => {
  test('keeps ids, drops a handle', () => {
    expect(screenName('/r/3f2a-id')).toBe('/r/3f2a-id')
    expect(screenName('/u/handle/ana')).toBe('/u/handle/:handle')
    expect(screenName('/u/handle/ana.perez_1/')).toBe('/u/handle/:handle/')
    expect(screenName('/u/abc123')).toBe('/u/abc123')
  })
})

import { describe, expect, test } from 'bun:test'

import { websiteKind } from './websiteKind'

describe('websiteKind', () => {
  test('names the social pages that fill the website field', () => {
    expect(websiteKind('https://www.instagram.com/segundomuelle')).toBe('instagram')
    expect(websiteKind('https://instagram.com/lulu_sdq/')).toBe('instagram')
    expect(websiteKind('https://m.facebook.com/elagave')).toBe('facebook')
    expect(websiteKind('https://fb.me/elagave')).toBe('facebook')
  })
  test('anything else is a website, including lookalikes and junk', () => {
    expect(websiteKind('https://segundomuelle.do')).toBe('website')
    expect(websiteKind('https://notinstagram.com')).toBe('website')
    expect(websiteKind('https://instagram.com.evil.example')).toBe('website')
    expect(websiteKind('not a url')).toBe('website')
  })
})

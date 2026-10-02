import { describe, expect, test } from 'bun:test'

import { socialLabelKey, websiteKind } from './websiteKind'

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

describe('socialLabelKey', () => {
  test('is the label key for a social page, null for a plain website', () => {
    expect(socialLabelKey('https://instagram.com/x')).toBe('restaurant.instagram')
    expect(socialLabelKey('https://es-la.facebook.com/x')).toBe('restaurant.facebook')
    expect(socialLabelKey('https://segundomuelle.do')).toBeNull()
  })
})

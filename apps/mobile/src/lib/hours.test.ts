import { describe, expect, test } from 'bun:test'

import { closesLabel } from './hours'

describe('closesLabel', () => {
  test('reads the display labels the catalog stores', () => {
    expect(closesLabel('12a')).toBe('12 AM')
    expect(closesLabel('1a')).toBe('1 AM')
    expect(closesLabel('11p')).toBe('11 PM')
    expect(closesLabel(' 9P ')).toBe('9 PM')
  })

  test('anything else is no closing time', () => {
    for (const bad of [null, undefined, '', '13p', '0a', 'late', '10', '10pm'])
      expect(closesLabel(bad)).toBeNull()
  })
})

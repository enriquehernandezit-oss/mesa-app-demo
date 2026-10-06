import { describe, expect, test } from 'bun:test'

import { isReservedHandle } from './handles'

describe('isReservedHandle', () => {
  test('names that read as Mesa or its staff are reserved, in either language', () => {
    for (const h of ['mesa', 'admin', 'soporte', 'support', 'moderador', 'oficial', 'null']) {
      expect(isReservedHandle(h)).toBe(true)
    }
  })

  test('ignores case and a leading @', () => {
    expect(isReservedHandle('@Admin')).toBe(true)
    expect(isReservedHandle('MESA')).toBe(true)
  })

  test('an ordinary handle, or one that merely contains a reserved word, is fine', () => {
    expect(isReservedHandle('camila')).toBe(false)
    expect(isReservedHandle('mesa_camila')).toBe(false)
    expect(isReservedHandle('admin2')).toBe(false)
  })
})

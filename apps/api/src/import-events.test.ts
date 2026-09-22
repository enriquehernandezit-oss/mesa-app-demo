import { describe, expect, test } from 'bun:test'

import { bookingFields } from './import-events'

// bookingFields gates the two booking columns — a bad capacity would show a
// nonsense "spots left", and a malformed number would build a broken wa.me
// link, so the boundaries are pinned here rather than only via --dry-run.

describe('bookingFields', () => {
  test('omitted fields become null', () => {
    expect(bookingFields({})).toEqual({ capacity: null, bookingWhatsapp: null })
  })

  test('capacity accepts 1..10000 integers only', () => {
    expect(bookingFields({ capacity: 1 })).toEqual({ capacity: 1, bookingWhatsapp: null })
    expect(bookingFields({ capacity: 10000 })).toEqual({ capacity: 10000, bookingWhatsapp: null })
    for (const bad of [0, -5, 10001, 2.5]) {
      expect('error' in bookingFields({ capacity: bad })).toBe(true)
    }
  })

  test('bookingWhatsapp strips spaces/dashes/+ and stores bare digits', () => {
    expect(bookingFields({ bookingWhatsapp: '+1 809-555-1234' })).toEqual({
      capacity: null,
      bookingWhatsapp: '18095551234',
    })
  })

  test('bookingWhatsapp rejects too short, too long, or non-digit', () => {
    for (const bad of ['1234567', '1234567890123456', '809-CALL-NOW', '(809) 555-1234', '']) {
      expect('error' in bookingFields({ bookingWhatsapp: bad })).toBe(true)
    }
  })
})

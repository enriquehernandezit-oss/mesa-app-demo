import { describe, expect, test } from 'bun:test'

import { clockLabel, closesLabel, openStatusLine } from './hours'

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

describe('clockLabel', () => {
  test('24-hour times as shown', () => {
    expect(clockLabel('00:00')).toBe('12 AM')
    expect(clockLabel('12:00')).toBe('12 PM')
    expect(clockLabel('18:30')).toBe('6:30 PM')
    expect(clockLabel('09:05')).toBe('9:05 AM')
    expect(clockLabel('25:00')).toBeNull()
    expect(clockLabel('nope')).toBeNull()
  })
})

describe('openStatusLine', () => {
  const words = {
    openUntil: (t: string) => `open until ${t}`,
    open24h: 'open 24 hours',
    opensToday: (t: string) => `opens ${t}`,
    opensTomorrow: (t: string) => `opens tomorrow ${t}`,
    opensOn: (d: number, t: string) => `opens day ${d} ${t}`,
    closed: 'closed',
  }
  // Monday 2026-10-05 10:00 in Santo Domingo
  const monday = new Date('2026-10-05T10:00:00-04:00')

  test('open, and until when', () => {
    expect(openStatusLine({ open: true, closesAt: { day: 2, time: '00:00' } }, words, monday)).toBe(
      'open until 12 AM',
    )
    expect(openStatusLine({ open: true, closesAt: null }, words, monday)).toBe('open 24 hours')
  })

  test('closed: opens today, tomorrow, or on a later day', () => {
    expect(openStatusLine({ open: false, opensAt: { day: 1, time: '12:00' } }, words, monday)).toBe(
      'opens 12 PM',
    )
    expect(openStatusLine({ open: false, opensAt: { day: 2, time: '12:00' } }, words, monday)).toBe(
      'opens tomorrow 12 PM',
    )
    expect(openStatusLine({ open: false, opensAt: { day: 4, time: '18:00' } }, words, monday)).toBe(
      'opens day 4 6 PM',
    )
    expect(openStatusLine({ open: false, opensAt: null }, words, monday)).toBe('closed')
  })

  test('no hours, no line', () => {
    expect(openStatusLine(null, words)).toBeNull()
    expect(openStatusLine(undefined, words)).toBeNull()
  })
})

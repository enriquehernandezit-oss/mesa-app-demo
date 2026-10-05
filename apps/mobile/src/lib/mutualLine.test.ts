import { describe, expect, test } from 'bun:test'

import { mutualLine } from './mutualLine'
import type { MutualSummary } from './types'

const t = (key: string, vars?: { a?: string; b?: string; n?: number }) =>
  `${key}|${vars?.a ?? ''}|${vars?.b ?? ''}|${vars?.n ?? ''}`
const p = (id: string, name: string) => ({ id, name, image: null })

describe('mutualLine', () => {
  test('nobody in common says nothing', () => {
    expect(mutualLine(t, { count: 0, sample: [] })).toBeNull()
  })

  test('one name, two names, then the rest as a count', () => {
    const sample = [p('1', 'Ana Perez'), p('2', 'Luis'), p('3', 'Mia')]
    expect(mutualLine(t, { count: 1, sample: sample.slice(0, 1) })).toBe('friends.mutual_one|Ana||')
    expect(mutualLine(t, { count: 2, sample: sample.slice(0, 2) })).toBe(
      'friends.mutual_two|Ana|Luis|',
    )
    expect(mutualLine(t, { count: 3, sample })).toBe('friends.mutual_many|Ana|Luis|1')
    expect(mutualLine(t, { count: 12, sample })).toBe('friends.mutual_many|Ana|Luis|10')
  })

  test('a count with fewer faces than people still names who it can', () => {
    const short: MutualSummary = { count: 4, sample: [p('1', 'Ana')] }
    expect(mutualLine(t, short)).toBe('friends.mutual_one|Ana||')
  })
})

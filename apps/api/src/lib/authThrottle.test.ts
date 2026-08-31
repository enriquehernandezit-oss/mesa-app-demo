import { describe, expect, test } from 'bun:test'
import {
  FAILURE_DECAY_MS,
  effectiveFailures,
  lockMsFor,
  retryAfterMs,
  throttleKey,
} from './authThrottle'

// The backoff arithmetic is the kind of logic that fails silently: a limiter
// that never locks looks exactly like one that works, and curl can't tell "not
// locked out yet" from "never locks out". These pin the boundaries.

const at = (ms: number) => new Date(ms)

describe('lockMsFor', () => {
  test('the first four failures are free', () => {
    for (const f of [0, 1, 2, 3, 4]) expect(lockMsFor(f)).toBe(0)
  })

  test('escalates at each tier boundary', () => {
    expect(lockMsFor(5)).toBe(60_000)
    expect(lockMsFor(9)).toBe(60_000)
    expect(lockMsFor(10)).toBe(15 * 60_000)
    expect(lockMsFor(19)).toBe(15 * 60_000)
    expect(lockMsFor(20)).toBe(60 * 60_000)
    expect(lockMsFor(500)).toBe(60 * 60_000)
  })

  test('never decreases as failures grow', () => {
    for (let f = 1; f < 40; f++) expect(lockMsFor(f)).toBeGreaterThanOrEqual(lockMsFor(f - 1))
  })
})

describe('effectiveFailures', () => {
  test('no record means no failures', () => {
    expect(effectiveFailures(null, 1000)).toBe(0)
  })

  test('counts recent failures', () => {
    expect(effectiveFailures({ failures: 7, lastFailureAt: at(1000) }, 2000)).toBe(7)
  })

  test('forgives once the decay window has fully elapsed', () => {
    const row = { failures: 30, lastFailureAt: at(0) }
    expect(effectiveFailures(row, FAILURE_DECAY_MS - 1)).toBe(30)
    expect(effectiveFailures(row, FAILURE_DECAY_MS)).toBe(0)
  })
})

describe('retryAfterMs', () => {
  test('not locked below the threshold', () => {
    expect(retryAfterMs({ failures: 4, lastFailureAt: at(1000) }, 1000)).toBe(0)
  })

  test('locked immediately after the fifth failure', () => {
    expect(retryAfterMs({ failures: 5, lastFailureAt: at(1000) }, 1000)).toBe(60_000)
  })

  test('counts down and releases exactly at the boundary', () => {
    const row = { failures: 5, lastFailureAt: at(0) }
    expect(retryAfterMs(row, 30_000)).toBe(30_000)
    expect(retryAfterMs(row, 59_999)).toBe(1)
    expect(retryAfterMs(row, 60_000)).toBe(0)
    expect(retryAfterMs(row, 99_999)).toBe(0)
  })

  test('never returns a negative wait', () => {
    expect(retryAfterMs({ failures: 25, lastFailureAt: at(0) }, 10 * 60 * 60_000)).toBe(0)
  })

  test('a decayed record is not locked even at a high failure count', () => {
    expect(retryAfterMs({ failures: 50, lastFailureAt: at(0) }, FAILURE_DECAY_MS)).toBe(0)
  })
})

describe('throttleKey', () => {
  test('case and whitespace cannot split one account into two budgets', () => {
    expect(throttleKey(' Ana@Mesa.DO ')).toBe(throttleKey('ana@mesa.do'))
  })

  test('is namespaced so it cannot collide with another key space', () => {
    expect(throttleKey('ana@mesa.do')).toBe('signin:ana@mesa.do')
  })
})

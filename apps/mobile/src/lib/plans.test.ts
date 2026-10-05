import { describe, expect, test } from 'bun:test'

import { isPastPlan, isPendingInvite } from './plans'
import type { Plan } from './types'

const plan = (over: Partial<Plan>): Plan =>
  ({
    isHost: false,
    myReply: 'pending',
    status: 'open',
    startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    ...over,
  }) as Plan

describe('isPendingInvite', () => {
  test('an upcoming invite you have not answered is pending', () => {
    expect(isPendingInvite(plan({}))).toBe(true)
  })
  test('a plan that already happened is past, never a pending invitation', () => {
    const past = plan({ startsAt: new Date(Date.now() - 86_400_000).toISOString() })
    expect(isPastPlan(past)).toBe(true)
    expect(isPendingInvite(past)).toBe(false)
  })
  test('your own plans, answered ones and cancelled ones are not pending', () => {
    expect(isPendingInvite(plan({ isHost: true }))).toBe(false)
    expect(isPendingInvite(plan({ myReply: 'going' }))).toBe(false)
    expect(isPendingInvite(plan({ status: 'cancelled' }))).toBe(false)
  })
})

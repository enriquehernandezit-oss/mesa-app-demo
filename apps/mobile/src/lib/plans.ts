import type { Plan, PlanDetail } from './types'

// Shared by plans/index.tsx's sectioning, profile.tsx's pending-invite count,
// and plans/[planId].tsx's RSVP gating — one definition so the three never
// drift on what "pending" means.
export function isPendingInvite(plan: Plan | PlanDetail): boolean {
  return !plan.isHost && plan.myReply === 'pending' && plan.status !== 'cancelled'
}

export function isPastPlan(plan: Plan | PlanDetail): boolean {
  return new Date(plan.startsAt).getTime() < Date.now()
}

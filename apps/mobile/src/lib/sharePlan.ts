import { track } from '@/lib/analytics'
import { apiOrigin } from './api'
import { shareTextWhatsAppFirst } from './shareProfile'
import { formatPlanDate } from './time'
import type { Plan, PlanDetail } from './types'

export function planShareLink(planId: string): string {
  return `${apiOrigin}/p/plan/${planId}`
}

// The spot line for a share text: the chosen restaurant once confirmed,
// otherwise "Votación: A · B · C" — mirrors share-pages.ts's own h1 so the
// WhatsApp text and the unfurled /p/plan card never disagree.
function planSpotLine(plan: Plan | PlanDetail): string {
  const chosen = plan.options.find((o) => o.id === plan.chosenRestaurantId)
  if (chosen) return chosen.name
  return `Votación: ${plan.options.map((o) => o.name).join(' · ')}`
}

export async function sharePlan(plan: Plan | PlanDetail): Promise<void> {
  track('plan_shared')
  const link = planShareLink(plan.id)
  const text = `${plan.host.name} armó una mesa en ${planSpotLine(plan)} · ${formatPlanDate(plan.startsAt)}\n${link}`
  await shareTextWhatsAppFirst(text)
}

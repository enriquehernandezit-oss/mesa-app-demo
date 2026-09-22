import { track } from '@/lib/analytics'
import { getLanguage, t } from '@/lib/i18n'

import { apiOrigin } from './api'
import { shareTextWhatsAppFirst } from './shareProfile'
import { formatPlanDate } from './time'
import type { Plan, PlanDetail } from './types'

export function planShareLink(planId: string): string {
  return `${apiOrigin}/p/plan/${planId}`
}

// The spot line for a share text: the chosen restaurant once confirmed,
// otherwise "Votación: A · B · C" — mirrors share-pages.ts's own h1 so the
// WhatsApp text and the unfurled /p/plan card never disagree. Not a component
// — reads the language directly via t()/getLanguage(), same as lib/authErrors.ts.
function planSpotLine(plan: Plan | PlanDetail): string {
  const chosen = plan.options.find((o) => o.id === plan.chosenRestaurantId)
  if (chosen) return chosen.name
  return t(getLanguage(), 'plans.voting_line', {
    spots: plan.options.map((o) => o.name).join(' · '),
  })
}

export async function sharePlan(plan: Plan | PlanDetail): Promise<void> {
  track('plan_shared')
  const link = planShareLink(plan.id)
  const text = t(getLanguage(), 'plans.share_text', {
    host: plan.host.name,
    spot: planSpotLine(plan),
    date: formatPlanDate(plan.startsAt),
    link,
  })
  await shareTextWhatsAppFirst(text)
}

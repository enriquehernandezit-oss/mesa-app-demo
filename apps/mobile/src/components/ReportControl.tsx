import { Caption } from '@/components/ui'
import { showSheet } from '@/components/ui/Sheet'
import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { getLanguage, t, useT } from '@/lib/i18n'
import { useMutation } from '@tanstack/react-query'
import { Pressable, Text } from 'react-native'

// UGC reporting (App Store 1.2) for the surfaces that carry other people's
// content: a dish, a vibe note, or a member. The reasons used to render as an
// inline chip panel that pushed the page around; they're Mesa's own Sheet now —
// a genuine chooser (see components/ui/Sheet.tsx for why this one isn't a
// native system sheet, unlike the destructive confirms elsewhere).
const REASON_KEYS = [
  'report.reason_spam',
  'report.reason_harassment',
  'report.reason_inappropriate',
  'report.reason_other',
] as const

export type ReportTarget = 'dish' | 'vibe_note' | 'user'

const PROMPT_KEYS: Record<
  ReportTarget,
  'report.prompt_dish' | 'report.prompt_vibe_note' | 'report.prompt_user'
> = {
  dish: 'report.prompt_dish',
  vibe_note: 'report.prompt_vibe_note',
  user: 'report.prompt_user',
}

// Ask for a reason. Exported for callers that own their own trigger (the member
// profile's Reportar action) so the prompt and reasons stay in one place. Not a
// component — reads the language directly via t()/getLanguage() rather than
// useT(), same as lib/authErrors.ts.
export async function pickReportReason(targetType: ReportTarget): Promise<string | null> {
  const lang = getLanguage()
  const reasons = REASON_KEYS.map((key) => t(lang, key))
  const i = await showSheet({
    title: t(lang, PROMPT_KEYS[targetType]),
    options: reasons.map((label) => ({ label })),
  })
  return i === null ? null : (reasons[i] ?? null)
}

// A quiet "Reportar" link that opens the reason sheet, and the thank-you once it
// lands.
export function ReportControl({
  targetType,
  targetId,
  label,
}: {
  targetType: ReportTarget
  targetId: string
  label?: string
}) {
  const t = useT()
  const report = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType, targetId, reason }),
    // Without this a failed report closes silently and the reporter can't tell
    // it never sent.
    onError: () => toast({ variant: 'error', message: t('common.report_error') }),
  })

  if (report.isSuccess) {
    return <Caption className="mt-2">{t('common.reported')}</Caption>
  }
  return (
    <Pressable
      accessibilityRole="button"
      disabled={report.isPending}
      onPress={async () => {
        const reason = await pickReportReason(targetType)
        if (reason) report.mutate(reason)
      }}
      className="mt-2 min-h-[44px] justify-center active:opacity-60"
    >
      <Text className="font-ui text-eyebrow text-status-packed uppercase tracking-eyebrow">
        {label ?? t('report.label')}
      </Text>
    </Pressable>
  )
}

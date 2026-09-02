import { Caption } from '@/components/ui'
import { toast } from '@/components/ui/toast-store'
import { showActionSheet } from '@/lib/actionSheet'
import { api } from '@/lib/api'
import { useMutation } from '@tanstack/react-query'
import { Pressable, Text } from 'react-native'

// UGC reporting (App Store 1.2) for the surfaces that carry other people's
// content: a dish, a vibe note, or a member. The reasons used to render as an
// inline chip panel that pushed the page around; they're a system action sheet
// now — which is what a short, mutually-exclusive, dismissable choice is on iOS.
// showActionSheet handles the non-iOS fallback, so there's one code path here.
const REASONS = ['Spam', 'Acoso', 'Inapropiado', 'Otro'] as const

export type ReportTarget = 'dish' | 'vibe_note' | 'user'

const PROMPTS: Record<ReportTarget, string> = {
  dish: '¿Por qué reportas este plato?',
  vibe_note: '¿Por qué reportas esta nota?',
  user: '¿Por qué reportas a esta persona?',
}

// Ask for a reason. Exported for callers that own their own trigger (the member
// profile's Reportar action) so the prompt and reasons stay in one place.
export async function pickReportReason(targetType: ReportTarget): Promise<string | null> {
  const i = await showActionSheet({
    title: PROMPTS[targetType],
    options: REASONS.map((label) => ({ label })),
  })
  return i === null ? null : (REASONS[i] ?? null)
}

// A quiet "Reportar" link that opens the reason sheet, and the thank-you once it
// lands.
export function ReportControl({
  targetType,
  targetId,
  label = 'Reportar',
}: {
  targetType: ReportTarget
  targetId: string
  label?: string
}) {
  const report = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType, targetId, reason }),
    // Without this a failed report closes silently and the reporter can't tell
    // it never sent.
    onError: () =>
      toast({ variant: 'error', message: 'No se pudo enviar el reporte. Intenta de nuevo.' }),
  })

  if (report.isSuccess) {
    return <Caption className="mt-2">Reportado. Gracias — lo revisaremos.</Caption>
  }
  return (
    <Pressable
      accessibilityRole="button"
      disabled={report.isPending}
      onPress={async () => {
        const reason = await pickReportReason(targetType)
        if (reason) report.mutate(reason)
      }}
      className="mt-2 min-h-[36px] justify-center active:opacity-60"
    >
      <Text className="font-ui text-eyebrow text-status-packed uppercase tracking-eyebrow">
        {label}
      </Text>
    </Pressable>
  )
}

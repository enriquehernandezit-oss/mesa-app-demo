import { Caption, Chip } from '@/components/ui'
import { toast } from '@/components/ui/toast-store'
import { api } from '@/lib/api'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'

// UGC reporting (App Store 1.2), shared by the two surfaces that carry other
// people's content: a dish, a vibe note, or a whole member. Ported from the
// ReasonPicker/ReportControl pair in apps/app/src/screens/user/UserRankings.tsx
// — the web had a near-copy in DishDetail too, so this is one component now.
const REASONS = ['Spam', 'Acoso', 'Inapropiado', 'Otro'] as const

export type ReportTarget = 'dish' | 'vibe_note' | 'user'

const PROMPTS: Record<ReportTarget, string> = {
  dish: '¿Por qué reportas este plato?',
  vibe_note: '¿Por qué reportas esta nota?',
  user: '¿Por qué reportas a esta persona?',
}

// The reason chips + cancel. `pending` keeps a chip from firing a second report
// while the first is in flight.
export function ReasonPicker({
  prompt,
  pending,
  onPick,
  onCancel,
}: {
  prompt: string
  pending: boolean
  onPick: (reason: string) => void
  onCancel: () => void
}) {
  return (
    <View className="mt-3 gap-2 rounded border border-line bg-surface p-3">
      <Caption>{prompt}</Caption>
      <View className="flex-row flex-wrap gap-2">
        {REASONS.map((reason) => (
          <Chip key={reason} size="sm" onPress={() => !pending && onPick(reason)}>
            {reason}
          </Chip>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        className="min-h-[36px] justify-center active:opacity-60"
      >
        <Text className="font-ui-medium text-label text-text-muted">Cancelar</Text>
      </Pressable>
    </View>
  )
}

// The whole control: a quiet "Reportar" link that opens the reason panel, and
// the thank-you once it lands. Callers that own their own trigger (the ⋯ menu)
// use ReasonPicker directly instead.
export function ReportControl({
  targetType,
  targetId,
  label = 'Reportar',
}: {
  targetType: ReportTarget
  targetId: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const report = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType, targetId, reason }),
    // Without this a failed report closed nothing and said nothing, so the
    // reporter couldn't tell it hadn't sent.
    onError: () =>
      toast({ variant: 'error', message: 'No se pudo enviar el reporte. Intenta de nuevo.' }),
  })

  if (report.isSuccess) {
    return <Caption className="mt-2">Reportado. Gracias — lo revisaremos.</Caption>
  }
  if (!open) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        className="mt-2 min-h-[36px] justify-center active:opacity-60"
      >
        <Text className="font-ui text-eyebrow text-status-packed uppercase tracking-eyebrow">
          {label}
        </Text>
      </Pressable>
    )
  }
  return (
    <ReasonPicker
      prompt={PROMPTS[targetType]}
      pending={report.isPending}
      onPick={report.mutate}
      onCancel={() => setOpen(false)}
    />
  )
}

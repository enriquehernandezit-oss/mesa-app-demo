import { Caption, EmptyState, ErrorState, RowsSkeleton } from '@/components/ui'
import { toast } from '@/components/ui/toast-store'
import { useProfile } from '@/hooks/useProfile'
import { showActionSheet } from '@/lib/actionSheet'
import { api } from '@/lib/api'
import { captureError } from '@/lib/errors'
import { cloudinaryUrl } from '@/lib/media'
import { timeAgo } from '@/lib/time'
import type { ModerationReport } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'expo-image'
import { Redirect, Stack } from 'expo-router'
import { Pressable, ScrollView, Text, View } from 'react-native'

// The moderation queue (App Store 1.2). Until this screen existed, a member
// could report a note and it went nowhere: the four moderator endpoints had no
// caller and `status` never left 'open'. Reporting that visibly does nothing is
// worse than not offering it.
//
// Moderator-only, and the gate is the server's: `isModerator` comes from GET /me
// and every endpoint behind this screen re-checks it (requireModerator). The
// redirect below is a courtesy, not the security boundary — there is no way to
// grant yourself the flag from inside the product.
const TYPE_ES: Record<ModerationReport['targetType'], string> = {
  vibe_note: 'Nota',
  dish: 'Plato',
  user: 'Miembro',
}

export default function ModerationQueue() {
  const { data: me, isPending: meLoading } = useProfile(true)
  const queryClient = useQueryClient()

  const q = useQuery({
    queryKey: ['moderation-reports'],
    queryFn: () => api.get<{ reports: ModerationReport[] }>('/moderation/reports'),
    enabled: Boolean(me?.profile.isModerator),
  })

  const act = useMutation({
    mutationFn: ({
      report,
      action,
    }: { report: ModerationReport; action: 'remove' | 'dismiss' }) => {
      if (action === 'dismiss') return api.post(`/moderation/reports/${report.id}/dismiss`)
      if (report.targetType === 'vibe_note')
        return api.del(`/moderation/vibe-notes/${report.targetId}`)
      if (report.targetType === 'dish') return api.del(`/moderation/dishes/${report.targetId}`)
      return api.post(`/moderation/users/${report.targetId}/eject`)
    },
    onSuccess: (_d, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['moderation-reports'] })
      // Removing content changes what everyone else sees.
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      toast({ message: action === 'dismiss' ? 'Reporte descartado' : 'Contenido retirado' })
    },
    onError: (err) => {
      captureError(err, 'moderation.act')
      toast({ variant: 'error', message: 'No se pudo completar. Intenta de nuevo.' })
    },
  })

  // Wait for the profile before deciding — redirecting on a not-yet-loaded
  // profile would bounce a real moderator straight back out.
  if (meLoading) return <View className="flex-1 bg-bg" />
  if (!me?.profile.isModerator) return <Redirect href="/discover" />

  const reports = q.data?.reports ?? []

  return (
    <View className="flex-1 bg-bg">
      <Stack.Screen options={{ title: 'Moderación' }} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerClassName="px-5 pb-10"
        contentInsetAdjustmentBehavior="automatic"
      >
        {q.isPending ? (
          <RowsSkeleton rows={3} />
        ) : q.isError ? (
          <ErrorState onRetry={() => q.refetch()}>No se pudo cargar la cola.</ErrorState>
        ) : reports.length === 0 ? (
          <EmptyState body="Los reportes de la comunidad aparecen aquí para revisarlos.">
            Nada pendiente.
          </EmptyState>
        ) : (
          <>
            <Caption className="mb-3 mt-2 font-mono text-micro">
              {reports.length} {reports.length === 1 ? 'reporte abierto' : 'reportes abiertos'}
            </Caption>
            {reports.map((r) => (
              <ReportRow
                key={r.id}
                report={r}
                busy={act.isPending}
                onAct={(action) => {
                  const isRemove = action === 'remove'
                  const label = r.targetType === 'user' ? 'Expulsar miembro' : 'Retirar contenido'
                  showActionSheet({
                    title: isRemove ? `¿${label}?` : '¿Descartar el reporte?',
                    message: isRemove
                      ? r.targetType === 'user'
                        ? 'La cuenta queda suspendida y su contenido desaparece de Mesa.'
                        : 'El contenido desaparece de Mesa. La fila se conserva para auditoría.'
                      : 'El reporte se cierra sin tocar el contenido.',
                    options: [{ label: isRemove ? label : 'Descartar', destructive: isRemove }],
                  }).then((picked) => {
                    if (picked === 0) act.mutate({ report: r, action })
                  })
                }}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function ReportRow({
  report,
  busy,
  onAct,
}: {
  report: ModerationReport
  busy: boolean
  onAct: (action: 'remove' | 'dismiss') => void
}) {
  const t = report.target
  return (
    <View className="mb-3 rounded border border-line bg-surface p-4">
      <View className="flex-row items-center justify-between">
        <Caption className="font-mono text-micro text-accent-strong">
          {TYPE_ES[report.targetType]}
        </Caption>
        <Caption className="font-mono text-micro">{timeAgo(report.createdAt)}</Caption>
      </View>

      {/* The reported content itself — without it there's nothing to judge. */}
      {t === null ? (
        <Caption className="mt-2 text-text-muted">
          El contenido ya no existe. Descarta el reporte.
        </Caption>
      ) : t.kind === 'vibe_note' ? (
        <Text selectable className="mt-2 font-serif-italic text-serif-sm text-text-2">
          “{t.body}”
        </Text>
      ) : t.kind === 'dish' ? (
        <View className="mt-2 flex-row items-center gap-3">
          <Image
            source={{ uri: cloudinaryUrl(t.imageId, { w: 200, h: 200 }) ?? undefined }}
            style={{ width: 56, height: 56, borderRadius: 10 }}
            contentFit="cover"
          />
          <View className="flex-1">
            <Text className="font-serif text-serif-sm text-text">{t.name}</Text>
            {t.caption ? (
              <Text selectable className="font-serif-italic text-serif-sm text-text-2">
                “{t.caption}”
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        <Text className="mt-2 font-ui text-body text-text">
          {t.name}
          {t.handle ? <Text className="font-mono text-label text-text-2"> @{t.handle}</Text> : null}
        </Text>
      )}

      <Caption className="mt-2">
        Motivo: <Text className="text-text-2">{report.reason}</Text>
      </Caption>

      {report.alreadyHandled ? (
        <Caption className="mt-3 font-mono text-micro text-text-muted">
          Ya retirado — solo queda cerrar el reporte.
        </Caption>
      ) : null}

      <View className="mt-3 flex-row gap-5">
        {!report.alreadyHandled && t !== null && (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onAct('remove')}
            className="min-h-[44px] justify-center active:opacity-60"
          >
            <Text className="font-ui text-eyebrow text-status-packed uppercase tracking-eyebrow">
              {report.targetType === 'user' ? 'Expulsar' : 'Retirar'}
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onAct('dismiss')}
          className="min-h-[44px] justify-center active:opacity-60"
        >
          <Text className="font-ui text-eyebrow text-text-muted uppercase tracking-eyebrow">
            Descartar
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

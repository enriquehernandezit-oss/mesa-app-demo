import { ReportControl, pickReportReason } from '@/components/ReportControl'
import { ScreenHeader } from '@/components/ScreenHeader'
import { Body, Button, Caption, Chip, EmptyState, SectionHeader } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { Characteristics } from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { showActionSheet } from '@/lib/actionSheet'
import { ApiError, api } from '@/lib/api'
import { comingSoon } from '@/lib/comingSoon'
import { displayScore } from '@/lib/display'
import type { Ranking, UserRankingsResponse } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

// Another person's ranked passport (mock E2) — and the surface where UGC
// moderation is exercised (App Store 1.2): report a vibe note or the member,
// block them. Blocking severs the graph and hides their content; the API 404s a
// blocked user, so this view empties out. Ported from apps/app/src/screens/user/
// UserRankings.tsx; the ⋯ dropdown (which needed outside-tap/Escape handling on
// web) becomes an inline actions row — no popover to dismiss.
export default function UserRankings() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/discover'))

  const q = useQuery({
    queryKey: ['user-rankings', userId],
    queryFn: () => api.get<UserRankingsResponse>(`/rankings/user/${userId}`),
    retry: false,
  })

  const block = useMutation({
    mutationFn: () => api.post('/moderation/blocks', { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries()
      router.replace('/discover')
    },
    onError: () => toast({ variant: 'error', message: 'No se pudo bloquear. Intenta de nuevo.' }),
  })
  const follow = useMutation({
    mutationFn: (next: boolean) =>
      next ? api.post('/social/follow', { userId }) : api.del(`/social/follow/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-rankings', userId] })
      queryClient.invalidateQueries({ queryKey: ['feed'] })
    },
  })

  const reportUser = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType: 'user', targetId: userId, reason }),
    onError: () =>
      toast({ variant: 'error', message: 'No se pudo enviar el reporte. Intenta de nuevo.' }),
  })

  if (q.isPending) {
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel="Atrás" />
        <Body className="px-5">Cargando…</Body>
      </View>
    )
  }
  if (q.isError || !q.data) {
    const gone = q.error instanceof ApiError && q.error.status === 404
    return (
      <View className="flex-1 bg-bg">
        <ScreenHeader onBack={goBack} backLabel="Atrás" />
        <EmptyState>
          {gone ? 'Este perfil no está disponible.' : 'No se pudo cargar este perfil.'}
        </EmptyState>
      </View>
    )
  }

  const { user, rankings, isFollowing, matchPercent } = q.data
  const firstName = (user.name || user.handle || '').split(' ')[0] || 'esta persona'
  const barrio = user.neighborhood?.name
  const shown = expanded ? rankings : rankings.slice(0, 4)

  return (
    <View className="flex-1 bg-bg">
      <ScreenHeader onBack={goBack} backLabel={user.name || user.handle || 'Atrás'} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pb-10">
        <View className="items-center gap-1">
          <Avatar name={user.name || user.handle || 'm'} src={user.image} size={88} />
          {user.handle ? (
            <Text className="mt-2 font-mono text-label text-text-2">@{user.handle}</Text>
          ) : null}
          <Caption>{[`${rankings.length} rankeados`, barrio].filter(Boolean).join(' · ')}</Caption>
          {matchPercent != null && (
            <Chip size="sm" state="selected" className="mt-2">
              +{matchPercent}% de gustos en común
            </Chip>
          )}

          <View className="mt-4 flex-row items-center gap-3">
            <Button
              variant="primary"
              className="w-auto px-6"
              disabled={follow.isPending}
              onPress={() => follow.mutate(!isFollowing)}
            >
              {isFollowing ? 'Siguiendo' : 'Seguir'}
            </Button>
            {/* Inert-by-design: Mesa has no messaging backend yet. */}
            <Pressable
              accessibilityRole="button"
              onPress={() => comingSoon('Los mensajes llegan pronto a Mesa.')}
              className="min-h-[44px] justify-center rounded-pill border border-line border-dashed px-5 active:opacity-70"
            >
              <Text className="font-mono text-[11px] text-text-muted">Mensaje</Text>
            </Pressable>
          </View>

          {/* Report / block — the moderation entry points (App Store 1.2). */}
          <View className="mt-3 flex-row gap-5">
            <Pressable
              accessibilityRole="button"
              disabled={reportUser.isPending}
              onPress={async () => {
                const reason = await pickReportReason('user')
                if (reason) reportUser.mutate(reason)
              }}
              className="min-h-[36px] justify-center active:opacity-60"
            >
              <Text className="font-ui text-eyebrow text-text-muted uppercase tracking-eyebrow">
                Reportar
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                const picked = await showActionSheet({
                  title: `¿Bloquear a ${firstName}?`,
                  message:
                    'No verás su contenido y esta persona no verá el tuyo. Puedes desbloquear luego en Ajustes.',
                  options: [{ label: 'Bloquear', destructive: true }],
                })
                if (picked === 0) block.mutate()
              }}
              className="min-h-[36px] justify-center active:opacity-60"
            >
              <Text className="font-ui text-eyebrow text-status-packed uppercase tracking-eyebrow">
                Bloquear
              </Text>
            </Pressable>
          </View>
        </View>

        {rankings.length === 0 ? (
          <EmptyState>Todavía no hay rankings.</EmptyState>
        ) : (
          <>
            <SectionHeader action={<Caption>Todos {rankings.length}</Caption>}>
              Los favoritos de {firstName}
            </SectionHeader>
            {shown.map((r) => (
              <TheirRow key={r.id} ranking={r} />
            ))}
            {rankings.length > 4 && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setExpanded((v) => !v)}
                className="min-h-[44px] justify-center active:opacity-60"
              >
                <Text className="font-ui text-eyebrow text-text-muted uppercase tracking-eyebrow">
                  {expanded ? 'Mostrar menos' : `Ver los ${rankings.length} ›`}
                </Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

function TheirRow({ ranking }: { ranking: Ranking }) {
  return (
    <View className="flex-row gap-3 border-line border-b py-3">
      <Text className="w-7 font-serif text-serif-lg text-accent">{ranking.position}</Text>
      <View className="flex-1">
        <Text className="font-serif text-serif-md text-text">{ranking.restaurant.name}</Text>
        <Characteristics
          priceTier={ranking.restaurant.priceTier}
          cuisine={ranking.restaurant.cuisine}
          neighborhood={ranking.neighborhood}
        />
        {ranking.note ? (
          <Text selectable className="mt-1 font-serif-italic text-serif-sm text-text-2">
            “{ranking.note}”
          </Text>
        ) : null}
        {ranking.note && ranking.noteId ? (
          <ReportControl targetType="vibe_note" targetId={ranking.noteId} />
        ) : null}
      </View>
      <Text className="font-serif text-serif-lg text-accent">{displayScore(ranking.score)}</Text>
    </View>
  )
}

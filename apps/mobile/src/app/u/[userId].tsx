import { ScreenHeader } from '@/components/ScreenHeader'
import { Body, Button, Caption, Chip, EmptyState, SectionHeader } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { Characteristics } from '@/components/ui/patterns'
import { toast } from '@/components/ui/toast-store'
import { ApiError, api } from '@/lib/api'
import { displayScore } from '@/lib/display'
import type { Ranking, UserRankingsResponse } from '@/lib/types'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'

// Another person's ranked passport (mock E2) — and the surface where UGC
// moderation is exercised (App Store 1.2): report a vibe note or the user, block
// them. Blocking severs the graph and hides their content; the API 404s a
// blocked user, so this view empties out. Ported from apps/app/src/screens/user/
// UserRankings.tsx. The inert "Mensaje" button is cut (Messages is out of the
// native launch subset).
const REASONS = ['Spam', 'Acoso', 'Inapropiado', 'Otro'] as const

export default function UserRankings() {
  const { userId } = useLocalSearchParams<{ userId: string }>()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [confirmingBlock, setConfirmingBlock] = useState(false)
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

  if (q.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-bg">
        <Body>Cargando…</Body>
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
      <ScreenHeader
        onBack={goBack}
        backLabel={user.name || user.handle || 'Atrás'}
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Más opciones"
            onPress={() => setMenuOpen((v) => !v)}
            className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-60"
          >
            <Text className="font-serif text-title text-text">⋯</Text>
          </Pressable>
        }
      />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerClassName="px-5 pb-10">
        <View className="items-center gap-1 pb-4">
          <Avatar name={user.name || user.handle || 'm'} src={user.image} size={88} />
          {user.handle ? <Caption className="mt-1">@{user.handle}</Caption> : null}
          <Caption>{[`${rankings.length} rankeados`, barrio].filter(Boolean).join(' · ')}</Caption>
          {matchPercent != null && (
            <View className="mt-1 rounded-pill border border-accent px-3 py-1">
              <Caption className="font-mono text-[10px] text-accent-strong">
                +{matchPercent}% de gustos en común
              </Caption>
            </View>
          )}
          <View className="mt-3">
            <Button
              variant={isFollowing ? 'secondary' : 'primary'}
              className="w-auto min-h-[44px] px-6"
              onPress={() => follow.mutate(!isFollowing)}
              disabled={follow.isPending}
            >
              {isFollowing ? 'Siguiendo' : 'Seguir'}
            </Button>
          </View>
        </View>

        {reporting && (
          <ReportUser
            userId={userId}
            onDone={() => {
              setReporting(false)
              setMenuOpen(false)
            }}
          />
        )}

        {/* Blocking severs the social graph and hides both sides' content — a
            real consequence for a one-tap menu item, so it confirms first. */}
        {confirmingBlock && (
          <View className="mb-4 gap-3 rounded border border-line bg-surface p-4">
            <Caption>
              ¿Bloquear a {firstName}? No verás su contenido y esta persona no verá el tuyo. Puedes
              desbloquear luego en Ajustes.
            </Caption>
            <View className="flex-row">
              <Chip
                state="default"
                onPress={() => {
                  setConfirmingBlock(false)
                  block.mutate()
                }}
              >
                Bloquear
              </Chip>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setConfirmingBlock(false)}
              className="min-h-[44px] self-start justify-center active:opacity-60"
            >
              <Text className="font-ui-medium text-label text-text-muted">Cancelar</Text>
            </Pressable>
          </View>
        )}

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

      {/* The ⋯ menu, as a dismiss-on-outside-tap overlay (RN has no document-level
          pointerdown listener like the web). */}
      {menuOpen && (
        <Pressable
          onPress={() => setMenuOpen(false)}
          className="absolute inset-0"
          accessibilityLabel="Cerrar menú"
        >
          <View className="absolute right-4 top-14 w-40 overflow-hidden rounded border border-line bg-surface-raised">
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setMenuOpen(false)
                setReporting(true)
              }}
              className="min-h-[44px] justify-center px-4 active:opacity-70"
            >
              <Text className="font-ui text-body text-text">Reportar</Text>
            </Pressable>
            <View className="h-px bg-line" />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setConfirmingBlock(true)
                setMenuOpen(false)
              }}
              className="min-h-[44px] justify-center px-4 active:opacity-70"
            >
              <Text className="font-ui text-body text-status-packed">Bloquear</Text>
            </Pressable>
          </View>
        </Pressable>
      )}
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
          <Text className="mt-1 font-serif-italic text-serif-sm text-text-2">“{ranking.note}”</Text>
        ) : null}
        {ranking.note && ranking.noteId ? (
          <ReportControl targetType="vibe_note" targetId={ranking.noteId} />
        ) : null}
      </View>
      <Text className="font-serif text-serif-lg text-accent">{displayScore(ranking.score)}</Text>
    </View>
  )
}

// The report-reason panel, shared by the two report entry points (a whole user
// from the ⋯ menu, a single vibe note inline). The `pending` guard keeps a chip
// from firing a second report while the first is in flight.
function ReasonPicker({
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
    <View className="mb-4 gap-3 rounded border border-line bg-surface p-4">
      <Caption>{prompt}</Caption>
      <View className="flex-row flex-wrap gap-2">
        {REASONS.map((reason) => (
          <Chip key={reason} state="default" onPress={() => !pending && onPick(reason)}>
            {reason}
          </Chip>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onCancel}
        className="min-h-[44px] self-start justify-center active:opacity-60"
      >
        <Text className="font-ui-medium text-label text-text-muted">Cancelar</Text>
      </Pressable>
    </View>
  )
}

// Report the whole user (from the ⋯ menu) — targetType 'user'.
function ReportUser({ userId, onDone }: { userId: string; onDone: () => void }) {
  const report = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType: 'user', targetId: userId, reason }),
    onSuccess: onDone,
    onError: () =>
      toast({ variant: 'error', message: 'No se pudo enviar el reporte. Intenta de nuevo.' }),
  })
  return (
    <ReasonPicker
      prompt="¿Por qué reportas a esta persona?"
      pending={report.isPending}
      onPick={report.mutate}
      onCancel={onDone}
    />
  )
}

function ReportControl({
  targetType,
  targetId,
}: { targetType: 'vibe_note' | 'user'; targetId: string }) {
  const [open, setOpen] = useState(false)
  const report = useMutation({
    mutationFn: (reason: string) =>
      api.post('/moderation/reports', { targetType, targetId, reason }),
    onError: () =>
      toast({ variant: 'error', message: 'No se pudo enviar el reporte. Intenta de nuevo.' }),
  })
  if (report.isSuccess) {
    return <Caption className="mt-2">Reportado. Gracias — lo revisaremos.</Caption>
  }
  return (
    <View className="mt-2">
      {!open ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          className="min-h-[44px] self-start justify-center active:opacity-60"
        >
          <Text className="font-ui text-eyebrow text-status-packed uppercase tracking-eyebrow">
            Reportar
          </Text>
        </Pressable>
      ) : (
        <ReasonPicker
          prompt="¿Por qué reportas esta nota?"
          pending={report.isPending}
          onPick={report.mutate}
          onCancel={() => setOpen(false)}
        />
      )}
    </View>
  )
}
